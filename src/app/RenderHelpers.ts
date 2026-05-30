/**
 * Static rendering helper methods extracted from ArmamentApp.
 * Pure functions — no instance state needed.
 */
import type { IFileEntry, ICommitInfo } from '../core/interfaces/IRenderer.js';

export function renderBanner(): string {
  return [
    '╔═══════════════════════════════════════╗',
    '║         ARMAMENT v0.1.0               ║',
    '║   Multi-Agent IRC-Style Terminal      ║',
    '╚═══════════════════════════════════════╝',
  ].join('\n');
}

/** Render mini banner. */
export function renderMiniBanner(): string {
  return '── armament v0.1.0 ──';
}

/** Render separator. */
export function renderSeparator(width: number): string {
  return '─'.repeat(width);
}

/** Render markdown. */
export function renderMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```\w*\n?/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1');
}

/** Render diff. */
export function renderDiff(diff: string): string {
  return diff.split('\n').map(line => {
    if (line.startsWith('+')) return `\x1b[32m${line}\x1b[0m`;
    if (line.startsWith('-')) return `\x1b[31m${line}\x1b[0m`;
    return line;
  }).join('\n');
}

/** Render error. */
export function renderError(error: Error): string {
  return `\x1b[31mError: ${error.message || 'Unknown error'}\x1b[0m`;
}

/** Render progress bar. */
export function renderProgressBar(current: number, total: number): string {
  const width = 30;
  const percentage = total === 0 ? 0 : Math.max(0, Math.min(100, (current / total) * 100));
  const filled = Math.round((percentage / 100) * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${Math.round(percentage)}%`;
}

/** Render box. */
export function renderBox(content: string): string {
  const lines = content.split('\n');
  const maxLen = Math.max(...lines.map(l => l.length));
  const top = '┌' + '─'.repeat(maxLen + 2) + '┐';
  const bottom = '└' + '─'.repeat(maxLen + 2) + '┘';
  const body = lines.map(l => `│ ${l.padEnd(maxLen)} │`).join('\n');
  return `${top}\n${body}\n${bottom}`;
}

/** Render file tree. */
export function renderFileTree(entries: IFileEntry[]): string {
  return entries.map(e => `${e.type === 'dir' ? '📁' : '📄'} ${e.name}`).join('\n');
}

/** Render file path. */
export function renderFilePath(p: string, line?: number): string {
  return line !== undefined ? `\x1b[36m${p}:${line}\x1b[0m` : `\x1b[36m${p}\x1b[0m`;
}

/** Render commit. */
export function renderCommit(commit: ICommitInfo): string {
  return `\x1b[33m${commit.hash}\x1b[0m ${commit.message} (${commit.author})`;
}

/** Render status. */
export function renderStatus(type: string, message: string): string {
  const icons: Record<string, string> = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
  return `${icons[type] || '•'} ${message}`;
}

/** Apply gradient. */
export function applyGradient(text: string, noColor: boolean): string {
  return noColor ? text : `\x1b[38;5;46m${text}\x1b[0m`;
}

/** A content block that may contain image data. */
interface ContentBlockLike {
  type?: string;
  mimeType?: string;
  data?: string | { length?: number };
}

/** Render image content block placeholder. */
export function renderImage(content: ContentBlockLike): string {
  return `[Image: ${content.mimeType || 'unknown'} (${content.data?.length || 0} bytes)]`;
}

/** Check if a content block is an image type. */
export function isImageContent(content: ContentBlockLike): boolean {
  return content?.type === 'image';
}
