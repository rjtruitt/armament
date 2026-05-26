/** Simulates Git operations with tracked files, commits, and branches. */
export type {
  GitCommit, GitBranch, GitFileStatus, GitStatusResult,
  GitDiffResult, GitDiffFile, GitDiffHunk, GitLogOptions, GitMockConfig,
} from './git-types.js';
import type {
  GitCommit, GitBranch, GitFileStatus, GitStatusResult,
  GitDiffResult, GitDiffFile, GitDiffHunk, GitLogOptions, GitMockConfig,
} from './git-types.js';
import {
  COMMIT_MESSAGES, INITIAL_WORKING_CHANGES, OLD_CODE_LINES, NEW_CODE_LINES, getAuthors,
} from './git-repo-data.js';
class SeededRandom {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 0xffffffff;
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  hex(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += Math.floor(this.next() * 16).toString(16);
    }
    return result;
  }
}
/**
 * Mock server that simulates Git operations: status, diff, log, commit, branch, checkout, add, stash.
 */
/**
 * Mock server that simulates Git operations: status, diff, log, commit, branch, checkout, add, stash.
 */
export class GitMock {
  private config: Required<GitMockConfig>;
  private rng: SeededRandom;
  private commits: GitCommit[] = [];
  private branches: Map<string, string> = new Map();
  private currentBranch: string;
  private stagedFiles: Map<string, GitFileStatus> = new Map();
  private workingChanges: Map<string, GitFileStatus> = new Map();
  private trackedFiles: Set<string> = new Set();
  constructor(config?: GitMockConfig) {
    this.config = {
      seed: config?.seed ?? 42,
      latencyMs: config?.latencyMs ?? 0,
      repoName: config?.repoName ?? 'target-app',
      defaultBranch: config?.defaultBranch ?? 'main',
      userName: config?.userName ?? 'Operator',
      userEmail: config?.userEmail ?? 'operator@pentest.local',
    };
    this.rng = new SeededRandom(this.config.seed);
    this.currentBranch = this.config.defaultBranch;
    this.initializeRepo();
  }
  /**
   * Status.
   */
/**
   * Show the working tree status.
   * @returns Current branch and file statuses
   */
/**
   * Show the working tree status.
   * @returns Current branch and file statuses
   */
  async status(): Promise<GitStatusResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const files: GitFileStatus[] = [
      ...Array.from(this.stagedFiles.values()),
      ...Array.from(this.workingChanges.values()),
    ];
    return {
      branch: this.currentBranch,
      upstream: `origin/${this.currentBranch}`,
      ahead: this.rng.int(0, 3),
      behind: 0,
      files,
      clean: files.length === 0,
    };
  }
  /**
   * Diff.
   */
/**
   * Show changes between commits, commit and working tree, etc.
   * @param ref - Optional reference to diff against
   * @returns Diff result with per-file changes
   */
/**
   * Show changes between commits, commit and working tree, etc.
   * @param ref - Optional reference to diff against
   * @returns Diff result with per-file changes
   */
  async diff(ref?: string): Promise<GitDiffResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const changedFiles = ref
      ? this.generateRefDiff(ref)
      : this.generateWorkingDiff();
    let totalInsertions = 0;
    let totalDeletions = 0;
    for (const file of changedFiles) {
      totalInsertions += file.additions;
      totalDeletions += file.deletions;
    }
    return {
      files: changedFiles,
      stats: { insertions: totalInsertions, deletions: totalDeletions, files_changed: changedFiles.length },
    };
  }
  /**
   * Log.
   */
/**
   * Show commit logs with optional filtering.
   * @param opts - Optional filter options
   * @returns Array of matching commits
   */
/**
   * Show commit logs with optional filtering.
   * @param opts - Optional filter options
   * @returns Array of matching commits
   */
  async log(opts?: GitLogOptions): Promise<GitCommit[]> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    let results = [...this.commits];
    if (opts?.author) {
      results = results.filter((c) => c.author.toLowerCase().includes(opts.author!.toLowerCase()));
    }
    if (opts?.maxCount) {
      results = results.slice(0, opts.maxCount);
    }
    return results;
  }
  /**
   * Commit.
   */
/**
   * Create a new commit with the given message.
   * @param message - Commit message
   * @param files - Optional files to stage and commit
   * @returns The newly created commit
   */
/**
   * Create a new commit with the given message.
   * @param message - Commit message
   * @param files - Optional files to stage and commit
   * @returns The newly created commit
   */
  async commit(message: string, files?: string[]): Promise<GitCommit> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    if (files) {
      for (const file of files) {
        const change = this.workingChanges.get(file);
        if (change) {
          this.stagedFiles.set(file, { ...change, staged: true });
          this.workingChanges.delete(file);
        } else {
          this.stagedFiles.set(file, { file, status: 'added', staged: true });
        }
      }
    }
    if (this.stagedFiles.size === 0) {
      throw new Error('nothing to commit, working tree clean');
    }
    const hash = this.rng.hex(40);
    const newCommit: GitCommit = {
      hash,
      shortHash: hash.substring(0, 7),
      message,
      author: this.config.userName,
      email: this.config.userEmail,
      date: new Date().toISOString(),
      files: Array.from(this.stagedFiles.keys()),
    };
    this.commits.unshift(newCommit);
    this.branches.set(this.currentBranch, hash);
    for (const [file, status] of this.stagedFiles) {
      if (status.status === 'deleted') {
        this.trackedFiles.delete(file);
      } else {
        this.trackedFiles.add(file);
      }
    }
    this.stagedFiles.clear();
    return newCommit;
  }
  /**
   * Branch.
   */
/**
   * List or create branches.
   * @param name - If provided, creates a new branch
   * @returns Branch list or new branch info
   */
/**
   * List or create branches.
   * @param name - If provided, creates a new branch
   * @returns Branch list or new branch info
   */
  async branch(name?: string): Promise<GitBranch[] | GitBranch> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    if (name) {
      const currentHash = this.branches.get(this.currentBranch) ?? this.commits[0]?.hash ?? 'initial';
      this.branches.set(name, currentHash);
      return { name, current: false, commitHash: currentHash };
    }
    const result: GitBranch[] = [];
    for (const [branchName, hash] of this.branches) {
      result.push({
        name: branchName,
        current: branchName === this.currentBranch,
        commitHash: hash,
        upstream: `origin/${branchName}`,
        ahead: branchName === this.currentBranch ? this.rng.int(0, 3) : 0,
        behind: 0,
      });
    }
    return result;
  }
  /**
   * Checkout.
   */
/**
   * Switch to a different branch.
   * @param ref - Branch name to switch to
   * @returns Result indicating switch status
   */
/**
   * Switch to a different branch.
   * @param ref - Branch name to switch to
   * @returns Result indicating switch status
   */
  async checkout(ref: string): Promise<{ branch: string; switched: boolean }> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    if (this.stagedFiles.size > 0 || this.workingChanges.size > 0) {
      throw new Error('error: Your local changes to the following files would be overwritten by checkout');
    }
    if (this.branches.has(ref)) {
      this.currentBranch = ref;
      return { branch: ref, switched: true };
    }
    const currentHash = this.branches.get(this.currentBranch) ?? 'initial';
    this.branches.set(ref, currentHash);
    this.currentBranch = ref;
    return { branch: ref, switched: true };
  }
  /**
   * Add.
   */
/**
   * Add file contents to the staging area.
   * @param files - File paths or "."/"-A" for all
   */
/**
   * Add file contents to the staging area.
   * @param files - File paths or "."/"-A" for all
   */
  async add(files: string[]): Promise<void> {
    for (const file of files) {
      if (file === '.' || file === '-A') {
        for (const [path, change] of this.workingChanges) {
          this.stagedFiles.set(path, { ...change, staged: true });
        }
        this.workingChanges.clear();
        return;
      }
      const change = this.workingChanges.get(file);
      if (change) {
        this.stagedFiles.set(file, { ...change, staged: true });
        this.workingChanges.delete(file);
      } else if (!this.trackedFiles.has(file)) {
        this.stagedFiles.set(file, { file, status: 'added', staged: true });
      }
    }
  }
  /**
   * Stash.
   */
/**
   * Stash current working and staged changes.
   * @returns Confirmation message
   */
/**
   * Stash current working and staged changes.
   * @returns Confirmation message
   */
  async stash(): Promise<{ message: string }> {
    const count = this.stagedFiles.size + this.workingChanges.size;
    if (count === 0) {
      throw new Error('No local changes to save');
    }
    this.stagedFiles.clear();
    this.workingChanges.clear();
    return { message: `Saved working directory and index state WIP on ${this.currentBranch}` };
  }
  /**
   * Simulate change.
   */
/**
   * Simulate a file change in the working tree.
   * @param file - File path to mark as changed
   * @param status - Change status
   */
/**
   * Simulate a file change in the working tree.
   * @param file - File path to mark as changed
   * @param status - Change status
   */
/**
   * Simulate a file change in the working tree.
   * @param file - File path to mark as changed
   * @param status - Change status
   */
  simulateChange(file: string, status: GitFileStatus['status'] = 'modified'): void {
    this.workingChanges.set(file, { file, status, staged: false });
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
      { name: 'git_status', description: 'Show the working tree status', inputSchema: { type: 'object', properties: {} } },
      { name: 'git_diff', description: 'Show changes between commits, commit and working tree, etc.', inputSchema: { type: 'object', properties: { ref: { type: 'string', description: 'Reference to diff against (e.g., HEAD~1, branch name)' } } } },
      { name: 'git_log', description: 'Show commit logs', inputSchema: { type: 'object', properties: { maxCount: { type: 'number', description: 'Limit number of commits' }, author: { type: 'string', description: 'Filter by author' }, oneline: { type: 'boolean', description: 'Show one line per commit' } } } },
      { name: 'git_commit', description: 'Record changes to the repository', inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'Commit message' }, files: { type: 'array', items: { type: 'string' }, description: 'Files to stage and commit' } }, required: ['message'] } },
      { name: 'git_branch', description: 'List, create, or delete branches', inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'New branch name (omit to list branches)' } } } },
      { name: 'git_checkout', description: 'Switch branches or restore working tree files', inputSchema: { type: 'object', properties: { ref: { type: 'string', description: 'Branch name or commit ref to checkout' } }, required: ['ref'] } },
      { name: 'git_add', description: 'Add file contents to the staging area', inputSchema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' }, description: 'Files to stage' } }, required: ['files'] } },
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
      case 'git_status': return this.status();
      case 'git_diff': return this.diff(args.ref as string | undefined);
      case 'git_log': return this.log(args as GitLogOptions);
      case 'git_commit': return this.commit(args.message as string, args.files as string[] | undefined);
      case 'git_branch': return this.branch(args.name as string | undefined);
      case 'git_checkout': return this.checkout(args.ref as string);
      case 'git_add': return this.add(args.files as string[]);
      default: throw new Error(`Unknown tool: ${name}`);
    }
  }
  private initializeRepo(): void {
    const authors = getAuthors(this.config.userName, this.config.userEmail);
    const now = Date.now();
    for (let i = 0; i < COMMIT_MESSAGES.length; i++) {
      const { msg, files } = COMMIT_MESSAGES[i];
      const author = this.rng.pick(authors);
      const hash = this.rng.hex(40);
      const daysAgo = i * this.rng.int(1, 4);
      const date = new Date(now - daysAgo * 86400000).toISOString();
      this.commits.push({ hash, shortHash: hash.substring(0, 7), message: msg, author: author.name, email: author.email, date, files });
      for (const file of files) {
        this.trackedFiles.add(file);
      }
    }
    this.branches.set(this.config.defaultBranch, this.commits[0].hash);
    this.branches.set('develop', this.commits[2].hash);
    this.branches.set('feature/api-v2', this.commits[0].hash);
    this.branches.set('hotfix/auth-bypass', this.commits[1].hash);
    for (const change of INITIAL_WORKING_CHANGES) {
      this.workingChanges.set(change.file, { file: change.file, status: change.status, staged: false });
    }
  }
  private generateWorkingDiff(): GitDiffFile[] {
    const files: GitDiffFile[] = [];
    for (const [path, status] of this.workingChanges) {
      if (status.status === 'modified') files.push(this.generateDiffForFile(path));
    }
    for (const [path, status] of this.stagedFiles) {
      if (status.status === 'modified') files.push(this.generateDiffForFile(path));
    }
    return files;
  }
  private generateRefDiff(ref: string): GitDiffFile[] {
    const files: GitDiffFile[] = [];
    const commitCount = ref.includes('~') ? parseInt(ref.replace(/.*~/, '')) || 1 : 3;
    for (let i = 0; i < Math.min(commitCount, this.commits.length); i++) {
      for (const file of this.commits[i].files) {
        if (!files.find((f) => f.path === file)) {
          files.push(this.generateDiffForFile(file));
        }
      }
    }
    return files;
  }
  private generateDiffForFile(path: string): GitDiffFile {
    const additions = this.rng.int(2, 20);
    const deletions = this.rng.int(0, 15);
    const lines: string[] = [];
    for (let i = 0; i < deletions; i++) {
      lines.push(`-  ${this.generateCodeLine(path, 'old')}`);
    }
    for (let i = 0; i < additions; i++) {
      lines.push(`+  ${this.generateCodeLine(path, 'new')}`);
    }
    return {
      path,
      hunks: [{ header: `@@ -${this.rng.int(1, 50)},${deletions + 3} +${this.rng.int(1, 50)},${additions + 3} @@`, lines }],
      additions,
      deletions,
    };
  }
  private generateCodeLine(path: string, context: 'old' | 'new'): string {
    if (path.endsWith('.ts') || path.endsWith('.js')) {
      return this.rng.pick(context === 'old' ? OLD_CODE_LINES : NEW_CODE_LINES);
    }
    if (path.endsWith('.json')) {
      return `"version": "${context === 'old' ? '1.0.0' : '1.1.0'}"`;
    }
    return `${context === 'old' ? 'old' : 'new'} content for ${path}`;
  }
}
/**
 * Create a new GitMock server instance.
 * @param config - Optional configuration
 * @returns A new GitMock instance
 */
/**
 * Create a new GitMock server instance.
 * @param config - Optional configuration
 * @returns A new GitMock instance
 */
export function createMockServer(config?: GitMockConfig): GitMock {
  return new GitMock(config);
}