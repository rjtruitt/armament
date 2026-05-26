/** Describes a configured AI provider with its available models. */
export interface ProviderInfo {
  type: string;
  models: string[];
  region?: string;
  profile?: string;
}
/** Full session configuration produced by the menu. */
export interface SessionMenuConfig {
  workspace: string;
  budget: string;
  model: string;
  providers: string[];
  providerConfigs: ProviderInfo[];
  mcpServers: string[];
  denyPaths: string[];
  nodes: string;
  theme: string;
  mcpClientName?: string;
}
/** Stored configuration for an MCP server connection. */
export interface McpServerConfig {
  name: string;
  config: {
    url?: string;
    command?: string;
    args?: string;
    transport?: string;
    env?: string;
    headers?: string;
    auth?: {
      type?: string;
      clientName?: string;
      clientId?: string;
      clientSecret?: string;
      authUrl?: string;
      tokenUrl?: string;
      registrationUrl?: string;
      scopes?: string;
      apiKey?: string;
      token?: string;
      headerName?: string;
      redirectUri?: string;
      refreshToken?: string;
      pkce?: boolean;
      resource?: string;
    };
  };
}
/** Options passed to the SessionMenu constructor. */
export interface SessionMenuOptions {
  workspace?: string;
  budget?: string;
  model?: string;
  providers?: ProviderInfo[];
  mcpServers?: string[];
  mcpConfigs?: McpServerConfig[];
  denyPaths?: string[];
  nodes?: string;
  theme?: string;
  debug?: boolean;
  mcpClientName?: string;
}
/** Discriminated union of menu item interaction modes. */
export type MenuItemType = 'submenu' | 'toggle' | 'choice' | 'text' | 'json' | 'display';
/** A single item within a menu panel. */
export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  type: MenuItemType;
  value?: any;
  choices?: { id: string; label: string; description?: string; enabled?: boolean }[];
  children?: MenuItem[];
  readonly?: boolean;
  hidden?: boolean;
  showWhen?: { field: string; values: string[] };
}
/** A navigable panel containing menu items. */
export interface MenuPanel {
  id: string;
  title: string;
  items: MenuItem[];
  parent?: string;
}
/** Legacy flat-list item definition for the original SESSION CONFIG view. */
export interface LegacyMenuItemDef {
  key: string;
  label: string;
  configKey: keyof SessionMenuConfig;
}
import type { RGB } from '../../rendering/index.js';
export type { RGB };