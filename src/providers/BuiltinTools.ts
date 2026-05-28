/** Built-in tools: AskUserTool, WebFetchTool, ListFilesTool, and factory functions. */

import { spawnSync, execSync, exec } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { ITool, ToolResult, ToolContext } from 'iteratio';
import { z } from 'zod';
import * as cheerio from 'cheerio';
import { LRUCache } from 'lru-cache';
import { UserConfig } from '../config/UserConfig.js';
import type { IProviderPool } from '../core/interfaces/IProviderPool.js';
import { ReadWorkerStateTool } from './ReadWorkerStateTool.js';
import {
  BashTool,
  ReadFileTool,
  EditFileTool,
  WriteFileTool,
  AppendFileTool,
  GrepTool,
  RipgrepTool,
} from './BuiltinToolDefs.js';

// Re-export tool classes from BuiltinToolDefs so existing consumers can still import from here
export {
  BashTool,
  ReadFileTool,
  EditFileTool,
  WriteFileTool,
  AppendFileTool,
  GrepTool,
  RipgrepTool,
} from './BuiltinToolDefs.js';
import { scopePath } from './BuiltinToolDefs.js';

const MAX_OUTPUT_BYTES = 100_000;

/** Pool of real browser User-Agent strings for rotation. */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
];

const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8';
const cookieJar = new Map<string, string>();

/** LRU cache for web_fetch content — 1000 entries, 15min TTL. */
const FETCH_CACHE = new LRUCache<string, string>({
  max: 1000,
  ttl: 15 * 60 * 1000,
});

/** Lazy Turndown service for HTML→Markdown conversion. */
let turndownService: any = null;
async function getTurndown(): Promise<any> {
  if (!turndownService) {
    const mod = await import('turndown');
    const Turndown = (mod as any).default || mod;
    turndownService = new Turndown();
  }
  return turndownService;
}

/** Get configured User-Agent from settings, or null for random. */
function getConfiguredUA(): string | null {
  try {
    const cfg = UserConfig.instance();
    const ua = cfg.getPath('web.userAgent') as string | undefined;
    return ua || null;
  } catch {
    return null;
  }
}

/** Convert HTML to Markdown using Turndown. */
async function htmlToMarkdown(html: string): Promise<string> {
  try {
    const td = await getTurndown();
    return td.turndown(html);
  } catch {
    // Fallback: strip tags via cheerio
    const $ = cheerio.load(html);
    return $('body').text().replace(/\s+/g, ' ').trim();
  }
}

/** Strip HTML to clean text via cheerio — removes scripts, styles, nav, footer, etc. Compact and fast. */
function htmlToText(html: string): string {
  try {
    const $ = cheerio.load(html);
    // Remove junk elements
    $('script, style, nav, footer, header, aside, svg, noscript, iframe, form, [role="navigation"]').remove();
    $('[aria-hidden="true"]').remove();
    // Remove JSON-LD and other hidden script data
    $('script[type="application/ld+json"]').remove();
    const text = $('body').text();
    return text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  } catch {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }
}

/** Detected curl-impersonate binaries in PATH (lazy-scanned on first use). */
let impersonateBins: string[] | null = null;
function getImpersonateBins(): string[] {
  if (impersonateBins === null) {
    try {
      const out = execSync(
        `ls /usr/local/bin/curl_chrome* ~/.local/bin/curl_chrome* 2>/dev/null; which curl_chrome116 2>/dev/null || true`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      impersonateBins = out.trim().split('\n').filter(Boolean);
    } catch {
      impersonateBins = [];
    }
  }
  return impersonateBins;
}

/** Random UA string. */
function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/** Build curl command with configured UA or rotating pool (no impersonation). */
function curlCmd(url: string, extraHeaders?: Record<string, string>, timeout = 15): string {
  const ua = getConfiguredUA() || randomUA();
  let cmd = `curl -s -L --compressed -m ${timeout}`;
  cmd += ` -A "${ua}"`;
  cmd += ` -H "Accept: ${BROWSER_ACCEPT}"`;
  cmd += ` -H "Accept-Language: en-US,en;q=0.9"`;
  cmd += ` -H "DNT: 1" -H "Upgrade-Insecure-Requests: 1"`;
  cmd += ` -H "Sec-Fetch-Dest: document" -H "Sec-Fetch-Mode: navigate"`;
  cmd += ` -H "Sec-Fetch-Site: none" -H "Sec-Fetch-User: ?1"`;
  try {
    const cookies = cookieJar.get(new URL(url).hostname);
    if (cookies) cmd += ` -b "${cookies}"`;
  } catch {}
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) cmd += ` -H "${k}: ${v.replace(/"/g, '\\"')}"`;
  cmd += ` "${url}"`;
  return cmd;
}

/** Build curl command — tries curl-impersonate if in PATH, falls back to plain curlCmd. */
function curlCmdImpersonate(url: string, extraHeaders?: Record<string, string>, timeout = 15): string {
  const bins = getImpersonateBins();
  if (bins.length > 0) {
    const bin = bins[Math.floor(Math.random() * bins.length)];
    let cmd = `${bin} -s -L --compressed -m ${timeout}`;
    // impersonate binary handles its own TLS fingerprint, no browser headers needed
    try {
      const cookies = cookieJar.get(new URL(url).hostname);
      if (cookies) cmd += ` -b "${cookies}"`;
    } catch {}
    if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) cmd += ` -H "${k}: ${v.replace(/"/g, '\\"')}"`;
    cmd += ` "${url}"`;
    return cmd;
  }
  return curlCmd(url, extraHeaders, timeout);
}

/** Run curl and return stdout. */
function runCurl(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', timeout: 30_000, maxBuffer: 500_000 }).trim();
}

/** Async curl — doesn't block event loop. */
function runCurlAsync(cmd: string, timeout = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf-8', maxBuffer: 500_000, timeout }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

/** Check if DDG returned a bot challenge page. */
function isBotChallenge($: cheerio.CheerioAPI): boolean {
  return $('title').text().includes('Please Confirm') || $.html().includes('challenge-form') || $.html().includes('anomaly-modal');
}

/** Parse DDG search result HTML using cheerio. */
function parseDdgResults(html: string, maxResults: number): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  try {
    const $ = cheerio.load(html);
    $('.result.results_links_deep.web-result').slice(0, maxResults).each((_, el) => {
      const $el = $(el);
      const title = $el.find('.result__a').first().text().trim();
      const urlRaw = $el.find('.result__a').first().attr('href') || '';
      const uddgMatch = urlRaw.match(/uddg=([^&]+)/);
      const url = uddgMatch ? decodeURIComponent(uddgMatch[1]) : '';
      const snippet = $el.find('.result__snippet').first().text().trim();
      if (title && url) results.push({ title, url, snippet });
    });
  } catch {
    // cheerio parse error
  }
  return results;
}

/** Parse Google search result HTML using cheerio. */
function parseGoogleResults(html: string, maxResults: number): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  try {
    const $ = cheerio.load(html);
    // Google results are in <div class="g"> blocks
    $('.g').slice(0, maxResults).each((_, el) => {
      const $el = $(el);
      const title = $el.find('h3').first().text().trim();
      const urlRaw = $el.find('a').first().attr('href') || '';
      // Google uses /url?q=ACTUAL_URL&...
      const qMatch = urlRaw.match(/[?&]q=([^&]+)/);
      const url = qMatch ? decodeURIComponent(qMatch[1]) : '';
      const snippet = $el.find('.VwiC3b, .lEBKkf, [data-sncf], .st').first().text().trim();
      if (title && url && !url.includes('google.com')) results.push({ title, url, snippet });
    });
  } catch {}
  return results;
}

/** Fetches URL content via curl with rotating browser identifiers. Uses curl-impersonate if in PATH. */
export class WebFetchTool implements ITool {
  readonly name = 'web_fetch';
  readonly description = `Fetch the content of a URL and return it as text. Uses curl-impersonate to avoid bot-blocking. Works for web pages, API endpoints, raw files, documentation, etc.

Usage: {"url": "https://api.example.com/status"}
With headers: {"url": "https://api.example.com/data", "headers": {"Authorization": "Bearer token123"}}

Returns the response body as text (HTML, JSON, plain text, etc). Response is capped at 100KB.
For HTML pages, returns raw HTML — useful for reading docs, READMEs, release notes.
For JSON APIs, returns the raw JSON string.
Timeout is 30 seconds.`;

  readonly schema = z.object({
    url: z.string().describe('The URL to fetch'),
    headers: z.record(z.string()).optional().describe('Optional HTTP headers to include (e.g. Authorization)'),
  });

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

    // Check cache if no custom headers
    const cacheKey = Object.keys(parsed).length > 0 ? '' : url;
    if (cacheKey) {
      const cached = FETCH_CACHE.get(cacheKey);
      if (cached) return { success: true, data: cached };
    }

    try {
      const cmd = curlCmdImpersonate(url, parsed, 30);
      let stdout: string;
      try { stdout = runCurl(cmd); } catch (e: unknown) {
        return { success: false, error: { message: e instanceof Error ? e.message : String(e), code: 'CURL_ERROR' } };
      }
      if (!stdout) return { success: false, error: { message: 'Empty response', code: 'EMPTY' } };

      // Convert HTML to Markdown via Turndown for cleaner output
      const lower = stdout.toLowerCase();
      if (lower.includes('<!doctype html') || lower.includes('<html') || stdout.includes('text/html')) {
        try { stdout = await htmlToMarkdown(stdout); } catch {}
      }

      if (stdout.length > MAX_OUTPUT_BYTES) {
        return { success: true, data: stdout.slice(0, MAX_OUTPUT_BYTES) + `\n\n... (truncated at 100KB, full response was ${Math.round(stdout.length / 1024)}KB)` };
      }

      // Cache the result
      if (cacheKey) FETCH_CACHE.set(cacheKey, stdout);

      return { success: true, data: stdout };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
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
export function getDefaultTools(opts?: { onWriteComplete?: (reason: string, toolName: string, path: string) => Promise<void>; providerPool?: IProviderPool }): ITool[] {
  const editTool = new EditFileTool();
  const writeTool = new WriteFileTool();
  const appendTool = new AppendFileTool();
  if (opts?.onWriteComplete) {
    editTool.onAfterWrite = opts.onWriteComplete;
    writeTool.onAfterWrite = opts.onWriteComplete;
    appendTool.onAfterWrite = opts.onWriteComplete;
  }
  const deepResearchTool = new DeepResearchTool();
  if (opts?.providerPool) deepResearchTool.providerPool = opts.providerPool;
  return [
    new BashTool(),
    new ReadFileTool(),
    editTool,
    writeTool,
    appendTool,
    new GrepTool(),
    new WebFetchTool(),
    new WebSearchTool(),
    deepResearchTool,
    new ListFilesTool(),
    new ReadWorkerStateTool(),
  ];
}

/** Factory for an AskUserTool bound to a specific handler and optional source channel. */
export function createAskUserTool(handler: AskUserHandler, sourceChannel?: string): ITool {
  return new AskUserTool(handler, sourceChannel);
}

/** Search DuckDuckGo via curl with rotating identifiers. */
async function searchDuckDuckGo(query: string, maxResults = 10): Promise<{ html: string; results: Array<{ title: string; url: string; snippet: string }> } | null> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await runCurlAsync(curlCmd(url, undefined, 15), 20_000);
      if (out) {
        // Quick check: does it look like a valid results page?
        const $ = cheerio.load(out);
        if (!isBotChallenge($)) {
          const results = parseDdgResults(out, maxResults);
          // If results empty but page has result elements, parser may need update
          if (results.length === 0 && $('.result__a').length > 0) {
            // Fallback: extract from raw links
            const links = $('.result__a');
            links.slice(0, maxResults).each((_, el) => {
              const $el = $(el);
              const title = $el.text().trim();
              const href = $el.attr('href') || '';
              const uddgMatch = href.match(/uddg=([^&]+)/);
              const url = uddgMatch ? decodeURIComponent(uddgMatch[1]) : href;
              if (title && url) results.push({ title, url, snippet: '' });
            });
          }
          return { html: out, results };
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}

/** Search Google via curl with rotating identifiers. */
async function searchGoogle(query: string, maxResults = 10): Promise<{ html: string; results: Array<{ title: string; url: string; snippet: string }> } | null> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await runCurlAsync(curlCmd(url, undefined, 10), 15_000);
      if (out) {
        const results = parseGoogleResults(out, maxResults);
        if (results.length > 0) return { html: out, results };
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}

/** Format search results into display text with optional inline content fetching. */
async function formatResults(query: string, results: Array<{ title: string; url: string; snippet: string }>, fetchContent = false): Promise<ToolResult> {
  const lines: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title}`, `   ${r.url}`, `   ${r.snippet || '(no snippet)'}`);
    if (fetchContent && r.url.startsWith('http')) {
      try {
        const content = await runCurlAsync(curlCmdImpersonate(r.url, undefined, 10), 15_000);
        const $ = cheerio.load(content);
        const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 2000);
        lines.push(`   -- content: ${text}${text.length >= 2000 ? '...' : ''}`);
      } catch { lines.push(`   -- content: (failed)`); }
    }
    lines.push('');
  }
  return { success: true, data: `Search results for "${query}":\n\n${lines.join('\n').trim()}\n\n━━━ Use web_fetch to pull any page (curl-impersonate) — don't curl URLs directly.` };
}

/** Format search error with suggestion to try other engines. */
function searchError(engine: string, detail?: string): ToolResult {
  const msg = detail
    ? `Search engine "${engine}" returned no results. ${detail} Try engine:"google" or engine:"brave".`
    : `Search engine "${engine}" is blocking searches. Try engine:"google", engine:"brave", or engine:"duckduckgo".`;
  return { success: false, error: { message: msg, code: 'SEARCH_FAILED' } };
}

/** Search the web. Tries specified engine, falls back to others if blocked. */
export class WebSearchTool implements ITool {
  readonly name = 'web_search';
  readonly description = `Search the web for information. Tries multiple engines with automatic fallback.

Usage: {"query": "latest AI research"}
       {"query": "python errors", "max_results": 5, "fetch_content": false}
       {"query": "linux commands", "engine": "google"}
       {"query": "AI news", "engine": "brave"}

Available engines: duckduckgo (default), google, brave.
Rotates User-Agent and browser headers.
If an engine blocks the search, auto-falls back to the next engine.
For page content, use web_fetch instead of bash/curl — it uses curl-impersonate.
Brave search requires an API key (set in Settings config pane or BRAVE_API_KEY env var).
For thorough research, use deep_research instead — it auto-fetches full content from all results.`;

  readonly schema = z.object({
    query: z.string().describe('The search query'),
    max_results: z.number().optional().describe('Max results (default: 10, max: 20)'),
    fetch_content: z.boolean().optional().describe('Fetch result page content inline (default: true)'),
    engine: z.enum(['auto', 'duckduckgo', 'google', 'brave']).optional()
      .describe('Engine (default: auto = tries duckduckgo, then google, then brave)'),
  });

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { query, max_results = 10, fetch_content = true, engine: rawEngine } = args as any;
    if (!query) return { success: false, error: { message: 'Missing "query". Usage: {"query": "search terms"}', code: 'INVALID_ARGS' } };

    const maxRes = Math.min(max_results || 10, 20);
    const engine = rawEngine || 'auto';

    // Brave direct
    if (engine === 'brave') {
      const key = (() => {
        try {
          const cfgKey: string | undefined = UserConfig.instance().getPath('web.braveApiKey');
          return cfgKey || process.env.BRAVE_API_KEY || '';
        } catch { return process.env.BRAVE_API_KEY || ''; }
      })();
      if (!key) return { success: false, error: { message: 'Brave requires an API key. Set it in Settings → Brave API Key (config pane) or set BRAVE_API_KEY env var.', code: 'NO_KEY' } };
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 15000);
        const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxRes}`, {
          headers: { 'Accept': 'application/json', 'X-Subscription-Token': key },
          signal: c.signal,
        });
        clearTimeout(t);
        if (!r.ok) return { success: false, error: { message: `Brave HTTP ${r.status}`, code: 'BRAVE_ERR' } };
        const d: any = await r.json();
        const items = (d.web?.results ?? []).slice(0, maxRes).map((x: any, i: number) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.description || ''}`).join('\n');
        return { success: true, data: `Results for "${query}":\n\n${items}` };
      } catch (e: unknown) {
        return { success: false, error: { message: e instanceof Error ? e.message : String(e), code: 'BRAVE_ERR' } };
      }
    }

    // Try specified engine or auto-fallback
    const engines: string[] = engine === 'auto'
      ? ['duckduckgo', 'google']
      : [engine];

    for (const eng of engines) {
      if (eng === 'duckduckgo') {
        const result = await searchDuckDuckGo(query, maxRes);
        if (result && result.results.length > 0) return formatResults(query, result.results, fetch_content);
        if (result && result.results.length === 0) return { success: true, data: `No results for "${query}".` };
        // DDG returned null (blocked/error) — try next
        continue;
      }

      if (eng === 'google') {
        const result = await searchGoogle(query, maxRes);
        if (result && result.results.length > 0) return formatResults(query, result.results, fetch_content);
        if (result && result.results.length === 0) return { success: true, data: `No results for "${query}".` };
        // Google returned null (blocked/error) — try next
        continue;
      }
    }

    return searchError(engine, engine === 'auto' ? 'Both DuckDuckGo and Google are blocking searches.' : undefined);
  }
}

/** File-based search result cache for deep_research pagination (stored in .armaws/research-cache/). */
function researchCacheDir(): string {
  const dir = join(process.cwd(), '.armaws', 'research-cache');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function researchCacheKey(query: string): string {
  return createHash('md5').update(query.toLowerCase().trim()).digest('hex').slice(0, 12);
}

function researchCachePath(query: string): string {
  return join(researchCacheDir(), `${researchCacheKey(query)}.json`);
}

/** Clear all research cache files (called on new search). */
function clearResearchCache(): void {
  try {
    const dir = researchCacheDir();
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try { unlinkSync(join(dir, f)); } catch {}
    }
  } catch {}
}

interface ResearchCacheEntry {
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  fetchedCount: number;
  timestamp: number;
}

function loadResearchCache(query: string): ResearchCacheEntry | null {
  const path = researchCachePath(query);
  try {
    if (existsSync(path)) {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      // Check expiry (30 min)
      if (Date.now() - data.timestamp < 30 * 60 * 1000) return data;
    }
  } catch {}
  return null;
}

function saveResearchCache(entry: ResearchCacheEntry): void {
  try {
    entry.timestamp = Date.now();
    writeFileSync(researchCachePath(entry.query), JSON.stringify(entry), 'utf-8');
  } catch {}
}

/** Deep research tool: searches the web and auto-fetches full content from all results. */
export class DeepResearchTool implements ITool {
  readonly name = 'deep_research';
  workspace?: string;
  channel?: string;
  /** Set by getDefaultTools() or manually if LLM summarization is desired. */
  providerPool?: IProviderPool;
  /** Returns true if summarization is configured and usable. */
  private get _canSummarize(): boolean {
    return !!UserConfig.instance().settings.web.summarizationModel && !!this.providerPool;
  }

  get description(): string {
    const base = `Do deep research on a topic: searches the web, fetches full content from all result pages, and returns a consolidated summary with source citations.\n\nUse this when you need thorough information on a topic. The tool automatically fetches and reads every result page.\n\nUsage: {\"query\": \"impact of AI on software engineering 2025\"}\n       {\"query\": \"python async patterns\", \"max_sources\": 15}`;
    if (this._canSummarize) {
      return base + `\n       {\"query\": \"rust async\", \"summarize\": true}\n\n- query: the research topic or question\n- max_sources: max results to search and fetch (default: 10, max: 50)\n- summarize: if true, each page is LLM-summarized before returning (using web.summarizationModel)`;
    }
    return base + `\n\n- query: the research topic or question\n- max_sources: max results to search and fetch (default: 10, max: 50)`;
  }

  get schema(): z.ZodObject<any> {
    const base: Record<string, any> = {
      query: z.string().describe('The research topic or question'),
      max_sources: z.number().optional().describe('Max sources to fetch in this batch (default: 10, max: 50)'),
      offset: z.number().optional().describe('Skip this many results (for pagination — use the "remaining" count from the previous response)'),
    };
    if (this._canSummarize) {
      base.summarize = z.boolean().optional().describe('If true, summarize each page via LLM (using web.summarizationModel)');
    }
    return z.object(base);
  }

  /** Summarize a chunk of text using the configured summarization model. */
  private async _summarize(text: string, title: string, url: string): Promise<string> {
    const modelName = UserConfig.instance().settings.web.summarizationModel;
    if (!modelName || !this.providerPool) return text;
    try {
      // Find which provider serves this model
      const config = UserConfig.instance();
      let providerType = '';
      for (const p of config.settings.providers) {
        const models = (p.models || []).map((m: any) => typeof m === 'string' ? m : m.name);
        if (models.includes(modelName)) { providerType = p.type; break; }
      }
      if (!providerType) return text;

      const adapter = await this.providerPool.getOrCreate(providerType, modelName);
      const result = await adapter.invoke([
        { role: 'system', content: `Summarize this web page content concisely (2-4 sentences capturing the key points). Title: ${title}\nURL: ${url}` },
        { role: 'user', content: text.slice(0, 30_000) },
      ]);
      const summary = result?.content?.trim();
      return summary && summary.length < text.length ? summary : text;
    } catch {
      return text;
    }
  }

  async execute(args: unknown, _context: ToolContext): Promise<ToolResult> {
    const { query, max_sources = 10, offset = 0, summarize = false } = args as { query: string; max_sources?: number; offset?: number; summarize?: boolean };
    const shouldSummarize = summarize && this._canSummarize;
    if (!query) return { success: false, error: { message: 'Missing "query".', code: 'INVALID_ARGS' } };

    const maxSrc = Math.min(max_sources, 50);

    let stored = offset > 0 ? loadResearchCache(query) : null;
    if (!stored) {
      // New search: clear old caches and do the search
      clearResearchCache();
      const maxRes = Math.min(maxSrc + (offset || 0) + 10, 50);
      let results: Array<{ title: string; url: string; snippet: string }> = [];
      const ddgResult = await searchDuckDuckGo(query, maxRes);
      if (ddgResult && ddgResult.results.length > 0) {
        results = ddgResult.results;
      } else {
        const googleResult = await searchGoogle(query, maxRes);
        if (googleResult && googleResult.results.length > 0) {
          results = googleResult.results;
        }
      }
      if (results.length === 0) return { success: false, error: { message: 'No search results found.', code: 'NO_RESULTS' } };
      stored = { query, results, fetchedCount: 0, timestamp: Date.now() };
      saveResearchCache(stored);
    }

    const totalResults = stored.results.length;
    if (offset >= totalResults) {
      return { success: true, data: `No more results for "${query}". All ${totalResults} results have been fetched.` };
    }

    const batch = stored.results.slice(offset, offset + maxSrc);
    const remaining = Math.max(0, totalResults - (offset + batch.length));

    // Fetch full content from this batch
    const sources: Array<{ title: string; url: string; content: string; error?: string }> = [];
    const fetchPromises = batch.map(async (r) => {
      try {
        const html = await runCurlAsync(curlCmdImpersonate(r.url, undefined, 15), 20_000);
        if (!html) return { title: r.title, url: r.url, content: '', error: 'Empty response' };
        const text = htmlToText(html);
        const trimmed = text.slice(0, 15_000);
        if (shouldSummarize) {
          const summary = await this._summarize(trimmed, r.title, r.url);
          return { title: r.title, url: r.url, content: summary, error: summary !== trimmed ? '(summarized)' : undefined };
        }
        return { title: r.title, url: r.url, content: trimmed, error: trimmed.length >= 15000 ? '(truncated)' : undefined };
      } catch (e: unknown) {
        return { title: r.title, url: r.url, content: 'Fetch error', error: e instanceof Error ? e.message : String(e) };
      }
    });

    const fetched = await Promise.all(fetchPromises);
    for (const f of fetched) sources.push(f);
    stored.fetchedCount += sources.filter(s => s.content && s.content !== 'Fetch error').length;
    saveResearchCache(stored);

    // Build output
    const output: string[] = [];
    output.push(`# Deep Research: "${query}"`);
    output.push('');
    output.push(`Results ${offset + 1}–${offset + sources.length} of ${totalResults} total.`);
    output.push(`Loaded ${sources.filter(s => s.content).length}/${sources.length} sources in this batch.`);
    output.push('');

    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      output.push(`## Source ${offset + i + 1}: ${s.title}`);
      output.push(`   URL: ${s.url}`);
      if (s.error) output.push(`   Status: ${s.error}`);
      if (s.content && s.content !== 'Fetch error') {
        const clean = s.content.slice(0, 15_000).trim();
        output.push('');
        output.push(clean);
        if (s.error === '(summarized)') output.push('   (summarized via ' + UserConfig.instance().settings.web.summarizationModel + ')');
        else if (s.content.length > 15000) output.push('   ... (truncated)');
      }
      output.push('');
      output.push('---');
      output.push('');
    }

    if (remaining > 0) {
      output.push(`━━━ ${remaining} more result${remaining > 1 ? 's' : ''} remaining. Use {\"query\":\"${query}\",\"offset\":${offset + sources.length}} to fetch the next batch.`);
    } else {
      output.push(`━━━ Research complete. All ${totalResults} results fetched.`);
    }

    let data = output.join('\n');
    if (data.length > MAX_OUTPUT_BYTES) {
      data = data.slice(0, MAX_OUTPUT_BYTES) + `\n\n... (truncated at 100KB, ${sources.filter(s => s.content).length}/${sources.length} sources shown in this batch)`;
    }

    return { success: true, data };
  }
}

