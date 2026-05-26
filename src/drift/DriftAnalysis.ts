/**
 * DriftAnalysis — minimal helpers for the snapshot-only drift system.
 */

/** Get the number of commits ahead of a given reference. */
export function getCommitsAhead(ref: string, repoPath: string, gitSafe: (cmd: string, cwd?: string) => string | null): number {
  const countStr = gitSafe(`rev-list "${ref}..HEAD" --count`, repoPath);
  return parseInt(countStr || '0', 10);
}
