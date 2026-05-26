/**
 * Shared type definitions for the TUI renderer subsystem.
 * Extracted to avoid circular imports between renderer modules.
 */

import type { RGB } from '../rendering/index.js';

export type { RGB };

/** Metadata for a collapsible tool execution block in the chat view. */
export interface ToolBlock {
  id: number;
  toolName: string;
  description: string;
  result: { success: boolean; data?: string; error?: string };
  durationMs: number;
  expanded: boolean;
  lineIndex: number;
  pending?: boolean;
  startedAt?: number;
}

/** Provider configuration surfaced in the session menu. */
export interface TuiProviderInfo {
  type: string;
  models: string[];
  region?: string;
  profile?: string;
}

/** Configuration passed to the session/config menu on construction. */
export interface TuiMenuConfig {
  providers?: TuiProviderInfo[];
  mcpServers?: string[];
  mcpConfigs?: Array<{ name: string; config: any }>;
  model?: string;
  budget?: string;
  mcpClientName?: string;
}

/** Per-channel status metadata displayed in the status bar. */
export interface ChannelStatus {
  tokens: number;
  cacheRead: number;
  cacheWrite: number;
  model: string;
  provider: string;
  status: 'idle' | 'thinking' | 'tool_use' | 'complete' | 'error';
  contextPercent?: number;
  contextTokens?: number;
}

/** All callbacks and configuration for creating a TuiRenderer instance. */
export interface TuiRendererOptions {
  theme?: string;
  noColor?: boolean;
  mouse?: boolean;
  menuConfig?: TuiMenuConfig;
  onSubmit: (text: string) => Promise<void>;
  onExit: () => void;
  onInterrupt?: () => void;
  isProcessing?: () => boolean;
  onChannelSwitch?: (channel: string) => void;
  onMcpAdd?: (name: string, config: any) => void;
  onMcpConfigChange?: (serverName: string, fieldPath: string, value: any) => void;
  onMcpRemove?: (serverName: string) => void;
  onMcpShow?: () => void;
  getChannelStatus?: (channel: string) => ChannelStatus | null;
  getMcpStatus?: () => Array<{ name: string; status: string }>;
  onMcpAuth?: (serverName: string) => void;
  formatPrompt?: () => string;
  getAvailableModels?: () => Array<{ provider: string; model: string }>;
  onModelSelect?: (provider: string, model: string) => void;
  onNewChannel?: (channel: string) => void;
  getCommandDispatch?: () => import('./CommandDispatch.js').CommandDispatch | null;
}

/** Backward-compat alias. */
export type TuiModeOptions = TuiRendererOptions;

/** Data displayed in the TUI control dashboard panel.
 * @property {Array<{ name: string; status: string; tokens: number; contextPercent: number }>} channels - Per-channel status summary with token and context usage.
 * @property {number} totalTokens - Aggregate token usage across all channels.
 * @property {number} totalCost - Aggregate accumulated cost across all channels.
 * @property {number} activeWorkers - Number of currently active worker agents.
 * @property {number} uptime - Session uptime in seconds.
 */
export interface ControlDashboardData {
  channels: Array<{ name: string; status: string; tokens: number; contextPercent: number }>;
  totalTokens: number;
  totalCost: number;
  activeWorkers: number;
  uptime: number;
}

/** Rotating messages shown during agent thinking state. */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Thinking messages.
 */
export const THINKING_MESSAGES = [
  'Traversing latent space',
  'Attending to context',
  'Sampling token distributions',
  'Propagating through layers',
  'Computing attention heads',
  'Following the gradient',
  'Crystallizing a response',
  'Parsing the signal',
  'Weighing possibilities',
  'Resolving embeddings',
  'Decoding intent',
  'Activating pathways',
  'Correlating patterns',
  'Navigating the manifold',
  'Synthesizing output',
  'Consulting the weights',
  'Unfolding representations',
  'Projecting into token space',
  'Collapsing the wavefunction',
  'Loading context vectors',
];
