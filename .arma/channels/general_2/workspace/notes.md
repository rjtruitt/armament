# Channel Notes — agent scratchpad

This file is prepended to every user message. It's your shared memory across turns.

## Hard rules (must follow)

1. **After each tool execution**, briefly evaluate: does this produce something worth remembering for future turns? If yes (decision, gotcha, root cause, unexpected behavior), write to `## Current notes` before responding. If not (routine read, simple edit), skip it.

2. **On every turn start**, check `## Active context` first. If it's stale or done, move it to `## Archive` and clear the section.

3. **Prune stale entries** from `## Current notes` when the topic changes. Old noise wastes tokens and misleads future turns.

4. **When writing to `## Current notes`, compact first.** If the section is getting long, consolidate related entries, drop redundant ones, and shorten phrasing — without losing the rationale. Keep the *why*, cut the filler. Never touch the `## Hard rules` section when compacting.

5. **Maintain `architecture/` folder alongside this file.** When starting work on a codebase, create `architecture/index.md` if missing. Break into sub-files as it grows (e.g. `architecture/tui.md`). Reference the index or specific sub-files from `## Active context` or `## Current notes`.

6. **Before modifying source code, set the drift workspace and snapshot.** Call `drift_set_workspace` to activate the worktree, then `drift_snapshot` to save a pre-edit checkpoint. Record the snapshot hash and worktree path in `## Active context`. All subsequent `write_file`/`edit_file` calls with `reason` will auto-commit on the drift branch.

7. **When something breaks — recover through drift first.** If the user reports broken code, don't guess — check `## Active context` for workspace info, then run `drift_snapshots` to review the commit history on the drift branch. Use `drift_rollback` to revert to a known-good snapshot, then `drift_auto_merge` to restore main. If no drift workspace was active, use `git log` on main to identify what changed.

## Structure

### Active context — current task, updated every turn
What I'm working on right now, why, next step. Cleared when done.

### Current notes — permanent reference
Findings, decisions, gotchas. Tagged entries, pruned when stale.

- `[decision]` — a choice with rationale (why X over Y)
- `[fact]` — a discovered truth about the system (gotcha, quirk, behavior)
- `[todo]` — explicitly requested work not yet done
- `[progress]` — batch of completed work

## Drift system

See `architecture/drift.md` for available tools, worktree paths, and
usage rules. This channel has its own git worktree at
`.armament/worktrees/<channel>/` — changes are isolated until merged.

## External workspace projects

Use `drift_init_external` tool to work on external git repos without
adding armament files to them:

```
drift_init_external: {"repoPath": "/path/to/other/project"}
```

This creates a worktree at `.armament/external-worktrees/<channel>/`
on branch `armament/<channel>`. The external repo is never modified.
All drift tools (snapshot, rollback, merge preview, auto-merge) work
on this worktree.

## Active context

Implementing workspace-aware drift system:
- WorkspaceRegistry created ✓
- drift_set_workspace/drift_unset_workspace tools added ✓
- write_file/edit_file now accept workspace+reason params for dual-write + auto-commit ✓
- DriftManager.getWorktree/commitFile added ✓
- Wired into createAppServices so tools share the same registry ✓
- MockDriftManager updated ✓
- Docs updated: core-notes.md rules 6-7, drift.md workspace workflow + recovery, tool descriptions reference architecture/drift.md
- **Pending:** drift tests, commit, merge

## Current notes

[decision] Agent message truncation removed from ChatRenderer.ts. The `maxLines = 40` cap and `░░▒▓ N more lines ░░▒▓` indicator were applied to ALL agent messages when they should only apply to tool results (which already have their own 30-line cap in TuiChannelHelpers.ts).

[decision] tool_call_id and tool_calls fields added to session serialization (ISessionPersistence, ChannelLifecycle, SessionBridge). OpenAI requires tool role messages to have tool_call_id — without it, session resume sends malformed messages and gets 400 error.

[decision] TUI double-submit fixed. Some terminals send \r\n instead of just \r for enter. The old tokenizer split them into two tokens, producing two submit events. Now \r\n is treated as a single token.

[fact] `arma` command runs `dist/bundle.cjs`, not `dist/index.js`. `npx tsc` is only half the build — `make binary` (which runs esbuild) is needed for the runnable artifact. Forgetting this means changes appear in dist/ but don't take effect.

[progress] Committed batch across two commits: tool_call_id persistence, TUI \r\n fix, ChatRenderer truncation removal, cache efficiency cadence, drift_init_external tool, architecture auto-seed, notes.md template redesign.

[decision] Cache efficiency warning now fires every 10th turn (10, 20, 30...). Old guards (turnCount < 4, totalTokens < 50k) didn't account for session resume — historical tokens reloaded but cache is empty on first request after resume.

[decision] Added `drift_init_external` tool. Creates a git worktree of an external repo inside `.armament/external-worktrees/<channel>/` on branch `armament/<channel>`. External repo never gets armament files added. All drift tools (snapshot, rollback, merge preview, auto-merge) work on external worktrees. Web UI unaffected (agent tools only). Implements IDriftManager.createExternalWorktree() with mock in MockDriftManager.

[fact] notes.md is prepended to every user message via MessageHandler.ts line 103. Whatever I write here gets fed to me on every turn — making it the most effective place to store persistent context.
