/**
 * MessageHandler — processes user messages by routing to the active channel agent
 * or falling back to debug mode.
 *
 * Extracted from ArmamentApp to isolate the message dispatch logic from the
 * composition root. Handles provider validation, channel routing, sticky injection,
 * and error recovery (including auth re-triggering).
 */

import { logError, logInfo, logWarn, type IMessage, type IUsageStats, type IReplConfig } from '../core/index.js';
import { DebugMode } from '../debug/index.js';
import { handleDebugMessage } from './DebugMessageHandler.js';
import type { ChannelAgent, ProviderPool } from '../providers/index.js';
import type { StreamRouter } from './StreamRouter.js';
import type { SessionState } from './SessionState.js';
import type { TuiRenderer } from './TuiRenderer.js';
import type { ChannelInfo } from './ChannelLifecycle.js';

/** Interface for MessageHandlerDeps. */
export interface MessageHandlerDeps {
  getInterrupted: (channel: string) => boolean;
  getTurnCount: () => number;
  setTurnCount: (n: number) => void;
  getConfig: () => IReplConfig;
  getActiveChannelName: () => string | undefined;
  getChannelManagerInternal: () => ChannelInfo[];
  joinChannel: (name: string) => void;
  getActiveChannelNameAfterJoin: () => string | undefined;
  getChannelAgents: () => Map<string, ChannelAgent>;
  getProviderPool: () => ProviderPool;
  getStreamRouter: () => StreamRouter;
  getSessionState: () => SessionState;
  getMessages: () => IMessage[];
  getUsageStats: () => IUsageStats;
  getCurrentModel: () => string;
  getActiveProvider: () => string;
  buildStickyInjection: () => string;
  buildStickyInjectionTop: () => string;
  buildStickyInjectionBottom: () => string;
  getChannelNotes: (channel: string) => string;
  getAgentNick: () => string;
  getTui: () => TuiRenderer | null;
  setProcessing: (channel: string, state: boolean) => void;
  setLastUserMsg: (msg: string) => void;
  setLastResponseMeta: (meta: any) => void;
  setLastToolResultVal: (val: any) => void;
  isAuthError: (err: any) => boolean;
  handleAuthError: (channel: string, agent: ChannelAgent, err: any) => void;
  emitEvent: (event: string, ...args: any[]) => void;
  refreshProviderStats: () => void;
  awaitChannelReady: (channel: string) => Promise<void>;
}

/** Handle user message.
 * @param {string} input - Description of input.
 * @param {MessageHandlerDeps} deps - Description of deps.
 * @returns {Promise<string | void>} - Description of return value.
 */
export async function handleUserMessage(
  input: string,
  deps: MessageHandlerDeps,
): Promise<string | void> {
  let activeChannel = deps.getActiveChannelName() ?? '#control';
  if (deps.getInterrupted(activeChannel)) return undefined;
  const config = deps.getConfig();
  const turnCount = deps.getTurnCount();
  if (turnCount >= config.maxTurns) throw new Error(`Max turns (${config.maxTurns}) reached`);

  const systemChannels = ['#control', '#logs', '#cost', '#approvals'];
  if (systemChannels.includes(activeChannel)) {
    const nonSystem = deps.getChannelManagerInternal().find(c => !systemChannels.includes(c.name));
    if (nonSystem) deps.joinChannel(nonSystem.name.replace(/^#/, ''));
    else deps.joinChannel('general');
    activeChannel = deps.getActiveChannelNameAfterJoin() ?? '#general';
    if (systemChannels.includes(activeChannel)) return undefined;
  }

  const newTurn = turnCount + 1;
  deps.setTurnCount(newTurn);
  deps.setLastUserMsg(input);
  deps.setProcessing(activeChannel, true);

  if (deps.getProviderPool().size === 0 && !DebugMode.instance().isActive()) {
    deps.setProcessing(activeChannel, false);
    const msg = [
      'No provider connected. Open F2 → Providers to add one, then use /model to pick a model.',
    ].join('\n');
    const messages = deps.getMessages();
    messages.push({ id: `msg-${Date.now()}-u`, role: 'user', content: input, timestamp: Date.now(), metadata: { turnNumber: newTurn } });
    messages.push({ id: `msg-${Date.now()}-a`, role: 'assistant', content: msg, timestamp: Date.now(), metadata: { turnNumber: newTurn, model: 'system' } });
    deps.setLastResponseMeta({ turnNumber: newTurn, model: 'system' });
    return msg;
  }

  let agent = deps.getChannelAgents().get(activeChannel);
  if (!agent && !DebugMode.instance().isActive()) {
    logInfo('repl', `Waiting for ${activeChannel} to become ready...`);
    await Promise.race([
      deps.awaitChannelReady(activeChannel),
      new Promise<void>(r => setTimeout(r, 15000)),
    ]);
    agent = deps.getChannelAgents().get(activeChannel);
  }
  if (agent) {
    try {
      const notesPrefix = deps.getChannelNotes(activeChannel);
      const stickyPre = deps.buildStickyInjectionTop();
      const stickyPost = deps.buildStickyInjectionBottom();
      const augmentedInput = `${notesPrefix}${stickyPre}[USER MESSAGE]\n${input}${stickyPost}`;
      const nick = deps.getAgentNick();
      await deps.getStreamRouter().routeStream(agent, augmentedInput, { channel: activeChannel, nick }, () => deps.getInterrupted(activeChannel));
      deps.setProcessing(activeChannel, false);
      return undefined;
    } catch (err: unknown) {
      logError('repl', `Stream error on ${activeChannel}`, err);
      deps.setProcessing(activeChannel, false);
      const tui = deps.getTui();
      if (tui) { tui.stopThinking(activeChannel); tui.finalizeStreamMessage(activeChannel); }
      if (deps.isAuthError(err)) {
        logWarn('repl', `Auth error on ${activeChannel}, triggering re-auth`);
        deps.handleAuthError(activeChannel, agent, err);
        return '';
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      tui?.writeMessage('system', 'err', `${activeChannel} error: ${errMsg}`, '#logs');
      tui?.writeMessage('system', 'err', `${activeChannel} error: ${errMsg}`, '#errors');
      return `Error: ${errMsg}`;
    }
  }

  try {
    const result = handleDebugMessage(input, newTurn, activeChannel, {
      getSessionState: () => deps.getSessionState(),
      getUsageStats: () => deps.getUsageStats(),
      getMessages: () => deps.getMessages(),
      getCurrentModel: () => deps.getCurrentModel(),
      getActiveProvider: () => deps.getActiveProvider(),
      getChannelAgent: (ch) => deps.getChannelAgents().get(ch),
      getTurnCount: () => deps.getTurnCount(),
      getConfig: () => deps.getConfig(),
      emitEvent: (event, ...args) => deps.emitEvent(event, ...args),
      refreshProviderStats: () => deps.refreshProviderStats(),
    });
    deps.setLastResponseMeta(result.metadata);
    deps.setLastToolResultVal(result.metadata.lastToolResult);
    deps.setProcessing(activeChannel, false);
    return result.response;
  } catch (err) {
    deps.setProcessing(activeChannel, false);
    throw err;
  }
}
