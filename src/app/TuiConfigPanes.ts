import { ConfigPane } from '../tui/index.js';
import { registerSchema } from '../tui/ConfigSchema.js';
import { UserConfig } from '../config/index.js';
import { registerConfigPanelSchemas } from './TuiConfigSchemas.js';
import type { IProviderConfig } from '../core/index.js';
import type { MenuPanel } from '../tui/session-menu/types.js';
import {
  registerSessionSchemas,
  registerContextSchemas,
  registerWorkspaceSchemas,
  registerDisplaySchemas,
} from './TuiConfigSchemasExt.js';
import type { TuiRendererOptions } from './TuiTypes.js';

/**
 * Config panes delegate interface.
 */
export interface ConfigPanesDelegate {
  render(): void;
  setActiveChannel(channel: string): void;
  setRenderInterval(ms: number): void;
}

/**
 * Tui config panes class.
 */
export class TuiConfigPanes {
  private _configPanes: Map<string, ConfigPane> = new Map();
  /** Shared panel definitions map for all ConfigPane instances. */
  private _panels: Map<string, MenuPanel> = new Map();
  private opts: TuiRendererOptions;
  private delegate: ConfigPanesDelegate;

  constructor(opts: TuiRendererOptions, delegate: ConfigPanesDelegate) {
    this.opts = opts;
    this.delegate = delegate;
  }

  /**
   * Gets the config pane.
   */
  getConfigPane(paneId: string): ConfigPane {
    const dotIdx = paneId.indexOf('.');
    if (dotIdx > 0) {
      const parentId = paneId.slice(0, dotIdx);
      const pane = this.getConfigPane(parentId);
      const currentPanel = pane.panelStackTop;
      if (currentPanel !== paneId) {
        pane.navigateToSubPanel(parentId, paneId);
      }
      // Register per-provider models schema dynamically on navigation
      const modelsMatch = paneId.match(/^providers\.(\w+)\.models$/);
      if (modelsMatch) {
        this.registerProviderModelSchemas(pane, modelsMatch[1]);
      }
      return pane;
    }

    let pane = this._configPanes.get(paneId);
    if (!pane) {
      pane = new ConfigPane(this._panels, paneId);
      // Per-provider models sub-panel
      const modelsMatch = paneId.match(/^providers\.(\w+)\.models$/);
      if (modelsMatch) {
        this.registerProviderModelSchemas(pane, modelsMatch[1]);
      } else {
        this.registerPaneListViews(pane, paneId);
      }
      pane.onChange = (path, value) => {
        this.handlePaneConfigChange(paneId, path, value);
      };
      pane.onAction = (action, rowId, panelId) => {
        if (panelId === 'providers') {
          const cfg = UserConfig.instance();
          if (action === 'a') {
            const knownTypes = ['bedrock', 'anthropic', 'openai', 'gemini', 'ollama', 'openrouter', 'replicate'];
            // Register the type picker panel
            this._panels.set('providers.new', {
              id: 'providers.new',
              title: 'New Provider',
              items: knownTypes.map(t => ({
                id: `providers.new.${t}`,
                label: t,
                type: 'submenu' as const,
              })),
            });
            // Clean up any stale type-specific form panels
            for (const [key] of this._panels) {
              if (key.startsWith('providers.new.') && key !== 'providers.new') this._panels.delete(key);
            }
            // Push the type picker onto the panel stack and intercept navigation
            pane!.pushPanel('providers.new');
            const prevNavigate = pane!.onNavigate;
            pane!.onNavigate = (target: string) => {
              const match = target.match(/^providers\.new\.(\w+)$/);
              if (match) {
                const type = match[1] as IProviderConfig['type'];
                if (!knownTypes.includes(type)) return;
                const existingNames = cfg.providers.map(p => p.name ?? p.type);
                let newName: string = type;
                let suffix = 2;
                while (existingNames.includes(newName)) {
                  newName = `${type}-${suffix++}`;
                }
                const newProvider: IProviderConfig = { type, name: newName, models: [] };
                const providers = [...cfg.providers, newProvider];
                cfg.set('providers', providers);
                this.refreshSchemas('providers');
                pane!.resetPanelStack('providers');
                const providerRows = pane!.filteredRows;
                const newIdx = providerRows.findIndex((r: any) => r.id === newName);
                pane!.setCursor(newIdx >= 0 ? newIdx : 0);
                pane!.onNavigate = prevNavigate;
                pane!.openDetail();
                this.delegate.render();
                return;
              }
              prevNavigate?.(target);
            };
            this.delegate.render();
          } else if (action === 'd') {
            const providers = cfg.providers.filter(p => (p.name ?? p.type) !== rowId);
            cfg.set('providers', providers);
            if (cfg.defaultProvider === rowId) cfg.set('defaultProvider', '' as any);
            if (cfg.defaultModel && providers.every(p => !(p.models || []).some(m => (typeof m === 'string' ? m : m.name) === cfg.defaultModel!))) {
              cfg.set('defaultModel', '' as any);
              cfg.set('model', '');
            }
            this.refreshSchemas('providers');
            this.delegate.render();
          } else if (action === 'm') {
            this.delegate.setActiveChannel(`@providers.${rowId}.models`);
            this.delegate.render();
          }
        } else if (panelId.match(/^providers\.\w+\.models$/)) {
          const cfg = UserConfig.instance();
          const panelMatch = panelId.match(/^providers\.(\w+)\.models$/);
          const providerType = panelMatch![1];
          if (action === 'a') {
            // Add a placeholder model and open the detail view so user can name it
            const baseName = 'new-model';
            const existing = (cfg.providers.find(p => (p.name ?? p.type) === providerType)?.models ?? []);
            const newModelName = existing.some(m => (typeof m === 'string' ? m : m.name) === baseName) ? `${baseName}-${existing.length + 1}` : baseName;
            const providers = cfg.providers.map(p => {
              if ((p.name ?? p.type) === providerType) {
                const updated = { ...p, models: [...(p.models || []), { name: newModelName }] };
                // Auto-populate summaryModel if blank
                if (!updated.webpageSummarizationModel) updated.webpageSummarizationModel = newModelName;
                return updated;
              }
              return p;
            });
            cfg.set('providers', providers);
            if (!cfg.defaultModel) {
              cfg.set('defaultModel', newModelName);
              cfg.set('defaultProvider', providerType);
            }
            this.refreshSchemas('providers');
            this.refreshSchemas(panelId);
            // Auto-open detail view on the new model
            const modelPane = this._configPanes.get(panelId);
            if (modelPane) {
              const rows = modelPane.filteredRows;
              const fullId = `${providerType}-${newModelName}`;
              const newIdx = rows.findIndex((r: any) => r.id === fullId);
              if (newIdx >= 0) {
                modelPane.setCursor(newIdx);
                modelPane.openDetail();
              }
            }
            this.delegate.render();
          } else if (action === 'd') {
            if (rowId !== 'none') {
              const dashIdx = rowId.indexOf('-');
              const modelId = dashIdx > 0 ? rowId.slice(dashIdx + 1) : rowId;
              const providers = cfg.providers.map(p => {
                if ((p.name ?? p.type) === providerType) {
                  return { ...p, models: (p.models || []).filter(m => (typeof m === 'string' ? m : m.name) !== modelId) };
                }
                return p;
              });
              cfg.set('providers', providers);
              if (cfg.defaultModel === modelId) {
                cfg.set('defaultModel', '');
                cfg.set('defaultProvider', '');
              }
              this.refreshSchemas('providers');
              this.refreshSchemas(panelId);
              this.delegate.render();
            }
          }
        } else if (panelId === 'mcp' && action === 'a') {
          // Add a new MCP server entry and open the detail view for inline editing
          const existing = this.opts.menuConfig?.mcpConfigs ?? [];
          let idx = 1;
          let name = 'new-server';
          while (existing.some(c => c.name === name)) { idx++; name = `new-server-${idx}`; }
          const newEntry = { name, config: { transport: 'stdio', command: 'npx', args: [], env: {}, timeout: 60 } };
          const updated = [...existing, newEntry];
          if (this.opts.menuConfig) this.opts.menuConfig.mcpConfigs = updated;
          // Write to disk so onMcpConfigChange can find it on subsequent edits
          Promise.all([import('node:fs'), import('node:path'), import('node:os')]).then(([fs, path, os]) => {
            const file = path.join(os.homedir(), '.arma', 'mcp.json');
            fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf8');
          }).catch(() => {});
          this.refreshSchemas('mcp');
          this.delegate.render();
          // Open detail view on the new row
          const mcpPane = this._configPanes.get('mcp');
          if (mcpPane) {
            const newIdx = mcpPane.filteredRows.findIndex((r: any) => r.id === name);
            if (newIdx >= 0) {
              mcpPane.setCursor(newIdx);
              mcpPane.openDetail();
              this.delegate.render();
            }
          }
        } else if (panelId === 'mcp' && action === 'd' && rowId && rowId !== 'none') {
          // Remove from in-memory cache immediately so refreshSchemas sees the update
          if (this.opts.menuConfig) {
            this.opts.menuConfig.mcpConfigs = (this.opts.menuConfig.mcpConfigs ?? []).filter(c => c.name !== rowId);
          }
          if (this.opts.onMcpRemove) this.opts.onMcpRemove(rowId);
          this.refreshSchemas('mcp');
          this.delegate.render();
        } else if (panelId === 'mcp' && action === 'r' && rowId && rowId !== 'none') {
          this.opts.onSubmit(`/mcp restart ${rowId}`).catch(() => {});
        } else if (panelId === 'scheduler.workflows' && action === 'r') {
          this.opts.onSubmit(`/flow run ${rowId}`).catch(() => {});
        }
      };
      this._configPanes.set(paneId, pane);
    }
    return pane;
  }

  private registerProviderModelSchemas(pane: ConfigPane, providerKey: string): void {
    const cfg = UserConfig.instance();
    const provider = cfg.providers.find(p => (p.name ?? p.type) === providerKey);
    const modelRows = (provider?.models ?? []).map(m => {
      const mName = typeof m === 'string' ? m : m.name;
      return {
      id: `${providerKey}-${mName}`,
      status: 'active' as const,
      cells: {
        name: mName,
        provider: providerKey,
        context: '—',
        costIn: typeof m === 'object' && m.inputPrice != null ? String(m.inputPrice) : '—',
        costOut: typeof m === 'object' && m.outputPrice != null ? String(m.outputPrice) : '—',
        tpm: '—',
        rpm: '—',
        default: cfg.defaultModel === mName ? 'on' : 'off',
        // Hidden detail fields — populated so detail view shows current values
        maxTokens: String((provider as any)[`model_${mName}_maxTokens`] ?? '∞'),
        temperature: String((provider as any)[`model_${mName}_temperature`] ?? '1.0'),
        topP: String((provider as any)[`model_${mName}_topP`] ?? '1.0'),
        streaming: (provider as any)[`model_${mName}_streaming`] !== false ? 'on' : 'off',
        caching: (provider as any)[`model_${mName}_caching`] !== false ? 'on' : 'off',
        reasoningEffort: typeof m === 'object' && m.options ? (m.options as any).reasoning_effort ?? (m.options as any).output_config?.effort ?? '' : '',
      },
      };
    });

    registerSchema(pane, pane.currentPanelId, {
      id: pane.currentPanelId,
      title: `${provider?.name || providerKey} Models`,
      fields: [
        { key: 'name', label: 'Model', width: 30, sortable: true, detailType: 'text', description: 'Model ID (e.g. deepseek-chat, gpt-4o)' },
        { key: 'context', label: 'Context', width: 8, align: 'right' as const, sortable: true, detailType: 'readonly' },
        { key: 'costIn', label: '$/M in', width: 8, align: 'right' as const, sortable: true, detailType: 'text', description: 'Cost per million input tokens ($)' },
        { key: 'costOut', label: '$/M out', width: 8, align: 'right' as const, sortable: true, detailType: 'text', description: 'Cost per million output tokens ($)' },
        { key: 'tpm', label: 'TPM', width: 7, align: 'right' as const, sortable: true, detailType: 'readonly' },
        { key: 'rpm', label: 'RPM', width: 5, align: 'right' as const, sortable: true, detailType: 'readonly' },
        { key: 'default', label: 'Default', listVisible: false, detailType: 'toggle', defaultValue: false },
        { key: 'maxTokens', label: 'Max Output', listVisible: false, detailType: 'text', defaultValue: '∞' },
        { key: 'temperature', label: 'Temperature', listVisible: false, detailType: 'text', defaultValue: '1.0' },
        { key: 'topP', label: 'Top P', listVisible: false, detailType: 'text', defaultValue: '1.0' },
        { key: 'reasoningEffort', label: 'Reasoning Effort', listVisible: false, detailType: 'choice', choices: [
          { id: '', label: '(default)' },
          { id: 'low', label: 'low' },
          { id: 'medium', label: 'medium' },
          { id: 'high', label: 'high' },
          { id: 'xhigh', label: 'xhigh' },
          { id: 'max', label: 'max' },
        ], defaultValue: '', description: 'Effort level for reasoning models (openai: low/medium/high, deepseek: low/medium/high/xhigh/max, anthropic: low/medium/high/xhigh/max)' },
      ],
      actions: [
        { key: 'a', label: 'add' },
        { key: 'd', label: 'delete', danger: true, bulk: true },
      ],
      rows: modelRows.length > 0 ? modelRows : [
        { id: 'none', status: 'inactive' as const, cells: { name: '(no models)', provider: providerKey, context: '—', costIn: '—', costOut: '—', tpm: '—', rpm: '—' } },
      ],
      sortColumn: 'name',
      sortAsc: true,
      multiSelect: false,
    });

    pane.onNavigate = (target: string) => {
      this.delegate.setActiveChannel(target);
      this.delegate.render();
    };
  }

  private refreshSchemas(paneId: string): void {
    const pane = this._configPanes.get(paneId);
    if (!pane) return;
    registerConfigPanelSchemas(pane, paneId, (target: string) => {
      this.delegate.setActiveChannel(target);
      this.delegate.render();
    }, () => this.opts.menuConfig?.mcpConfigs);
    // Re-register sub-schemas on refresh so row values update from config
    if (paneId === 'session') registerSessionSchemas(pane);
    if (paneId === 'context') registerContextSchemas(pane);
    if (paneId === 'workspace') registerWorkspaceSchemas(pane);
    if (paneId === 'display') registerDisplaySchemas(pane);
  }

  private registerPaneListViews(pane: ConfigPane, paneId: string): void {
    const onNavigate = (target: string) => {
      this.delegate.setActiveChannel(target);
      this.delegate.render();
    };

    registerConfigPanelSchemas(pane, paneId, onNavigate, () => this.opts.menuConfig?.mcpConfigs);

    if (paneId === 'session') registerSessionSchemas(pane);
    if (paneId === 'context') registerContextSchemas(pane);
    if (paneId === 'workspace') registerWorkspaceSchemas(pane);
    if (paneId === 'display') registerDisplaySchemas(pane);
  }

  private handlePaneConfigChange(paneId: string, path: string, value: any): void {
    const cfg = UserConfig.instance();

    // Provider detail field edits from the CRM list/detail view
    if (paneId === 'providers' && path.startsWith('providers.')) {
      const parts = path.split('.');
      if (parts.length === 3) {
        const providerType = parts[1];
        let fieldKey = parts[2];
        // Safety: reject model edits that fell through — models is an array, not a scalar field
        if (fieldKey === 'models') return;
        const fieldMap: Record<string, string> = { authType: 'auth' };
        fieldKey = fieldMap[fieldKey] ?? fieldKey;
        // Map summaryModel (detail view field name) to webpageSummarizationModel (config key)
        if (fieldKey === 'summaryModel') fieldKey = 'webpageSummarizationModel';
        let coerced: any = value;
        if (value === 'on') coerced = true;
        else if (value === 'off') coerced = false;
        else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) coerced = Number(value);
        const providers = cfg.providers.map(p =>
          (p.name ?? p.type) === providerType ? { ...p, [fieldKey]: coerced } : p
        );
        cfg.set('providers', providers);
        this.refreshSchemas('providers');
        return;
      }
    }

    // Model detail field edits (per-provider models list)
    const providerModelMatch = path.match(/^providers\.(\w+)\.models\.(.+)\.(.+)$/);
    if (providerModelMatch) {
      const rowId = providerModelMatch[2];
      const fieldKey = providerModelMatch[3];
      if (rowId && fieldKey) {
        const dashIdx = rowId.indexOf('-');
        const providerType = providerModelMatch[1];
        const modelId = dashIdx > 0 ? rowId.slice(dashIdx + 1) : rowId;
        if (providerType) {
          let coerced: any = value;
          if (value === 'on') coerced = true;
          else if (value === 'off') coerced = false;
          else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) coerced = Number(value);

          // Handle 'default' toggle: update the global defaultModel/defaultProvider
          if (fieldKey === 'default') {
            if (coerced === true) {
              cfg.set('defaultModel', modelId);
              cfg.set('defaultProvider', providerType);
            } else if (coerced === false && cfg.defaultModel === modelId) {
              cfg.set('defaultModel', '');
              cfg.set('defaultProvider', '');
            }
            const providersPane = this._configPanes.get('providers');
            if (providersPane) this.registerProviderModelSchemas(providersPane, providerType);
            return;
          }

          const providers = cfg.providers.map(p => {
            if ((p.name ?? p.type) === providerType) {
              if (fieldKey === 'name' && coerced && coerced !== modelId) {
                const models = (p.models || []).map(m => (typeof m === 'string' ? m : m.name) === modelId ? { ...(typeof m === 'string' ? { name: m } : m), name: coerced } : m);
                return { ...p, models };
              }
              if (fieldKey === 'reasoningEffort') {
                // Store in model.options.reasoning_effort (nested object on the model)
                const models = (p.models || []).map(m => {
                  const mName = typeof m === 'string' ? m : m.name;
                  if (mName !== modelId) return m;
                  const current = typeof m === 'string' ? { name: m, options: {} } : { ...m };
                  if (!current.options) current.options = {};
                  if (!coerced) {
                    delete (current.options as any).reasoning_effort;
                    if (Object.keys(current.options).length === 0) delete current.options;
                  } else {
                    (current.options as any).reasoning_effort = coerced;
                  }
                  return current;
                });
                return { ...p, models };
              }
              if (fieldKey === 'costIn' || fieldKey === 'costOut') {
                const priceKey = fieldKey === 'costIn' ? 'inputPrice' : 'outputPrice';
                const numVal = coerced === '' ? undefined : Number(coerced);
                const models = (p.models || []).map(m => {
                  const mName = typeof m === 'string' ? m : m.name;
                  if (mName !== modelId) return m;
                  const current = typeof m === 'string' ? { name: m } : { ...m };
                  if (numVal === undefined || isNaN(numVal)) {
                    delete (current as any)[priceKey];
                  } else {
                    (current as any)[priceKey] = numVal;
                  }
                  return current;
                });
                return { ...p, models };
              }
              return { ...p, [`model_${modelId}_${fieldKey}`]: coerced };
            }
            return p;
          });
          cfg.set('providers', providers);
        }
      }
      // Refresh per-provider models panel and provider list model counts
      this.refreshSchemas('providers');
      const providersPane = this._configPanes.get('providers');
      if (providersPane) {
        this.registerProviderModelSchemas(providersPane, providerModelMatch[1]);
      }
      return;
    }

    // MCP server detail field changes
    const mcpMatch = path.match(/^mcp\.(.+)\.(.+)\.value$/);
    if (mcpMatch) {
      const serverName = mcpMatch[1];
      const fieldKey = mcpMatch[2];
      if (this.opts.onMcpConfigChange) {
        let coerced: any = value;
        if (value === 'on') coerced = true;
        else if (value === 'off') coerced = false;
        else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) coerced = Number(value);
        this.opts.onMcpConfigChange(serverName, fieldKey, coerced);
      }
      return;
    }

    const configPathMap: Record<string, string> = {
      // Session main
      'session.streaming.value': 'session.streaming',
      'session.autoSave.value': 'session.autoSave',
      'session.showThinkingInBuffer.value': 'session.showThinkingInBuffer',
      'session.showThinkingOverlay.value': 'session.showThinkingOverlay',
      'session.promptCaching.value': 'session.promptCaching',
      'session.maxTurns.value': 'session.maxTurns',
      'session.timeout.value': 'session.conversationTimeout',
      // Web
      'session.braveApiKey.value': 'web.braveApiKey',
      // Session budget
      'session.budget.enabled.value': 'session.budgetEnabled',
      'session.budget.amount.value': 'session.budgetAmount',
      // Context
      'context.maxTokens.value': 'context.maxTokens',
      'context.compactThreshold.value': 'context.compactThreshold',
      'context.recentMessages.value': 'context.recentMessages',
      'context.maxSnapshots.value': 'context.maxSnapshots',
      'context.autoCompact.value': 'context.autoCompact',
      'context.strategy.value': 'context.strategy',
      // Workspace
      'workspace.mode.value': 'workspace.mode',
      'workspace.allowedPaths.value': 'workspace.allowedPaths',
      'workspace.denyPaths.value': 'workspace.denyPaths',
      'workspace.gitAutoCommit.value': 'workspace.gitAutoCommit',
      'workspace.fileWatcher.value': 'workspace.fileWatcher',
      'workspace.maxFileSize.value': 'workspace.maxFileSize',
      'workspace.encoding.value': 'workspace.encoding',
      // Display
      'display.theme.value': 'display.theme',
      'display.showThinking.value': 'display.showThinking',
      'display.showToolCalls.value': 'display.showToolCalls',
      'display.compact.value': 'display.compact',
      'display.verbose.value': 'display.verbose',
      'display.timestamps.value': 'display.timestamps',
      'display.syntaxHighlighting.value': 'display.syntaxHighlighting',
      'display.maxOutputLines.value': 'display.maxOutputLines',
      'display.renderInterval.value': 'display.renderInterval',
      // Display font
      'display.font.size.value': 'display.fontSize',
      'display.font.family.value': 'display.fontFamily',
      'display.font.weight.value': 'display.fontWeight',
      'display.font.lineHeight.value': 'display.lineHeight',
    };

    const cfgPath = configPathMap[path];
    if (cfgPath) {
      let coerced: any = value;
      if (value === 'on') coerced = true;
      else if (value === 'off') coerced = false;
      else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) coerced = Number(value);
      else if (typeof value === 'string' && value.endsWith('m') && /^\d+m$/.test(value)) coerced = Number(value.slice(0, -1));
      cfg.setPath(cfgPath, coerced);
      // Refresh session pane rows after change so toggled values show immediately
      if (cfgPath.startsWith('session.') || cfgPath.startsWith('web.')) {
        this.refreshSchemas('session');
        this.refreshSchemas('session.budget');
      }
    }

    if (cfgPath === 'display.theme') {
      this.opts.theme = value;
      this.delegate.render();
    }
    if (cfgPath === 'session.showThinkingInBuffer') {
      this.opts.showThinkingInBuffer = typeof value === 'boolean' ? value : value === 'on';
      this.delegate.render();
    }
    if (cfgPath === 'session.showThinkingOverlay') {
      this.opts.showThinkingOverlay = typeof value === 'boolean' ? value : value === 'on';
      this.delegate.render();
    }
    if (cfgPath === 'display.renderInterval') {
      this.delegate.setRenderInterval(typeof value === 'number' ? value : Number(value) || 16);
    }
  }
}
