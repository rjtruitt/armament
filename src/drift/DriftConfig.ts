/** Default configuration and resolution helpers for the drift subsystem. */
import type { IDriftConfig } from './interfaces/IDrift.js';

/** Sensible defaults for drift — enabled with auto-prune. */
export const DRIFT_DEFAULTS: IDriftConfig = {
  enabled: true,
  autoPruneStaleOnStart: true,
  retentionDays: 0, // 0 = no age-based pruning by default
  maxSizeBytes: 50 * 1024 * 1024, // 50MB default limit
};

/** Merges partial config with defaults. */
export function resolveDriftConfig(partial?: Partial<IDriftConfig>): IDriftConfig {
  return { ...DRIFT_DEFAULTS, ...partial };
}
