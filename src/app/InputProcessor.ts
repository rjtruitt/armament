/**
 * InputProcessor — handles input queuing, message routing, and approval resolution.
 *
 * Extracted from ArmamentApp to separate input processing concerns from the
 * composition root. Manages the input queue, processes user messages, and
 * handles approval channel interactions.
 */

import type { TuiRenderer } from './TuiRenderer.js';
import type { CommandDispatch, CommandContext } from './CommandDispatch.js';
import type { PluginLoader } from '../plugins/index.js';

/**
 * Approval entry interface.
 */
export interface ApprovalEntry {
  resolve: (response: string) => void;
  question: string;
  options?: string[];
  source: string;
}

/**
 * Input processor deps interface.
 */
export interface InputProcessorDeps {
  getTui: () => TuiRenderer | null;
  getActiveChannelName: () => string | undefined;
  getUserNick: () => string;
  getAgentNick: () => string;
  getCommandDispatch: () => CommandDispatch;
  getPluginLoader: () => PluginLoader;
  buildCommandContext: () => CommandContext;
  getPendingApprovals: () => Map<string, ApprovalEntry>;
  getInputQueue: () => any[];
  isProcessingInput: (channel: string) => boolean;
  setProcessingInput: (channel: string, state: boolean) => void;
  getInterrupted: (channel: string) => boolean;
  setInterrupted: (channel: string, state: boolean) => void;
  setInterruptCount: (channel: string, count: number) => void;
  handleUserMessage: (input: string) => Promise<string | void>;
  injectPluginContext: (cmd: string, content: any, args: string[]) => void;
  stop: () => void;
  clearSession: () => void;
  output: (text: string) => void;
}

/**
 * Process a slash command. Returns true if handled, false if not recognized.
 */
export function processSlashCommand(input: string, deps: InputProcessorDeps): boolean {
  const trimmed = input.trim();
  const cmd = trimmed.split(/\s+/)[0].toLowerCase();

  if (cmd === '/quit' || cmd === '/exit' || cmd === '/q') {
    const quitArgs = trimmed.split(/\s+/).slice(1);
    if (quitArgs[0] === 'clear' || quitArgs[0] === '--clear') deps.clearSession();
    deps.stop();
    return true;
  }

  const result = deps.getCommandDispatch().dispatch(trimmed, deps.buildCommandContext());
  if (result.handled) {
    if (result.output) deps.output(result.output);
    return true;
  }

  const pluginCmd = trimmed.split(/\s+/)[0].slice(1);
  const content = deps.getPluginLoader().getCommandWithReferences(pluginCmd);
  if (content) {
    const pluginArgs = trimmed.split(/\s+/).slice(1);
    deps.injectPluginContext(pluginCmd, content, pluginArgs);
    return true;
  }

  return false;
}

/**
 * Handle approval response when the user types in the #approvals channel.
 */
export function handleApprovalResponse(
  response: string,
  deps: InputProcessorDeps,
): void {
  const pendingApprovals = deps.getPendingApprovals();
  const entry = pendingApprovals.entries().next().value;
  if (!entry) return;
  const [approvalId, approval] = entry;
  pendingApprovals.delete(approvalId);
  const tui = deps.getTui();
  tui?.writeMessage('user', deps.getUserNick(), response, '#approvals');
  tui?.removeApproval(approvalId);
  tui?.writeMessage('system', '*', `✓ ${approval.source}: "${response}"`, '#approvals');
  tui?.writeMessage('system', '*', `Approval from ${approval.source} resolved: "${response}"`, '#control');
  approval.resolve(response);
}

/**
 * Resolve a channel-specific pending approval if the user types in that channel.
 */
export function resolveChannelApproval(
  trimmed: string,
  targetChannel: string,
  deps: InputProcessorDeps,
): boolean {
  const pendingApprovals = deps.getPendingApprovals();
  if (pendingApprovals.size === 0) return false;

  const match = [...pendingApprovals.entries()]
    .find(([, a]) => a.source === targetChannel);
  if (!match) return false;

  const [approvalId, approval] = match;
  pendingApprovals.delete(approvalId);
  const tui = deps.getTui();
  tui?.removeApproval(approvalId);
  tui?.writeMessage('system', '*', `✓ ${approval.source}: "${trimmed}"`, '#approvals');
  approval.resolve(trimmed);
  return true;
}

/** A queued message with its original channel context. */
export interface QueuedMessage {
  text: string;
  channel: string;
}

/**
 * Queue a message for later processing if already handling input on the same channel.
 * Returns true if the message was queued, false if it should be processed immediately.
 */
export function tryQueueMessage(
  trimmed: string,
  currentChannel: string,
  deps: InputProcessorDeps,
): boolean {
  // Only queue if this specific channel is the one currently being processed
  if (!deps.isProcessingInput(currentChannel)) return false;

  const queue = deps.getInputQueue();
  const last = queue[queue.length - 1];
  const lastText = typeof last === 'string' ? last : (last as QueuedMessage)?.text;
  if (lastText === trimmed) return true; // duplicate

  queue.push({ text: trimmed, channel: currentChannel ?? '' });
  const tui = deps.getTui();
  if (tui) tui.stageMessage(deps.getUserNick(), trimmed, currentChannel);
  return true;
}

/**
 * Drain the input queue, processing messages sequentially.
 * Only processes messages for the specified channel — others stay queued.
 */
export async function drainInputQueue(
  channel: string,
  processMessage: (msg: string, channel?: string) => Promise<void>,
  deps: InputProcessorDeps,
): Promise<void> {
  const queue = deps.getInputQueue();
  const remaining: any[] = [];
  while (queue.length > 0) {
    const entry = queue.shift()!;
    const text = typeof entry === 'string' ? entry : (entry as QueuedMessage).text;
    const entryChannel = typeof entry === 'string' ? undefined : (entry as QueuedMessage).channel;
    // Only process messages for the specified channel — requeue others
    if (entryChannel && entryChannel !== channel) {
      remaining.push(entry);
    } else {
      await processMessage(text, entryChannel);
    }
  }
  // Put back messages for other channels
  for (const entry of remaining) {
    queue.push(entry);
  }
}
