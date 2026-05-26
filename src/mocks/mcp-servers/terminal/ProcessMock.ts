/** Information about a running process. */
export interface ProcessInfo {
  pid: number;
  command: string;
  args: string[];
  status: 'running' | 'stopped' | 'zombie';
  cpu: number;
  memory: number;
  startedAt: number;
  user: string;
  ppid: number;
}
/** Result of spawning a new process. */
/** Result of spawning a new process. */
export interface SpawnResult {
  pid: number;
  command: string;
  status: 'running';
}
/** Result of sending a signal to a process. */
/** Result of sending a signal to a process. */
export interface KillResult {
  pid: number;
  signal: string;
  success: boolean;
  error?: string;
}
/** Result of listing running processes. */
/** Result of listing running processes. */
export interface ProcessListResult {
  processes: ProcessInfo[];
  total: number;
}
/** Configuration for the ProcessMock server. */
/** Configuration for the ProcessMock server. */
export interface ProcessMockConfig {
  seed?: number;
  latencyMs?: number;
  user?: string;
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
const SYSTEM_PROCESSES: Omit<ProcessInfo, 'pid' | 'startedAt'>[] = [
  { command: '/sbin/init', args: [], status: 'running', cpu: 0.0, memory: 0.1, user: 'root', ppid: 0 },
  { command: '/usr/sbin/sshd', args: ['-D'], status: 'running', cpu: 0.0, memory: 0.2, user: 'root', ppid: 1 },
  { command: '/usr/sbin/cron', args: ['-f'], status: 'running', cpu: 0.0, memory: 0.1, user: 'root', ppid: 1 },
  { command: '/usr/sbin/rsyslogd', args: ['-n'], status: 'running', cpu: 0.0, memory: 0.3, user: 'syslog', ppid: 1 },
  { command: '/usr/bin/python3', args: ['/opt/monitor/agent.py'], status: 'running', cpu: 0.3, memory: 1.2, user: 'root', ppid: 1 },
  { command: '/usr/bin/dbus-daemon', args: ['--system'], status: 'running', cpu: 0.0, memory: 0.1, user: 'messagebus', ppid: 1 },
  { command: 'bash', args: [], status: 'running', cpu: 0.0, memory: 0.1, user: 'operator', ppid: 423 },
  { command: '/usr/sbin/apache2', args: ['-k', 'start'], status: 'running', cpu: 0.1, memory: 1.5, user: 'www-data', ppid: 1 },
  { command: '/usr/bin/redis-server', args: ['127.0.0.1:6379'], status: 'running', cpu: 0.2, memory: 0.8, user: 'redis', ppid: 1 },
];
/**
 * Mock server that simulates process management with spawn, kill, and list operations.
 * Provides tools: process_spawn, process_kill, process_list.
 */
/**
 * Mock server that simulates process management with spawn, kill, and list operations.
 * Provides tools: process_spawn, process_kill, process_list.
 */
export class ProcessMock {
  private config: Required<ProcessMockConfig>;
  private rng: SeededRandom;
  private processes: Map<number, ProcessInfo> = new Map();
  private nextPid: number;
  constructor(config?: ProcessMockConfig) {
    this.config = {
      seed: config?.seed ?? 42,
      latencyMs: config?.latencyMs ?? 0,
      user: config?.user ?? 'operator',
    };
    this.rng = new SeededRandom(this.config.seed);
    this.nextPid = 5000;
    let pid = 1;
    const baseTime = Date.now() - 3600000 * 24 * 42; // 42 days uptime
    for (const proc of SYSTEM_PROCESSES) {
      this.processes.set(pid, {
        ...proc,
        pid,
        startedAt: baseTime + this.rng.int(0, 60000),
      });
      pid = this.rng.int(pid + 10, pid + 500);
    }
  }
  /**
   * Spawn.
   */
/**
   * Spawn a new process.
   * @param cmd - Command to execute
   * @param args - Command arguments
   * @returns Spawn result with PID
   */
/**
   * Spawn a new process.
   * @param cmd - Command to execute
   * @param args - Command arguments
   * @returns Spawn result with PID
   */
  async spawn(cmd: string, args: string[] = []): Promise<SpawnResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const pid = this.nextPid++;
    const process: ProcessInfo = {
      pid,
      command: cmd,
      args,
      status: 'running',
      cpu: this.rng.next() * 5,
      memory: this.rng.next() * 3,
      startedAt: Date.now(),
      user: this.config.user,
      ppid: Array.from(this.processes.values()).find(
        (p) => p.command === 'bash' && p.user === this.config.user
      )?.pid ?? 1,
    };
    this.processes.set(pid, process);
    return {
      pid,
      command: `${cmd} ${args.join(' ')}`.trim(),
      status: 'running',
    };
  }
  /**
   * Kill.
   */
/**
   * Send a signal to a running process.
   * @param pid - Process ID
   * @param signal - Signal name/number (default: SIGTERM)
   * @returns Kill result
   */
/**
   * Send a signal to a running process.
   * @param pid - Process ID
   * @param signal - Signal name/number (default: SIGTERM)
   * @returns Kill result
   */
  async kill(pid: number, signal?: string): Promise<KillResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    const sig = signal ?? 'SIGTERM';
    const process = this.processes.get(pid);
    if (!process) {
      return {
        pid,
        signal: sig,
        success: false,
        error: `No such process: ${pid}`,
      };
    }
    // Can't kill system processes unless root
    if (process.user !== this.config.user && this.config.user !== 'root') {
      return {
        pid,
        signal: sig,
        success: false,
        error: `Operation not permitted`,
      };
    }
    if (sig === 'SIGKILL' || sig === '9') {
      this.processes.delete(pid);
    } else {
      // SIGTERM - process may or may not terminate
      if (this.rng.next() > 0.1) {
        this.processes.delete(pid);
      } else {
        return {
          pid,
          signal: sig,
          success: false,
          error: 'Process did not terminate',
        };
      }
    }
    return { pid, signal: sig, success: true };
  }
  /**
   * List.
   */
/**
   * List running processes with optional filters.
   * @param filter - Optional filters by user or command
   * @returns List of matching processes
   */
/**
   * List running processes with optional filters.
   * @param filter - Optional filters by user or command
   * @returns List of matching processes
   */
  async list(filter?: { user?: string; command?: string }): Promise<ProcessListResult> {
    if (this.config.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.latencyMs));
    }
    let processes = Array.from(this.processes.values());
    if (filter?.user) {
      processes = processes.filter((p) => p.user === filter.user);
    }
    if (filter?.command) {
      processes = processes.filter((p) =>
        p.command.includes(filter.command!) || p.args.some((a) => a.includes(filter.command!))
      );
    }
    return {
      processes,
      total: processes.length,
    };
  }
  /**
   * Gets the process.
   */
/**
   * Get a specific process by PID.
   * @param pid - Process ID
   * @returns Process info or undefined
   */
/**
   * Get a specific process by PID.
   * @param pid - Process ID
   * @returns Process info or undefined
   */
/**
   * Get a specific process by PID.
   * @param pid - Process ID
   * @returns Process info or undefined
   */
  getProcess(pid: number): ProcessInfo | undefined {
    return this.processes.get(pid);
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
        name: 'process_spawn',
        description: 'Spawn a new process',
        inputSchema: {
          type: 'object',
          properties: {
            cmd: { type: 'string', description: 'Command to execute' },
            args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
          },
          required: ['cmd'],
        },
      },
      {
        name: 'process_kill',
        description: 'Kill a running process by PID',
        inputSchema: {
          type: 'object',
          properties: {
            pid: { type: 'number', description: 'Process ID to kill' },
            signal: { type: 'string', description: 'Signal to send (default: SIGTERM)' },
          },
          required: ['pid'],
        },
      },
      {
        name: 'process_list',
        description: 'List running processes with optional filters',
        inputSchema: {
          type: 'object',
          properties: {
            filter: {
              type: 'object',
              properties: {
                user: { type: 'string' },
                command: { type: 'string' },
              },
            },
          },
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
      case 'process_spawn':
        return this.spawn(args.cmd as string, (args.args as string[]) ?? []);
      case 'process_kill':
        return this.kill(args.pid as number, args.signal as string | undefined);
      case 'process_list':
        return this.list(args.filter as { user?: string; command?: string } | undefined);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
/**
 * Create a new ProcessMock server instance.
 * @param config - Optional configuration
 * @returns A new ProcessMock instance
 */
/**
 * Create a new ProcessMock server instance.
 * @param config - Optional configuration
 * @returns A new ProcessMock instance
 */
export function createMockServer(config?: ProcessMockConfig): ProcessMock {
  return new ProcessMock(config);
}