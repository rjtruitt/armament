/** Bridges iteratio-plugin-tools ToolCatalog into the agent loop. */

import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';
import type { BaseTool, ToolContext as PluginToolContext } from 'iteratio-plugin-tools';
import { ToolCatalog } from 'iteratio-plugin-tools';

/** Wraps a BaseTool from iteratio-plugin-tools as an iteratio ITool. */
export class BaseToolAdapter implements ITool {
  /**
   * name property.
   */
  readonly name: string;
  /**
   * description property.
   */
  readonly description: string;
  /**
   * schema property.
   */
  readonly schema: z.ZodType<unknown>;

  private _baseTool: BaseTool;

  constructor(baseTool: BaseTool) {
    this._baseTool = baseTool;
    this.name = baseTool.name;
    this.description = baseTool.description;
    this.schema = z.record(z.unknown()).describe(baseTool.description);
  }

  /**
   * Execute.
   */
  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const params = (args ?? {}) as Record<string, unknown>;
    const errors = this._baseTool.validate(params);
    if (errors.length > 0) {
      return { success: false, error: { message: errors.join('; '), code: 'VALIDATION_ERROR' } };
    }

    const pluginCtx: PluginToolContext = {
      turnNumber: context.turnNumber,
      cwd: process.cwd(),
    };

    const result = await this._baseTool.execute(params, pluginCtx);
    return {
      success: result.success,
      data: result.output || undefined,
      error: result.error ? { message: result.error, code: 'TOOL_ERROR' } : undefined,
    };
  }
}

/** ITool that lets the LLM request additional tool categories from the catalog. */
export class RequestToolsITool implements ITool {
  /**
   * name property.
   */
  readonly name = 'request_tools';
  /**
   * description property.
   */
  readonly description = `Load additional tools into your session by category or name. Call with no arguments to see what's available.

Usage (browse): {}
Usage (load category): {"categories": ["pentest", "git"]}
Usage (load specific): {"tools": ["nmap_scan", "nuclei_run"]}
Usage (unload): {"unload_categories": ["web"]}

Tools stay loaded for the rest of the session. Unload categories you no longer need to free context space.
Categories include: pentest, git, shell, web, data, infra, monitoring (varies by config).`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    categories: z.array(z.string()).optional().describe('Tool categories to load (e.g. "pentest", "git", "shell", "web", "data", "infra", "monitoring")'),
    tools: z.array(z.string()).optional().describe('Specific tool names to load'),
    unload_categories: z.array(z.string()).optional().describe('Categories to unload (free up context space)'),
    list: z.boolean().optional().describe('If true, just list available categories'),
  });

  private _catalog: ToolCatalog;
  private _onToolsLoaded: (tools: ITool[]) => void;

  constructor(catalog: ToolCatalog, onToolsLoaded: (tools: ITool[]) => void) {
    this._catalog = catalog;
    this._onToolsLoaded = onToolsLoaded;
  }

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const params = (args ?? {}) as Record<string, unknown>;
    const categories = params.categories as string[] | undefined;
    const tools = params.tools as string[] | undefined;
    const unload_categories = params.unload_categories as string[] | undefined;
    const list = params.list as boolean | undefined;

    if (list || (!categories && !tools && !unload_categories)) {
      const summaries = this._catalog.getCategorySummaries();
      const unloaded = summaries.filter(s => {
        const activeCount = s.tools.filter(t => this._catalog.isActive(t)).length;
        return activeCount < s.toolCount;
      });

      if (unloaded.length === 0) {
        return { success: true, data: 'All tool categories are fully loaded. No additional tools available to request.' };
      }

      const lines = ['Available tool categories (not yet loaded):', ''];
      for (const s of unloaded) {
        const activeCount = s.tools.filter(t => this._catalog.isActive(t)).length;
        const remaining = s.tools.filter(t => !this._catalog.isActive(t));
        if (activeCount > 0) {
          lines.push(`  ${s.category} (${remaining.length} remaining of ${s.toolCount})`);
          lines.push(`    ${s.description}`);
          lines.push(`    Available: ${remaining.join(', ')}`);
        } else {
          lines.push(`  ${s.category} (${s.toolCount} tools)`);
          lines.push(`    ${s.description}`);
          lines.push(`    Tools: ${s.tools.join(', ')}`);
        }
        lines.push('');
      }
      const totalRemaining = this._catalog.totalToolCount - this._catalog.activeToolCount;
      lines.push(`${totalRemaining} tools remaining across ${unloaded.length} categories`);
      return { success: true, data: lines.join('\n') };
    }

    const results: string[] = [];
    const newlyLoaded: BaseTool[] = [];

    if (unload_categories) {
      for (const cat of unload_categories) {
        const removed = this._catalog.unloadCategory(cat);
        if (removed.length > 0) {
          results.push(`Unloaded ${cat}: ${removed.join(', ')}`);
        }
      }
    }

    if (categories) {
      for (const cat of categories) {
        const result = this._catalog.loadCategory(cat);
        if (result.notFound.length > 0) {
          results.push(`Category '${cat}' not found`);
        } else if (result.loaded.length > 0) {
          results.push(`Loaded ${cat} (${result.loaded.length} tools): ${result.loaded.join(', ')}`);
          for (const name of result.loaded) {
            const tool = this._catalog.getActiveTool(name);
            if (tool) newlyLoaded.push(tool);
          }
        } else {
          results.push(`${cat}: already fully loaded — no action needed`);
        }
      }
    }

    if (tools) {
      const toLoad = tools.filter((t: string) => !this._catalog.isActive(t));
      const alreadyActive = tools.filter((t: string) => this._catalog.isActive(t));

      if (alreadyActive.length > 0) {
        results.push(`Already active (skipped): ${alreadyActive.join(', ')}`);
      }

      if (toLoad.length > 0) {
        const result = this._catalog.loadTools(toLoad);
        if (result.loaded.length > 0) {
          results.push(`Loaded tools: ${result.loaded.join(', ')}`);
          for (const name of result.loaded) {
            const tool = this._catalog.getActiveTool(name);
            if (tool) newlyLoaded.push(tool);
          }
        }
        if (result.notFound.length > 0) {
          results.push(`Not found: ${result.notFound.join(', ')}`);
        }
      }
    }

    if (results.length === 0) {
      return { success: false, error: { message: 'No action taken. Specify categories or tools to load.', code: 'NO_ACTION' } };
    }

    if (newlyLoaded.length > 0) {
      const adapted = newlyLoaded.map(t => new BaseToolAdapter(t));
      this._onToolsLoaded(adapted);
    }

    results.push('');
    results.push(`Active tools: ${this._catalog.activeToolCount}/${this._catalog.totalToolCount}`);
    return { success: true, data: results.join('\n') };
  }
}

/** Manages the ToolCatalog lifecycle, creating the request_tools ITool. */
export class CatalogManager {
  private _catalog: ToolCatalog;
  private _loadedAdapters: Map<string, BaseToolAdapter> = new Map();

  constructor(catalog: ToolCatalog) {
    this._catalog = catalog;
  }

  /**
   * Gets the catalog.
   */
  get catalog(): ToolCatalog {
    return this._catalog;
  }

  /**
   * Gets the active tool names.
   */
  get activeToolNames(): string[] {
    return Array.from(this._loadedAdapters.keys());
  }

  /** Builds the request_tools ITool that agents use to load additional tool categories. */
  createRequestTool(onToolsLoaded: (tools: ITool[]) => void): RequestToolsITool {
    return new RequestToolsITool(this._catalog, (tools) => {
      for (const tool of tools) {
        this._loadedAdapters.set(tool.name, tool as BaseToolAdapter);
      }
      onToolsLoaded(tools);
    });
  }

  /** Re-activates previously loaded tools by name (e.g. after session restore). */
  restoreTools(names: string[]): ITool[] {
    const result = this._catalog.restoreActive(names);
    const adapted: ITool[] = [];
    for (const name of result.loaded) {
      const tool = this._catalog.getActiveTool(name);
      if (tool) {
        const adapter = new BaseToolAdapter(tool);
        this._loadedAdapters.set(name, adapter);
        adapted.push(adapter);
      }
    }
    return adapted;
  }
}
