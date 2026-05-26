# Message flow

## Path

1. User types message
2. `ArmamentApp.handleInput()` receives it
3. If starts with `/` → `processSlashCommand()` in InputProcessor.ts
4. Else → `MessageHandler.ts` prepends notes.md + sticky notes, sends to agent
5. Agent streams response back via StreamRouter
6. TUI renders in chat panel via ChatRenderer

## notes.md injection

`MessageHandler.ts:103` — the channel's notes.md is prepended to every user message before it reaches the agent. This is why notes.md is the most effective place for persistent context.
