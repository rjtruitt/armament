import { IRenderer, IStatusState, IFileEntry, ICommitInfo, StatusType } from '../interfaces/IRenderer.js';

/** Class representing BaseRenderer. */
export abstract class BaseRenderer implements IRenderer {
  protected colorEnabled: boolean;

  constructor(colorEnabled = true) {
    this.colorEnabled = colorEnabled;
  }

  /**
   * Render banner.
   */
  abstract renderBanner(): string;
  /**
   * Render mini banner.
   */
  abstract renderMiniBanner(): string;
  /**
   * Render separator.
   */
  abstract renderSeparator(width: number): string;
  /**
   * Render prompt.
   */
  abstract renderPrompt(mode: string): string;
  /**
   * Render status line.
   */
  abstract renderStatusLine(state: IStatusState): string;
  /**
   * Render thinking.
   */
  abstract renderThinking(text: string): string;
  /**
   * Render tool call.
   */
  abstract renderToolCall(name: string, args: Record<string, unknown>): string;
  /**
   * Render tool result.
   */
  abstract renderToolResult(result: string, durationMs: number): string;
  /**
   * Render error.
   */
  abstract renderError(error: Error): string;
  /**
   * Render diff.
   */
  abstract renderDiff(diff: string): string;
  /**
   * Render markdown.
   */
  abstract renderMarkdown(md: string): string;
  /**
   * Render progress bar.
   */
  abstract renderProgressBar(current: number, total: number): string;
  /**
   * Render box.
   */
  abstract renderBox(content: string, title?: string): string;
  /**
   * Render file tree.
   */
  abstract renderFileTree(entries: IFileEntry[]): string;
  /**
   * Render commit.
   */
  abstract renderCommit(commit: ICommitInfo): string;
  /**
   * Render status.
   */
  abstract renderStatus(type: StatusType, message: string): string;
  /**
   * Apply gradient.
   */
  abstract applyGradient(text: string): string;

  /**
   * Checks whether color enabled.
   */
  isColorEnabled(): boolean {
    return this.colorEnabled;
  }

  protected stripAnsi(str: string): string {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }
}
