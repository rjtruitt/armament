/** ANSI-colored renderers for drift snapshot status. */
import type { IDriftStats } from './interfaces/IDrift.js';

const GREEN = '\x1b[38;5;46m';
const YELLOW = '\x1b[38;5;214m';
const BLUE = '\x1b[38;5;39m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

/** Creates a display helper with ANSI-formatted rendering for drift snapshot stats. */
export function createDriftDisplay(stats: IDriftStats) {
  return {
    renderStats(): string {
      const lines: string[] = [];
      lines.push(`${BOLD}${BLUE}drift:${RESET} ${stats.channelName}`);

      if (stats.snapshotsCount === 0) {
        lines.push(`  ${DIM}no snapshots yet${RESET}`);
      } else {
        lines.push(`  snapshots: ${stats.snapshotsCount}`);
        lines.push(`  stored size: ${formatBytes(stats.totalSizeBytes)}`);
        lines.push(`  tracked files:`);
        for (const p of stats.paths) {
          lines.push(`    ${p}`);
        }
      }

      return lines.join('\n');
    },
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
