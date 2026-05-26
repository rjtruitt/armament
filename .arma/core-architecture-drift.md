# Drift tools — file snapshot archive

## What drift is

A safety net for file changes. Every time you use `write_file`, `edit_file`, or `append_file` with a `reason`, drift automatically saves a copy of the file's original content before modifying it. You can restore any file to a previous state.

## Available tools

| Tool | What it does |
|------|-------------|
| `drift_status` | Show snapshot count, total size, which files are tracked |
| `drift_snapshot` | Manually snapshot a file (use before risky bash commands) |
| `drift_snapshots` | List all snapshots; filter by path to find relevant ones |
| `drift_rollback` | Restore a file from a snapshot by ID |
| `drift_prune` | Remove old snapshots to free space |

## Auto-snapshot workflow

Every write/edit/append auto-snapshots. Just include `reason`:

```json
{"name": "write_file", "arguments": {"path": "src/config.ts", "content": "...", "reason": "adding-config-file"}}
```

For changes via bash, snapshot first:

```json
{"name": "drift_snapshot", "arguments": {"path": "src/config.ts", "reason": "before-bash-change"}}
```

## Listing and rollback

```json
// List snapshots for a file
{"name": "drift_snapshots", "arguments": {"path": "src/config.ts"}}

// Restore to a previous state
{"name": "drift_rollback", "arguments": {"id": "s_42"}}
```

## Recovery

1. `drift_snapshots` to find the right snapshot
2. `drift_rollback <id>` to restore
3. Rollbacks are themselves snapshotted (reversible)
4. If the index is corrupted, `drift_status` auto-recovers
