/** Individual built-in tool class definitions for agents. */

import { spawnSync, spawn, exec } from 'node:child_process';
import { resolve, isAbsolute, relative, sep, dirname } from 'path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';
import { getPermissionStore, isRemembered } from '../app/PermissionStore.js';

const DEFAULT_BASH_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 100_000;

function expandTilde(p: string): string {
  if (p.startsWith('~/') || p === '~') return p.replace(/^~/, homedir());
  return p;
}

const ALWAYS_ALLOWED = new Set(['/dev/null', '/dev/zero', '/dev/random', '/dev/urandom', '/dev/stdin', '/dev/stdout', '/dev/stderr']);

/** Resolve + scope a path to allowed workspace directories. Prompts user for permission if outside. */
export async function scopePath(raw: string, workspace: string, toolName: string, channel?: string): Promise<string> {
  const workspaces = workspace.split(':');
  const rawExpanded = expandTilde(raw);
  // Skip bogus paths
  if (!rawExpanded || rawExpanded === '/' || rawExpanded === '//') {
    throw new Error(`PERMISSION_DENIED:${toolName}:${raw}:Invalid path "${raw}". Do NOT retry this tool call.`);
  }
  // Always allow /dev paths
  if (ALWAYS_ALLOWED.has(rawExpanded) || rawExpanded.startsWith('/dev/')) return rawExpanded;
  // If raw is a local relative path (no /, ~/, or ../ prefix) it can't escape the workspace — always allow
  if (!rawExpanded.startsWith('/') && !rawExpanded.startsWith('~') && !rawExpanded.startsWith('..')) {
    // Resolve against the primary workspace directory, not process.cwd()
    return resolve(workspaces[0], rawExpanded);
  }
  // If raw is relative (./ or ../), try resolving against each workspace first
  if (!isAbsolute(rawExpanded)) {
    for (const ws of workspaces) {
      const candidate = resolve(ws, rawExpanded);
      const rel = relative(ws, candidate);
      if (!rel.startsWith('..') && !isAbsolute(rel)) return candidate;
    }
  }
  // Fallback: resolve against CWD
  const resolved = resolve(rawExpanded);
  for (const ws of workspaces) {
    const rel = relative(ws, resolved);
    if (!rel.startsWith('..') && !isAbsolute(rel)) return resolved;
  }
  if (isRemembered(channel || workspaces[0], resolved)) return resolved;
  // Don't prompt for files that don't exist — auto-reject with a clear message
  if (!existsSync(resolved)) {
    throw new Error(`PERMISSION_DENIED:${toolName}:${raw}:Path "${raw}" does not exist. Do NOT retry this tool call.`);
  }
  const store = getPermissionStore();
  const allowed = await store.request(resolved, toolName, channel || workspaces[0], raw);
  if (!allowed) {
    throw new Error(`PERMISSION_DENIED:${toolName}:${raw}:User denied access to "${raw}". Do NOT retry this tool call — suggest the path was denied or ask the user for a different path.`);
  }
  return resolved;
}

/** Extract the primary working directory from a potentially multi-workspace string. */
function primaryWorkspace(workspace?: string): string | undefined {
  if (!workspace) return undefined;
  return workspace.split(':')[0];
}

/** Simple circuit breaker for BashTool to prevent runaway command loops. */
class BashCircuitBreaker {
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private readonly threshold = 5;
  private readonly cooldownMs = 60_000;

  /** Check if the circuit is open (too many recent failures). */
  get isOpen(): boolean {
    if (this.consecutiveFailures === 0) return false;
    const elapsed = Date.now() - this.lastFailureTime;
    if (elapsed >= this.cooldownMs) {
      this.consecutiveFailures = 0;
      return false;
    }
    return this.consecutiveFailures >= this.threshold;
  }

  /** Remaining cooldown seconds for error message. */
  get remainingCooldown(): number {
    if (!this.isOpen) return 0;
    return Math.ceil((this.cooldownMs - (Date.now() - this.lastFailureTime)) / 1000);
  }

  /** Report a successful execution — resets the counter. */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  /** Report a failure — increments counter only for execution-level errors. */
  recordFailure(code?: string): void {
    // Only count real execution failures, not permission denials or invalid args
    if (code === 'TIMEOUT' || code === 'EXECUTION_ERROR' || code === 'SPAWN_ERROR') {
      this.consecutiveFailures++;
      this.lastFailureTime = Date.now();
    }
  }
}

const bashCircuitBreaker = new BashCircuitBreaker();

/** Executes shell commands with timeout, output cap, and background mode. */
export class BashTool implements ITool {
  readonly name = 'bash';
  workspace?: string;
  channel?: string;
  readonly description = `Execute a shell command in the working directory and return stdout + stderr.

Usage: {"command": "git status"}
With timeout: {"command": "npm test", "timeout": 60000}
Background: {"command": "npm run build", "run_in_background": true}

Runs with a default 2-minute timeout. Override with "timeout" (milliseconds, max 600000).
Set "run_in_background" to true to start the process and return immediately — you'll get the pid back instead of output.
Output is capped at 100KB. Use for: git, grep, find, running tests, installing packages, build commands.
Avoid using bash for reading/writing files — use read_file, write_file, or edit_file instead.`;
  readonly schema = z.object({
    command: z.string().describe('Shell command to execute'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default 120000, max 600000)'),
    run_in_background: z.boolean().optional().describe('If true, start the process and return its pid immediately without waiting for output'),
  });

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    // Circuit breaker check
    if (bashCircuitBreaker.isOpen) {
      return { success: false, error: { message: `Circuit breaker open — too many consecutive bash failures. Try again in ${bashCircuitBreaker.remainingCooldown}s.`, code: 'CIRCUIT_OPEN' } };
    }

    const { command, timeout, run_in_background } = args as { command: string; timeout?: number; run_in_background?: boolean };
    if (!command || typeof command !== 'string') {
      return { success: false, error: { message: `Missing required "command" argument. Correct usage: {"command": "your shell command"}`, code: 'INVALID_ARGS' } };
    }

    const blocked = /^\s*(rm\s+-rf\s+\/|mkfs|dd\s+if=|:(){ :|fork)/i;
    if (blocked.test(command)) {
      return { success: false, error: { message: 'Command blocked: potentially destructive', code: 'BLOCKED' } };
    }

    // Restrict bash to workspace when sandbox is active
    if (this.workspace) {
      const workspaces = this.workspace.split(':');
      const absPaths = command.match(/(?:\/|~\/)[^\s"';|&]+/g) || [];
      for (const p of absPaths) {
        try {
          let resolved = resolve(expandTilde(p));
          // Skip bogus paths (//, empty) — not real file accesses
          if (!resolved || resolved === '//') continue;
          let allowed = ALWAYS_ALLOWED.has(resolved) || resolved.startsWith('/dev/');
          if (!allowed) {
            for (const ws of workspaces) {
              if (!relative(ws, resolved).startsWith('..')) { allowed = true; break; }
            }
          }
          if (!allowed && !isRemembered(this.channel || workspaces[0], resolved)) {
            // Don't prompt for files that don't exist
            if (!existsSync(resolved)) continue;
            const store = getPermissionStore();
            const result = await store.request(resolved, this.name, this.channel || workspaces[0], p);
            if (!result) {
              return { success: false, error: { message: `PERMISSION_DENIED:${this.name}:${p}:User denied access to "${p}". Do NOT retry this tool call.`, code: 'ACCESS_DENIED' } };
            }
          }
        } catch {}
      }
    }

    const timeoutMs = Math.min(timeout ?? DEFAULT_BASH_TIMEOUT_MS, 600_000);

    if (run_in_background) {
      try {
        const child = spawn('sh', ['-c', command], {
          cwd: primaryWorkspace(this.workspace) ?? process.cwd(),
          env: { ...process.env, TERM: 'dumb' },
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        bashCircuitBreaker.recordSuccess();
        return { success: true, data: `Started in background (pid: ${child.pid})` };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        bashCircuitBreaker.recordFailure('SPAWN_ERROR');
        return { success: false, error: { message: msg, code: 'SPAWN_ERROR' } };
      }
    }

    try {
      const output = await new Promise<string>((resolve, reject) => {
        exec(command, {
          encoding: 'utf-8',
          timeout: timeoutMs,
          maxBuffer: MAX_OUTPUT_BYTES,
          cwd: primaryWorkspace(this.workspace) ?? process.cwd(),
          env: { ...process.env, TERM: 'dumb' },
        }, (err, stdout, stderr) => {
          if (err) {
            if (err.killed) {
              bashCircuitBreaker.recordFailure('TIMEOUT');
              reject(Object.assign(new Error(`Command timed out after ${timeoutMs / 1000}s`), { code: 'TIMEOUT' }));
              return;
            }
            const combined = [stdout?.trim(), stderr?.trim()].filter(Boolean).join('\n') || err.message;
            bashCircuitBreaker.recordFailure('EXECUTION_ERROR');
            reject(Object.assign(new Error(combined), { code: 'EXECUTION_ERROR' }));
            return;
          }
          bashCircuitBreaker.recordSuccess();
          resolve(((stdout || '') + (stderr || '')).trim());
        });
      });
      return { success: true, data: output || '(no output)' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && 'code' in err ? (err as any).code : 'EXECUTION_ERROR';
      bashCircuitBreaker.recordFailure(code);
      return { success: false, error: { message: msg, code } };
    }
  }
}

/** Reads file contents with line numbers, supporting offset/limit for large files. */
export class ReadFileTool implements ITool {
  readonly name = 'read_file';
  workspace?: string;
  channel?: string;
  readonly description = `Read a file's contents with line numbers. Returns output in "line_number\\tcontent" format so you can reference exact lines for editing.

Usage: {"path": "src/index.ts"}
Partial read: {"path": "src/big.ts", "offset": 100, "limit": 50}

Returns the full file by default with line numbers starting at 1. For large files, the response tells you where it stopped — use "offset" to continue from that line.
- offset: line number to start from (1-based, default: 1 = beginning)
- limit: max lines to return (default: all, capped at 100KB output)

Always read a file before editing it.`;
  readonly schema = z.object({
    path: z.string().describe('File path to read (absolute or relative to working directory)'),
    offset: z.number().optional().describe('Line number to start from (1-based). Use to continue after truncation.'),
    limit: z.number().optional().describe('Max number of lines to return.'),
  });

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { path, offset, limit } = args as { path: string; offset?: number; limit?: number };
    if (!path) {
      return { success: false, error: { message: `Missing required "path" argument. Correct usage: {"path": "src/file.ts"}`, code: 'INVALID_ARGS' } };
    }
    try {
      const pathToRead = this.workspace ? await scopePath(path, this.workspace!, this.name, this.channel) : path;
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(pathToRead, 'utf-8');
      const allLines = content.split('\n');
      const startLine = offset ? offset - 1 : 0;
      const endLine = limit ? startLine + limit : allLines.length;
      const slice = allLines.slice(startLine, endLine);

      const numbered = slice.map((line, i) => `${startLine + i + 1}\t${line}`).join('\n');

      if (numbered.length > MAX_OUTPUT_BYTES) {
        const truncated = numbered.slice(0, MAX_OUTPUT_BYTES);
        const linesReturned = truncated.split('\n').length;
        const stoppedAt = startLine + linesReturned;
        return { success: true, data: truncated + `\n\n... truncated at line ${stoppedAt} of ${allLines.length}. Use offset: ${stoppedAt + 1} to continue reading.` };
      }
      return { success: true, data: numbered };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && 'code' in err ? (err as any).code : undefined;
      if (code === 'ENOENT') {
        return { success: false, error: { message: `File not found: ${path}`, code: 'NOT_FOUND' } };
      }
      return { success: false, error: { message: msg, code: 'READ_ERROR' } };
    }
  }
}

/** Performs exact string replacement in a file (surgical edit). */
export class EditFileTool implements ITool {
  readonly name = 'edit_file';
  workspace?: string;
  channel?: string;
  /** Optional callback fired after a successful write, used by drift auto-snapshot. */
  onAfterWrite?: (reason: string, toolName: string, path: string) => Promise<void>;
  readonly description = `Make a surgical text replacement in a file. Finds an exact string and replaces it with new content. Much better than rewriting an entire file when you only need to change a few lines.

Usage: {"path": "src/auth.ts", "old_string": "const timeout = 5000;", "new_string": "const timeout = 30000;", "reason": "updating-auth-timeout"}
Replace all: {"path": "src/utils.ts", "old_string": "oldName", "new_string": "newName", "replace_all": true, "reason": "renaming-utility-function"}

Rules:
- You MUST read the file first (read_file) before editing — you need to know the exact text to match.
- "old_string" must be an EXACT match of text currently in the file (whitespace matters).
- If old_string appears more than once, the edit FAILS unless you set replace_all: true or provide more surrounding context to make it unique.
- If old_string is not found at all, the edit FAILS.
- Use this for targeted changes. Use write_file only when you need to replace the entire file.
- "reason" is required — describes why this edit was made (used for drift snapshot tracking).`;
  readonly schema = z.object({
    path: z.string().describe('File path to edit (creates parent directories if needed)'),
    old_string: z.string().describe('Exact text to find in the file (must match exactly, including whitespace)'),
    new_string: z.string().describe('Text to replace it with (can be empty string to delete)'),
    replace_all: z.boolean().optional().describe('If true, replace ALL occurrences. Default: false (fails if not unique).'),
    reason: z.string().describe('Why this edit was made — used for drift snapshot labeling so you can roll back if needed'),
  });

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { path, old_string, new_string, replace_all, reason } = args as { path: string; old_string: string; new_string: string; replace_all?: boolean; reason?: string };
    if (!path) {
      return { success: false, error: { message: `Missing required "path". Correct usage: {"path": "file.ts", "old_string": "old text", "new_string": "new text"}`, code: 'INVALID_ARGS' } };
    }
    if (old_string === undefined || old_string === null) {
      return { success: false, error: { message: `Missing required "old_string". Provide the exact text you want to replace.`, code: 'INVALID_ARGS' } };
    }
    if (new_string === undefined || new_string === null) {
      return { success: false, error: { message: `Missing required "new_string". Provide the replacement text (use "" to delete).`, code: 'INVALID_ARGS' } };
    }
    if (!reason) {
      return { success: false, error: { message: `Missing required "reason". Briefly describe why this edit was made — it's used for snapshot tracking so you can roll back changes.`, code: 'INVALID_ARGS' } };
    }
    if (old_string === new_string) {
      return { success: false, error: { message: `old_string and new_string are identical. Nothing to change.`, code: 'NO_CHANGE' } };
    }

    try {
      const pathToEdit = this.workspace ? await scopePath(path, this.workspace!, this.name, this.channel) : path;
      const { readFile, writeFile } = await import('node:fs/promises');
      const content = await readFile(pathToEdit, 'utf-8');

      if (!content.includes(old_string)) {
        const lines = content.split('\n');
        const preview = old_string.split('\n')[0].slice(0, 60);
        return { success: false, error: { message: `old_string not found in ${path}. The text "${preview}..." does not exist in the file (${lines.length} lines). Read the file again to get the current content.`, code: 'NOT_FOUND' } };
      }

      if (!replace_all) {
        const firstIdx = content.indexOf(old_string);
        const secondIdx = content.indexOf(old_string, firstIdx + 1);
        if (secondIdx !== -1) {
          const occurrences = content.split(old_string).length - 1;
          return { success: false, error: { message: `old_string is not unique — found ${occurrences} occurrences in ${path}. Either provide more surrounding context to make it unique, or set replace_all: true.`, code: 'NOT_UNIQUE' } };
        }
      }

      const updated = replace_all
        ? content.split(old_string).join(new_string)
        : content.replace(old_string, new_string);

      await writeFile(pathToEdit, updated, 'utf-8');

      // Fire post-write callback (drift auto-snapshot)
      if (this.onAfterWrite) {
        await this.onAfterWrite(reason, this.name, pathToEdit).catch(() => {});
      }

      const replacements = replace_all ? content.split(old_string).length - 1 : 1;
      const oldLines = old_string.split('\n').slice(0, 10);
      const newLines = new_string.split('\n').slice(0, 10);
      const diffParts: string[] = [`Edited ${path}: ${replacements} replacement${replacements > 1 ? 's' : ''}`];
      for (const l of oldLines) diffParts.push(`- ${l}`);
      if (old_string.split('\n').length > 10) diffParts.push(`- ... (${old_string.split('\n').length - 10} more)`);
      for (const l of newLines) diffParts.push(`+ ${l}`);
      if (new_string.split('\n').length > 10) diffParts.push(`+ ... (${new_string.split('\n').length - 10} more)`);
      return { success: true, data: diffParts.join('\n') };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && 'code' in err ? (err as any).code : undefined;
      if (code === 'ENOENT') {
        return { success: false, error: { message: `File not found: ${path}. Cannot edit a file that doesn't exist.`, code: 'NOT_FOUND' } };
      }
      return { success: false, error: { message: msg, code: 'EDIT_ERROR' } };
    }
  }
}

/** Creates or fully overwrites a file, auto-creating parent directories. */
export class WriteFileTool implements ITool {
  readonly name = 'write_file';
  workspace?: string;
  channel?: string;
  /** Optional callback fired after a successful write, used by drift auto-snapshot. */
  onAfterWrite?: (reason: string, toolName: string, path: string) => Promise<void>;
  readonly description = `Create a new file or completely overwrite an existing one. Creates parent directories automatically.

Usage: {"path": "src/config.ts", "content": "export const config = {\\n  port: 3000,\\n};\\n", "reason": "adding-config-file"}

IMPORTANT:
- Both "path" and "content" are required.
- This OVERWRITES the entire file. For small targeted changes, use edit_file instead.
- If the file is large, write the first portion here then use append_file for the rest.
- "reason" is required — describes why this file was written (used for drift snapshot tracking).`;
  readonly schema = z.object({
    path: z.string().describe('File path to write (creates parent directories if needed)'),
    content: z.string().describe('The complete file content to write'),
    reason: z.string().describe('Why this file was written — used for drift snapshot labeling so you can roll back if needed'),
  });

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { path, content, reason } = args as { path: string; content: string; reason?: string };
    if (!path) {
      return { success: false, error: { message: `Missing required "path". Correct usage: {"path": "file.ts", "content": "file contents"}`, code: 'INVALID_ARGS' } };
    }
    if (content === undefined || content === null) {
      return { success: false, error: { message: `Missing required "content". Both "path" and "content" are required.`, code: 'INVALID_ARGS' } };
    }
    if (!reason) {
      return { success: false, error: { message: `Missing required "reason". Briefly describe why this file was written — it's used for snapshot tracking so you can roll back changes.`, code: 'INVALID_ARGS' } };
    }
    try {
      const pathToWrite = this.workspace ? await scopePath(path, this.workspace!, this.name, this.channel) : path;
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { dirname } = await import('node:path');
      await mkdir(dirname(pathToWrite), { recursive: true });
      await writeFile(pathToWrite, content, 'utf-8');

      // Fire post-write callback (drift auto-snapshot)
      if (this.onAfterWrite) {
        await this.onAfterWrite(reason, this.name, pathToWrite).catch(() => {});
      }

      const lines = content.split('\n').length;
      const bytes = Buffer.byteLength(content, 'utf-8');
      return { success: true, data: `Wrote ${bytes} bytes (${lines} lines) to ${path}.` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: { message: msg, code: 'WRITE_ERROR' } };
    }
  }
}

/** Appends content to the end of an existing file. */
export class AppendFileTool implements ITool {
  readonly name = 'append_file';
  workspace?: string;
  channel?: string;
  /** Optional callback fired after a successful write, used by drift auto-snapshot. */
  onAfterWrite?: (reason: string, toolName: string, path: string) => Promise<void>;
  readonly description = `Append content to the end of an existing file. Use for writing large files in chunks.

Usage: {"path": "src/data.ts", "content": "\\nexport const extra = 'more';\\n", "reason": "appending-extra-data"}

Workflow for large files:
1. write_file with the first portion (include reason)
2. append_file for each subsequent chunk (include reason)

The file must already exist — use write_file first to create it. Content is appended exactly as-is, include a leading newline if you need one.
"reason" is required — describes why this content was appended (used for drift snapshot tracking).`;
  readonly schema = z.object({
    path: z.string().describe('File path to append to (must already exist)'),
    content: z.string().describe('Content to append to end of file'),
    reason: z.string().describe('Why this content was appended — used for drift snapshot labeling so you can roll back if needed'),
  });

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { path, content, reason } = args as { path: string; content: string; reason?: string };
    if (!path) {
      return { success: false, error: { message: `Missing required "path". Correct usage: {"path": "file.txt", "content": "text to append"}`, code: 'INVALID_ARGS' } };
    }
    if (content === undefined || content === null) {
      return { success: false, error: { message: `Missing required "content". Both "path" and "content" are required.`, code: 'INVALID_ARGS' } };
    }
    if (!reason) {
      return { success: false, error: { message: `Missing required "reason". Briefly describe why this content was appended — it's used for snapshot tracking so you can roll back changes.`, code: 'INVALID_ARGS' } };
    }
    try {
      const pathToAppend = this.workspace ? await scopePath(path, this.workspace!, this.name, this.channel) : path;
      const { appendFile, access, writeFile, mkdir } = await import('node:fs/promises');
      const { join, dirname: pDirname } = await import('node:path');
      await access(pathToAppend);
      await appendFile(pathToAppend, content, 'utf-8');

      // Fire post-write callback (drift auto-snapshot)
      if (this.onAfterWrite) {
        await this.onAfterWrite(reason, this.name, pathToAppend).catch(() => {});
      }

      const bytes = Buffer.byteLength(content, 'utf-8');
      return { success: true, data: `Appended ${bytes} bytes to ${path}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = err instanceof Error && 'code' in err ? (err as any).code : undefined;
      if (code === 'ENOENT') {
        return { success: false, error: { message: `File not found: ${path}. Use write_file to create it first, then append_file for subsequent chunks.`, code: 'NOT_FOUND' } };
      }
      return { success: false, error: { message: msg, code: 'APPEND_ERROR' } };
    }
  }
}

/** Searches files for a pattern using grep, returning structured file:line:content results. */
export class GrepTool implements ITool {
  readonly name = 'grep';
  workspace?: string;
  channel?: string;
  readonly description = `Search for a pattern across files. Returns matching lines with file paths and line numbers in structured format.

Usage: {"pattern": "function handleAuth", "path": "src/"}
With file filter: {"pattern": "TODO", "path": ".", "include": "*.ts"}

Returns results as "filepath:line_number:content" — one match per line, up to 200 results.
- pattern: text or regex to search for (passed to grep -rn)
- path: directory or file to search in (default: current directory)
- include: glob pattern to filter files (e.g. "*.ts", "*.py")

Use this instead of bash grep when you want structured output you can act on (e.g. to feed file:line pairs into edit_file).`;
  readonly schema = z.object({
    pattern: z.string().describe('Text or regex pattern to search for'),
    path: z.string().optional().describe('Directory or file to search in (default: working directory)'),
    include: z.string().optional().describe('Glob to filter filenames (e.g. "*.ts", "*.py", "*.go")'),
  });

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { pattern, path, include } = args as { pattern: string; path?: string; include?: string };
    if (!pattern) {
      return { success: false, error: { message: `Missing required "pattern". Correct usage: {"pattern": "searchTerm", "path": "src/"}`, code: 'INVALID_ARGS' } };
    }

    const grepArgs = ['-rn', '--color=never', '--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist', '--exclude-dir=build'];
    if (include) {
      grepArgs.push(`--include=${include}`);
    }
    const grepPath = this.workspace ? await scopePath(path || '.', this.workspace!, this.name, this.channel) : (path || '.');
    grepArgs.push('--', pattern, grepPath);

    const result = spawnSync('grep', grepArgs, {
      encoding: 'utf-8',
      timeout: 30_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      cwd: primaryWorkspace(this.workspace) ?? process.cwd(),
    });

    if (result.error) {
      return { success: false, error: { message: result.error.message, code: 'GREP_ERROR' } };
    }

    const output = (result.stdout || '').trim();
    if (!output) {
      return { success: true, data: `No matches found for "${pattern}" in ${path || '.'}` };
    }

    const lines = output.split('\n');
    if (lines.length > 200) {
      return { success: true, data: lines.slice(0, 200).join('\n') + `\n\n... (${lines.length} total matches, showing first 200. Narrow your search with "include" or a more specific path.)` };
    }
    return { success: true, data: `${lines.length} match${lines.length > 1 ? 'es' : ''}:\n${output}` };
  }
}
