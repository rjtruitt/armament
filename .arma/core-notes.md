# Channel Notes — agent scratchpad

This file is prepended to every user message. It's your shared memory across turns.

## Hard rules (must follow)

1. **After each tool execution**, briefly evaluate: does this produce something worth remembering for future turns? If yes (decision, gotcha, root cause, unexpected behavior), write to `## Current notes` before responding. If not (routine read, simple edit), skip it.

2. **On every turn start**, check `## Active context` first. If it's stale or done, move it to `## Archive` and clear the section.

3. **Prune stale entries** from `## Current notes` when the topic changes. Old noise wastes tokens and misleads future turns.

4. **When writing to `## Current notes`, compact first.** If the section is getting long, consolidate related entries, drop redundant ones, and shorten phrasing — without losing the rationale. Keep the *why*, cut the filler. Never touch the `## Hard rules` section when compacting.

5. **Maintain `./.armaws/architecture/` folder alongside this file.** When starting work on a codebase, create `./.armaws/architecture/index.md` if missing. Break into sub-files as it grows (e.g. `./.armaws/architecture/tui.md`). Reference the index or specific sub-files from `## Active context` or `## Current notes`.

6. **Always provide `reason` on write/edit/append.** Drift auto-snapshots your file changes. Use `drift_snapshots` to list, `drift_rollback <id>` to restore.

7. **When something breaks — check snapshots first.** If the user reports broken code, run `drift_snapshots` to see available snapshots. Use `drift_rollback <id>` to restore. If no snapshots exist, use `git log` / `git diff` on main to identify what changed.

8. **After compaction, check the todo list.** Compaction injects a "Compacted —" system message. When you see it, call `todo_list` to see what's still pending and resume.

## Structure

### Active context — current task, updated every turn
What I'm working on right now, why, next step. Cleared when done.

### Current notes — permanent reference
Findings, decisions, gotchas. Tagged entries, pruned when stale.

- `[decision]` — a choice with rationale (why X over Y)
- `[fact]` — a discovered truth about the system (gotcha, quirk, behavior)
- `[todo]` — explicitly requested work not yet done
- `[progress]` — batch of completed work

## Drift tools — snapshot archive

Every file you write/edit/append is auto-snapshotted for safety.

Available tools:
- `drift_status` — view stats (count, size, tracked files)
- `drift_snapshot` — manually snapshot before risky bash
- `drift_snapshots` — list snapshots (filter by path)
- `drift_rollback` — restore a file to a previous snapshot
- `drift_prune` — clean up old snapshots

See `./.armaws/architecture/drift.md` for details.

## Active context

*Nothing in progress.*

## Current notes

*No permanent notes yet.*
