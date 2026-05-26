import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoadingBarController } from '../core/LoadingBarController.js';

describe('LoadingBarController', () => {
  let controller: LoadingBarController;

  beforeEach(() => {
    controller = new LoadingBarController({
      providers: ['anthropic'],
      mcpServers: ['filesystem'],
      workspace: '/tmp/test-project',
    });
  });

  // ===========================================================================
  // 1. LOADING STATE
  // ===========================================================================
  describe('Loading State', () => {
    it('should return progress structure from getData()', () => {
      const data = controller.getData();
      expect(data).toHaveProperty('configLoaded');
      expect(data).toHaveProperty('providersStatus');
      expect(data).toHaveProperty('mcpStatus');
      expect(data).toHaveProperty('workspace');
      expect(data).toHaveProperty('progress');
      expect(data).toHaveProperty('ready');
    });

    it('should start at 0% progress', () => {
      const data = controller.getData();
      expect(data.progress).toBe(0);
      expect(data.ready).toBe(false);
    });

    it('should reach 10% after config loaded', () => {
      controller.setConfigLoaded(true);
      expect(controller.getData().progress).toBe(10);
    });

    it('should progress through providers phase (10→40%)', () => {
      controller.setConfigLoaded(true);
      controller.setProviderStatus('anthropic', true);
      const data = controller.getData();
      expect(data.progress).toBeGreaterThanOrEqual(40);
    });

    it('should progress through MCP phase (40→70%)', () => {
      controller.setConfigLoaded(true);
      controller.setProviderStatus('anthropic', true);
      controller.setMcpStatus('filesystem', true, 5);
      const data = controller.getData();
      expect(data.progress).toBeGreaterThanOrEqual(70);
    });

    it('should reach 90% after workspace scanned', () => {
      controller.setConfigLoaded(true);
      controller.setProviderStatus('anthropic', true);
      controller.setMcpStatus('filesystem', true, 5);
      controller.setWorkspaceScanned('/tmp/test-project');
      expect(controller.getData().progress).toBe(90);
    });

    it('should reach 100% when marked ready', () => {
      controller.markReady();
      expect(controller.getData().progress).toBe(100);
      expect(controller.getData().ready).toBe(true);
    });

    it('should track individual provider status', () => {
      controller.setProviderStatus('anthropic', true);
      controller.setProviderStatus('openai', false, 'API key missing');
      const data = controller.getData();
      expect(data.providersStatus).toHaveLength(2);
      expect(data.providersStatus[0]).toEqual({ name: 'anthropic', ok: true, detail: undefined });
      expect(data.providersStatus[1]).toEqual({ name: 'openai', ok: false, detail: 'API key missing' });
    });

    it('should track individual MCP server status', () => {
      controller.setMcpStatus('filesystem', true, 8);
      controller.setMcpStatus('github', false);
      const data = controller.getData();
      expect(data.mcpStatus).toHaveLength(2);
      expect(data.mcpStatus[0]).toEqual({ name: 'filesystem', ok: true, toolCount: 8 });
      expect(data.mcpStatus[1]).toEqual({ name: 'github', ok: false, toolCount: undefined });
    });

    it('should update existing provider status', () => {
      controller.setProviderStatus('anthropic', false, 'timeout');
      controller.setProviderStatus('anthropic', true);
      const data = controller.getData();
      expect(data.providersStatus).toHaveLength(1);
      expect(data.providersStatus[0].ok).toBe(true);
    });

    it('should update existing MCP status', () => {
      controller.setMcpStatus('filesystem', false);
      controller.setMcpStatus('filesystem', true, 8);
      const data = controller.getData();
      expect(data.mcpStatus).toHaveLength(1);
      expect(data.mcpStatus[0].ok).toBe(true);
      expect(data.mcpStatus[0].toolCount).toBe(8);
    });

    it('should skip MCP phase when no MCP servers expected', () => {
      const noMcp = new LoadingBarController({
        providers: ['anthropic'],
        mcpServers: [],
        workspace: '/tmp/test',
      });
      noMcp.setConfigLoaded(true);
      noMcp.setProviderStatus('anthropic', true);
      // With no MCP servers expected, should jump from 40 to 70
      expect(noMcp.getData().progress).toBeGreaterThanOrEqual(70);
    });

    it('should support degraded mode when some providers fail', () => {
      controller.setConfigLoaded(true);
      controller.setProviderStatus('anthropic', true);
      controller.setProviderStatus('openai', false, 'unreachable');
      const data = controller.getData();
      // Should still progress — one provider is OK
      expect(data.progress).toBeGreaterThanOrEqual(10);
    });
  });

  // ===========================================================================
  // 2. PROGRESS EVENTS
  // ===========================================================================
  describe('Progress Events', () => {
    it('should fire onProgress callback with current value on subscribe', () => {
      const cb = vi.fn();
      controller.onProgress(cb);
      expect(cb).toHaveBeenCalledWith(0);
    });

    it('should fire onProgress on each step', () => {
      const cb = vi.fn();
      controller.onProgress(cb);
      controller.setConfigLoaded(true);
      expect(cb).toHaveBeenCalledWith(10);
    });

    it('should ensure progress is monotonically increasing', () => {
      const values: number[] = [];
      controller.onProgress((pct) => values.push(pct));
      controller.setConfigLoaded(true);
      controller.setProviderStatus('anthropic', true);
      controller.setMcpStatus('filesystem', true, 5);
      controller.setWorkspaceScanned('/tmp/test');
      controller.markReady();
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]);
      }
    });

    it('should support multiple listeners', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      controller.onProgress(cb1);
      controller.onProgress(cb2);
      controller.setConfigLoaded(true);
      expect(cb1.mock.calls.length).toBe(cb2.mock.calls.length);
    });

    it('should allow removing a listener via returned unsubscribe', () => {
      const cb = vi.fn();
      const unsub = controller.onProgress(cb);
      unsub();
      controller.setConfigLoaded(true);
      // Only the initial call (from subscribe), no follow-up
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // 3. WAIT FOR READY
  // ===========================================================================
  describe('Wait for Ready', () => {
    it('should resolve when config loaded and provider OK', async () => {
      controller.setConfigLoaded(true);
      controller.setProviderStatus('anthropic', true);
      await expect(controller.waitForReady()).resolves.not.toThrow();
    });

    it('should resolve in degraded mode (some providers failed but one OK)', async () => {
      const multi = new LoadingBarController({
        providers: ['anthropic', 'openai'],
        mcpServers: [],
        workspace: '/tmp/test',
      });
      multi.setConfigLoaded(true);
      multi.setProviderStatus('anthropic', true);
      multi.setProviderStatus('openai', false, 'key missing');
      await expect(multi.waitForReady()).resolves.not.toThrow();
    });

    it('should reject when zero providers are available', async () => {
      const noProviders = new LoadingBarController({
        providers: [],
        mcpServers: [],
        workspace: '/tmp/test',
      });
      await expect(noProviders.waitForReady()).rejects.toThrow('No providers available');
    });

    it('should reject when all providers failed', async () => {
      controller.setConfigLoaded(true);
      controller.setProviderStatus('anthropic', false, 'auth failed');
      await expect(controller.waitForReady()).rejects.toThrow('No providers available');
    });

    it('should resolve immediately if already marked ready', async () => {
      controller.markReady();
      const start = Date.now();
      await controller.waitForReady();
      expect(Date.now() - start).toBeLessThan(50);
    });
  });

  // ===========================================================================
  // 4. MULTI-PROVIDER PROGRESS GRANULARITY
  // ===========================================================================
  describe('Multi-Provider Progress', () => {
    it('should spread provider progress across expected count', () => {
      const multi = new LoadingBarController({
        providers: ['anthropic', 'openai', 'ollama'],
        mcpServers: [],
        workspace: '/tmp/test',
      });
      multi.setConfigLoaded(true);
      multi.setProviderStatus('anthropic', true);
      const afterOne = multi.getData().progress;
      multi.setProviderStatus('openai', true);
      const afterTwo = multi.getData().progress;
      multi.setProviderStatus('ollama', true);
      const afterThree = multi.getData().progress;
      expect(afterOne).toBeLessThan(afterTwo);
      expect(afterTwo).toBeLessThan(afterThree);
      expect(afterThree).toBeGreaterThanOrEqual(40);
    });

    it('should spread MCP progress across expected count', () => {
      const multi = new LoadingBarController({
        providers: ['anthropic'],
        mcpServers: ['filesystem', 'github', 'glean'],
        workspace: '/tmp/test',
      });
      multi.setConfigLoaded(true);
      multi.setProviderStatus('anthropic', true);
      multi.setMcpStatus('filesystem', true, 8);
      const afterOne = multi.getData().progress;
      multi.setMcpStatus('github', true, 12);
      const afterTwo = multi.getData().progress;
      multi.setMcpStatus('glean', true, 5);
      const afterThree = multi.getData().progress;
      expect(afterOne).toBeLessThan(afterTwo);
      expect(afterTwo).toBeLessThan(afterThree);
      expect(afterThree).toBeGreaterThanOrEqual(70);
    });
  });
});
