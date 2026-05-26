# Armament architecture

## Overview

```
arma CLI (shell script)
  └─ dist/bundle.cjs (esbuild bundle of dist/index.js)
       └─ src/index.ts — bootstraps ArmamentApp
             ├─ TUI mode (default) → src/app/ArmamentApp.ts
             └─ Readline mode (--no-tui) → simple REPL
```

## Key files

| Layer | File | Role |
|-------|------|------|
| Entry | `src/index.ts` | CLI parsing, app bootstrap, web server init |
| App | `src/app/ArmamentApp.ts` | Composition root: wires all systems together |

## Architecture sections

- [TUI layer](tui.md) — rendering, input handling, chat formatting
- [Session persistence](session.md) — save/restore channel state
- [Message flow](message-flow.md) — user input → agent → response
- [Drift system](drift.md) — git worktree isolation per channel

## Known gotchas

- `make binary` required for changes to take effect (tsc → esbuild bundle.cjs)
- notes.md prepended to every user message (MessageHandler.ts:103)
