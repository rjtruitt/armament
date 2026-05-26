/** Core diff algorithms: LCS-based diff computation and three-way merge logic. */

import type { DiffHunk, MergeConflict } from './DiffMock.js';

/**
 * Compute diff hunks from two arrays of lines using LCS-based diffing.
 * @param linesA - Original file lines
 * @param linesB - Modified file lines
 * @returns Array of hunks describing the differences
 */
/** Compute diff hunks from two arrays of lines using LCS-based diffing. */
/**
 * Compute diff hunks from two arrays of lines using LCS-based diffing.
 * @param linesA - Original file lines
 * @param linesB - Modified file lines
 * @returns Array of hunks describing the differences
 */
export function computeHunks(linesA: string[], linesB: string[]): DiffHunk[] {
  const changes = computeChanges(linesA, linesB);
  if (changes.length === 0) return [];

  const contextLines = 3;
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;

  for (const change of changes) {
    if (!currentHunk || change.lineA > (currentHunk.oldStart + currentHunk.oldLines - 1) + contextLines * 2) {
      if (currentHunk) {
        addContextAfter(currentHunk, linesA, contextLines);
        hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: Math.max(1, change.lineA - contextLines + 1),
        oldLines: 0,
        newStart: Math.max(1, change.lineB - contextLines + 1),
        newLines: 0,
        lines: [],
      };
      const contextStart = Math.max(0, change.lineA - contextLines);
      for (let i = contextStart; i < change.lineA; i++) {
        currentHunk.lines.push(` ${linesA[i]}`);
        currentHunk.oldLines++;
        currentHunk.newLines++;
      }
    }

    if (change.type === 'delete') {
      currentHunk.lines.push(`-${linesA[change.lineA]}`);
      currentHunk.oldLines++;
    } else if (change.type === 'insert') {
      currentHunk.lines.push(`+${linesB[change.lineB]}`);
      currentHunk.newLines++;
    } else if (change.type === 'replace') {
      currentHunk.lines.push(`-${linesA[change.lineA]}`);
      currentHunk.lines.push(`+${linesB[change.lineB]}`);
      currentHunk.oldLines++;
      currentHunk.newLines++;
    }
  }

  if (currentHunk) {
    addContextAfter(currentHunk, linesA, contextLines);
    hunks.push(currentHunk);
  }

  return hunks;
}

function addContextAfter(hunk: DiffHunk, linesA: string[], contextLines: number): void {
  const lastOldLine = hunk.oldStart + hunk.oldLines - 1;
  const end = Math.min(linesA.length, lastOldLine + contextLines);
  for (let i = lastOldLine; i < end; i++) {
    hunk.lines.push(` ${linesA[i]}`);
    hunk.oldLines++;
    hunk.newLines++;
  }
}

function computeChanges(linesA: string[], linesB: string[]): Array<{
  type: 'delete' | 'insert' | 'replace';
  lineA: number;
  lineB: number;
}> {
  const m = linesA.length;
  const n = linesB.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (linesA[i - 1] === linesB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = m, j = n;
  const rawChanges: Array<{ type: 'delete' | 'insert' | 'replace'; lineA: number; lineB: number }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rawChanges.unshift({ type: 'insert', lineA: i, lineB: j - 1 });
      j--;
    } else if (i > 0) {
      rawChanges.unshift({ type: 'delete', lineA: i - 1, lineB: j });
      i--;
    }
  }

  return rawChanges;
}

/** Format unified diff.
 * @returns {string} - Description of return value.
 */
/**
 * Format diff hunks into a unified diff string (---/+++ format).
 * @param fileA - Name of the original file
 * @param fileB - Name of the modified file
 * @param hunks - Diff hunks to format
 * @returns Unified diff string
 */
/** Format diff hunks into a unified diff string (---/+++ format). */
/**
 * Format diff hunks into a unified diff string (---/+++ format).
 * @param fileA - Name of the original file
 * @param fileB - Name of the modified file
 * @param hunks - Diff hunks to format
 * @returns Unified diff string
 */
export function formatUnifiedDiff(fileA: string, fileB: string, hunks: DiffHunk[]): string {
  const lines: string[] = [
    `--- ${fileA}`,
    `+++ ${fileB}`,
  ];

  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    lines.push(...hunk.lines);
  }

  return lines.join('\n');
}

/** Parse patch.
 */
/**
 * Parse a unified diff patch string back into DiffHunk array.
 * @param patch - Unified diff string to parse
 * @returns Array of parsed hunks
 */
/** Parse a unified diff patch string back into DiffHunk array. */
/**
 * Parse a unified diff patch string back into DiffHunk array.
 * @param patch - Unified diff string to parse
 * @returns Array of parsed hunks
 */
export function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = patch.split('\n');
  let currentHunk: DiffHunk | null = null;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        oldStart: parseInt(hunkMatch[1]),
        oldLines: parseInt(hunkMatch[2] || '1'),
        newStart: parseInt(hunkMatch[3]),
        newLines: parseInt(hunkMatch[4] || '1'),
        lines: [],
      };
    } else if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

/** Verify context.
 * @returns {boolean} - Description of return value.
 */
/**
 * Verify that context lines match between a hunk and the target content.
 * @param lines - Target content lines
 * @param startLine - Line index to start checking
 * @param hunk - Hunk whose context lines to verify
 * @returns True if all context lines match
 */
/** Verify that context lines match between a hunk and the target content. */
/**
 * Verify that context lines match between a hunk and the target content.
 * @param lines - Target content lines
 * @param startLine - Line index to start checking
 * @param hunk - Hunk whose context lines to verify
 * @returns True if all context lines match
 */
export function verifyContext(lines: string[], startLine: number, hunk: DiffHunk): boolean {
  let lineIdx = startLine;
  for (const hunkLine of hunk.lines) {
    if (hunkLine.startsWith(' ') || hunkLine.startsWith('-')) {
      if (lineIdx >= lines.length) return false;
      if (lines[lineIdx] !== hunkLine.substring(1)) return false;
      lineIdx++;
    }
  }
  return true;
}

/** Get changes.
 */
/**
 * Extract a list of changes between base and modified lines.
 * @param base - Original lines
 * @param modified - Modified lines
 * @returns Array of change descriptors
 */
/** Extract a list of changes between base and modified lines. */
/**
 * Extract a list of changes between base and modified lines.
 * @param base - Original lines
 * @param modified - Modified lines
 * @returns Array of change descriptors
 */
export function getChanges(base: string[], modified: string[]): Array<{
  baseLine: number;
  baseCount: number;
  newLines: string[];
}> {
  const changes: Array<{ baseLine: number; baseCount: number; newLines: string[] }> = [];

  let i = 0;
  let j = 0;

  while (i < base.length && j < modified.length) {
    if (base[i] === modified[j]) {
      i++;
      j++;
    } else {
      const changeStart = i;
      const modStart = j;

      let matchFound = false;
      for (let lookAhead = 1; lookAhead < 10 && !matchFound; lookAhead++) {
        if (i + lookAhead < base.length) {
          for (let mLook = j; mLook < Math.min(j + 10, modified.length); mLook++) {
            if (base[i + lookAhead] === modified[mLook]) {
              changes.push({
                baseLine: changeStart,
                baseCount: lookAhead,
                newLines: modified.slice(modStart, mLook),
              });
              i += lookAhead;
              j = mLook;
              matchFound = true;
              break;
            }
          }
        }
      }

      if (!matchFound) {
        changes.push({
          baseLine: i,
          baseCount: 1,
          newLines: [modified[j]],
        });
        i++;
        j++;
      }
    }
  }

  return changes;
}

/** Arrays equal.
 * @returns {boolean} - Description of return value.
 */
/**
 * Compare two string arrays for strict equality.
 * @param a - First array
 * @param b - Second array
 * @returns True if both arrays have identical length and elements
 */
/** Compare two string arrays for strict equality. */
/**
 * Compare two string arrays for strict equality.
 * @param a - First array
 * @param b - Second array
 * @returns True if both arrays have identical length and elements
 */
export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
}

/** Three way merge impl.
 */
/**
 * Perform a three-way merge on line arrays.
 * @param baseLines - Common ancestor lines
 * @param oursLines - Our modified lines
 * @param theirsLines - Their modified lines
 * @returns Merged result and any conflicts
 */
/** Perform a three-way merge on line arrays using ours/theirs changes from a common base. */
/**
 * Perform a three-way merge on line arrays.
 * @param baseLines - Common ancestor lines
 * @param oursLines - Our modified lines
 * @param theirsLines - Their modified lines
 * @returns Merged result and any conflicts
 */
export function threeWayMergeImpl(
  baseLines: string[],
  oursLines: string[],
  theirsLines: string[],
): { result: string[]; conflicts: MergeConflict[] } {
  const conflicts: MergeConflict[] = [];
  const result: string[] = [];

  const oursChanges = getChanges(baseLines, oursLines);
  const theirsChanges = getChanges(baseLines, theirsLines);

  let baseIdx = 0;

  while (baseIdx < baseLines.length) {
    const ourChange = oursChanges.find((c) => c.baseLine === baseIdx);
    const theirChange = theirsChanges.find((c) => c.baseLine === baseIdx);

    if (!ourChange && !theirChange) {
      result.push(baseLines[baseIdx]);
      baseIdx++;
    } else if (ourChange && !theirChange) {
      result.push(...ourChange.newLines);
      baseIdx += ourChange.baseCount;
    } else if (!ourChange && theirChange) {
      result.push(...theirChange.newLines);
      baseIdx += theirChange.baseCount;
    } else if (ourChange && theirChange) {
      if (arraysEqual(ourChange.newLines, theirChange.newLines)) {
        result.push(...ourChange.newLines);
      } else {
        const conflict: MergeConflict = {
          startLine: result.length + 1,
          endLine: result.length + ourChange.newLines.length + theirChange.newLines.length + 3,
          ours: ourChange.newLines,
          theirs: theirChange.newLines,
          base: baseLines.slice(baseIdx, baseIdx + Math.max(ourChange.baseCount, theirChange.baseCount)),
        };
        conflicts.push(conflict);

        result.push('<<<<<<< ours');
        result.push(...ourChange.newLines);
        result.push('=======');
        result.push(...theirChange.newLines);
        result.push('>>>>>>> theirs');
      }
      baseIdx += Math.max(ourChange.baseCount, theirChange.baseCount);
    }
  }

  // Handle trailing content
  const oursExtra = oursLines.slice(baseLines.length);
  const theirsExtra = theirsLines.slice(baseLines.length);

  if (oursExtra.length > 0 && theirsExtra.length === 0) {
    result.push(...oursExtra);
  } else if (theirsExtra.length > 0 && oursExtra.length === 0) {
    result.push(...theirsExtra);
  } else if (oursExtra.length > 0 && theirsExtra.length > 0) {
    if (arraysEqual(oursExtra, theirsExtra)) {
      result.push(...oursExtra);
    } else {
      conflicts.push({
        startLine: result.length + 1,
        endLine: result.length + oursExtra.length + theirsExtra.length + 3,
        ours: oursExtra,
        theirs: theirsExtra,
        base: [],
      });
      result.push('<<<<<<< ours');
      result.push(...oursExtra);
      result.push('=======');
      result.push(...theirsExtra);
      result.push('>>>>>>> theirs');
    }
  }

  return { result, conflicts };
}
