# Drift System

Content-addressed file snapshot archive. Every `write_file`, `edit_file`, and `append_file` tool call auto-snapshots the file before modification. Snapshots are stored globally in `~/.arma/drift/` and tagged by channel for per-channel rollback.

No git worktrees. No branches. Just file-level snapshots with content-deduplication via SHA256 hashing.

## Architecture

```
Tool call (write_file / edit_file / append_file)
    → DriftManager.snapshot(channel, path, reason, tool)
    → reads current file content
    → SHA256 hashes it
    → stores bytes in ~/.arma/drift/content/<sha256hex>
    → appends entry to ~/.arma/drift/index.json

User requests rollback
    → DriftManager.rollback(snapshotId)
    → reads stored content from ~/.arma/drift/content/<hash>
    → writes it back to original path
    → snapshots the restored state (rollback is tracked too)
```

## Storage layout

```
~/.arma/drift/
    index.json     ← { version, counter, files: { "/path": [ { id, channel, hash, reason, tool, ts, size } ] } }
    content/
        <sha256hex>  ← raw file bytes (deduplicated by hash)
```

## Key types

| Type | Description |
|------|-------------|
| `DriftEntry` | Single snapshot: id, channel, hash, reason, tool ('edit_file'|'write_file'|'append_file'|'manual'|'rollback'), timestamp, size |
| `DriftStoreStats` | totalSnapshots, totalPaths, totalSizeBytes, paths[] |
| `IDriftConfig` | enabled, retentionDays, maxSizeBytes, autoPruneStaleOnStart |

## DriftManager API

| Method | Purpose |
|--------|---------|
| `snapshot(channel, path, reason, tool)` | Save a snapshot before a file change |
| `listSnapshots(channel, path?)` | List snapshots, optionally filtered |
| `rollback(channel, snapshotId)` | Restore file to a previous snapshot |
| `getStats(channel)` | Get snapshot count, size, paths |
| `prune({ days?, staleOnly?, maxSizeBytes? })` | Remove old/stale snapshots, enforce size cap |

## Agent-facing tools (from DriftTools.ts)

| Tool | Description |
|------|-------------|
| `drift_snapshot` | Manual snapshot: `{"path": "/abs/path", "reason": "why"}` |
| `drift_snapshots` | List snapshots: `{"path": "optional/filter.md"}` |
| `drift_rollback` | Rollback: `{"id": "s_3"}` |
| `drift_status` | Show stats: count, total size, tracked files |
| `drift_prune` | Clean up: `{"days": 30}` or `{"staleOnly": true}` |

## Auto-snapshots

The following tool calls auto-snapshot the target file **before** modification:

- `write_file` — snapshots old content, writes new
- `edit_file` — snapshots old content, applies edit
- `append_file` — snapshots old content, appends

This means every file change is recoverable. Snapshots are never modified or deleted by normal operations — only by explicit `drift_prune` or the size-based auto-prune when `maxSizeBytes` is configured.

## Storage

- Content is deduplicated by SHA256 hash — same file content = single copy
- Index is stored as JSON in `~/.arma/drift/index.json`
- Content directory: `~/.arma/drift/content/`
- All operations use atomic writes (write to `.tmp.<pid>`, rename to target) to prevent corruption
