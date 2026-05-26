/** Built-in tools: AskUserTool, WebFetchTool, ListFilesTool, and factory functions. */

import { spawnSync } from 'node:child_process';
import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';
import {
  BashTool,
  ReadFileTool,
  EditFileTool,
  WriteFileTool,
  AppendFileTool,
  GrepTool,
} from './BuiltinToolDefs.js';

// Re-export tool classes from BuiltinToolDefs so existing consumers can still import from here
export {
  BashTool,
  ReadFileTool,
  EditFileTool,
  WriteFileTool,
  AppendFileTool,
  GrepTool,
} from './BuiltinToolDefs.js';
import { scopePath } from './BuiltinToolDefs.js';

const MAX_OUTPUT_BYTES = 100_000;

/** Fetches URL content as text with optional headers and 30s timeout. */
export class WebFetchTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'web_fetch';
  /**
   * description property.
   */
  readonly description = `Fetch the content of a URL and return it as text. Works for web pages, API endpoints, raw files, documentation, etc.

Usage: {"url": "https://api.example.com/status"}
With headers: {"url": "https://api.example.com/data", "headers": {"Authorization": "Bearer token123"}}

Returns the response body as text (HTML, JSON, plain text, etc). Response is capped at 100KB.
For HTML pages, returns raw HTML — useful for reading docs, READMEs, release notes.
For JSON APIs, returns the raw JSON string.
Timeout is 30 seconds.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    url: z.string().describe('The URL to fetch'),
    headers: z.record(z.string()).optional().describe('Optional HTTP headers to include (e.g. Authorization)'),
  });

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { url, headers: rawHeaders } = args as { url: string; headers?: Record<string, string> | string };
    if (!url) {
      return { success: false, error: { message: `Missing required "url". Correct usage: {"url": "https://example.com/page"}`, code: 'INVALID_ARGS' } };
    }

    let parsed: Record<string, string> = {};
    if (typeof rawHeaders === 'string') {
      try { parsed = JSON.parse(rawHeaders); } catch { parsed = {}; }
    } else if (rawHeaders) {
      parsed = rawHeaders;
    }
    if (!parsed['User-Agent'] && !parsed['user-agent']) {
      parsed['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      const response = await fetch(url, {
        headers: parsed,
        signal: controller.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);

      if (!response.ok) {
        return { success: false, error: { message: `HTTP ${response.status} ${response.statusText} from ${url}`, code: 'HTTP_ERROR' } };
      }

      const text = await response.text();
      if (text.length > MAX_OUTPUT_BYTES) {
        return { success: true, data: text.slice(0, MAX_OUTPUT_BYTES) + `\n\n... (truncated at 100KB, full response was ${Math.round(text.length / 1024)}KB)` };
      }
      return { success: true, data: text };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : undefined;
      if (errName === 'AbortError') {
        return { success: false, error: { message: `Request timed out after 30s: ${url}`, code: 'TIMEOUT' } };
      }
      return { success: false, error: { message: msg, code: 'FETCH_ERROR' } };
    }
  }
}

/** Lists files in a directory, optionally recursive with glob filtering. */
export class ListFilesTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'list_files';
  /**
   * workspace property.
   */
  workspace?: string;
  /**
   * channel property.
   */
  channel?: string;
  /**
   * description property.
   */
  readonly description = `List files and directories at a path. Use to explore project structure before reading specific files.

Usage: {"path": "src/"}
Recursive: {"path": "src/", "recursive": true}
Filtered: {"path": ".", "recursive": true, "pattern": "*.test.ts"}

Without recursive: shows immediate contents (like ls).
With recursive: shows all files up to 3 levels deep.
With pattern: filters results to matching filenames (glob syntax).
Defaults to current directory if path is omitted. Capped at 500 entries.`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    path: z.string().optional().describe('Directory to list (default: working directory)'),
    recursive: z.boolean().optional().describe('If true, list recursively up to 3 levels deep'),
    pattern: z.string().optional().describe('Glob pattern to filter filenames (e.g. "*.ts", "*.py")'),
  });

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { path: rawPath, recursive, pattern } = args as { path?: string; recursive?: boolean; pattern?: string };
    const cwd = this.workspace ? this.workspace.split(':')[0] : process.cwd();
    let dir: string;
    if (rawPath) {
      try {
        dir = this.workspace ? await scopePath(rawPath, this.workspace!, this.name, this.channel) : rawPath;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return { success: false, error: { message: msg, code: 'LIST_ERROR' } };
      }
    } else {
      dir = cwd;
    }
    try {
      const findArgs = [dir];
      if (recursive) {
        findArgs.push('-maxdepth', '3');
      } else {
        findArgs.push('-maxdepth', '1');
      }
      findArgs.push('-type', 'f');
      if (pattern) {
        findArgs.push('-name', pattern);
      }
      findArgs.push('-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*');

      const result = spawnSync('find', findArgs, { encoding: 'utf-8', timeout: 10000 });
      if (result.error) {
        return { success: false, error: { message: result.error.message, code: 'LIST_ERROR' } };
      }
      const output = (result.stdout || '').trim();
      const lines = output.split('\n').filter(Boolean);
      if (lines.length === 0) {
        return { success: true, data: `No files found in ${dir}${pattern ? ` matching "${pattern}"` : ''}` };
      }
      const truncated = lines.length > 500 ? lines.slice(0, 500).join('\n') + `\n\n... (${lines.length} total, showing first 500)` : lines.join('\n');
      return { success: true, data: `${lines.length} file${lines.length > 1 ? 's' : ''}:\n${truncated}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: { message: msg, code: 'LIST_ERROR' } };
    }
  }
}

/** Input widget types for the ask_user tool. */
export type AskInputType = 'radio' | 'multi-select' | 'picklist' | 'freeform' | 'confirm';

/** Handler that the host app implements to present questions to the user. */
export interface AskUserHandler {
  ask(question: string, options?: string[], sourceChannel?: string, inputType?: AskInputType): Promise<string>;
}

/** Prompts the user for input with various widget types (radio, confirm, freeform, etc.). */
export class AskUserTool implements ITool {
  /**
   * name property.
   */
  readonly name = 'ask_user';
  /**
   * description property.
   */
  readonly description = `Ask the user a question and wait for their response. Use when you need clarification, approval, or a decision before proceeding.

Usage (open question): {"question": "What directory should I scan?"}
Usage (choices): {"question": "Which approach?", "options": ["Option A", "Option B"], "input_type": "radio"}
Usage (yes/no): {"question": "Proceed with deletion?", "input_type": "confirm"}
Usage (multi): {"question": "Which files to include?", "options": ["a.ts", "b.ts", "c.ts"], "input_type": "multi-select"}

Input types:
- "freeform" — open text input (default if no options)
- "radio" — pick one from options (default if options provided)
- "multi-select" — pick multiple from options
- "confirm" — yes/no
- "picklist" — scrollable select for long lists`;
  /**
   * schema property.
   */
  readonly schema = z.object({
    question: z.string().describe('The question to ask the user'),
    options: z.array(z.string()).optional().describe('Choices to present (required for radio/multi-select/picklist)'),
    input_type: z.enum(['radio', 'multi-select', 'picklist', 'freeform', 'confirm']).optional()
      .describe('How to collect the answer. Defaults to "radio" if options, "freeform" otherwise.'),
  });

  private handler: AskUserHandler;
  private sourceChannel?: string;

  constructor(handler: AskUserHandler, sourceChannel?: string) {
    this.handler = handler;
    this.sourceChannel = sourceChannel;
  }

  /**
   * Execute.
   */
  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { question, options, input_type } = args as { question: string; options?: string[]; input_type?: AskInputType };
    if (!question) {
      return { success: false, error: { message: 'Missing required "question". Correct usage: {"question": "Your question here"}', code: 'INVALID_ARGS' } };
    }
    try {
      const response = await this.handler.ask(question, options, this.sourceChannel, input_type);
      return { success: true, data: response };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: { message: msg, code: 'ASK_FAILED' } };
    }
  }
}

/** Returns the standard set of filesystem/shell tools (bash, read, edit, write, append, grep, fetch, list). */
export function getDefaultTools(opts?: { onWriteComplete?: (reason: string, toolName: string, path: string) => Promise<void> }): ITool[] {
  const editTool = new EditFileTool();
  const writeTool = new WriteFileTool();
  const appendTool = new AppendFileTool();
  if (opts?.onWriteComplete) {
    editTool.onAfterWrite = opts.onWriteComplete;
    writeTool.onAfterWrite = opts.onWriteComplete;
    appendTool.onAfterWrite = opts.onWriteComplete;
  }
  return [
    new BashTool(),
    new ReadFileTool(),
    editTool,
    writeTool,
    appendTool,
    new GrepTool(),
    new WebFetchTool(),
    new ListFilesTool(),
  ];
}

/** Factory for an AskUserTool bound to a specific handler and optional source channel. */
export function createAskUserTool(handler: AskUserHandler, sourceChannel?: string): ITool {
  return new AskUserTool(handler, sourceChannel);
}
