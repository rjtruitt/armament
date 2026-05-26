# Drift system — git worktree isolation

## What drift is

Each channel gets its own git worktree — an isolated checkout of the
project on a separate branch. Changes made in one channel don't affect
others until explicitly merged.

## Worktree locations

- **Internal** (armament's own repo): `.armament/worktrees/<channel>/`
  on branch `drift/<channel>`.
- **External** (other git repos): `.armament/external-worktrees/<channel>/`
  on branch `armament/<channel>`. Created via `drift_init_external` tool.

## Available tools

| Tool | Purpose |
|------|---------|
| `drift_status` | Show current status (commits ahead, files modified, co-drifts) |
| `drift_set_workspace` | Activate workspace — file tools auto-route writes to both worktree and main, with auto-commit on drift branch |
| `drift_unset_workspace` | Deactivate workspace — file tools go back to normal main-repo operation |
| `drift_snapshot` | Save a checkpoint before making changes (do this BEFORE first edit) |
| `drift_snapshots` | List all snapshots with hashes — used to find the right rollback point |
| `drift_rollback` | Rollback to a previous snapshot on the drift branch |
| `drift_merge_preview` | Preview merge conflicts before merging |
| `drift_auto_merge` | Merge worktree changes back to main |
| `drift_check_rebase` | Check if main has moved ahead |
| `drift_init_external` | Create worktree for an external git repo |

## Workspace workflow

Instead of manually prefixing paths, use `drift_set_workspace` once, then
`write_file`/`edit_file` with a `reason` field. The tools handle routing:

```
drift_set_workspace: {"type": "drift", "reason": "fix ChatRenderer"}
→ tools will write to both worktree and main, auto-committing on drift branch

write_file: {"path": "src/foo.ts", "content": "...", "reason": "add bar"}
→ writes to both paths, commits "add bar" on drift/general2
```

## Recovery — when something breaks

1. Check `## Active context` in notes.md for workspace info and snapshot hash
2. Run `drift_snapshots` to see the commit history on the drift branch
3. Run `drift_rollback` with a known-good snapshot hash
4. Run `drift_auto_merge` to restore main to that state
5. If no drift workspace was active, use `git log` on main directly
