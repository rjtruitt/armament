/** Renders UI components: banners, prompts, status bars, markdown, diffs, file trees, and gradients. */
export interface IRenderer {
  renderBanner(): string;
  renderMiniBanner(): string;
  renderSeparator(width: number): string;
  renderPrompt(mode: string): string;
  renderStatusLine(state: IStatusState): string;
  renderThinking(text: string): string;
  renderToolCall(name: string, args: Record<string, unknown>): string;
  renderToolResult(result: string, durationMs: number): string;
  renderError(error: Error): string;
  renderDiff(diff: string): string;
  renderMarkdown(md: string): string;
  renderProgressBar(current: number, total: number): string;
  renderBox(content: string, title?: string): string;
  renderFileTree(entries: IFileEntry[]): string;
  renderCommit(commit: ICommitInfo): string;
  renderStatus(type: StatusType, message: string): string;
  applyGradient(text: string): string;
  isColorEnabled(): boolean;
}
/** State data for rendering the status bar (model, provider, tokens, cost). */
export interface IStatusState {
  model: string;
  provider: string;
  mode: string;
  tokens: number;
  cost: number;
  elapsed?: number;
  processing: boolean;
  cacheHitRatio?: number;
}
/** A file or directory entry for rendering file trees. */
export interface IFileEntry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
}
/** Information about a git commit for rendering. */
export interface ICommitInfo {
  hash: string;
  message: string;
  author?: string;
  date?: string;
}
/** Type union for StatusType: success, error, warn, info, dim. */
export type StatusType = 'success' | 'error' | 'warn' | 'info' | 'dim';