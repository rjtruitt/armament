import { describe, it, expect, beforeEach } from 'vitest';
import { BaseToolAdapter, RequestToolsITool, CatalogManager } from '../providers/CatalogAdapter.js';
import { ToolCatalog, BaseTool, ToolParameterSchema, ToolContext, ToolResult, successResult, errorResult } from 'iteratio-plugin-tools';
import type { ITool } from 'iteratio';

class FakeTool extends BaseTool {
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly schema: ToolParameterSchema;

  constructor(name: string, category: string, opts: { required?: string[] } = {}) {
    super();
    this.name = name;
    this.description = `Fake ${name} tool`;
    this.category = category;
    this.schema = {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Target' },
      },
      required: opts.required,
    };
  }

  async execute(params: Record<string, any>, _context: ToolContext): Promise<ToolResult> {
    if (params.fail) return errorResult('intentional failure');
    return successResult(`executed ${this.name} on ${params.target || 'default'}`);
  }
}

describe('BaseToolAdapter', () => {
  it('should adapt a BaseTool to ITool interface', () => {
    const fake = new FakeTool('nmap', 'pentest');
    const adapter = new BaseToolAdapter(fake);

    expect(adapter.name).toBe('nmap');
    expect(adapter.description).toBe('Fake nmap tool');
    expect(adapter.schema).toBeDefined();
  });

  it('should execute and return iteratio ToolResult format', async () => {
    const fake = new FakeTool('nmap', 'pentest');
    const adapter = new BaseToolAdapter(fake);

    const result = await adapter.execute(
      { target: '192.168.1.1' },
      { turnNumber: 1, state: {}, metadata: {} }
    );
    expect(result.success).toBe(true);
    expect(result.data).toBe('executed nmap on 192.168.1.1');
  });

  it('should return error for validation failures', async () => {
    const fake = new FakeTool('nmap', 'pentest', { required: ['target'] });
    const adapter = new BaseToolAdapter(fake);

    const result = await adapter.execute(
      {},
      { turnNumber: 1, state: {}, metadata: {} }
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('Missing required parameter: target');
  });

  it('should pass through tool errors', async () => {
    const fake = new FakeTool('nmap', 'pentest');
    const adapter = new BaseToolAdapter(fake);

    const result = await adapter.execute(
      { fail: true },
      { turnNumber: 1, state: {}, metadata: {} }
    );
    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('intentional failure');
  });
});

describe('RequestToolsITool', () => {
  let catalog: ToolCatalog;
  let loadedTools: ITool[];

  beforeEach(() => {
    catalog = new ToolCatalog();
    catalog.registerAll([
      new FakeTool('nmap', 'pentest'),
      new FakeTool('sqlmap', 'pentest'),
      new FakeTool('bash', 'shell'),
    ]);
    loadedTools = [];
  });

  function createRequestTool(): RequestToolsITool {
    return new RequestToolsITool(catalog, (tools) => {
      loadedTools.push(...tools);
    });
  }

  it('should list categories', async () => {
    const tool = createRequestTool();
    const result = await tool.execute(
      { list: true },
      { turnNumber: 1, state: {}, metadata: {} }
    );
    expect(result.success).toBe(true);
    expect(result.data).toContain('pentest');
    expect(result.data).toContain('shell');
  });

  it('should load category and fire callback with adapted tools', async () => {
    const tool = createRequestTool();
    const result = await tool.execute(
      { categories: ['pentest'] },
      { turnNumber: 1, state: {}, metadata: {} }
    );
    expect(result.success).toBe(true);
    expect(loadedTools).toHaveLength(2);
    expect(loadedTools[0].name).toBe('nmap');
    expect(loadedTools[1].name).toBe('sqlmap');
  });

  it('should load specific tools and fire callback', async () => {
    const tool = createRequestTool();
    await tool.execute(
      { tools: ['bash'] },
      { turnNumber: 1, state: {}, metadata: {} }
    );
    expect(loadedTools).toHaveLength(1);
    expect(loadedTools[0].name).toBe('bash');
  });

  it('should not fire callback for already-loaded tools', async () => {
    const tool = createRequestTool();
    await tool.execute({ tools: ['bash'] }, { turnNumber: 1, state: {}, metadata: {} });
    loadedTools = [];

    await tool.execute({ tools: ['bash'] }, { turnNumber: 1, state: {}, metadata: {} });
    expect(loadedTools).toHaveLength(0);
  });

  it('should unload and not fire callback', async () => {
    const tool = createRequestTool();
    await tool.execute({ categories: ['pentest'] }, { turnNumber: 1, state: {}, metadata: {} });
    loadedTools = [];

    const result = await tool.execute(
      { unload_categories: ['pentest'] },
      { turnNumber: 1, state: {}, metadata: {} }
    );
    expect(result.success).toBe(true);
    expect(result.data).toContain('Unloaded pentest');
    expect(loadedTools).toHaveLength(0);
  });

  it('should return error with empty arrays', async () => {
    const tool = createRequestTool();
    const result = await tool.execute(
      { categories: [], tools: [] },
      { turnNumber: 1, state: {}, metadata: {} }
    );
    expect(result.success).toBe(false);
  });
});

describe('CatalogManager', () => {
  let catalog: ToolCatalog;
  let manager: CatalogManager;

  beforeEach(() => {
    catalog = new ToolCatalog();
    catalog.registerAll([
      new FakeTool('nmap', 'pentest'),
      new FakeTool('sqlmap', 'pentest'),
      new FakeTool('bash', 'shell'),
    ]);
    manager = new CatalogManager(catalog);
  });

  it('should expose the catalog', () => {
    expect(manager.catalog).toBe(catalog);
  });

  it('should start with no active tool names', () => {
    expect(manager.activeToolNames).toEqual([]);
  });

  it('should create a request tool that tracks loaded names', async () => {
    const loaded: ITool[] = [];
    const requestTool = manager.createRequestTool((tools) => loaded.push(...tools));

    await requestTool.execute(
      { categories: ['pentest'] },
      { turnNumber: 1, state: {}, metadata: {} }
    );

    expect(manager.activeToolNames).toContain('nmap');
    expect(manager.activeToolNames).toContain('sqlmap');
    expect(loaded).toHaveLength(2);
  });

  it('should restore tools from saved names', () => {
    const restored = manager.restoreTools(['nmap', 'bash']);
    expect(restored).toHaveLength(2);
    expect(manager.activeToolNames).toEqual(['nmap', 'bash']);
  });

  it('should handle restoring nonexistent tools', () => {
    const restored = manager.restoreTools(['nmap', 'ghost_tool']);
    expect(restored).toHaveLength(1);
    expect(manager.activeToolNames).toEqual(['nmap']);
  });
});
