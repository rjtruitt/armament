/** Agent question and file approval prompt rendering. */

import { THEMES, type ThemeColors, fgRgb, RESET } from '../rendering/index.js';

type RGB = [number, number, number];

/** Interface for PromptOption.
 * @property {string} label - Description of label.
 * @property {string} value - Description of value.
 */
export interface PromptOption {
  label: string;
  value: string;
}

/** Interface for PromptQuestion.
 * @property {string} agentId - Description of agentId.
 * @property {string} agentName - Description of agentName.
 * @property {string} title - Description of title.
 * @property {string} body - Description of body.
 * @property {PromptOption} options - Description of options.
 * @property {number} selectedIndex - Description of selectedIndex.
 */
export interface PromptQuestion {
  agentId: string;
  agentName: string;
  title: string;
  body: string;
  options: PromptOption[];
  selectedIndex?: number;
}

/** Interface for FileApproval.
 * @property {string} agentId - Description of agentId.
 * @property {string} agentName - Description of agentName.
 * @property {string} filePath - Description of filePath.
 * @property {string} before - Description of before.
 * @property {string} after - Description of after.
 */
export interface FileApproval {
  agentId: string;
  agentName: string;
  filePath: string;
  operation: 'edit' | 'create' | 'delete';
  before: string | null;
  after: string | null;
  linesChanged: { added: number; removed: number };
}

/** Interface for PromptState.
 * @property {number} selectedIndex - Description of selectedIndex.
 * @property {number} optionCount - Description of optionCount.
 */
export interface PromptState {
  selectedIndex: number;
  optionCount: number;
  mode?: 'question' | 'file-approval';
}

/** Interface for PromptAction.
 * @property {number} selectedIndex - Description of selectedIndex.
 */
export interface PromptAction {
  selectedIndex: number;
  action?: 'accept' | 'reject' | 'edit' | 'defer' | 'skip';
}

/** Interface for EditState.
 * @property {boolean} editable - Description of editable.
 * @property {string} content - Description of content.
 * @property {number} cursorLine - Description of cursorLine.
 * @property {number} cursorCol - Description of cursorCol.
 * @property {string} filePath - Description of filePath.
 */
export interface EditState {
  editable: boolean;
  content: string;
  cursorLine: number;
  cursorCol: number;
  filePath: string;
}

/** Interface for EditResult.
 * @property {string} content - Description of content.
 * @property {string} filePath - Description of filePath.
 */
export interface EditResult {
  content: string;
  filePath: string;
  action: 'accept-edited';
}

interface PromptConfig {
  width: number;
  noColor?: boolean;
  theme?: string;
  autoApprove?: boolean;
  autoApprovePaths?: string[];
}

const SENSITIVE_PATTERNS = ['.env', 'credentials', '.secret', '.key', '.pem', 'token'];

function matchGlob(pattern: string, path: string): boolean {
  if (pattern === '**') return true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return path.startsWith(prefix);
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return path.startsWith(prefix);
  }
  return path === pattern;
}

function isSensitiveFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return SENSITIVE_PATTERNS.some(p => lower.includes(p));
}

/** Create agent input prompt.
 * @param {PromptConfig} config - Description of config.
 */
export function createAgentInputPrompt(config: PromptConfig) {
  const { width, noColor = false, theme: themeName = 'red', autoApprove = false, autoApprovePaths } = config;
  const theme: ThemeColors = THEMES[themeName] ?? THEMES.red;
  const queue: PromptQuestion[] = [];

  const accent = theme.accentStops[0];
  const borderColor = noColor ? '' : fgRgb(accent[0], accent[1], accent[2]);
  const r = noColor ? '' : RESET;

  function gradText(text: string, stops: RGB[]): string {
    if (noColor) return text;
    const chars = [...text];
    const visible = chars.filter(c => c !== ' ');
    if (visible.length === 0) return text;
    let idx = 0;
    return chars.map(ch => {
      if (ch === ' ') return ch;
      const t = visible.length === 1 ? 0 : idx / (visible.length - 1);
      const segCount = stops.length - 1;
      const seg = Math.min(Math.floor(t * segCount), segCount - 1);
      const localT = (t * segCount) - seg;
      const [r1, g1, b1] = stops[seg];
      const [r2, g2, b2] = stops[seg + 1];
      const cr = Math.round(r1 + (r2 - r1) * localT);
      const cg = Math.round(g1 + (g2 - g1) * localT);
      const cb = Math.round(b1 + (b2 - b1) * localT);
      idx++;
      return `${fgRgb(cr, cg, cb)}${ch}`;
    }).join('') + RESET;
  }

  return {
    render(question: PromptQuestion): string[] {
      const lines: string[] = [];
      const selectedIdx = question.selectedIndex ?? 0;

      const titleText = ` ${question.title} `;
      const topDashLen = Math.max(3, width - titleText.length - 4);
      if (noColor) {
        lines.push(`┌─${titleText}${'─'.repeat(topDashLen)}`);
      } else {
        const titleGrad = gradText(titleText, theme.titleStops);
        lines.push(`${borderColor}┌─${r}${titleGrad}${borderColor}${'─'.repeat(topDashLen)}${r}`);
      }

      lines.push(`${borderColor}│${r}`);

      const bodyLines = question.body.split('\n');
      for (const bodyLine of bodyLines) {
        const content = noColor ? bodyLine : `${fgRgb(160, 160, 160)}${bodyLine}${r}`;
        lines.push(`${borderColor}│${r}  ${content}`);
      }

      lines.push(`${borderColor}│${r}`);

      for (let i = 0; i < question.options.length; i++) {
        const opt = question.options[i];
        const isSelected = i === selectedIdx;
        const cursor = isSelected ? '›' : ' ';
        const num = `${i + 1}.`;
        if (noColor) {
          lines.push(`│    ${cursor} ${num} ${opt.label}`);
        } else {
          const cursorColor = isSelected ? fgRgb(accent[0], accent[1], accent[2]) : '';
          const labelColor = isSelected ? fgRgb(220, 220, 220) : fgRgb(140, 140, 140);
          lines.push(`${borderColor}│${r}    ${cursorColor}${cursor}${r} ${fgRgb(100, 100, 100)}${num}${r} ${labelColor}${opt.label}${r}`);
        }
      }

      lines.push(`${borderColor}│${r}`);

      const hintText = '↑↓ navigate | enter select | ctrl+z defer | /skip | /prompts queue';
      if (noColor) {
        lines.push(`│  ${hintText}`);
      } else {
        lines.push(`${borderColor}│${r}  ${fgRgb(80, 80, 80)}${hintText}${r}`);
      }

      lines.push(`${borderColor}└──${r}`);

      return lines;
    },

    renderFileApproval(approval: FileApproval): string[] {
      const lines: string[] = [];

      const titleText = ` ${approval.agentName} — ${approval.operation} — ${approval.filePath} `;
      const topDashLen = Math.max(3, width - titleText.length - 4);
      if (noColor) {
        lines.push(`┌─${titleText}${'─'.repeat(topDashLen)}`);
      } else {
        const titleGrad = gradText(titleText, theme.titleStops);
        lines.push(`${borderColor}┌─${r}${titleGrad}${borderColor}${'─'.repeat(topDashLen)}${r}`);
      }

      lines.push(`${borderColor}│${r}`);

      const added = approval.linesChanged.added;
      const removed = approval.linesChanged.removed;
      const summary = `+${added} -${removed}`;
      if (noColor) {
        lines.push(`│  ${summary}`);
      } else {
        lines.push(`${borderColor}│${r}  ${fgRgb(80, 255, 80)}+${added}${r} ${fgRgb(255, 80, 80)}-${removed}${r}`);
      }

      lines.push(`${borderColor}│${r}`);

      if (approval.before !== null) {
        const beforeLines = approval.before.split('\n');
        for (const bl of beforeLines) {
          if (noColor) {
            lines.push(`│  - ${bl}`);
          } else {
            lines.push(`${borderColor}│${r}  ${fgRgb(255, 80, 80)}-${r} ${fgRgb(120, 80, 80)}${bl}${r}`);
          }
        }
      }

      if (approval.after !== null) {
        const afterLines = approval.after.split('\n');
        for (const al of afterLines) {
          if (noColor) {
            lines.push(`│  + ${al}`);
          } else {
            lines.push(`${borderColor}│${r}  ${fgRgb(80, 255, 80)}+${r} ${fgRgb(80, 180, 80)}${al}${r}`);
          }
        }
      }

      lines.push(`${borderColor}│${r}`);

      const actions = '[accept] [edit] [reject]';
      if (noColor) {
        lines.push(`│  ${actions}`);
      } else {
        lines.push(`${borderColor}│${r}  ${fgRgb(80, 255, 80)}[accept]${r} ${fgRgb(180, 180, 255)}[edit]${r} ${fgRgb(255, 80, 80)}[reject]${r}`);
      }

      lines.push(`${borderColor}└──${r}`);

      return lines;
    },

    handleKey(key: string, state: PromptState): PromptAction {
      if (key === 'ctrl+z') {
        return { selectedIndex: state.selectedIndex, action: 'defer' };
      }
      if (key === '/skip') {
        return { selectedIndex: state.selectedIndex, action: 'skip' };
      }
      if (key === 'enter') {
        if (state.mode === 'file-approval') {
          const actions: Array<'accept' | 'edit' | 'reject'> = ['accept', 'edit', 'reject'];
          return { selectedIndex: state.selectedIndex, action: actions[state.selectedIndex] ?? 'accept' };
        }
        return { selectedIndex: state.selectedIndex, action: 'accept' };
      }
      if (key === 'down') {
        const next = (state.selectedIndex + 1) % state.optionCount;
        return { selectedIndex: next };
      }
      if (key === 'up') {
        const next = (state.selectedIndex - 1 + state.optionCount) % state.optionCount;
        return { selectedIndex: next };
      }
      return { selectedIndex: state.selectedIndex };
    },

    checkAutoApprove(approval: FileApproval): boolean {
      if (!autoApprove) return false;
      if (isSensitiveFile(approval.filePath)) return false;
      if (!autoApprovePaths) return true;
      return autoApprovePaths.some(pattern => matchGlob(pattern, approval.filePath));
    },

    enterEditMode(approval: FileApproval): EditState {
      return {
        editable: true,
        content: approval.after ?? '',
        cursorLine: 0,
        cursorCol: 0,
        filePath: approval.filePath,
      };
    },

    renderEditMode(state: EditState): string[] {
      const lines: string[] = [];
      const contentLines = state.content.split('\n');

      lines.push(`${borderColor}┌─${r} ${noColor ? 'editing' : gradText('editing', theme.titleStops)} ${borderColor}— ${r}${fgRgb(140, 140, 140)}${state.filePath}${r} ${borderColor}${'─'.repeat(Math.max(3, width - state.filePath.length - 16))}${r}`);
      lines.push(`${borderColor}│${r}`);

      for (let i = 0; i < contentLines.length; i++) {
        const lineNum = String(i + 1).padStart(3, ' ');
        const isCursor = i === state.cursorLine;
        if (noColor) {
          lines.push(`│ ${lineNum} │ ${isCursor ? '>' : ' '} ${contentLines[i]}`);
        } else {
          const numColor = fgRgb(60, 60, 60);
          const highlight = isCursor ? `\x1b[48;2;20;20;30m` : '';
          lines.push(`${borderColor}│${r} ${numColor}${lineNum} │${r} ${highlight}${isCursor ? fgRgb(accent[0], accent[1], accent[2]) + '>' : ' '}${r} ${highlight}${fgRgb(187, 187, 187)}${contentLines[i]}${r}`);
        }
      }

      lines.push(`${borderColor}│${r}`);
      lines.push(`${borderColor}└──${r}`);

      return lines;
    },

    editKey(key: string, state: EditState): EditState {
      const lines = state.content.split('\n');
      let { cursorLine, cursorCol } = state;

      if (key === 'end') {
        cursorCol = lines[cursorLine]?.length ?? 0;
      } else if (key === 'home') {
        cursorCol = 0;
      } else if (key === 'down') {
        if (cursorLine < lines.length - 1) cursorLine++;
      } else if (key === 'up') {
        if (cursorLine > 0) cursorLine--;
      } else if (key === 'left') {
        if (cursorCol > 0) cursorCol--;
      } else if (key === 'right') {
        cursorCol++;
      } else if (key === 'backspace') {
        if (cursorCol > 0) {
          lines[cursorLine] = lines[cursorLine].slice(0, cursorCol - 1) + lines[cursorLine].slice(cursorCol);
          cursorCol--;
        } else if (cursorLine > 0) {
          cursorCol = lines[cursorLine - 1].length;
          lines[cursorLine - 1] += lines[cursorLine];
          lines.splice(cursorLine, 1);
          cursorLine--;
        }
      } else if (key === 'enter') {
        const before = lines[cursorLine].slice(0, cursorCol);
        const after = lines[cursorLine].slice(cursorCol);
        lines[cursorLine] = before;
        lines.splice(cursorLine + 1, 0, after);
        cursorLine++;
        cursorCol = 0;
      } else if (key.length === 1 && key.charCodeAt(0) >= 32) {
        lines[cursorLine] = lines[cursorLine].slice(0, cursorCol) + key + lines[cursorLine].slice(cursorCol);
        cursorCol++;
      }

      return {
        editable: true,
        content: lines.join('\n'),
        cursorLine,
        cursorCol,
        filePath: state.filePath,
      };
    },

    acceptEdit(state: EditState): EditResult {
      return {
        content: state.content,
        filePath: state.filePath,
        action: 'accept-edited',
      };
    },

    enqueue(question: PromptQuestion): void {
      queue.push(question);
    },

    dequeue(): PromptQuestion | undefined {
      return queue.shift();
    },

    peek(): PromptQuestion | undefined {
      return queue[0];
    },

    getQueueLength(): number {
      return queue.length;
    },
  };
}
