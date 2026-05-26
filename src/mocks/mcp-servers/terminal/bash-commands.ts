/** Builtin command handlers for the BashMock. */
import type { BashExecOptions, BashExecResult } from './BashMock.js';
/** Type definition for CommandHandler. */
/** Function signature for handling a bash command. */
export type CommandHandler = (args: string[], opts: BashExecOptions) => BashExecResult;
interface BashContext {
  hostname: string;
  user: string;
  homeDir: string;
  cwd: string;
  result: (command: string, stdout: string, stderr: string, exitCode: number) => BashExecResult;
  rngInt: (min: number, max: number) => number;
  rngNext: () => number;
  rngPick: <T>(arr: T[]) => T;
  generateLsOutput: (dir: string, showHidden: boolean, longFormat: boolean) => string;
  generateFileContent: (file: string) => string | null;
  generateGrepOutput: (pattern: string, target: string, recursive: boolean, lineNum: boolean) => string;
  generateFindOutput: (path: string, pattern?: string, type?: string) => string;
  generatePsOutput: (aux: boolean) => string;
  generateCurlOutput: (url: string, args: string[]) => string;
}
/** Register builtin commands.
 */
/**
 * Register all built-in command handlers into the provided map.
 * Commands: ls, cat, grep, find, ps, whoami, hostname, id, pwd, uname, which, env, curl, ping, netstat, ifconfig, echo, date, uptime, df, free, wc, head, tail, mkdir, touch, rm, cp, mv, chmod, chown.
 * @param handlers - Map to populate with command handlers
 * @param ctx - Bash context with utility functions
 */
/**
 * Register all built-in command handlers into the provided map.
 * Commands: ls, cat, grep, find, ps, whoami, hostname, id, pwd, uname, which, env, curl, ping, netstat, ifconfig, echo, date, uptime, df, free, wc, head, tail, mkdir, touch, rm, cp, mv, chmod, chown.
 * @param handlers - Map to populate with command handlers
 * @param ctx - Bash context with utility functions
 */
export function registerBuiltinCommands(
  handlers: Map<string, CommandHandler>,
  ctx: BashContext,
): void {
  handlers.set('ls', (args, opts) => {
    const showHidden = args.includes('-a') || args.includes('-la') || args.includes('-al');
    const longFormat = args.includes('-l') || args.includes('-la') || args.includes('-al');
    const dir = args.find((a) => !a.startsWith('-')) ?? opts.cwd ?? ctx.cwd;
    const entries = ctx.generateLsOutput(dir, showHidden, longFormat);
    return ctx.result(`ls ${args.join(' ')}`, entries, '', 0);
  });
  handlers.set('cat', (args) => {
    const file = args[0];
    if (!file) return ctx.result('cat', '', 'cat: missing operand', 1);
    const content = ctx.generateFileContent(file);
    if (content === null) return ctx.result(`cat ${file}`, '', `cat: ${file}: No such file or directory`, 1);
    return ctx.result(`cat ${file}`, content, '', 0);
  });
  handlers.set('grep', (args) => {
    const recursive = args.includes('-r') || args.includes('-R');
    const lineNum = args.includes('-n');
    const nonFlagArgs = args.filter((a) => !a.startsWith('-'));
    const pattern = nonFlagArgs[0] ?? '';
    const target = nonFlagArgs[1] ?? '.';
    if (!pattern) return ctx.result('grep', '', 'grep: missing pattern', 2);
    const output = ctx.generateGrepOutput(pattern, target, recursive, lineNum);
    return ctx.result(`grep ${args.join(' ')}`, output, '', output ? 0 : 1);
  });
  handlers.set('find', (args) => {
    const path = args[0] ?? '.';
    const nameIdx = args.indexOf('-name');
    const typeIdx = args.indexOf('-type');
    const pattern = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
    const type = typeIdx >= 0 ? args[typeIdx + 1] : undefined;
    const output = ctx.generateFindOutput(path, pattern, type);
    return ctx.result(`find ${args.join(' ')}`, output, '', 0);
  });
  handlers.set('ps', (args) => {
    const aux = args.includes('aux') || args.includes('-ef');
    const output = ctx.generatePsOutput(aux);
    return ctx.result(`ps ${args.join(' ')}`, output, '', 0);
  });
  handlers.set('whoami', () => ctx.result('whoami', ctx.user, '', 0));
  handlers.set('hostname', () => ctx.result('hostname', ctx.hostname, '', 0));
  handlers.set('id', () => {
    const uid = ctx.user === 'root' ? 0 : 1000;
    const gid = ctx.user === 'root' ? 0 : 1000;
    return ctx.result('id', `uid=${uid}(${ctx.user}) gid=${gid}(${ctx.user}) groups=${gid}(${ctx.user}),27(sudo)`, '', 0);
  });
  handlers.set('pwd', (_args, opts) => ctx.result('pwd', opts.cwd ?? ctx.cwd, '', 0));
  handlers.set('uname', (args) => {
    if (args.includes('-a')) {
      return ctx.result('uname -a', `Linux ${ctx.hostname} 6.1.0-18-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.76-1 (2024-02-01) x86_64 GNU/Linux`, '', 0);
    }
    return ctx.result('uname', 'Linux', '', 0);
  });
  handlers.set('which', (args) => {
    const cmd = args[0];
    if (!cmd) return ctx.result('which', '', '', 1);
    const knownCmds: Record<string, string> = {
      python3: '/usr/bin/python3',
      python: '/usr/bin/python3',
      node: '/usr/bin/node',
      nmap: '/usr/bin/nmap',
      git: '/usr/bin/git',
      curl: '/usr/bin/curl',
      wget: '/usr/bin/wget',
      ssh: '/usr/bin/ssh',
      docker: '/usr/bin/docker',
      kubectl: '/usr/local/bin/kubectl',
    };
    const path = knownCmds[cmd];
    if (path) return ctx.result(`which ${cmd}`, path, '', 0);
    return ctx.result(`which ${cmd}`, '', `${cmd} not found`, 1);
  });
  handlers.set('env', () => {
    const envVars = [
      `HOME=${ctx.homeDir}`,
      `USER=${ctx.user}`,
      `HOSTNAME=${ctx.hostname}`,
      'SHELL=/bin/bash',
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'LANG=en_US.UTF-8',
      'TERM=xterm-256color',
      'PWD=' + ctx.cwd,
      'EDITOR=vim',
    ];
    return ctx.result('env', envVars.join('\n'), '', 0);
  });
  handlers.set('curl', (args) => {
    const url = args.find((a) => a.startsWith('http'));
    if (!url) return ctx.result('curl', '', 'curl: no URL specified', 2);
    const output = ctx.generateCurlOutput(url, args);
    return ctx.result(`curl ${args.join(' ')}`, output, '', 0);
  });
  handlers.set('ping', (args) => {
    const host = args.find((a) => !a.startsWith('-')) ?? 'localhost';
    const count = 4;
    const lines: string[] = [`PING ${host} (93.184.216.34) 56(84) bytes of data.`];
    for (let i = 0; i < count; i++) {
      const ms = (ctx.rngNext() * 50 + 10).toFixed(1);
      lines.push(`64 bytes from ${host} (93.184.216.34): icmp_seq=${i + 1} ttl=56 time=${ms} ms`);
    }
    lines.push('', `--- ${host} ping statistics ---`);
    lines.push(`${count} packets transmitted, ${count} received, 0% packet loss, time ${count * 1000}ms`);
    return ctx.result(`ping ${args.join(' ')}`, lines.join('\n'), '', 0);
  });
  handlers.set('netstat', (args) => {
    const lines = [
      'Active Internet connections (servers and established)',
      'Proto Recv-Q Send-Q Local Address           Foreign Address         State',
      'tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN',
      'tcp        0      0 0.0.0.0:80              0.0.0.0:*               LISTEN',
      'tcp        0      0 0.0.0.0:443             0.0.0.0:*               LISTEN',
      'tcp        0      0 127.0.0.1:3306          0.0.0.0:*               LISTEN',
      'tcp        0      0 127.0.0.1:6379          0.0.0.0:*               LISTEN',
      'tcp        0    256 10.10.14.5:43218        10.10.10.40:445         ESTABLISHED',
      'tcp        0      0 10.10.14.5:4444         10.10.10.40:54832       ESTABLISHED',
      'udp        0      0 0.0.0.0:68              0.0.0.0:*',
    ];
    return ctx.result(`netstat ${args.join(' ')}`, lines.join('\n'), '', 0);
  });
  handlers.set('ifconfig', () => {
    const output = [
      'eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500',
      '        inet 10.10.14.5  netmask 255.255.254.0  broadcast 10.10.15.255',
      '        inet6 fe80::a00:27ff:fe18:4c7a  prefixlen 64  scopeid 0x20<link>',
      '        ether 08:00:27:18:4c:7a  txqueuelen 1000  (Ethernet)',
      '        RX packets 156432  bytes 189345621 (189.3 MB)',
      '        TX packets 98234  bytes 12345678 (12.3 MB)',
      '',
      'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536',
      '        inet 127.0.0.1  netmask 255.0.0.0',
      '        inet6 ::1  prefixlen 128  scopeid 0x10<host>',
      '        loop  txqueuelen 1000  (Local Loopback)',
    ];
    return ctx.result('ifconfig', output.join('\n'), '', 0);
  });
  handlers.set('echo', (args) => ctx.result(`echo ${args.join(' ')}`, args.join(' '), '', 0));
  handlers.set('date', () => ctx.result('date', 'Mon May 18 14:23:45 UTC 2026', '', 0));
  handlers.set('uptime', () => ctx.result('uptime', ' 14:23:45 up 42 days,  3:17,  2 users,  load average: 0.52, 0.48, 0.39', '', 0));
  handlers.set('df', () => {
    const output = [
      'Filesystem     1K-blocks     Used Available Use% Mounted on',
      '/dev/sda1       51475068 18234512  30601420  38% /',
      'tmpfs            4043064        0   4043064   0% /dev/shm',
      '/dev/sda2      103081248 42315824  55505128  44% /home',
    ];
    return ctx.result('df', output.join('\n'), '', 0);
  });
  handlers.set('free', () => {
    const output = [
      '              total        used        free      shared  buff/cache   available',
      'Mem:        8086128     3245612     1823456      234512     3017060     4523412',
      'Swap:       2097148      123456     1973692',
    ];
    return ctx.result('free', output.join('\n'), '', 0);
  });
  handlers.set('wc', (args) => {
    const file = args.find((a) => !a.startsWith('-'));
    const lines = ctx.rngInt(50, 500);
    const words = lines * ctx.rngInt(5, 15);
    const chars = words * ctx.rngInt(4, 8);
    if (args.includes('-l')) return ctx.result(`wc ${args.join(' ')}`, `${lines} ${file ?? ''}`, '', 0);
    return ctx.result(`wc ${args.join(' ')}`, `  ${lines}  ${words} ${chars} ${file ?? ''}`, '', 0);
  });
  handlers.set('head', (args) => {
    const file = args.find((a) => !a.startsWith('-'));
    if (!file) return ctx.result('head', '', 'head: missing operand', 1);
    const content = ctx.generateFileContent(file);
    if (!content) return ctx.result(`head ${file}`, '', `head: cannot open '${file}' for reading: No such file or directory`, 1);
    const lines = content.split('\n').slice(0, 10);
    return ctx.result(`head ${args.join(' ')}`, lines.join('\n'), '', 0);
  });
  handlers.set('tail', (args) => {
    const file = args.find((a) => !a.startsWith('-'));
    if (!file) return ctx.result('tail', '', 'tail: missing operand', 1);
    const content = ctx.generateFileContent(file);
    if (!content) return ctx.result(`tail ${file}`, '', `tail: cannot open '${file}' for reading: No such file or directory`, 1);
    const lines = content.split('\n').slice(-10);
    return ctx.result(`tail ${args.join(' ')}`, lines.join('\n'), '', 0);
  });
  handlers.set('mkdir', (args) => ctx.result(`mkdir ${args.join(' ')}`, '', '', 0));
  handlers.set('touch', (args) => ctx.result(`touch ${args.join(' ')}`, '', '', 0));
  handlers.set('rm', (args) => ctx.result(`rm ${args.join(' ')}`, '', '', 0));
  handlers.set('cp', (args) => ctx.result(`cp ${args.join(' ')}`, '', '', 0));
  handlers.set('mv', (args) => ctx.result(`mv ${args.join(' ')}`, '', '', 0));
  handlers.set('chmod', (args) => ctx.result(`chmod ${args.join(' ')}`, '', '', 0));
  handlers.set('chown', (args) => ctx.result(`chown ${args.join(' ')}`, '', '', 0));
}