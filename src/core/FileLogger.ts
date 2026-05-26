import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

const LOG_PATH = path.join(homedir(), '.armament', 'armament.log');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB rotation

let _stream: fs.WriteStream | null = null;

function getStream(): fs.WriteStream {
  if (!_stream) {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    try {
      const stat = fs.statSync(LOG_PATH);
      if (stat.size > MAX_SIZE) {
        const prev = LOG_PATH + '.prev';
        if (fs.existsSync(prev)) fs.unlinkSync(prev);
        fs.renameSync(LOG_PATH, prev);
      }
    } catch {}
    _stream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
  }
  return _stream;
}

function ts(): string {
  return new Date().toISOString();
}

/** Write a DEBUG-level line to ~/.armament/armament.log. */
export function logDebug(component: string, msg: string, data?: any): void {
  const line = data
    ? `${ts()} [DEBUG] [${component}] ${msg} ${JSON.stringify(data)}\n`
    : `${ts()} [DEBUG] [${component}] ${msg}\n`;
  getStream().write(line);
}

/** Write an INFO-level line to ~/.armament/armament.log. */
export function logInfo(component: string, msg: string, data?: any): void {
  const line = data
    ? `${ts()} [INFO]  [${component}] ${msg} ${JSON.stringify(data)}\n`
    : `${ts()} [INFO]  [${component}] ${msg}\n`;
  getStream().write(line);
}

/** Write a WARN-level line to ~/.armament/armament.log. */
export function logWarn(component: string, msg: string, data?: any): void {
  const line = data
    ? `${ts()} [WARN]  [${component}] ${msg} ${JSON.stringify(data)}\n`
    : `${ts()} [WARN]  [${component}] ${msg}\n`;
  getStream().write(line);
}

/** Write an ERROR-level line with optional stack trace to ~/.armament/armament.log. */
export function logError(component: string, msg: string, err?: any): void {
  const errStr = err instanceof Error ? `${err.message}\n${err.stack}` : (err ? JSON.stringify(err) : '');
  const line = `${ts()} [ERROR] [${component}] ${msg} ${errStr}\n`;
  getStream().write(line);
}

/** Flush and close the log stream; call on shutdown. */
export function flushLog(): void {
  _stream?.end();
  _stream = null;
}
