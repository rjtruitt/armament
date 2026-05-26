/**
 * Handles SessionMenu config:change and config:save events,
 * persisting user configuration changes to UserConfig and
 * triggering MCP lifecycle callbacks.
 */

import { SessionMenu } from '../tui/index.js';
import { THEMES } from '../rendering/index.js';
import { UserConfig } from '../config/index.js';
import type { TuiRendererOptions } from './TuiTypes.js';

/** Callback interface for notifying the parent of mode transitions. */
export interface ConfigHandlerDelegate {
  render(): void;
  setMode(mode: 'chat' | 'config'): void;
  unlockFocus(): void;
  setMenuRegionVisible(visible: boolean): void;
}

/**
 * Wires SessionMenu events (config:change, config:save, menu:complete, menu:hide)
 * to persistent UserConfig storage and MCP lifecycle callbacks.
 */
export class TuiConfigHandler {
  private sessionMenu: SessionMenu;
  private opts: TuiRendererOptions;
  private delegate: ConfigHandlerDelegate;

  constructor(sessionMenu: SessionMenu, opts: TuiRendererOptions, delegate: ConfigHandlerDelegate) {
    this.sessionMenu = sessionMenu;
    this.opts = opts;
    this.delegate = delegate;
  }

  /** Attach all event listeners to the session menu. Call once during construction. */
  wireEvents(): void {
    this.sessionMenu.on('menu:complete', () => {
      this.delegate.setMode('chat');
      this.delegate.unlockFocus();
      this.delegate.render();
    });

    this.sessionMenu.on('menu:hide', () => {
      this.delegate.setMode('chat');
      this.delegate.unlockFocus();
      this.delegate.setMenuRegionVisible(false);
      this.delegate.render();
    });

    this.sessionMenu.on('config:change', (data: { path: string; value: any }) => {
      this.handleConfigChange(data);
    });

    this.sessionMenu.on('config:save', (data: { path: string; fields: Record<string, any> }) => {
      this.handleConfigSave(data);
    });
  }

  private handleConfigChange(data: { path: string; value: any }): void {
    const userConfig = UserConfig.instance();

    if (data.path === 'display.theme') {
      const theme = data.value;
      userConfig.set('theme', theme);
      if (theme === 'random') {
        const themes = Object.keys(THEMES);
        this.opts.theme = themes[Math.floor(Math.random() * themes.length)];
      } else {
        this.opts.theme = theme;
      }
      this.delegate.render();
    } else if (data.path === 'models.default') {
      userConfig.set('defaultModel', data.value);
      const provider = userConfig.providers.find(p => p.models?.some(m => (typeof m === 'string' ? m : m.name) === data.value));
      if (provider) userConfig.set('defaultProvider', provider.type);
    } else if (data.path.match(/^providers\.\w+\.settings\.defaultModel$/)) {
      const providerName = data.path.split('.')[1];
      const providers = userConfig.providers.map(p => {
        if (p.type === providerName) return { ...p, defaultModel: data.value };
        return p;
      });
      userConfig.set('providers', providers);
    } else if (data.path.endsWith('.remove') || data.path.endsWith('.delete')) {
      this.handleRemove(data, userConfig);
    } else if (data.path.startsWith('mcp.') && !data.path.startsWith('mcp.new')) {
      const parts = data.path.split('.');
      const serverName = parts[1];
      const fieldPath = parts.slice(2).join('.');
      if (serverName && fieldPath && this.opts.onMcpConfigChange) {
        this.opts.onMcpConfigChange(serverName, fieldPath, data.value);
      }
    }
  }

  private handleRemove(data: { path: string; value: any }, userConfig: UserConfig): void {
    const parts = data.path.split('.');
    if (parts[0] === 'mcp' && parts.length >= 3) {
      const serverName = parts[1];
      if (this.opts.onMcpRemove) this.opts.onMcpRemove(serverName);
    } else if (parts[0] === 'providers') {
      const providers = [...userConfig.providers];
      if (parts.length === 3) {
        const providerName = parts[1];
        const updated = providers.filter(p => p.type !== providerName);
        userConfig.set('providers', updated);
        this.sessionMenu.rebuildPanels({
          providers: updated.map(p => p.type),
          providerConfigs: updated.map(p => ({ type: p.type, models: (p.models || []).map(m => typeof m === 'string' ? m : m.name) })),
        });
      } else if (parts.length >= 5 && parts[2] === 'models') {
        const providerName = parts[1];
        const modelName = parts.slice(3, parts.length - 1).join('.');
        const updated = providers.map(p => {
          if (p.type === providerName) {
            return { ...p, models: (p.models || []).filter(m => (typeof m === 'string' ? m : m.name) !== modelName) };
          }
          return p;
        });
        userConfig.set('providers', updated);
        this.sessionMenu.rebuildPanels({
          providers: updated.map(p => p.type),
          providerConfigs: updated.map(p => ({ type: p.type, models: (p.models || []).map(m => typeof m === 'string' ? m : m.name) })),
        });
      }
    }
  }

  private handleConfigSave(data: { path: string; fields: Record<string, any> }): void {
    const userConfig = UserConfig.instance();
    const { path, fields } = data;

    if (path.startsWith('providers.new.') && path.endsWith('.save')) {
      this.saveNewProvider(path, fields, userConfig);
    } else if (path.match(/^providers\.\w+\.models\.new\.save$/)) {
      this.saveNewModel(path, fields, userConfig);
    } else if (path === 'mcp.new.save') {
      this.saveNewMcp(fields);
    }
  }

  private saveNewProvider(path: string, fields: Record<string, any>, userConfig: UserConfig): void {
    const providerType = path.split('.')[2];
    const providers = [...userConfig.providers];
    const existingIdx = providers.findIndex(p => p.type === providerType);
    const newProvider: any = { type: providerType, models: [] };
    for (const [fieldId, value] of Object.entries(fields)) {
      const key = fieldId.split('.').pop()!;
      if (key !== 'save' && value) newProvider[key] = value;
    }
    if (existingIdx >= 0) {
      providers[existingIdx] = { ...providers[existingIdx], ...newProvider };
    } else {
      providers.push(newProvider);
    }
    userConfig.set('providers', providers);
    this.sessionMenu.rebuildPanels({
      providers: providers.map(p => p.type),
      providerConfigs: providers.map(p => ({ type: p.type, models: (p.models || []).map(m => typeof m === 'string' ? m : m.name) })),
    });
  }

  private saveNewModel(path: string, fields: Record<string, any>, userConfig: UserConfig): void {
    const providerName = path.split('.')[1];
    const modelIdField = Object.entries(fields).find(([k]) => k.endsWith('.id'));
    const modelId = modelIdField?.[1];
    if (modelId) {
      const providers = userConfig.providers.map(p => {
        if (p.type === providerName) {
          const models = [...(p.models || [])];
          if (!models.some(m => (typeof m === 'string' ? m : m.name) === modelId)) models.push({ name: modelId });
          return { ...p, models };
        }
        return p;
      });
      userConfig.set('providers', providers);
      this.sessionMenu.rebuildPanels({
        providers: providers.map(p => p.type),
        providerConfigs: providers.map(p => ({ type: p.type, models: (p.models || []).map(m => typeof m === 'string' ? m : m.name) })),
      });
    }
  }

  private saveNewMcp(fields: Record<string, any>): void {
    const nameField = Object.entries(fields).find(([k]) => k.endsWith('.name'));
    const serverName = nameField?.[1];
    if (!serverName) return;

    const getField = (suffix: string) => {
      const entry = Object.entries(fields).find(([k]) => k.endsWith(`.${suffix}`));
      return entry?.[1];
    };

    const mcpConfig: any = {
      transport: getField('transport') || 'stdio',
    };
    if (mcpConfig.transport === 'stdio') {
      if (getField('command')) mcpConfig.command = getField('command');
      if (getField('args')) mcpConfig.args = getField('args');
    } else {
      if (getField('url')) mcpConfig.url = getField('url');
    }
    if (getField('env')) mcpConfig.env = getField('env');
    if (getField('headers')) mcpConfig.headers = getField('headers');

    const authType = getField('auth.type') || getField('type');
    if (authType && authType !== 'none') {
      mcpConfig.auth = { type: authType };
      const authFields = ['clientName', 'clientId', 'clientSecret', 'scopes',
        'resource', 'authUrl', 'tokenUrl', 'apiKey', 'headerName', 'token', 'pkce'];
      for (const f of authFields) {
        const val = getField(`auth.${f}`) || getField(f);
        if (val !== undefined && val !== '') mcpConfig.auth[f] = val;
      }
    }

    if (this.opts.onMcpAdd) this.opts.onMcpAdd(serverName, mcpConfig);
  }
}
