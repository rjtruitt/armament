# Channels & Agents

## Channel Lifecycle

Managed by `ChannelLifecycle` (`src/app/ChannelLifecycle.ts`).

```
/join #name
  → ChannelLifecycle.joinChannel(name, activeChannel)
    → validates name (no spaces, max 32 chars, alphanumeric + -_)
    → creates channel entry in channels[]
    → registers in sidebar UI
    → ensures .arma/channels/<name>/notes.md (seeded from core-notes.md)
    → first provider from UserConfig → ProviderPool.getOrCreate()
    → creates ChannelAgent wrapping AgentLoop
    → returns channel name

/part #name
  → ChannelLifecycle.leaveChannel(name)
    → shuts down agent, deletes from channelAgents
    → shuts down TaskRuntime, deletes from channelRuntimes
    → cleans up worker agents (worker-{name}-*)
    → removes from channels[], sidebar, session persistence
    → deletes .arma/channels/<name>/

/model model-id [provider]
  → ChannelLifecycle.switchChannelModel(channel, model, provider?)
    → finds provider config by name
    → ProviderPool.getOrCreate(driverType, model, opts)
    → creates new ChannelAgent, imports session state
```

## Agent Loop Flow

Every user message goes through:

```
MessageHandler.handleUserMessage(channel, input)
  → augments input with channel notes + sticky notes
  → ChannelAgent.sendMessage(augmentedInput)
    → AgentLoop.runTurn(augmentedInput)  (iteratio)
      → CallLLMStep → adapter.invoke/invokeStream
        → ModelToLLMAdapter (armament)
          → flight-controller Model
            → provider API
      → AddToolResultsStep (if tool calls)
      → ExecuteToolsStep
      → CallLLMStep next iteration
    → returns final response text
```

## Channel Notes

Each channel has `.arma/channels/<name>/notes.md`:
- Created on `/join` from `.arma/core-notes.md` template
- Injected into agent context on every message turn
- Wrapped in `[IMPORTANT NOTES]` delimiters
- Agents can read + append to this file
- Deleted on `/part`

## Sticky Notes

Per-session reminders managed via `/sticky` command:
- Stored in `SessionState._stickyNotes[]`
- Support position: `top` | `bottom` | `both`
- Injected as `[PERSISTENT REMINDERS]` block
- `/sticky top "text"` / `/sticky bottom "text"`

## Context Injection Order

```
[IMPORTANT NOTES]        ← channel notes from notes.md
[PERSISTENT REMINDERS]   ← sticky notes (position: top/both)
[USER MESSAGE]            ← actual user input
[PERSISTENT REMINDERS]   ← sticky notes (position: bottom/both)
```

## Streaming

`ChannelAgent.sendMessageStreaming()` (`src/providers/ChannelAgentStreaming.ts`):
1. Yields `text` chunks incrementally
2. Yields `thinking` chunks (reasoning content)
3. Yields `tool_start`, `tool_progress`, `tool_call` events
4. Accumulates tool calls and executes them
5. Stores assistant message (content + tool_calls + reasoning)
6. Loops back if more tool calls

## Agent Tools

Built-in tools (`src/providers/BuiltinToolDefs.ts`):
bash, read_file, write_file, edit_file, grep, glob

Plugin tools from `iteratio-plugin-tools`:
git, web/data, infra, monitoring, pentest, shell

A2A tools (added in flow context):
spawn_worker, await_worker, get_workers, send_worker_message,
cancel_worker, report_complete, ask_user

## Worker Cleanup

On `/part` or agent shutdown:
- All `worker-{channel}-*` agents are shut down and removed
- Their runtimes are cleaned up
- UI children are removed from sidebar
- Notes directories are deleted
