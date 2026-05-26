/** Snapshot of boot progress state for rendering the loading screen. */
export interface LoadingBarData {
  configLoaded: boolean;
  providersStatus: { name: string; ok: boolean; detail?: string }[];
  mcpStatus: { name: string; ok: boolean; toolCount?: number }[];
  workspace: string;
  progress: number; // 0-100
  ready: boolean;
}
/** Class representing LoadingBarController. */
export class LoadingBarController {
  private _configLoaded = false;
  private _providersStatus: { name: string; ok: boolean; detail?: string }[] = [];
  private _mcpStatus: { name: string; ok: boolean; toolCount?: number }[] = [];
  private _workspace = '';
  private _workspaceScanned = false;
  private _progress = 0;
  private _ready = false;
  private _listeners: Array<(pct: number) => void> = [];
  private _expectedProviders: string[];
  private _expectedMcp: string[];
  /**
   * @param ctx - Optional context with provider list, MCP server list, and workspace path.
   */
  constructor(ctx: {
    providers?: string[];
    mcpServers?: string[];
    workspace?: string;
  } = {}) {
    this._expectedProviders = ctx.providers ?? [];
    this._expectedMcp = ctx.mcpServers ?? [];
    this._workspace = ctx.workspace ?? '';
  }
  /**
   * Gets the data.
   */
  /**
   * Returns the current loading bar state snapshot.
   */
  getData(): LoadingBarData {
    return {
      configLoaded: this._configLoaded,
      providersStatus: [...this._providersStatus],
      mcpStatus: [...this._mcpStatus],
      workspace: this._workspace,
      progress: this._progress,
      ready: this._ready,
    };
  }
  /**
   * Sets the config loaded.
   */
  /**
   * Marks config as loaded (sets progress to 10%).
   * @param loaded - Whether config is loaded.
   */
  setConfigLoaded(loaded: boolean): void {
    this._configLoaded = loaded;
    if (loaded) {
      this._setProgress(10);
    }
  }
  /**
   * Sets the provider status.
   */
  /**
   * Updates the status of a named provider and recalculates progress.
   * @param name - Provider name.
   * @param ok - Whether the provider initialized successfully.
   * @param detail - Optional detail message.
   */
  setProviderStatus(name: string, ok: boolean, detail?: string): void {
    const existing = this._providersStatus.find(p => p.name === name);
    if (existing) {
      existing.ok = ok;
      existing.detail = detail;
    } else {
      this._providersStatus.push({ name, ok, detail });
    }
    this._recalculateProgress();
  }
  /**
   * Sets the mcp status.
   */
  /**
   * Updates the status of a named MCP server and recalculates progress.
   * @param name - MCP server name.
   * @param ok - Whether the server connected.
   * @param toolCount - Optional number of tools exposed.
   */
  setMcpStatus(name: string, ok: boolean, toolCount?: number): void {
    const existing = this._mcpStatus.find(m => m.name === name);
    if (existing) {
      existing.ok = ok;
      existing.toolCount = toolCount;
    } else {
      this._mcpStatus.push({ name, ok, toolCount });
    }
    this._recalculateProgress();
  }
  /**
   * Sets the workspace scanned.
   */
  /**
   * Marks the workspace as scanned and recalculates progress.
   * @param workspace - The workspace path.
   */
  setWorkspaceScanned(workspace: string): void {
    this._workspace = workspace;
    this._workspaceScanned = true;
    this._recalculateProgress();
  }
  /**
   * Mark ready.
   */
  /**
   * Marks the boot process as ready (sets progress to 100%).
   */
  markReady(): void {
    this._ready = true;
    this._setProgress(100);
  }
  /**
   * On progress.
   */
  /**
   * Registers a progress listener. Called immediately with the current progress value.
   * @param cb - Callback invoked with progress percentage (0-100).
   * @returns A function to unregister the listener.
   */
  onProgress(cb: (pct: number) => void): () => void {
    this._listeners.push(cb);
    cb(this._progress);
    return () => {
      const idx = this._listeners.indexOf(cb);
      if (idx >= 0) this._listeners.splice(idx, 1);
    };
  }
  /**
   * Waits for the boot process to be ready.
   * Throws if no providers are available or none are configured.
   */
  async waitForReady(): Promise<void> {
    if (this._ready) {
      return;
    }
    const anyProviderOk = this._providersStatus.some(p => p.ok);
    if (this._configLoaded && anyProviderOk) {
      this._ready = true;
      this._setProgress(100);
      return;
    }
    if (this._providersStatus.length > 0 && !anyProviderOk) {
      throw new Error('No providers available');
    }
    // No providers configured at all — cannot be ready
    if (this._expectedProviders.length === 0 && this._providersStatus.length === 0) {
      throw new Error('No providers available');
    }
  }
  private _recalculateProgress(): void {
    let progress = 0;
    // Config: 10%
    if (this._configLoaded) {
      progress = 10;
    }
    // Providers: 10% → 40% (30% range)
    if (this._expectedProviders.length > 0) {
      const reported = this._providersStatus.length;
      const fraction = reported / this._expectedProviders.length;
      progress = Math.max(progress, 10 + Math.round(fraction * 30));
    } else if (this._providersStatus.length > 0) {
      progress = Math.max(progress, 40);
    }
    // MCP servers: 40% → 70% (30% range)
    if (this._expectedMcp.length > 0) {
      const reported = this._mcpStatus.length;
      const fraction = reported / this._expectedMcp.length;
      progress = Math.max(progress, 40 + Math.round(fraction * 30));
    } else if (this._mcpStatus.length > 0) {
      progress = Math.max(progress, 70);
    } else if (this._expectedMcp.length === 0 && progress >= 40) {
      progress = Math.max(progress, 70);
    }
    // Workspace: 70% → 90%
    if (this._workspaceScanned) {
      progress = Math.max(progress, 90);
    }
    // Ready: 100%
    if (this._ready) {
      progress = 100;
    }
    this._setProgress(progress);
    if (progress >= 90 && !this._ready) {
      const anyProviderOk = this._providersStatus.some(p => p.ok);
      if (anyProviderOk || this._providersStatus.length === 0) {
      }
    }
  }
  private _setProgress(pct: number): void {
    if (pct > this._progress) {
      this._progress = pct;
      for (const cb of this._listeners) {
        cb(pct);
      }
    }
  }
}