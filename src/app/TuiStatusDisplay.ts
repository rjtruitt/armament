import { THINKING_MESSAGES } from './TuiTypes.js';

/** Interface for StatusDisplayDelegate. */
export interface StatusDisplayDelegate {
  getActiveChannel(): string;
  render(): void;
}

/** Class representing TuiStatusDisplay. */
export class TuiStatusDisplay {
  /** Set of channels currently thinking — reference-counted so concurrent channels don't race. */
  private _thinkingChannels: Set<string> = new Set();
  private _thinkingTimer: ReturnType<typeof setInterval> | null = null;
  private _thinkingFrame = 0;
  /** Legacy — the most-recently started thinking channel, kept for render checks. */
  private _thinkingChannel: string | null = null;
  private _thinkingMsg = '';
  private _thinkingMsgLocked = false;
  private _thinkingTextBuffer = '';
  private _thinkingScrollOffset = 0;

  private _compactingChannel: string | null = null;
  private _compactingTimer: ReturnType<typeof setInterval> | null = null;

  private _paneStatus: string | null = null;
  private _paneStatusTimer: ReturnType<typeof setTimeout> | null = null;

  private delegate: StatusDisplayDelegate;

  constructor(delegate: StatusDisplayDelegate) {
    this.delegate = delegate;
  }

  /**
   * Gets the thinking frame.
   */
  get thinkingFrame(): number { return this._thinkingFrame; }
  /**
   * Gets the thinking channel.
   */
  get thinkingChannel(): string | null { return this._thinkingChannel; }
  /**
   * Gets the thinking msg.
   */
  get thinkingMsg(): string { return this._thinkingMsg; }
  /**
   * Gets the thinking text buffer.
   */
  get thinkingTextBuffer(): string { return this._thinkingTextBuffer; }
  /**
   * Gets the thinking timer.
   */
  get thinkingTimer(): ReturnType<typeof setInterval> | null { return this._thinkingTimer; }
  /**
   * Gets the compacting channel.
   */
  get compactingChannel(): string | null { return this._compactingChannel; }
  /**
   * Gets the compacting timer.
   */
  get compactingTimer(): ReturnType<typeof setInterval> | null { return this._compactingTimer; }
  /**
   * Gets the pane status.
   */
  get paneStatus(): string | null { return this._paneStatus; }

  /**
   * Append thinking text.
   */
  appendThinkingText(text: string): void {
    this._thinkingTextBuffer += text;
  }

  /**
   * Start thinking.
   */
  startThinking(channel?: string, message?: string): void {
    const ch = channel ?? this.delegate.getActiveChannel();
    this._thinkingChannels.add(ch);
    this._thinkingChannel = ch;
    this._thinkingMsg = message ?? THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
    this._thinkingFrame = 0;
    if (!this._thinkingTimer) {
      this._thinkingTimer = setInterval(() => {
        this._thinkingFrame++;
        if (this._thinkingFrame % 10 === 0 && !this._thinkingMsgLocked) {
          this._thinkingMsg = THINKING_MESSAGES[Math.floor(Math.random() * THINKING_MESSAGES.length)];
        }
        if (this._thinkingChannels.has(this.delegate.getActiveChannel())) this.delegate.render();
      }, 100);
    }
    this._thinkingMsgLocked = !!message;
  }

  /**
   * Update thinking message.
   */
  updateThinkingMessage(message: string): void {
    this._thinkingMsg = message;
    this._thinkingMsgLocked = true;
  }

  /**
   * Stop thinking for a channel (reference-counted).
   * Pass the channel name to decrement its ref. Only stops the timer
   * and clears state when ALL channels have stopped thinking.
   * Calling without a channel (legacy) clears everything immediately.
   */
  stopThinking(channel?: string): void {
    if (channel) {
      this._thinkingChannels.delete(channel);
      if (this._thinkingChannels.size > 0) return; // other channels still thinking
    } else {
      this._thinkingChannels.clear();
    }
    if (this._thinkingTimer) {
      clearInterval(this._thinkingTimer);
      this._thinkingTimer = null;
    }
    this._thinkingChannel = null;
    this._thinkingMsgLocked = false;
    this._thinkingTextBuffer = '';
    this._thinkingScrollOffset = 0;
    this.delegate.render();
  }

  /**
   * Start compacting.
   */
  startCompacting(channel?: string): void {
    this._compactingChannel = channel ?? this.delegate.getActiveChannel();
    if (this._compactingTimer) clearInterval(this._compactingTimer);
    this._compactingTimer = setInterval(() => {
      this.delegate.render();
    }, 80);
  }

  /**
   * Stop compacting.
   */
  stopCompacting(): void {
    if (this._compactingTimer) {
      clearInterval(this._compactingTimer);
      this._compactingTimer = null;
    }
    this._compactingChannel = null;
    this.delegate.render();
  }

  /**
   * Show pane status.
   */
  showPaneStatus(msg: string): void {
    this._paneStatus = msg;
    if (this._paneStatusTimer) clearTimeout(this._paneStatusTimer);
    this._paneStatusTimer = setTimeout(() => {
      this._paneStatus = null;
      this._paneStatusTimer = null;
      this.delegate.render();
    }, 3000);
    this.delegate.render();
  }
}
