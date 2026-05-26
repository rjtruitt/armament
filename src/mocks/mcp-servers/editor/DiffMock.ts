/** Simulates diff/patch operations including three-way merge. */
import {
  computeHunks,
  formatUnifiedDiff,
  parsePatch,
  verifyContext,
  threeWayMergeImpl,
} from './diff-algorithms.js';
/** Describes a single hunk in a unified diff. */
/** Describes a single hunk in a unified diff. */
export interface DiffHunk {
  /** Starting line number in the original file (1-based) */
  /** Starting line number in the original file (1-based) */
  /** Starting line number in the original file (1-based) */
  oldStart: number;
  /** Number of lines in the original file */
  /** Number of lines in the original file */
  /** Number of lines in the original file */
  oldLines: number;
  /** Starting line number in the new file (1-based) */
  /** Starting line number in the new file (1-based) */
  /** Starting line number in the new file (1-based) */
  newStart: number;
  /** Number of lines in the new file */
  /** Number of lines in the new file */
  /** Number of lines in the new file */
  newLines: number;
  /** Diff lines prefixed with space, +, or - */
  /** Diff lines prefixed with space, +, or - */
  /** Diff lines prefixed with space, +, or - */
  lines: string[];
}
/** Complete unified diff result for two file versions. */
/** Complete unified diff result for two file versions. */
export interface UnifiedDiff {
  fileA: string;
  fileB: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  unified: string;
}
/** Result of applying a diff patch to content. */
/** Result of applying a diff patch to content. */
export interface PatchResult {
  success: boolean;
  content: string;
  hunksApplied: number;
  hunksFailed: number;
  conflicts?: string[];
}
/** Result of a three-way merge operation. */
/** Result of a three-way merge operation. */
export interface MergeResult {
  success: boolean;
  content: string;
  conflicts: MergeConflict[];
  hasConflicts: boolean;
}
/** Describes a conflict between changes in a three-way merge. */
/** Describes a conflict between changes in a three-way merge. */
export interface MergeConflict {
  startLine: number;
  endLine: number;
  ours: string[];
  theirs: string[];
  base: string[];
}
/** Configuration for the DiffMock server. */
/** Configuration for the DiffMock server. */
export interface DiffMockConfig {
  latencyMs?: number;
}
/**
 * Mock server that simulates diff/patch operations including three-way merge.
 */
/** Mock MCP server simulating diff/patch operations including three-way merge. */
/**
 * Mock server that simulates diff/patch operations including three-way merge.
 */
/**
 * Mock server that simulates diff/patch operations including three-way merge.
 */
export class DiffMock {
  private config: Required<DiffMockConfig>;
  constructor(config?: DiffMockConfig) {
    this.config = {
      latencyMs: config?.latencyMs ?? 0,
    };
  }
  /**
   * Diff.
   */
/**
   * Generate a unified diff between two text contents.
   * @param contentA - Original content
   * @param contentB - Modified content
   * @param nameA - Label for original file
   * @param nameB - Label for modified file
   * @returns Unified diff result
   */
/**
   * Generate a unified diff between two text contents.
   * @param contentA - Original content
   * @param contentB - Modified content
   * @param nameA - Label for original file
   * @param nameB - Label for modified file
   * @returns Unified diff result
   */
  async diff(contentA: string, contentB: string, nameA?: string, nameB?: string): Promise<UnifiedDiff> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const linesA = contentA.split('\n');
    const linesB = contentB.split('\n');
    const hunks = computeHunks(linesA, linesB);
    let additions = 0;
    let deletions = 0;
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.startsWith('+')) additions++;
        else if (line.startsWith('-')) deletions++;
      }
    }
    const fileA = nameA ?? 'a/file';
    const fileB = nameB ?? 'b/file';
    const unified = formatUnifiedDiff(fileA, fileB, hunks);
    return { fileA, fileB, hunks, additions, deletions, unified };
  }
  /**
   * Apply.
   */
/**
   * Apply a unified diff patch to content.
   * @param content - Original file content
   * @param patch - Unified diff patch string
   * @returns Patch application result
   */
/**
   * Apply a unified diff patch to content.
   * @param content - Original file content
   * @param patch - Unified diff patch string
   * @returns Patch application result
   */
  async apply(content: string, patch: string): Promise<PatchResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const hunks = parsePatch(patch);
    const lines = content.split('\n');
    let offset = 0;
    let hunksApplied = 0;
    let hunksFailed = 0;
    const conflicts: string[] = [];
    for (const hunk of hunks) {
      const targetLine = hunk.oldStart - 1 + offset;
      const contextMatches = verifyContext(lines, targetLine, hunk);
      if (contextMatches) {
        const removeCount = hunk.lines.filter((l) => l.startsWith('-') || l.startsWith(' ')).length;
        const newLines = hunk.lines
          .filter((l) => l.startsWith('+') || l.startsWith(' '))
          .map((l) => l.substring(1));
        lines.splice(targetLine, removeCount, ...newLines);
        offset += newLines.length - removeCount;
        hunksApplied++;
      } else {
        hunksFailed++;
        conflicts.push(`Hunk at line ${hunk.oldStart} failed to apply`);
      }
    }
    return {
      success: hunksFailed === 0,
      content: lines.join('\n'),
      hunksApplied,
      hunksFailed,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    };
  }
  /**
   * Three way merge.
   */
/**
   * Perform a three-way merge between base, ours, and theirs.
   * @param base - Common ancestor content
   * @param ours - Our modified content
   * @param theirs - Their modified content
   * @returns Merge result with any conflicts
   */
/**
   * Perform a three-way merge between base, ours, and theirs.
   * @param base - Common ancestor content
   * @param ours - Our modified content
   * @param theirs - Their modified content
   * @returns Merge result with any conflicts
   */
  async threeWayMerge(base: string, ours: string, theirs: string): Promise<MergeResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const baseLines = base.split('\n');
    const oursLines = ours.split('\n');
    const theirsLines = theirs.split('\n');
    const { result, conflicts } = threeWayMergeImpl(baseLines, oursLines, theirsLines);
    return {
      success: conflicts.length === 0,
      content: result.join('\n'),
      conflicts,
      hasConflicts: conflicts.length > 0,
    };
  }
  /**
   * Gets the tools.
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
/**
   * Return the list of MCP tool definitions.
   * @returns Array of tool descriptors
   */
  getTools() {
    return [
      {
        name: 'diff_compare',
        description: 'Generate a unified diff between two text contents',
        inputSchema: {
          type: 'object',
          properties: {
            contentA: { type: 'string', description: 'Original content' },
            contentB: { type: 'string', description: 'Modified content' },
            nameA: { type: 'string', description: 'Name for original file' },
            nameB: { type: 'string', description: 'Name for modified file' },
          },
          required: ['contentA', 'contentB'],
        },
      },
      {
        name: 'diff_apply',
        description: 'Apply a unified diff patch to content',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Original file content' },
            patch: { type: 'string', description: 'Unified diff patch to apply' },
          },
          required: ['content', 'patch'],
        },
      },
      {
        name: 'diff_merge',
        description: 'Perform a three-way merge between base, ours, and theirs',
        inputSchema: {
          type: 'object',
          properties: {
            base: { type: 'string', description: 'Common ancestor content' },
            ours: { type: 'string', description: 'Our modified content' },
            theirs: { type: 'string', description: 'Their modified content' },
          },
          required: ['base', 'ours', 'theirs'],
        },
      },
    ];
  }
  /**
   * Call tool.
   */
/**
   * Route a tool call to the appropriate handler.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   */
/**
   * Route a tool call to the appropriate handler.
   * @param name - Tool name
   * @param args - Tool arguments
   * @returns Tool result
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'diff_compare':
        return this.diff(
          args.contentA as string,
          args.contentB as string,
          args.nameA as string | undefined,
          args.nameB as string | undefined
        );
      case 'diff_apply':
        return this.apply(args.content as string, args.patch as string);
      case 'diff_merge':
        return this.threeWayMerge(
          args.base as string,
          args.ours as string,
          args.theirs as string
        );
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
/**
 * Create a new DiffMock server instance.
 * @param config - Optional configuration
 * @returns A new DiffMock instance
 */
/** Create a new DiffMock instance with optional config. */
/**
 * Create a new DiffMock server instance.
 * @param config - Optional configuration
 * @returns A new DiffMock instance
 */
/**
 * Create a new DiffMock server instance.
 * @param config - Optional configuration
 * @returns A new DiffMock instance
 */
export function createMockServer(config?: DiffMockConfig): DiffMock {
  return new DiffMock(config);
}