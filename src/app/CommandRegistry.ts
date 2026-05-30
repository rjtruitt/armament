/** Describes a single slash command in the registry. */
export interface CommandEntry {
  name: string;
  description: string;
  usage?: string;
  category: 'irc' | 'standard' | 'config';
  handler?: string;
}
const COMMANDS: CommandEntry[] = [
  // IRC-style
  { name: 'join', description: 'Create/switch to agent channel', usage: '/join <name>', category: 'irc' },
  { name: 'part', description: 'Leave/close an agent channel', usage: '/part [name]', category: 'irc' },
  { name: 'leave', description: 'Leave/close an agent channel', usage: '/leave [name]', category: 'irc' },
  { name: 'spawn', description: 'Spawn a new agent in its own channel', usage: '/spawn <name> [--model m] [--provider p]', category: 'irc' },
  { name: 'kill', description: 'Kill a running agent', usage: '/kill <name>', category: 'irc' },
  { name: 'list', description: 'List all channels/agents', usage: '/list', category: 'irc' },
  { name: 'switch', description: 'Switch active channel', usage: '/switch <n|name>', category: 'irc' },
  { name: 'msg', description: 'Send message to specific agent', usage: '/msg <agent> <message>', category: 'irc' },
  { name: 'whois', description: 'Show agent info (model, tokens, cost)', usage: '/whois <agent>', category: 'irc' },
  { name: 'nick', description: 'Rename current agent', usage: '/nick <name>', category: 'irc' },
  { name: 'topic', description: 'Set system prompt for current channel', usage: '/topic <prompt>', category: 'irc' },
  { name: 'who', description: 'Show agents in current channel', usage: '/who', category: 'irc' },
  // Standard
  { name: 'help', description: 'Show available commands', usage: '/help', category: 'standard' },
  { name: 'quit', description: 'Exit armament', usage: '/quit', category: 'standard' },
  { name: 'clear', description: 'Clear screen', usage: '/clear', category: 'standard' },
  { name: 'clear-session', description: 'Delete saved session data', usage: '/clear-session', category: 'standard' },
  { name: 'status', description: 'Show session status', usage: '/status', category: 'standard' },
  { name: 'tools', description: 'List available tools', usage: '/tools', category: 'standard' },
  { name: 'model', description: 'Show/change model', usage: '/model [name]', category: 'standard' },
  { name: 'cost', description: 'Show cost summary', usage: '/cost', category: 'standard' },
  { name: 'context', description: 'Show context usage', usage: '/context', category: 'standard' },
  { name: 'history', description: 'Show conversation history', usage: '/history', category: 'standard' },
  { name: 'undo', description: 'Undo last action', usage: '/undo', category: 'standard' },
  { name: 'retry', description: 'Retry last action', usage: '/retry', category: 'standard' },
  { name: 'save_context', description: 'Save context for future use', usage: '/save_context <name> [description]', category: 'standard' },
  { name: 'load_context', description: 'Load a saved context', usage: '/load_context [name]', category: 'standard' },
  { name: 'plan', description: 'Show/create plan', usage: '/plan', category: 'standard' },
  { name: 'run', description: 'Run .arma script', usage: '/run <script>', category: 'standard' },
  { name: 'compact', description: 'Compact context window (summarize old messages)', usage: '/compact', category: 'standard' },
  { name: 'pin', description: 'Pin a file to survive compaction', usage: '/pin <filepath>', category: 'standard' },
  { name: 'unpin', description: 'Unpin a file', usage: '/unpin <filepath>', category: 'standard' },
  { name: 'stats', description: 'Show session statistics', usage: '/stats', category: 'standard' },
  { name: 'stickynote', description: 'Add/list sticky note reminders', usage: '/stickynote [text]', category: 'standard' },
  { name: 'sticky', description: 'Add/list sticky note reminders', usage: '/sticky [text]', category: 'standard' },
  { name: 'unsticky', description: 'Remove a sticky note', usage: '/unsticky <index>', category: 'standard' },
  { name: 'setroot', description: 'Set custom root directory for this channel', usage: '/setroot <path>', category: 'standard' },
  { name: 'flow list', description: 'List available workflows', usage: '/flow list', category: 'standard' },
  { name: 'flow run', description: 'Run a workflow', usage: '/flow run <name>', category: 'standard' },
  { name: 'flow test', description: 'Dry-run a workflow (validate + show steps)', usage: '/flow test <name>', category: 'standard' },
  { name: 'plugin', description: 'Manage plugins', usage: '/plugin [list|install|uninstall|info|reload]', category: 'standard' },
  { name: 'plugin run', description: 'Run a plugin command (picker)', usage: '/plugin run', category: 'standard' },
  // Config
  { name: 'thinking', description: 'Toggle thinking display', usage: '/thinking', category: 'config' },
  { name: 'verbose', description: 'Toggle verbose mode', usage: '/verbose', category: 'config' },
  { name: 'permissions', description: 'Show permission settings', usage: '/permissions', category: 'config' },
  { name: 'mcp', description: 'Show MCP server status', usage: '/mcp', category: 'config' },
  { name: 'mcp add', description: 'Add an MCP server', usage: '/mcp add {"url":"...","transport":"..."}', category: 'config' },
  { name: 'mcp list', description: 'List MCP servers', usage: '/mcp list', category: 'config' },
  { name: 'mcp restart', description: 'Restart an MCP server', usage: '/mcp restart <name>', category: 'config' },
  { name: 'providers', description: 'Show provider status', usage: '/providers', category: 'config' },
  { name: 'provider', description: 'Show/change provider for this channel', usage: '/provider [name]', category: 'config' },
  { name: 'theme', description: 'Show/change theme', usage: '/theme [name]', category: 'config' },
  { name: 'config', description: 'Open configuration menu', usage: '/config', category: 'config' },
  { name: 'set', description: 'Set config value', usage: '/set <key> <value>', category: 'config' },
  { name: 'auth', description: 'Manage provider authentication', usage: '/auth [provider]', category: 'config' },
  { name: 'health', description: 'Run provider health checks', usage: '/health', category: 'config' },
  { name: 'fallback', description: 'Configure model fallback chain', usage: '/fallback [models...]', category: 'config' },
  { name: 'font', description: 'Change UI font size', usage: '/font bigger|smaller|reset', category: 'config' },
  { name: 'channel_config', description: 'Open channel config menu', usage: '/channel_config', category: 'config' },
];
/** Get deduplicated list of unique command names with / prefix. */
export function getCommandNames(): string[] {
  return [...new Set(COMMANDS.map(c => `/${c.name.split(' ')[0]}`))];
}
/** Get all commands suitable for display in the command palette. */
export function getCommandsForPalette(): CommandEntry[] {
  return COMMANDS;
}