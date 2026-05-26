import { DebugMode } from '../debug/index.js';
import type { IMessage, IToolCall, IToolResult, IUsageStats } from '../core/index.js';
import type { SessionState } from './SessionState.js';
import type { ChannelAgent } from '../providers/index.js';
/**
 * Dependencies for the debug/fallback message handler.
 */
export interface DebugMessageDeps {
  getSessionState: () => SessionState;
  getUsageStats: () => IUsageStats;
  getMessages: () => IMessage[];
  getCurrentModel: () => string;
  getActiveProvider: () => string;
  getChannelAgent: (channel: string) => ChannelAgent | undefined;
  getTurnCount: () => number;
  getConfig: () => { showThinking?: boolean; compact?: boolean; showToolCalls?: boolean };
  emitEvent: (event: string, ...args: any[]) => void;
  refreshProviderStats: () => void;
}
/**
 * Debug message result interface.
 */
export interface DebugMessageResult {
  response: string;
  metadata: any;
}
/**
 * Handles the debug/fallback message path when no live ChannelAgent is streaming.
 * Emits tool events, produces canned responses, tracks usage.
 */
export function handleDebugMessage(
  input: string,
  turnCount: number,
  activeChannel: string,
  deps: DebugMessageDeps,
): DebugMessageResult {
  const debug = DebugMode.instance();
  const isDebug = debug.isActive();
  deps.emitEvent('stream:start', {});
  deps.emitEvent('thinking:start', {});
  const cannedResponse = isDebug ? debug.getResponse(input) : null;
  const thinkingContent = cannedResponse?.thinking ?? `Thinking about: ${input}`;
  const config = deps.getConfig();
  if (config.showThinking) {
    deps.emitEvent('thinking:content', thinkingContent);
    deps.emitEvent('thinking:display', { collapsed: config.compact, content: thinkingContent });
  }
  deps.emitEvent('thinking:end', { durationMs: isDebug ? 0 : 10 });
  let lastToolResult: IToolResult | undefined;
  if (cannedResponse?.toolCalls) {
    for (const tc of cannedResponse.toolCalls) {
      const toolCall: IToolCall = { id: `tool-${Date.now()}`, name: tc.name, arguments: tc.args };
      deps.emitEvent('tool:start', { name: tc.name, args: tc.args });
      const toolResult: IToolResult = { toolCallId: toolCall.id, output: tc.result, durationMs: 0 };
      deps.emitEvent('tool:result', toolResult);
      lastToolResult = toolResult;
      if (isDebug) debug.fireHook('post:tool', { tool: tc.name, args: tc.args, result: tc.result });
    }
  } else if (config.showToolCalls) {
    const toolCall: IToolCall = { id: `tool-${Date.now()}`, name: 'read_file', arguments: { path: process.cwd() } };
    deps.emitEvent('tool:start', { name: toolCall.name, args: toolCall.arguments });
    deps.emitEvent('tool:progress', { name: toolCall.name, progress: 50 });
    const toolResult: IToolResult = { toolCallId: toolCall.id, output: 'File contents read successfully', durationMs: 5 };
    deps.emitEvent('tool:result', toolResult);
    lastToolResult = toolResult;
  } else {
    lastToolResult = { toolCallId: `tool-${Date.now()}`, output: 'read_file', durationMs: 1 };
  }
  deps.emitEvent('permission:request', { tool: 'bash', action: 'execute' });
  const responseText = cannedResponse?.reply ?? 'Hello world';
  const responseTokens = responseText.split(/(?<=\s)/);
  for (const tok of responseTokens) deps.emitEvent('stream:token', tok);
  if (input === 'trigger_error') {
    deps.emitEvent('stream:error', new Error('Provider error'));
    deps.emitEvent('tool:error', new Error('Tool failed'));
    throw new Error('Provider error');
  }
  if (input.includes('failing') || input.includes('fail')) {
    deps.emitEvent('tool:error', new Error('Tool execution failed'));
  }
  const usageStats = deps.getUsageStats();
  const inputTokens = cannedResponse?.tokens?.input ?? Math.ceil(input.length / 4);
  const outputTokens = cannedResponse?.tokens?.output ?? Math.ceil(responseText.length / 4);
  usageStats.inputTokens += inputTokens;
  usageStats.outputTokens += outputTokens;
  usageStats.totalTokens += inputTokens + outputTokens;
  usageStats.estimatedCost += (inputTokens + outputTokens) * 0.00001;
  usageStats.turnsUsed = turnCount;
  usageStats.requestCount++;
  usageStats.contextUsed += inputTokens + outputTokens;
  const debugAgent = deps.getChannelAgent(activeChannel);
  if (debugAgent) {
    debugAgent.addTokens(inputTokens + outputTokens);
    debugAgent.addCacheTokens(Math.floor(inputTokens * 0.7), Math.floor(inputTokens * 0.15));
  }
  deps.refreshProviderStats();
  const userMsg: IMessage = {
    id: `msg-${Date.now()}-user`, role: 'user', content: input,
    timestamp: Date.now(), metadata: { turnNumber: turnCount },
  };
  const assistantMsg: IMessage = {
    id: `msg-${Date.now()}-assistant`, role: 'assistant', content: responseText,
    timestamp: Date.now(),
    metadata: {
      model: deps.getCurrentModel(), provider: deps.getActiveProvider(),
      inputTokens, outputTokens, cost: (inputTokens + outputTokens) * 0.00001,
      latencyMs: isDebug ? 0 : 50, turnNumber: turnCount,
    },
  };
  const messages = deps.getMessages();
  messages.push(userMsg, assistantMsg);
  deps.emitEvent('stream:end', {});
  if (isDebug) {
    debug.fireHook('post:message', { input, response: responseText, turn: turnCount });
    debug.captureOutput(responseText);
  }
  return {
    response: assistantMsg.content,
    metadata: { ...assistantMsg.metadata, lastToolResult },
  };
}