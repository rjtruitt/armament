/** Current state of the input line for rendering. */
export interface InputState {
  text: string;
  cursorPosition: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  isMultiLine: boolean;
  historyIndex: number;
  completionIndex: number;
  mode: 'normal' | 'insert' | 'search';
}
/** Interface for CompletionItem.
 * @property {string} text - Description of text.
 * @property {string} description - Description of description.
 * @property {string} icon - Description of icon.
 */
export interface CompletionItem {
  text: string;
  type: 'command' | 'agent' | 'model' | 'provider' | 'file' | 'variable' | 'alias';
  description?: string;
  icon?: string;
}
interface InputHandlerContext {
  commands?: string[];
  agents?: string[];
  models?: string[];
  providers?: string[];
  variables?: string[];
  history?: string[];
  aliases?: Record<string, string>;
  onCommand?: (command: string) => void;
  onMessage?: (message: string, mention?: { type: string; name: string }) => void;
  commandHandler?: any;
  scriptEngine?: any;
  agentController?: any;
  providerManager?: any;
}
/** Class representing InputHandler. */
export class InputHandler {
  private text = '';
  private cursorPosition = 0;
  private isMultiLine = false;
  private historyEntries: string[];
  private historyIndex = -1;
  private savedInput = '';
  private completionIndex = -1;
  private undoStack: Array<{ text: string; cursor: number }> = [];
  private redoStack: Array<{ text: string; cursor: number }> = [];
  private backtickCount = 0;
  private cachedCompletions: CompletionItem[] = [];
  private _completionPrefix = '';
  private commands: string[];
  private agents: string[];
  private models: string[];
  private providers: string[];
  private variables: string[];
  private aliases: Record<string, string>;
  private onCommand?: (command: string) => void;
  private onMessage?: (message: string, mention?: { type: string; name: string }) => void;
  /**
   * @param ctx - Context with command/agent/model/provider lists, history, aliases, and callbacks.
   */
  constructor(ctx: InputHandlerContext) {
    this.commands = ctx.commands ?? [];
    this.agents = ctx.agents ?? [];
    this.models = (ctx.models ?? []).map(m => typeof m === 'string' ? m : (m as any).name);
    this.providers = ctx.providers ?? [];
    this.variables = ctx.variables ?? [];
    this.historyEntries = [...(ctx.history ?? [])];
    this.aliases = ctx.aliases ?? {};
    this.onCommand = ctx.onCommand;
    this.onMessage = ctx.onMessage;
    this.undoStack.push({ text: '', cursor: 0 });
  }
  /**
   * Returns the current input state for rendering.
   */
  getState(): InputState {
    return {
      text: this.text,
      cursorPosition: this.cursorPosition,
      selectionStart: null,
      selectionEnd: null,
      isMultiLine: this.isMultiLine,
      historyIndex: this.historyIndex,
      completionIndex: this.completionIndex,
      mode: 'insert',
    };
  }
  /**
   * Sets the input text and resets completion state.
   * @param text - The new text to set.
   */
  setText(text: string): void {
    this.pushUndo();
    this.text = text;
    this.cursorPosition = text.length;
    this.completionIndex = -1;
    this.cachedCompletions = [];
  }
  /**
   * Inserts a character at the cursor position. Tracks backticks for multi-line mode.
   * @param char - The character to insert.
   */
  insertChar(char: string): void {
    this.pushUndo();
    this.text = this.text.slice(0, this.cursorPosition) + char + this.text.slice(this.cursorPosition);
    this.cursorPosition += char.length;
    this.completionIndex = -1;
    this.cachedCompletions = [];
    if (char === '`') {
      this.backtickCount++;
      if (this.backtickCount >= 3 && !this.isMultiLine) {
        this.isMultiLine = true;
      }
    } else {
      this.backtickCount = 0;
    }
  }
  /**
   * Deletes a character at or before the cursor position.
   * @param direction - 'backward' deletes before cursor, 'forward' deletes at cursor.
   */
  deleteChar(direction: 'forward' | 'backward'): void {
    this.pushUndo();
    if (direction === 'backward' && this.cursorPosition > 0) {
      this.text = this.text.slice(0, this.cursorPosition - 1) + this.text.slice(this.cursorPosition);
      this.cursorPosition--;
    } else if (direction === 'forward' && this.cursorPosition < this.text.length) {
      this.text = this.text.slice(0, this.cursorPosition) + this.text.slice(this.cursorPosition + 1);
    }
  }
  /**
   * Moves the cursor in the given direction.
   * @param direction - The movement direction (left, right, home, end, word-left, word-right).
   */
  moveCursor(direction: 'left' | 'right' | 'home' | 'end' | 'word-left' | 'word-right'): void {
    switch (direction) {
      case 'left':
        if (this.cursorPosition > 0) this.cursorPosition--;
        break;
      case 'right':
        if (this.cursorPosition < this.text.length) this.cursorPosition++;
        break;
      case 'home':
        this.cursorPosition = 0;
        break;
      case 'end':
        this.cursorPosition = this.text.length;
        break;
      case 'word-left': {
        let pos = this.cursorPosition;
        while (pos > 0 && this.text[pos - 1] === ' ') pos--;
        while (pos > 0 && this.text[pos - 1] !== ' ') pos--;
        this.cursorPosition = pos;
        break;
      }
      case 'word-right': {
        let pos = this.cursorPosition;
        while (pos < this.text.length && this.text[pos] !== ' ') pos++;
        this.cursorPosition = pos;
        break;
      }
    }
  }
  /**
   * Submits the current input: expands aliases, records history, and dispatches to command or message handler.
   */
  async submit(): Promise<void> {
    const input = this.text.trim();
    if (!input) return;
    const expanded = this.expandAlias(input);
    if (this.historyEntries.length === 0 || this.historyEntries[this.historyEntries.length - 1] !== input) {
      this.historyEntries.push(input);
    }
    if (expanded.startsWith('/')) {
      this.onCommand?.(expanded);
    } else if (expanded.startsWith('@')) {
      const mention = this.parseMentionFromText(expanded);
      if (mention) {
        const message = expanded.slice(expanded.indexOf(' ') + 1);
        this.onMessage?.(message, mention);
      } else {
        this.onMessage?.(expanded, undefined);
      }
    } else {
      this.onMessage?.(expanded, undefined);
    }
    this.text = '';
    this.cursorPosition = 0;
    this.historyIndex = -1;
    this.savedInput = '';
    this.completionIndex = -1;
  }
  /**
   * Navigates backward through input history.
   */
  historyUp(): void {
    if (this.historyEntries.length === 0) return;
    if (this.historyIndex === -1) {
      this.savedInput = this.text;
      this.historyIndex = this.historyEntries.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    }
    this.text = this.historyEntries[this.historyIndex];
    this.cursorPosition = this.text.length;
  }
  /**
   * Navigates forward through input history.
   */
  historyDown(): void {
    if (this.historyIndex === -1) return;
    if (this.historyIndex < this.historyEntries.length - 1) {
      this.historyIndex++;
      this.text = this.historyEntries[this.historyIndex];
    } else {
      this.historyIndex = -1;
      this.text = this.savedInput;
    }
    this.cursorPosition = this.text.length;
  }
  /**
   * Searches history entries matching the given query (case-insensitive).
   * @param query - The search string.
   */
  searchHistory(query: string): string[] {
    return this.historyEntries.filter(entry =>
      entry.toLowerCase().includes(query.toLowerCase())
    );
  }
  /**
   * Returns the full history of input entries.
   */
  getHistory(): string[] {
    return [...this.historyEntries];
  }
  /**
   * Returns tab-completion items based on the current input text.
   * Supports command (/), mention (@), and variable ($) prefixes.
   */
  getCompletions(): CompletionItem[] {
    const text = this.text;
    if (text.startsWith('/')) {
      const partial = text.toLowerCase();
      return this.commands
        .filter(c => c.toLowerCase().startsWith(partial))
        .map(c => ({ text: c, type: 'command' as const }));
    }
    if (text.startsWith('@')) {
      const partial = text.slice(1).toLowerCase();
      const items: CompletionItem[] = [];
      for (const agent of this.agents) {
        if (agent.toLowerCase().startsWith(partial)) {
          items.push({ text: `@${agent}`, type: 'agent' });
        }
      }
      for (const model of this.models) {
        if (model.toLowerCase().startsWith(partial)) {
          items.push({ text: `@${model}`, type: 'model' });
        }
      }
      for (const provider of this.providers) {
        if (provider.toLowerCase().startsWith(partial)) {
          items.push({ text: `@${provider}`, type: 'provider' });
        }
      }
      return items;
    }
    if (text.startsWith('$')) {
      const partial = text.toUpperCase();
      return this.variables
        .filter(v => v.toUpperCase().startsWith(partial))
        .map(v => ({ text: v, type: 'variable' as const }));
    }
    return [];
  }
  /**
   * Accepts a completion at the given index, replacing input text.
   * @param index - The index in the completions array.
   */
  acceptCompletion(index: number): void {
    const completions = this.getCompletions();
    if (index >= 0 && index < completions.length) {
      this.text = completions[index].text;
      this.cursorPosition = this.text.length;
      this.completionIndex = index;
    }
  }
  /**
   * Cycles through available completions (next or previous).
   * @param direction - 'next' or 'prev'.
   */
  cycleCompletion(direction: 'next' | 'prev'): void {
    if (this.cachedCompletions.length === 0 || this.completionIndex === -1) {
      this.cachedCompletions = this.getCompletions();
      this._completionPrefix = this.text;
      this.completionIndex = -1;
    }
    if (this.cachedCompletions.length === 0) return;
    if (direction === 'next') {
      this.completionIndex = (this.completionIndex + 1) % this.cachedCompletions.length;
    } else {
      this.completionIndex = this.completionIndex <= 0 ? this.cachedCompletions.length - 1 : this.completionIndex - 1;
    }
    this.text = this.cachedCompletions[this.completionIndex].text;
    this.cursorPosition = this.text.length;
  }
  /**
   * Enters multi-line editing mode.
   */
  enterMultiLine(): void {
    this.isMultiLine = true;
  }
  /**
   * Exits multi-line editing mode.
   */
  exitMultiLine(): void {
    this.isMultiLine = false;
  }
  /**
   * Handles pasted text: sanitizes control characters and detects multi-line paste.
   * @param text - The pasted text.
   */
  handlePaste(text: string): void {
    const sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    if (sanitized.includes('\n')) {
      this.isMultiLine = true;
    }
    this.text = this.text.slice(0, this.cursorPosition) + sanitized + this.text.slice(this.cursorPosition);
    this.cursorPosition += sanitized.length;
  }
  /**
   * Parses an @mention from the current input text.
   * @returns The mention details, or null if no valid mention found.
   */
  parseMention(): { type: 'agent' | 'model' | 'provider'; name: string } | null {
    return this.parseMentionFromText(this.text);
  }
  /**
   * Undoes the last input operation.
   */
  undo(): void {
    if (this.undoStack.length <= 1) return;
    const current = { text: this.text, cursor: this.cursorPosition };
    this.redoStack.push(current);
    const prev = this.undoStack.pop()!;
    this.text = prev.text;
    this.cursorPosition = prev.cursor;
  }
  /**
   * Redoes a previously undone operation.
   */
  redo(): void {
    if (this.redoStack.length === 0) return;
    this.undoStack.push({ text: this.text, cursor: this.cursorPosition });
    const next = this.redoStack.pop()!;
    this.text = next.text;
    this.cursorPosition = next.cursor;
  }
  private pushUndo(): void {
    this.undoStack.push({ text: this.text, cursor: this.cursorPosition });
    this.redoStack = [];
  }
  private expandAlias(input: string): string {
    for (const [alias, expansion] of Object.entries(this.aliases)) {
      if (input === alias || input.startsWith(alias + ' ')) {
        return expansion + input.slice(alias.length);
      }
    }
    return input;
  }
  private parseMentionFromText(text: string): { type: 'agent' | 'model' | 'provider'; name: string } | null {
    if (!text.startsWith('@')) return null;
    const match = text.match(/^@([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const name = match[1];
    if (this.agents.includes(name)) {
      return { type: 'agent', name };
    }
    if (this.models.includes(name)) {
      return { type: 'model', name };
    }
    if (this.providers.includes(name)) {
      return { type: 'provider', name };
    }
    return null;
  }
}