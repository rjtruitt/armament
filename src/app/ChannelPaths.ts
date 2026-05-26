/**
 * ChannelPaths — centralized path resolution for channel workspace directories.
 *
 * Each channel has an `.armaws/` directory that stores its metadata
 * (notes.md, architecture/, contexts, .drift.workspace, etc.).
 *
 * By default:  ~/.arma/channels/<name>/.armaws/
 * After /setroot <path>: the .armaroot pointer file redirects to <path>/.armaws/
 * so the channel's metadata lives alongside the project it's working on.
 *
 * Override the data dir via ARMAMENT_ARMA env variable.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** Directory name for channel workspace inside the target project. */
export const ARMAWS_DIR = '.armaws';

/** Get the bare channel name (strip # prefix). */
export function bareName(channel: string): string {
  return channel.startsWith('#') ? channel.slice(1) : channel;
}

/**
 * Canonical location for the .arma data directory.
 * Defaults to ~/.arma, overridable via ARMAMENT_ARMA env variable.
 * Cross-platform: uses os.homedir() for Windows compatibility.
 */
export function armaDataDir(): string {
  const envDir = process.env.ARMAMENT_ARMA;
  if (envDir) return envDir;
  return join(homedir(), '.arma');
}

/** Root directory for a channel under .arma/ (e.g. ~/.arma/channels/<bare>/). */
export function channelBaseDir(channel: string): string {
  return join(armaDataDir(), 'channels', bareName(channel));
}

/** Path to the .armaroot pointer file that redirects to a custom root. */
export function armarootPath(channel: string): string {
  return join(channelBaseDir(channel), '.armaroot');
}

/**
 * Resolve the workspace directory for a channel.
 *
 * If `.armaroot` exists, returns `<target>/.armaws/`.
 * Otherwise returns `.arma/channels/<bare>/<ARMAWS_DIR>/`.
 */
export function getArmaPath(channel: string): string {
  const ar = armarootPath(channel);
  if (existsSync(ar)) {
    try {
      const root = readFileSync(ar, 'utf-8').trim();
      if (root) return join(root, ARMAWS_DIR);
    } catch { /* fall through */ }
  }
  // Default: .armaws/ under the channel dir
  return join(channelBaseDir(channel), ARMAWS_DIR);
}

/** Same as getArmaPath but only returns the redirected root path, null if using default. */
export function getRedirectedRoot(channel: string): string | null {
  const ar = armarootPath(channel);
  if (existsSync(ar)) {
    try {
      const root = readFileSync(ar, 'utf-8').trim();
      if (root) return root;
    } catch {}
  }
  return null;
}

/** Get the project root for a channel (parent of .armaws/ directory). */
export function getChannelRoot(channel: string): string {
  const redirected = getRedirectedRoot(channel);
  if (redirected) return redirected;
  // Default: .armaws/ under the channel dir
  return join(channelBaseDir(channel), ARMAWS_DIR);
}

/** Get notes.md path. */
export function getNotesPath(channel: string): string {
  return join(getArmaPath(channel), 'notes.md');
}

/** Get architecture/ directory path. */
export function getArchDir(channel: string): string {
  return join(getArmaPath(channel), 'architecture');
}

/** Get .drift.workspace path. */
export function getDriftWsPath(channel: string): string {
  return join(getArmaPath(channel), '.drift.workspace');
}

/** Get contexts/ directory path. */
export function getContextDir(channel: string): string {
  return join(getArmaPath(channel), 'contexts');
}

/**
 * Set a custom root for a channel by writing the .armaroot pointer file.
 * Creates the channel base dir if needed, and ensures the target .armaws/ exists.
 */
export function setChannelRoot(channel: string, rootPath: string): void {
  mkdirSync(channelBaseDir(channel), { recursive: true });
  writeFileSync(armarootPath(channel), rootPath.trim() + '\n', 'utf-8');
  // Ensure target .armaws/ exists
  mkdirSync(join(rootPath.trim(), ARMAWS_DIR), { recursive: true });
}
