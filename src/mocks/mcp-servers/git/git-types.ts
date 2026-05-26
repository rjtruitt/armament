/** Represents a single Git commit. */
export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  files: string[];
}
/** Represents a Git branch with tracking info. */
/** Represents a Git branch with tracking info. */
export interface GitBranch {
  name: string;
  current: boolean;
  commitHash: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
}
//** Status of a single file in the working tree. */
//** Status of a single file in the working tree. */
//** Status of a single file in the working tree. */
export interface GitFileStatus {
  file: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
  oldPath?: string;
}
/** Result of a git status operation. */
/** Result of a git status operation. */
export interface GitStatusResult {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  clean: boolean;
}
/** Result of a git diff operation. */
/** Result of a git diff operation. */
export interface GitDiffResult {
  files: GitDiffFile[];
  stats: { insertions: number; deletions: number; files_changed: number };
}
/** Diff information for a single file. */
/** Diff information for a single file. */
export interface GitDiffFile {
  path: string;
  hunks: GitDiffHunk[];
  additions: number;
  deletions: number;
}
/** A single hunk in a Git diff. */
/** A single hunk in a Git diff. */
export interface GitDiffHunk {
  header: string;
  lines: string[];
}
/** Options for filtering Git log results. */
/** Options for filtering Git log results. */
export interface GitLogOptions {
  maxCount?: number;
  since?: string;
  author?: string;
  oneline?: boolean;
}
/** Configuration for the GitMock server. */
/** Configuration for the GitMock server. */
export interface GitMockConfig {
  seed?: number;
  latencyMs?: number;
  repoName?: string;
  defaultBranch?: string;
  userName?: string;
  userEmail?: string;
}