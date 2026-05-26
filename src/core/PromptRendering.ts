/** Prompt rendering helpers: box drawing, prompt renderers, input processors. */
import { stripAnsi } from './stripAnsi.js';
/**
 * Wraps text at a maximum width, splitting into multiple lines.
 * @param text - The text to wrap.
 * @param maxWidth - The maximum line width.
 */
export function wrapLine(text: string, maxWidth: number): string[] {
  if (stripAnsi(text).length <= maxWidth) return [text];
  const lines: string[] = [];
  let remaining = text;
  while (stripAnsi(remaining).length > maxWidth) {
    lines.push(remaining.slice(0, maxWidth));
    remaining = remaining.slice(maxWidth);
  }
  if (remaining) lines.push(remaining);
  return lines;
}
/**
 * Renders lines inside a bordered box with padding.
 * @param lines - The content lines.
 * @param width - The total box width.
 * @param maxHeight - The maximum box height.
 */
export function renderBox(lines: string[], width: number, maxHeight: number): string[] {
  const result: string[] = [];
  const innerWidth = width - 4;
  result.push('╭' + '─'.repeat(width - 2) + '╮');
  let contentLines: string[] = [];
  for (const line of lines) {
    const wrapped = wrapLine(line, innerWidth);
    contentLines.push(...wrapped);
  }
  if (contentLines.length > maxHeight - 2) {
    contentLines = contentLines.slice(0, maxHeight - 3);
    contentLines.push('▼ more...');
  }
  for (const cl of contentLines) {
    const stripped = stripAnsi(cl);
    const pad = Math.max(0, innerWidth - stripped.length);
    result.push('│ ' + cl + ' '.repeat(pad) + ' │');
  }
  result.push('╰' + '─'.repeat(width - 2) + '╯');
  return result.map(r => {
    if (stripAnsi(r).length > width) return r.slice(0, width);
    return r;
  });
}
/**
 * Renders a prompt request inside a bordered box.
 * @param request - The prompt request object.
 * @param width - The box width.
 * @param height - The box height.
 */
export function renderPrompt(request: any, width: number, height: number): string[] {
  const lines: string[] = [];
  if (request.title) {
    lines.push(`\x1b[1m${request.agentName || 'Agent'}: ${request.title}\x1b[0m`);
  } else {
    lines.push(`\x1b[1m${request.agentName || 'Agent'} asks:\x1b[0m`);
  }
  if (request.type === 'confirm') {
    const defaultInd = request.defaultValue === true ? '[Y/n]' : request.defaultValue === false ? '[y/N]' : '[y/n]';
    lines.push(defaultInd);
  } else if (request.type === 'select' || request.type === 'multi-select') {
    if (request.choices) {
      for (const choice of request.choices) {
        let choiceLine = '';
        if (request.type === 'multi-select') {
          choiceLine += '☐ ';
        }
        if (choice.disabled) {
          choiceLine += `\x1b[2m${choice.key}. ${choice.label}\x1b[0m`;
        } else if (choice.default) {
          choiceLine += `${choice.key}. ${choice.label} →`;
        } else {
          choiceLine += `${choice.key}. ${choice.label}`;
        }
        if (choice.description) {
          choiceLine += ` - ${choice.description}`;
        }
        lines.push(choiceLine);
      }
      if (request.choices.length > height - 4) {
        lines.push('▼');
      }
    }
  } else if (request.type === 'select-or-text') {
    if (request.choices) {
      for (const choice of request.choices) {
        lines.push(`${choice.key}. ${choice.label}`);
      }
      lines.push(`${(request.choices.length || 0) + 1}. Other (custom)`);
    }
    lines.push('█'); // cursor
  } else if (request.type === 'text') {
    lines.push(request.title || 'Enter value:');
    lines.push('█'); // cursor indicator
  } else if (request.type === 'info-then-act') {
    const choiceLines: string[] = [];
    choiceLines.push('─'.repeat(Math.min(width - 4, 40)));
    if (request.choices) {
      for (const choice of request.choices) {
        choiceLines.push(`${choice.key}. ${choice.label}`);
      }
    }
    const availableBodyLines = height - 2 - 1 - choiceLines.length - 1;
    if (request.body) {
      const bodyLines = request.body.split('\n');
      const rendered: string[] = [];
      for (let bl of bodyLines) {
        bl = bl.replace(/\*\*(.+?)\*\*/g, '\x1b[1m$1\x1b[0m');
        rendered.push(bl);
      }
      if (rendered.length > availableBodyLines) {
        const truncated = rendered.slice(0, Math.max(1, availableBodyLines - 1));
        truncated.push('▼');
        lines.push(...truncated);
      } else {
        lines.push(...rendered);
      }
    }
    lines.push(...choiceLines);
  }
  return renderBox(lines, width, height);
}
/**
 * Renders a prompt request with interactive state (selection, text input, errors).
 * @param request - The prompt request object.
 * @param state - The current interactive state.
 * @param width - The box width.
 * @param height - The box height.
 */
export function renderPromptWithState(request: any, state: any, width: number, height: number): string[] {
  const lines: string[] = [];
  if (request.title) {
    lines.push(`\x1b[1m${request.agentName || 'Agent'}: ${request.title}\x1b[0m`);
  } else {
    lines.push(`\x1b[1m${request.agentName || 'Agent'} asks:\x1b[0m`);
  }
  if (state.error) {
    lines.push(`\x1b[31m${state.error}\x1b[0m`);
  }
  if (state.remainingMs !== undefined) {
    const secs = Math.round(state.remainingMs / 1000);
    lines.push(`Time remaining: ${secs}s (0:${String(secs).padStart(2, '0')})`);
  }
  if (request.type === 'select' || request.type === 'multi-select') {
    if (request.choices) {
      for (let i = 0; i < request.choices.length; i++) {
        const choice = request.choices[i];
        let choiceLine = '';
        if (request.type === 'multi-select') {
          const checked = state.selectedIndices?.includes(i);
          choiceLine += checked ? '☑ ' : '☐ ';
        }
        const isSelected = state.selectedIndex === i;
        if (isSelected) {
          choiceLine += `\x1b[7m${choice.key}. ${choice.label}\x1b[0m`;
        } else if (choice.disabled) {
          choiceLine += `\x1b[2m${choice.key}. ${choice.label}\x1b[0m`;
        } else {
          choiceLine += `${choice.key}. ${choice.label}`;
        }
        if (choice.preview && state.showPreview && isSelected) {
          choiceLine += ` | ${choice.preview}`;
        }
        lines.push(choiceLine);
      }
      if (state.selectedIndices) {
        lines.push(`Selected: ${state.selectedIndices.length}`);
      }
    }
  } else if (request.type === 'text') {
    if (state.currentInput === '' && request.placeholder) {
      lines.push(`\x1b[2m${request.placeholder}\x1b[0m`);
    } else if (state.currentInput !== undefined) {
      lines.push(state.currentInput);
    }
    if (request.maxLength) {
      const len = (state.currentInput || '').length;
      lines.push(`${len}/${request.maxLength}`);
    }
    lines.push('█');
  } else if (request.type === 'select-or-text') {
    if (state.isTextMode) {
      if (state.textInput === '' && request.placeholder) {
        lines.push(`\x1b[2m${request.placeholder}\x1b[0m`);
      }
      lines.push('█');
    } else if (request.choices) {
      for (const choice of request.choices) {
        lines.push(`${choice.key}. ${choice.label}`);
      }
    }
  }
  return renderBox(lines, width, height);
}
/**
 * Renders a deferred (minimized) prompt representation.
 * @param request - The prompt request object.
 * @param width - The box width.
 * @param height - The box height.
 */
export function renderDeferred(request: any, width: number, height: number): string[] {
  const lines: string[] = [];
  lines.push(`\x1b[2m[Deferred] ${request.agentName || 'Agent'}: ${request.title || request.type}\x1b[0m`);
  return renderBox(lines, width, height);
}
/** Render inline.
 * @param {any} request - Description of request.
 * @param {number} width - Description of width.
 */
export function renderInline(request: any, width: number): string[] {
  const lines: string[] = [];
  if (request.title) {
    lines.push(`\x1b[1m${request.agentName || 'Agent'}: ${request.title}\x1b[0m`);
  }
  if (request.choices) {
    for (const choice of request.choices) {
      lines.push(`${choice.key}. ${choice.label}`);
    }
  }
  return renderBox(lines, width, 24);
}
/**
 * Renders a prompt as a single chat line (compact format).
 * @param request - The prompt request object.
 */
export function renderAsChatLine(request: any): string {
  return `[${request.agentName || 'Agent'}] ${request.title || request.type}: ${request.type === 'confirm' ? '[y/n]' : 'pending'}`;
}
/**
 * Renders a summary of the prompt response.
 * @param request - The prompt request object.
 * @param response - The response object.
 */
export function renderResponseSummary(request: any, response: any): string {
  if (response.cancelled) {
    return `\x1b[2m[Cancelled] ${request.title || request.type}\x1b[0m`;
  }
  if (response.timedOut) {
    return `\x1b[2m[Timeout expired] ${request.title || request.type}\x1b[0m`;
  }
  if (request.type === 'select' && request.choices) {
    const choice = request.choices.find((c: any) => c.key === response.value);
    return `Answered: ${choice?.label || response.value}`;
  }
  return `Answered: ${response.value}`;
}
/** Render timeout bar.
 * @param {number} totalMs - Description of total ms.
 * @param {number} remainingMs - Description of remaining ms.
 * @param {number} width - Description of width.
 * @returns {string} - Description of return value.
 */
export function renderTimeoutBar(totalMs: number, remainingMs: number, width: number): string {
  const filled = Math.round((remainingMs / totalMs) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
/** Render queue indicator.
 * @param {any[]} queue - Description of queue.
 * @returns {string} - Description of return value.
 */
export function renderQueueIndicator(queue: any[]): string { return `[${queue.length} pending]`; }
/** Render queue list.
 * @param {any[]} queue - Description of queue.
 */
export function renderQueueList(queue: any[]): string[] {
  if (queue.length === 0) return ['No pending prompts'];
  return queue.map(item => {
    const waitSec = Math.max(0, Math.round((Date.now() - (item._enqueuedAt || Date.now())) / 1000));
    return `${item.agentName || 'Agent'} - ${item.type} (confirm) - waiting ${waitSec}s`;
  });
}
/** Render queue view.
 * @param {any[]} queue - Description of queue.
 * @param {number} width - Description of width.
 * @param {number} height - Description of height.
 * @param {any} opts - Description of opts.
 */
export function renderQueueView(queue: any[], width: number, height: number, opts: any = {}): string[] {
  const lines: string[] = [];
  const filteredQueue = queue.filter((item: any) => {
    if (opts.filterAgent && item.agentId !== opts.filterAgent) return false;
    if (opts.filterType && item.type !== opts.filterType) return false;
    return true;
  });
  lines.push(`\x1b[1mPrompt Queue (${filteredQueue.length})\x1b[0m`);
  lines.push('Agent    | Type    | Question | Wait | Action');
  if (opts.groupByAgent) {
    const groups: Record<string, any[]> = {};
    for (const item of filteredQueue) {
      const agentId = item.agentId || 'default';
      if (!groups[agentId]) groups[agentId] = [];
      groups[agentId].push(item);
    }
    for (const [agentId, items] of Object.entries(groups)) {
      lines.push(`${agentId} (${items.length})`);
      for (const item of items) {
        lines.push(`  ● ${item.type} - ${item.title || '?'}`);
      }
    }
  } else {
    for (let i = 0; i < filteredQueue.length; i++) {
      const item = filteredQueue[i];
      const waitMs = Date.now() - (item._enqueuedAt || Date.now());
      const waitSec = Math.max(0, Math.round(waitMs / 1000));
      const isSelected = opts.cursorRow === i;
      const prefix = isSelected ? '\x1b[7m' : '';
      const suffix = isSelected ? '\x1b[0m' : '';
      let actionHint = '';
      if (item.type === 'confirm') actionHint = '[Y] [n]';
      else actionHint = '[Enter]';
      const displayName = (item.agentName && item.agentName !== 'Agent') ? item.agentName : (item.agentId || 'Agent');
      lines.push(`${prefix}● ${displayName} | ${item.type} | ${item.title || '?'} | ${waitSec}s | ${actionHint}${suffix}`);
      if (opts.showPreview && isSelected) {
        if (item.title) lines.push(`  Preview: ${item.title}`);
        if (item.choices) {
          for (const c of item.choices) {
            lines.push(`    ${c.key}. ${c.label}`);
          }
        }
      }
    }
  }
  lines.push('');
  lines.push('Enter: answer | Esc: back | S: skip | A: approve all');
  return lines;
}
/** Render notification line.
 * @param {any} request - Description of request.
 * @param {any} opts - Description of opts.
 * @returns {string} - Description of return value.
 */
export function renderNotificationLine(request: any, opts: any = {}): string {
  const waitStr = opts.waitingMs ? ` (${Math.round(opts.waitingMs / 1000)}s)` : '';
  return `[hitl] ${request.agentName || 'Agent'} [${request.type === 'select' ? 'select/choice' : request.type}]: ${request.title || '?'}${waitStr}`;
}
/** Render pending summary bar.
 * @param {any[]} queue - Description of queue.
 * @param {number} width - Description of width.
 * @returns {string} - Description of return value.
 */
export function renderPendingSummaryBar(queue: any[], width: number): string {
  const parts = [`${queue.length} pending:`];
  for (let i = 0; i < queue.length; i++) parts.push(`[${i + 1}] ${queue[i].agentName || queue[i].agentId || 'Agent'}`);
  return parts.join(' ');
}
/** Render sidebar notification.
 * @param {any[]} queue - Description of queue.
 * @param {string} agentId - Description of agent id.
 * @returns {string} - Description of return value.
 */
export function renderSidebarNotification(queue: any[], agentId: string): string {
  const count = queue.filter(p => p.agentId === agentId).length;
  return count > 0 ? `? ${count} pending` : '';
}
/** Render status bar segment.
 * @param {any[]} queue - Description of queue.
 * @param {boolean} deferred - Description of deferred.
 * @returns {string} - Description of return value.
 */
export function renderStatusBarSegment(queue: any[], deferred: boolean): string {
  if (deferred) return '[deferred/paused ⏸]';
  return queue.length > 0 ? `[${queue.length} prompts]` : '';
}
/** Render history.
 * @param {any[]} history - Description of history.
 */
export function renderHistory(history: any[]): string[] {
  if (history.length === 0) return ['No prompt history'];
  return history.map(h => `${h.request.agentName}: ${h.request.type} -> ${h.response.value} (${h.duration}ms)`);
}
/** Process key input.
 * @param {string} key - Description of key.
 * @param {any} state - Description of state.
 */
export function processKeyInput(key: string, state: any): void {
  if (key === 'down') {
    if (state.scrollPosition !== undefined) state.scrollPosition++;
    if (state.selectedIndex !== undefined) {
      const total = state.totalChoices || 999;
      state.selectedIndex = (state.selectedIndex + 1) % total;
    }
    if (state.cursorRow !== undefined) {
      const total = state.totalRows || 999;
      state.cursorRow = Math.min(state.cursorRow + 1, total - 1);
    }
  } else if (key === 'up') {
    if (state.scrollPosition !== undefined) state.scrollPosition = Math.max(0, state.scrollPosition - 1);
    if (state.selectedIndex !== undefined) {
      const total = state.totalChoices || 999;
      state.selectedIndex = (state.selectedIndex - 1 + total) % total;
    }
  } else if (key === 'pagedown') {
    if (state.scrollPosition !== undefined && state.pageSize) state.scrollPosition += state.pageSize;
  } else if (key === 'pageup') {
    if (state.scrollPosition !== undefined && state.pageSize) state.scrollPosition = Math.max(0, state.scrollPosition - state.pageSize);
  } else if (key === 'space') {
    if (state.selectedIndices !== undefined) {
      const idx = state.cursorIndex !== undefined ? state.cursorIndex : 0;
      const pos = state.selectedIndices.indexOf(idx);
      if (pos >= 0) { state.selectedIndices.splice(pos, 1); } else { state.selectedIndices.push(idx); }
    }
  } else if (key === 'ctrl+a') {
    if (state.selectedIndices !== undefined && state.totalChoices) {
      state.selectedIndices = Array.from({ length: state.totalChoices }, (_, i) => i);
    }
  } else if (key === 'ctrl+d') {
    if (state.selectedIndices !== undefined) state.selectedIndices.length = 0;
  } else if (key === 'tab') {
    if (state.focusArea !== undefined) state.focusArea = state.focusArea === 'body' ? 'choices' : 'body';
  } else if (key === 'enter') {
    if (state.isTextMode === false && state.selectedIndex !== undefined) state.isTextMode = true;
  } else if (key === 'escape') {
    if (state.isTextMode !== undefined) { state.isTextMode = false; }
    else if (state.viewMode !== undefined) { state.viewMode = 'chat'; }
    else if (state.cancelled === false) { /* required prompt, don't cancel */ }
    else { state.cancelled = true; }
  }
}
/** Process text input.
 * @param {string} input - Description of input.
 * @param {any} request - Description of request.
 * @returns {any} - Description of return value.
 */
export function processTextInput(input: string, request: any): any {
  const response: any = { value: null, cancelled: false, timedOut: false, timestamp: Date.now() };
  if (request.type === 'confirm') {
    const lower = input.toLowerCase();
    if (lower === 'y' || lower === 'yes') { response.value = true; }
    else if (lower === 'n' || lower === 'no') { response.value = false; }
    else if (input === '' && request.defaultValue !== undefined) { response.value = request.defaultValue; }
  } else if (request.type === 'select') {
    const num = parseInt(input, 10);
    if (!isNaN(num) && request.choices) {
      const choice = request.choices.find((c: any) => c.key === num);
      if (choice && !choice.disabled) response.value = num;
    }
  } else if (request.type === 'multi-select') {
    // handled via handleConfirm
  } else if (request.type === 'text') {
    if (request.required && input === '') { /* leave null */ }
    else if (request.maxLength && input.length > request.maxLength) { /* leave null */ }
    else if (request.validator) {
      const err = request.validator(input);
      if (!err) { response.value = input; }
    } else {
      response.value = input;
      response.cancelled = false;
    }
  } else if (request.type === 'select-or-text') {
    const num = parseInt(input, 10);
    if (!isNaN(num) && request.choices) {
      const choice = request.choices.find((c: any) => c.key === num);
      response.value = choice ? num : input;
    } else {
      response.value = input;
    }
  }
  return response;
}