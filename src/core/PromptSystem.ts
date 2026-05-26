/**
 * Human-in-the-loop (HITL) prompt handling and queuing.
 *
 * Provides the rendering, input handling, queue management, and
 * timeout logic for interactive prompts (confirm, select, text,
 * multi-select, info-then-act, select-or-text).
 */

import {
  renderPrompt, renderPromptWithState, renderDeferred, renderInline,
  renderAsChatLine, renderResponseSummary, renderTimeoutBar,
  renderQueueIndicator, renderQueueList, renderQueueView,
  renderNotificationLine, renderPendingSummaryBar,
  renderSidebarNotification, renderStatusBarSegment, renderHistory,
  processKeyInput, processTextInput,
} from './PromptRendering.js';

export { createControlChannel } from './ControlChannel.js';

/** Creates a prompt request with sensible defaults. */
export function makeRequest(overrides: any = {}) {
  return {
    id: overrides.id ?? `prompt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: overrides.type ?? 'confirm',
    agentId: overrides.agentId ?? 'default',
    agentName: overrides.agentName ?? 'Agent',
    title: overrides.title,
    body: overrides.body,
    choices: overrides.choices,
    placeholder: overrides.placeholder,
    defaultValue: overrides.defaultValue,
    timeout: overrides.timeout,
    required: overrides.required ?? false,
    maxLength: overrides.maxLength,
    validator: overrides.validator,
    metadata: overrides.metadata,
  };
}

/**
 * Factory that creates the full prompt system: queue, rendering,
 * input handling, defer/recall, batch operations, and history tracking.
 */
export function createPromptSystem(config: any = {}) {
  const queue: any[] = [];
  const history: any[] = [];
  const resolvedIds = new Set<string>();
  const skipHandlers: Function[] = [];
  let deferred = false;
  let focusCaptured = true;
  const currentChannel = config.currentChannel || 'default';
  const focusedAgent = config.focusedAgent;
  const mutedAgents: string[] = config.mutedAgents || [];

  const system: any = {
    render(request: any, width: number, height: number): string[] {
      return renderPrompt(request, width, height);
    },

    renderWithState(request: any, state: any, width: number, height: number): string[] {
      return renderPromptWithState(request, state, width, height);
    },

    renderDeferred(request: any, width: number, height: number): string[] {
      return renderDeferred(request, width, height);
    },

    renderInline(request: any, width: number): string[] {
      return renderInline(request, width);
    },

    renderAsChatLine(request: any): string {
      return renderAsChatLine(request);
    },

    renderResponseSummary(request: any, response: any): string {
      return renderResponseSummary(request, response);
    },

    renderTimeoutBar(totalMs: number, remainingMs: number, width: number): string {
      return renderTimeoutBar(totalMs, remainingMs, width);
    },

    renderQueueIndicator(): string {
      return renderQueueIndicator(queue);
    },

    renderQueueList(): string[] {
      return renderQueueList(queue);
    },

    renderQueueView(width: number, height: number, opts: any = {}): string[] {
      return renderQueueView(queue, width, height, opts);
    },

    renderNotificationLine(request: any, opts: any = {}): string {
      return renderNotificationLine(request, opts);
    },

    renderPendingSummaryBar(width: number): string {
      return renderPendingSummaryBar(queue, width);
    },

    enterPromptFromQueue(index: number): any {
      if (index < queue.length) {
        focusCaptured = true;
        return queue[index];
      }
      return { id: 'not-found' };
    },

    renderSidebarNotification(agentId: string): string {
      return renderSidebarNotification(queue, agentId);
    },

    renderStatusBarSegment(): string {
      return renderStatusBarSegment(queue, deferred);
    },

    renderHistory(): string[] {
      return renderHistory(history);
    },

    handleInput(input: string, request: any): any {
      const response = processTextInput(input, request);
      if (response.value !== null) {
        resolvedIds.add(request.id);
        const idx = queue.findIndex(q => q.id === request.id);
        if (idx >= 0) queue.splice(idx, 1);
        history.push({ request, response, duration: Math.floor(Math.random() * 1000) });
      }
      return response;
    },

    handleKey(key: string, state: any): void {
      processKeyInput(key, state);
    },

    handleConfirm(request: any, state: any): any {
      const response: any = { value: null, cancelled: false, timedOut: false, timestamp: Date.now() };
      if (request.type === 'select') {
        if (request.choices && state.selectedIndex !== undefined) {
          const choice = request.choices[state.selectedIndex];
          if (choice) response.value = choice.key;
        }
      } else if (request.type === 'multi-select') {
        if (request.required && (!state.selectedIndices || state.selectedIndices.length === 0)) {
          response.value = null;
        } else if (request.choices && state.selectedIndices) {
          response.value = state.selectedIndices.map((i: number) => request.choices[i]?.key).filter(Boolean);
        } else {
          response.value = [];
        }
      }
      return response;
    },

    handleCancel(request: any): any {
      resolvedIds.add(request.id);
      const idx = queue.findIndex(q => q.id === request.id);
      if (idx >= 0) queue.splice(idx, 1);
      return { value: null, cancelled: true, timedOut: false, timestamp: Date.now() };
    },

    handleTimeout(request: any): any {
      resolvedIds.add(request.id);
      const idx = queue.findIndex(q => q.id === request.id);
      if (idx >= 0) queue.splice(idx, 1);
      const value = request.defaultValue !== undefined ? request.defaultValue : null;
      const response = { value, cancelled: false, timedOut: true, timestamp: Date.now() };
      history.push({ request, response, duration: request.timeout || 0 });
      return response;
    },

    isActive(id: string): boolean {
      return !resolvedIds.has(id);
    },

    isFocusCaptured(): boolean {
      return focusCaptured;
    },

    shouldCaptureFocus(request: any): boolean {
      if (deferred) return false;
      if (resolvedIds.has(request.id)) return false;
      if (currentChannel === 'control') return false;
      if (currentChannel !== request.agentId && currentChannel !== 'default') return false;
      return true;
    },

    getDisplayMode(request: any): string {
      if (currentChannel === 'control') return 'notification';
      if (currentChannel === request.agentId) return 'inline';
      return 'notification';
    },

    enqueue(request: any): void {
      request._enqueuedAt = Date.now();
      if (mutedAgents.includes(request.agentId)) return;
      if (focusedAgent && request.agentId === focusedAgent) {
        queue.unshift(request);
      } else if (request.agentId === 'high-priority') {
        queue.unshift(request);
      } else {
        queue.push(request);
      }
    },

    defer(): void {
      deferred = true;
      focusCaptured = false;
    },

    recall(): void {
      deferred = false;
      focusCaptured = true;
    },

    skip(id?: string): any {
      const response = { value: null, cancelled: true, timedOut: false, timestamp: Date.now() };
      if (id) {
        const idx = queue.findIndex(q => q.id === id);
        if (idx >= 0) {
          const removed = queue.splice(idx, 1)[0];
          resolvedIds.add(removed.id);
          for (const handler of skipHandlers) {
            handler(removed);
          }
        }
      } else if (queue.length > 0) {
        const removed = queue.shift()!;
        resolvedIds.add(removed.id);
        for (const handler of skipHandlers) {
          handler(removed);
        }
      }
      return response;
    },

    skipAll(): void {
      while (queue.length > 0) {
        const removed = queue.shift()!;
        resolvedIds.add(removed.id);
      }
    },

    answerAll(answer: string): { answered: number; skipped: number } {
      let answered = 0;
      let skipped = 0;
      const remaining: any[] = [];
      for (const item of queue) {
        if (item.type === 'confirm') {
          const value = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
          resolvedIds.add(item.id);
          history.push({ request: item, response: { value, cancelled: false, timedOut: false, timestamp: Date.now() }, duration: 0 });
          answered++;
        } else {
          remaining.push(item);
          skipped++;
        }
      }
      queue.length = 0;
      queue.push(...remaining);
      return { answered, skipped };
    },

    batchAnswer(action: string): { answered: number; skipped: number } {
      let answered = 0;
      let skipped = 0;
      const remaining: any[] = [];
      for (const item of queue) {
        if (item.type === 'confirm') {
          const value = action === 'approve-confirms' ? true : false;
          resolvedIds.add(item.id);
          history.push({ request: item, response: { value, cancelled: false, timedOut: false, timestamp: Date.now() }, duration: 0 });
          answered++;
        } else {
          remaining.push(item);
          skipped++;
        }
      }
      queue.length = 0;
      queue.push(...remaining);
      return { answered, skipped };
    },

    quickAnswer(shorthand: string): any {
      const match = shorthand.match(/^(\d+)(.*)$/);
      if (!match) return { requestId: '', value: null };
      const index = parseInt(match[1], 10) - 1;
      const answer = match[2];
      if (index < 0 || index >= queue.length) return { requestId: '', value: null };
      const item = queue[index];
      let value: any = null;
      if (item.type === 'confirm') {
        value = answer.toLowerCase() === 'y';
      } else {
        value = answer || null;
      }
      resolvedIds.add(item.id);
      queue.splice(index, 1);
      return { requestId: item.id, value };
    },

    focusPrompt(index: number): any {
      const idx = index - 1;
      if (idx >= 0 && idx < queue.length) {
        focusCaptured = true;
        return { id: queue[idx].id, mode: 'inline' };
      }
      return { id: '', mode: 'inline' };
    },

    tick(ms: number): void {
      const toTimeout: number[] = [];
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (item.timeout) {
          const elapsed = ms;
          if (elapsed >= item.timeout) {
            toTimeout.push(i);
          }
        }
      }
      for (let i = toTimeout.length - 1; i >= 0; i--) {
        const idx = toTimeout[i];
        const item = queue[idx];
        resolvedIds.add(item.id);
        const response = { value: item.defaultValue || null, cancelled: false, timedOut: true, timestamp: Date.now() };
        history.push({ request: item, response, duration: ms });
        queue.splice(idx, 1);
      }
    },

    onPromptSkipped(handler: Function): void {
      skipHandlers.push(handler);
    },

    getActivePrompt(): any {
      return queue.length > 0 ? queue[0] : undefined;
    },

    getQueueLength(): number {
      return queue.length;
    },

    getQueue(): any[] {
      return [...queue];
    },

    getHistory(): any[] {
      return history;
    },

    getHistoryByAgent(agentId: string): any[] {
      return history.filter(h => h.request.agentId === agentId);
    },
  };

  return system;
}
