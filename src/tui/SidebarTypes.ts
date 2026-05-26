type RGB = [number, number, number];

/** Stats displayed in the sidebar for pending approvals and MCP server statuses. */
export interface SidebarStats {
  pendingApprovals?: number;
  mcpServers?: Array<{ name: string; status: string }>;
}

/** Theme configuration for sidebar rendering including accent color and focus state. */
export interface SidebarTheme {
  accent: RGB;
  noColor?: boolean;
  focused?: boolean;
  activeChannel?: string | null;
  stats?: SidebarStats;
}

/** Coordinates and dimensions of a sidebar region on screen. */
export interface SidebarRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Info about a single channel displayed in the sidebar. */
export interface ChannelInfo {
  name: string;
  active: boolean;
  unread: number;
  model?: string;
  status?: string;
  provider?: string;
  section: string;
  children?: ChannelChild[];
}

/** A child entry nested under a channel, representing a sub-channel or agent. */
export interface ChannelChild {
  id: string;
  label: string;
  model?: string;
  status?: string;
  role?: 'operator' | 'worker';
}

/** Token and cost statistics for a model. */
export interface ModelStats {
  tokens: number;
  cost: number;
  cacheRead: number;
  cacheWrite: number;
  agents: number;
}

/** A provider entry displayed in the sidebar with connection status and model stats. */
export interface ProviderEntry {
  name: string;
  type?: string;
  connected: boolean;
  models: Map<string, ModelStats>;
}

/** A scheduled job entry with status and schedule information. */
export interface ScheduledJobEntry {
  name: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  schedule?: string;
  lastRun?: Date;
  nextRun?: Date;
}
