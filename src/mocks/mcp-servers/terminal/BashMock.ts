/** Simulates shell command execution with deterministic output for known commands. */
import { registerBuiltinCommands, type CommandHandler } from './bash-commands.js';
export type { CommandHandler } from './bash-commands.js';
/** Options for executing a bash command. */
/** Options for executing a bash command. */
export interface BashExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}
/** Result of executing a bash command. */
/** Result of executing a bash command. */
export interface BashExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
  duration_ms: number;
}
/** Configuration for the BashMock server. */
/** Configuration for the BashMock server. */
export interface BashMockConfig {
  seed?: number;
  latencyMs?: number;
  hostname?: string;
  user?: string;
  homeDir?: string;
}
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
}
/**
 * Mock server that simulates shell command execution with deterministic output for known commands.
 * Provides tool: bash_execute.
 */
/**
 * Mock server that simulates shell command execution with deterministic output for known commands.
 * Provides tool: bash_execute.
 */
export class BashMock {
  private config: Required<BashMockConfig>;
  private rng: SeededRandom;
  private handlers: Map<string, CommandHandler> = new Map();
  private cwd: string;
  constructor(config?: BashMockConfig) {
    this.config = {
      seed: config?.seed ?? 42,
      latencyMs: config?.latencyMs ?? 0,
      hostname: config?.hostname ?? 'pentest-box',
      user: config?.user ?? 'operator',
      homeDir: config?.homeDir ?? '/home/operator',
    };
    this.rng = new SeededRandom(this.config.seed);
    this.cwd = this.config.homeDir;
    this.registerBuiltins();
  }
  /**
   * Execute.
   */
/**
   * Execute a shell command and return stdout, stderr, and exit code.
   * Supports built-in commands: ls, cat, grep, find, ps, whoami, hostname, id, pwd, uname, which, env, curl, ping, netstat, ifconfig, echo, date, uptime, df, free, wc, head, tail, mkdir, touch, rm, cp, mv, chmod, chown.
   * @param command - Shell command to execute
   * @param opts - Execution options (cwd, timeout, env)
   * @returns Command result with stdout, stderr, exitCode
   */
/**
   * Execute a shell command and return stdout, stderr, and exit code.
   * Supports built-in commands: ls, cat, grep, find, ps, whoami, hostname, id, pwd, uname, which, env, curl, ping, netstat, ifconfig, echo, date, uptime, df, free, wc, head, tail, mkdir, touch, rm, cp, mv, chmod, chown.
   * @param command - Shell command to execute
   * @param opts - Execution options (cwd, timeout, env)
   * @returns Command result with stdout, stderr, exitCode
   */
  async execute(command: string, opts?: BashExecOptions): Promise<BashExecResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const effectiveCwd = opts?.cwd ?? this.cwd;
    const effectiveOpts: BashExecOptions = { ...opts, cwd: effectiveCwd };
    const parts = this.parseCommand(command);
    if (parts.length === 0) {
      return this.result(command, '', '', 0);
    }
    const cmd = parts[0];
    const args = parts.slice(1);
    const handler = this.handlers.get(cmd);
    if (handler) {
      return handler(args, effectiveOpts);
    }
    return this.result(command, '', `bash: ${cmd}: command not found`, 127);
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
        name: 'bash_execute',
        description: 'Execute a shell command and return stdout/stderr/exitCode',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command to execute' },
            opts: {
              type: 'object',
              properties: {
                cwd: { type: 'string', description: 'Working directory' },
                timeout: { type: 'number', description: 'Timeout in ms' },
                env: { type: 'object', additionalProperties: { type: 'string' }, description: 'Environment variables' },
              },
            },
          },
          required: ['command'],
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
    if (name === 'bash_execute') {
      return this.execute(args.command as string, args.opts as BashExecOptions | undefined);
    }
    throw new Error(`Unknown tool: ${name}`);
  }
  /**
   * Register a custom command handler for testing.
   */
/**
   * Register a custom command handler for testing.
   * @param name - Command name
   * @param handler - Handler function
   */
/**
   * Register a custom command handler for testing.
   * @param name - Command name
   * @param handler - Handler function
   */
/**
   * Register a custom command handler for testing.
   * @param name - Command name
   * @param handler - Handler function
   */
  registerCommand(name: string, handler: CommandHandler): void {
    this.handlers.set(name, handler);
  }
  private registerBuiltins(): void {
    registerBuiltinCommands(this.handlers, {
      hostname: this.config.hostname,
      user: this.config.user,
      homeDir: this.config.homeDir,
      cwd: this.cwd,
      result: (cmd, stdout, stderr, exitCode) => this.result(cmd, stdout, stderr, exitCode),
      rngInt: (min, max) => this.rng.int(min, max),
      rngNext: () => this.rng.next(),
      rngPick: <T>(arr: T[]) => this.rng.pick(arr),
      generateLsOutput: (dir, showHidden, longFormat) => this.generateLsOutput(dir, showHidden, longFormat),
      generateFileContent: (file) => this.generateFileContent(file),
      generateGrepOutput: (pattern, target, recursive, lineNum) => this.generateGrepOutput(pattern, target, recursive, lineNum),
      generateFindOutput: (path, pattern, type) => this.generateFindOutput(path, pattern, type),
      generatePsOutput: (aux) => this.generatePsOutput(aux),
      generateCurlOutput: (url, args) => this.generateCurlOutput(url, args),
    });
  }
  private generateLsOutput(dir: string, showHidden: boolean, longFormat: boolean): string {
    const files = [
      { name: '.bashrc', size: 3771, perm: '-rw-r--r--', hidden: true },
      { name: '.ssh', size: 4096, perm: 'drwx------', hidden: true },
      { name: '.config', size: 4096, perm: 'drwxr-xr-x', hidden: true },
      { name: 'projects', size: 4096, perm: 'drwxr-xr-x', hidden: false },
      { name: 'tools', size: 4096, perm: 'drwxr-xr-x', hidden: false },
      { name: 'scripts', size: 4096, perm: 'drwxr-xr-x', hidden: false },
      { name: 'wordlists', size: 4096, perm: 'drwxr-xr-x', hidden: false },
      { name: 'notes.md', size: 2048, perm: '-rw-r--r--', hidden: false },
      { name: 'scan_results.json', size: 15234, perm: '-rw-r--r--', hidden: false },
      { name: 'targets.txt', size: 456, perm: '-rw-r--r--', hidden: false },
      { name: 'exploit.py', size: 3421, perm: '-rwxr-xr-x', hidden: false },
      { name: 'report.pdf', size: 234567, perm: '-rw-r--r--', hidden: false },
    ];
    const visible = showHidden ? files : files.filter((f) => !f.hidden);
    if (longFormat) {
      const lines = [`total ${visible.length * 4}`];
      for (const f of visible) {
        lines.push(`${f.perm} 1 ${this.config.user} ${this.config.user} ${String(f.size).padStart(8)} May 18 14:00 ${f.name}`);
      }
      return lines.join('\n');
    }
    return visible.map((f) => f.name).join('  ');
  }
  private generateFileContent(file: string): string | null {
    const knownFiles: Record<string, string> = {
      'targets.txt': '10.10.10.40\n10.10.10.41\n10.10.10.42\n192.168.1.0/24\nweb.example.com\napi.example.com',
      '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nbin:x:2:2:bin:/bin:/usr/sbin/nologin\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\noperator:x:1000:1000:operator:/home/operator:/bin/bash',
      '/etc/hosts': '127.0.0.1\tlocalhost\n10.10.10.40\ttarget.htb\n10.10.10.41\tdb.target.htb\n10.10.14.5\tattacker.htb',
      'notes.md': '# Pentest Notes\n\n## Target: 10.10.10.40\n- Port 80 open (Apache 2.4.57)\n- Port 22 open (OpenSSH 8.9)\n- Port 3306 open (MySQL 8.0)\n- Found /admin with default creds\n- SQLi in /api/users?id=\n\n## TODO\n- [ ] Escalate privileges\n- [ ] Dump database\n- [ ] Check lateral movement',
      'scan_results.json': '{"target":"10.10.10.40","ports":[{"port":22,"service":"ssh"},{"port":80,"service":"http"},{"port":3306,"service":"mysql"}],"vulns":["CVE-2023-44487","exposed-env-file"]}',
      '.bashrc': '# ~/.bashrc\nexport PATH="$HOME/.local/bin:$PATH"\nexport HISTSIZE=10000\nalias ll="ls -la"\nalias nse="nmap --script"\nalias serve="python3 -m http.server 8000"',
    };
    if (knownFiles[file]) return knownFiles[file];
    const basename = file.split('/').pop() ?? file;
    if (knownFiles[basename]) return knownFiles[basename];
    return null;
  }
  private generateGrepOutput(pattern: string, target: string, recursive: boolean, lineNum: boolean): string {
    const results: string[] = [];
    const files = recursive
      ? ['src/index.ts', 'src/config.ts', 'src/auth.ts', 'lib/utils.ts', 'package.json']
      : [target];
    for (const file of files) {
      const count = this.rng.int(0, 3);
      for (let i = 0; i < count; i++) {
        const line = this.rng.int(1, 200);
        const prefix = recursive ? `${file}:` : '';
        const linePrefix = lineNum ? `${line}:` : '';
        results.push(`${prefix}${linePrefix}  ${this.generateMatchLine(pattern)}`);
      }
    }
    return results.join('\n');
  }
  private generateMatchLine(pattern: string): string {
    const templates = [
      `const ${pattern} = require('./${pattern}');`,
      `import { ${pattern} } from './${pattern}';`,
      `// TODO: fix ${pattern} handling`,
      `if (${pattern} !== undefined) {`,
      `  console.log('${pattern}:', result);`,
      `  return ${pattern}.process(data);`,
    ];
    return this.rng.pick(templates);
  }
  private generateFindOutput(path: string, pattern?: string, type?: string): string {
    const entries = [
      `${path}/src/index.ts`,
      `${path}/src/config.ts`,
      `${path}/src/utils/helpers.ts`,
      `${path}/src/services/auth.ts`,
      `${path}/src/services/api.ts`,
      `${path}/package.json`,
      `${path}/tsconfig.json`,
      `${path}/node_modules`,
      `${path}/dist`,
      `${path}/.env`,
      `${path}/.git`,
    ];
    let results = entries;
    if (type === 'f') results = entries.filter((e) => e.includes('.'));
    if (type === 'd') results = entries.filter((e) => !e.includes('.') || e.endsWith('node_modules') || e.endsWith('dist') || e.endsWith('.git'));
    if (pattern) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      results = results.filter((e) => regex.test(e.split('/').pop() ?? ''));
    }
    return results.join('\n');
  }
  private generatePsOutput(aux: boolean): string {
    if (aux) {
      const lines = [
        'USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
        'root         1  0.0  0.1  22568  5236 ?        Ss   May16   0:03 /sbin/init',
        'root       423  0.0  0.2  72300  8456 ?        Ss   May16   0:01 /usr/sbin/sshd -D',
        'www-data   891  0.1  1.2 345624 48234 ?        S    May16   2:34 /usr/sbin/apache2 -k start',
        'mysql     1024  0.5  5.3 1234568 215432 ?      Ssl  May16  15:23 /usr/sbin/mysqld',
        'redis     1089  0.1  0.3  56432 12345 ?        Ssl  May16   3:45 /usr/bin/redis-server 127.0.0.1:6379',
        `${this.config.user}  2345  0.0  0.1  23456  4567 pts/0    Ss   14:00   0:00 -bash`,
        `${this.config.user}  2456  0.0  0.0  18892  3456 pts/0    R+   14:23   0:00 ps aux`,
        'root      3012  0.0  0.1  45678  5678 ?        S    May16   0:12 /usr/bin/python3 /opt/monitor/check.py',
      ];
      return lines.join('\n');
    }
    const lines = [
      '  PID TTY          TIME CMD',
      ` 2345 pts/0    00:00:00 bash`,
      ` 2456 pts/0    00:00:00 ps`,
    ];
    return lines.join('\n');
  }
  private generateCurlOutput(url: string, args: string[]): string {
    const headOnly = args.includes('-I') || args.includes('--head');
    const verbose = args.includes('-v') || args.includes('--verbose');
    if (headOnly || verbose) {
      return [
        'HTTP/2 200',
        'server: nginx/1.24.0',
        'date: Mon, 18 May 2026 14:23:45 GMT',
        'content-type: text/html; charset=utf-8',
        'content-length: 12345',
        'x-powered-by: Express',
        'x-request-id: abc123-def456',
        '',
      ].join('\r\n');
    }
    if (url.includes('api') || url.includes('json')) {
      return '{"status":"ok","version":"2.1.0","timestamp":"2026-05-18T14:23:45Z"}';
    }
    return '<html><head><title>Example</title></head><body><h1>Hello World</h1></body></html>';
  }
  private parseCommand(cmd: string): string[] {
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';
    for (const ch of cmd) {
      if (inQuote) {
        if (ch === quoteChar) {
          inQuote = false;
        } else {
          current += ch;
        }
      } else if (ch === '"' || ch === "'") {
        inQuote = true;
        quoteChar = ch;
      } else if (ch === ' ' || ch === '\t') {
        if (current) {
          parts.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
    if (current) parts.push(current);
    return parts;
  }
  private result(command: string, stdout: string, stderr: string, exitCode: number): BashExecResult {
    return {
      stdout,
      stderr,
      exitCode,
      command,
      duration_ms: this.rng.int(1, 500),
    };
  }
}
/**
 * Create a new BashMock server instance.
 * @param config - Optional configuration
 * @returns A new BashMock instance
 */
/**
 * Create a new BashMock server instance.
 * @param config - Optional configuration
 * @returns A new BashMock instance
 */
export function createMockServer(config?: BashMockConfig): BashMock {
  return new BashMock(config);
}