# Drift System

Git-worktree-based channel isolation. Each channel gets its own git worktree so agents can modify files independently without conflicting. The drift system tracks changes, detects co-drifting (multiple channels editing same files), and provides merge/sync tooling.

## Architecture

```
ChannelLifecycle.joinChannel()
    → DriftManager.createWorktree()     ← NEEDS WIRING
    → git worktree add -b drift/<slug>

Agent turn completes
    → DriftManager.recordActivity()     ← NEEDS WIRING
    → DriftManager.snapshot()           ← optional, configured

ChannelLifecycle.leaveChannel()
    → DriftManager.destroyWorktree()    ← WIRED
    → git worktree remove --force
```

## Worktree layout

```
.armament/worktrees/
  channel-name/         ← git worktree (agent's sandboxed repo)
  another-channel/
  ...
```

Each worktree is on a branch `drift/<channel-slug>` with its own working directory.

## Key types

| Type | Description |
|------|-------------|
| `IDriftStats` | Per-channel stats: commits ahead, velocity, sync status, co-drifts, files modified |
| `IDriftConfig` | `enabled`, `inactivityDays` (7), `autoRebaseThreshold` (10), `snapshotOnTurnComplete` (false), `mergePreviewOnComplete` (true) |
| `IDriftMergePreview` | Fast-forward possible? Conflict files? Lines added/removed |
| `SyncStatus` | `clean`, `stale`, `conflict`, `diverged` |

## DriftManager API

| Method | Purpose |
|--------|---------|
| `createWorktree(channel, repoPath)` | Creates git worktree + drift branch for a channel |
| `destroyWorktree(channel)` | Removes worktree + branch, cleans up |
| `getStats(channel)` | Returns drift stats for a channel |
| `getAllStats()` | Returns stats for all active worktrees |
| `getDriftMap()` | Map of file → channels that modified it (co-drift detection) |
| `snapshot(channel, label?)` | `git add -A` + commit in the worktree |
| `mergePreview(channel)` | Shows what a merge would look like |
| `autoMerge(channel)` | Attempts merge, returns conflicts if any |
| `checkRebaseNeeded(channel)` | Checks if worktree is behind main |
| `cleanOrphans(knownChannels)` | Removes worktrees for channels that no longer exist |
| `recordActivity(channel)` | Updates lastActivity timestamp |

## Co-drift detection

When two channels modify the same files, they're "co-drifting":
- **Low risk**: 1-2 shared files
- **Medium risk**: 3-5 shared files
- **High risk**: >5 shared files

The drift map shows which files are being modified by which channels so you can spot conflicts before merging.

## Config

```json
{
  "drift": {
    "enabled": true,
    "inactivityDays": 7,
    "autoRebaseThreshold": 10,
    "snapshotOnTurnComplete": false,
    "mergePreviewOnComplete": true,
    "worktreeBaseDir": ".armament/worktrees"
  }
}
```

## States needing wiring

| Hook | Where | Status |
|------|-------|--------|
| `createWorktree` on channel join | `ChannelLifecycle.joinChannel()` | Not wired |
| `recordActivity` on turn start | Agent turn lifecycle | Not wired |
| `snapshot` on turn complete | Agent turn lifecycle | Not wired |
| `mergePreview` on turn complete | Agent turn lifecycle | Not wired |
| `checkRebaseNeeded` display | TUI status / web card | Not wired |
| `getDriftMap` / co-drift display | TUI / web card | Not wired |
