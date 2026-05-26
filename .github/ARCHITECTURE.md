# Architecture

## Repo Map

Three core projects plus a plugin ecosystem:

```
iteratio/              Agent loop & pipeline framework (core engine)
  src/core/             AgentLoop, StepPipeline, TurnManager, MessageManager
  src/core/steps/       CallLLMStep, AddAssistantResponseStep, AddToolResultsStep,
                        ExecuteToolsStep, AddUserMessageStep
  src/interfaces/       ILLMProvider, IMessageManager, IStep, IAgentLoop
  src/distributed/      AgentMessageBus, LeaderElection, HealthMonitor
  src/hub/              ModelRegistry, ToolRegistry, RateLimiter
  src/transports/       MemoryTransport, BroadcastChannelTransport, NATSTransport
  src/cross-cutting/    AgentGraph, CircuitBreaker, MemoryStore, ParallelExecutor
  src/threading/        WorkerThreadRunner, ChildProcessRunner, WebWorkerRunner

flight-controller/     LLM provider implementations
  src/providers/        OpenAI, Anthropic, Bedrock, Gemini (each with translator + types)
  src/core/model/       Model base class, ModelIdentity, ModelHealth, ModelLimitChecker
  src/core/translator/  IOpenAITranslator interface + per-provider translators
  src/core/limits/      RateLimit, TokenLimit, SessionLimit, AdaptiveRateLimiter
  src/core/errors/      LLMError, error handlers, error classifiers
  src/auth/             AWSSSOAuth, ApiKeyAuth, OAuth providers

armament/              Terminal UI & app wiring (consumer)
  src/app/              ArmamentApp, TuiRenderer, ChannelLifecycle, MessageHandler
  src/tui/              ScreenBuffer, Sidebar, StatusBar, ConfigPane, SessionMenu
  src/providers/        ProviderPool, ModelToLLMAdapter, ChannelAgent, Streaming
  src/config/           UserConfig singleton (~/.armament/config.json)
  src/threads/          AgentThreadEntry, ThreadCoordinator, SubworkerManager
  src/a2a/              TaskRuntime, TaskTools, WorkerTools (agent-to-agent)
  src/scripting/        ArmaScript, ArmaFlow, flow executor, script runtime
  src/drift/            Git worktree management per channel
  src/session/          Session persistence, checkpoint, resume

iteratio-plugin-*/     Optional plugins extending iteratio
  iteratio-plugin-tools     Built-in tool catalog (git, web, data, infra, pentest, shell)
  iteratio-plugin-memory     Shared memory, memory index, conflict resolution
  iteratio-plugin-a2a       Hive orchestrator, agent registry, coordination memory
  iteratio-plugin-mcp       MCP server management, tool discovery, auth
  iteratio-plugin-graph     Graph composer, workflow builder, vector store
  iteratio-plugin-workflow  Workflow steps, todo manager, output processors
  iteratio-plugin-*         (constraints, federation, human, metrics, parallel,
                             retry, sessions, state, tracing)
```

## Agent Loop (iteratio)

The core of every agent interaction is `AgentLoop.runTurn()`. Here's the full flow:

```
runTurn(input, maxTurns)
  │
  ├─ 1. AddUserMessageStep
  │     appends user input to message history
  │
  ├─ 2. CallLLMStep
  │     builds context from messages + tools
  │     calls adapter.invoke() or invokeStream()
  │     → returns LLMResponse { content, tool_calls, reasoning, finish_reason }
  │
  ├─ 3. Check tool_calls
  │     │
  │     ├─ NO tool_calls → AddAssistantResponseStep
  │     │     appends assistant message (content + reasoning) to history
  │     │     marks turn complete → return
  │     │
  │     └─ HAS tool_calls → AddToolResultsStep
  │           appends assistant message (content + tool_calls + reasoning)
  │           for each tool result:
  │             appends tool message (result + tool_call_id)
  │           → marks shouldContinue = true
  │
  ├─ 4. ExecuteToolsStep (if tool_calls present)
  │     for each tool_call:
  │       looks up tool by name
  │       executes with parsed args
  │       stores result in context.toolResults
  │
  ├─ 5. If shouldContinue AND turns < maxTurns:
  │     loop back to step 2 (CallLLMStep)
  │     The LLM now sees: user → assistant(tool_calls) → tool(results) → ...
  │
  └─ 6. Return final response string
```

Key points:
- The `AgentLoop` is DI-wired via inversify — steps can be added/replaced by plugins
- `shouldContinue` is true when there are tool results to process
- The loop terminates when the LLM responds without tool_calls OR maxTurns is hit
- Each turn increments the message history, so the LLM has full context

### Streaming variant

`ChannelAgent.sendMessageStreaming()` drives the same loop but yields
`StreamEvent` chunks for real-time UI rendering:

```
for await (const chunk of invokeStream(messages)):
  type: 'text'      → append to fullText, yield to UI
  type: 'thinking'  → accumulate into fullThinking, yield to UI
  type: 'tool_call' → push to toolCalls[], yield to UI
  type: 'done'      → loop naturally ends

After loop: store assistant message with content + tool_calls + reasoning
Execute tools → store tool results → loop back if more tool calls
```

## Zombie Detection & Nudges

Workers that stop responding are detected and handled at two levels:

### TaskRuntime (a2a layer)

`TaskRuntime` manages worker lifecycle with zombie detection:

- Each worker has a `zombieThresholdMs` config (defaults to high value)
- An interval timer (every 5s) checks all workers
- If a worker hasn't responded within threshold:
  1. **Nudge**: sends a nudge message to the worker
     ("You appear to be done but haven't called report_complete yet...")
  2. **Track**: marks worker as nudged in `nudgedWorkers` set
  3. **Timeout**: if still no response after nudge, fires `onWorkerError`
- Workers are also checked against `zombieThresholdTurns` (max turns without progress)

### FlowRuntime (orchestration layer)

Flow workers get an idle nudge timer:

- When a worker is spawned via `spawnChannelBackground`, a `setInterval` starts
- After 60s of continuous idleness (no `report_complete` called), a nudge is sent
- If the worker produces results before 60s, the interval is cleared
- The nudge prompts the worker to call `report_complete` with current progress

### Circuit Breakers

Tools have a circuit breaker mechanism in `ChannelAgentStreaming`:

- Tracks consecutive failures per tool name (`toolFailCounts`)
- MAX_TOOL_FAILURES (3) failures → circuit breaker trips
- Further calls to that tool return an error:
  "CIRCUIT BREAKER: {tool} has failed {N} consecutive times. STOP calling this tool."
- Fail count resets on successful tool execution

## A2A / Worker Communication

Workers spawned by flows use A2A tools to coordinate:

```
spawn_worker     → parent creates child worker with task
report_complete  → worker signals done, sends results
send_message     → worker sends message to parent channel
ask_user         → worker asks orchestrator for guidance
```

Worker status tracking:
- `TaskRuntime.workers` Map tracks each worker's state
- States flow through: thinking → tool_use → complete / error
- Completion resolves the worker's promise with the report
- Timeouts and errors propagate up through the promise chain
- Workers can be canceled via `TaskRuntime.cancelWorker()`

Worker cleanup on `/part`:
- All workers with prefix `worker-{channelName}` are shut down
- Their runtimes are removed from `channelRuntimes`
- UI children are removed from sidebar
- Notes directories are deleted

## Context Injection

Every user message is augmented before reaching the LLM:

```
raw input: "fix the bug in auth.ts"
           │
           ├── Sticky notes (user-managed reminders)
           │     appended as block at start of input
           │     managed via /sticky, /unsticky commands
           │     stored in SessionState._stickyNotes[]
           │
           ├── Channel notes (.arma/channels/<name>/notes.md)
           │     loaded from file on every message
           │     wrapped in === CHANNEL NOTES === delimiters
           │     agents read + append to this file
           │     seeded from .arma/core-notes.md template
           │
           └── System prompt (per-agent)
                 set at agent creation
                 can include tool definitions from MCP + built-in tools
                 
augmented input: "=== CHANNEL NOTES ===\n[fact] auth module uses JWT\n...\n
                  \n=== REMINDERS ===\n📝 check logging too\n...
                  fix the bug in auth.ts"
```

The augmented input is what the agent loop processes. The LLM sees notes
and reminders as part of the most recent user message, giving it full
context on every turn.

## Flows (ArmaFlow)

`.armaflow` files define multi-agent workflows. Format:

```
/name my-flow
/description What it does
/trigger manual
/budget 8.00

/spawn orchestrator "You are the orchestrator..."
Instructions for the orchestrator agent...
```

### Flow Runtime Execution

```
user runs "/flow run my-flow"
  → FlowRuntime.runFlow("my-flow")
    → reads .arma/flows/my-flow.armaflow
    → creates #flow-my-flow channel (log/status viewer)
    → registers channel in ChannelLifecycle
    
    → spawn workers as defined in flow:
        FlowContext.spawn(name, opts)
          → ChannelLifecycle.spawnChannelBackground(name)
            → creates .arma/channels/<name>/ with notes.css from parent
            → creates ChannelAgent with provider
            → seeds worker notes.md from parent channel notes
          → awaits agent ready
          → sends task instructions to worker
          
    → workers complete and report via report_complete tool
    → orchestrator collects results and continues flow steps
    → flow completion triggers output processing
```

### Flow Spawn Chain

```
flow
  └── #flow-audit (orchestrator channel, log viewer)
        ├── worker-dead-code-N (scans unreachable code)
        │     notes.md seeded from parent + task-specific instructions
        │     reads/writes own notes during execution
        │     calls report_complete when done
        │
        ├── worker-bug-hunter-N (finds logic bugs)
        │     same pattern — isolated context, own notes
        │
        ├── worker-perf-analyst-N
        └── worker-consistency-N
        
After all workers complete:
  orchestrator reads worker outputs
  synthesizes final report
  writes findings to flow channel
```

### Flow Commands

```
/spawn <name> <prompt>         Start a worker agent
/kill <name>                   Stop a running worker
/flow run <name>               Execute a .armaflow file
/flow list                     List available flows
/flow stop                     Stop the currently running flow
```

Workers use `report_complete`, `spawn_worker`, `send_message`,
and `ask_user` tools to communicate with the flow runtime.


## Key Integration Points

### armament ↔ iteratio
- `ChannelAgent` wraps iteratio's `AgentLoop`
- `ModelToLLMAdapter` implements armament's `ILLMProvider` interface
- Messages flow as `SimpleMessage[]` ↔ `Message[]` (iteratio type)
- Stream events flow as `AsyncGenerator<StreamEvent>`

### armament ↔ flight-controller
- `ModelToLLMAdapter` wraps flight-controller's `Model` instances
- `ProviderPool` creates/deduplicates providers via `getOrCreate`
- Context format: `OpenAIContext` with `messages: OpenAIMessage[]`
- Wire format varies by provider (OpenAI SDK, Bedrock SDK, etc.)

### Translator Architecture (flight-controller)

Each provider implements `IOpenAITranslator<NativeRequest, NativeResponse>`:

```
fromOpenAI(OpenAIContext) → NativeRequest     (internal → wire)
responseToOpenAI(NativeResponse) → ModelResponse (wire → internal)
```

The `OpenAIContext` is the universal intermediate format — all providers
convert to/from it. This means armament only speaks `OpenAIContext` and
doesn't need to know about provider-specific wire formats.

### Content Block Model

Messages carry `content: OpenAIContent[]` — a typed union of:
`text`, `image`, `audio`, `video`, `document`, `tool_call`,
`tool_result`, `thinking`, `cache_marker`

Each provider's content converter maps these to/from native content types.

## Provider Streaming

Each provider extends `Model` and can optionally override:

- `sendRequest(context)` → non-streaming response
- `sendStreamRequest(context)` → streaming AsyncGenerator

If `sendStreamRequest` is not overridden, the base class throws
"Streaming not implemented for {provider}/{model}". The
`ModelToLLMAdapter.invokeStream` checks `supportsStreaming` capability
and falls back to non-streaming if not supported.

## Two Config Systems (both active)

1. **SessionMenu** (old) — hierarchical menu, events: `config:change`, `config:save`
2. **ConfigPane** (new) — CRM list view, F2 to open, direct persistence

Both persist to `~/.armament/config.json` via `UserConfig` singleton.

## Channel Lifecycle

```
/join #name
  → ChannelLifecycle.joinChannel
  → ensures channel notes (.arma/channels/<name>/notes.md)
  → UserConfig lookup → ProviderPool.getOrCreate(driverType, model, opts)
  → creates ChannelAgent wrapping AgentLoop

/part #name
  → ChannelLifecycle.leaveChannel
  → shuts down agent, removes runtime, cleans up workers
  → removes notes dir (.arma/channels/<name>/)
  → removes from sidebar

/model model-id [provider]
  → ChannelLifecycle.switchChannelModel
  → shuts down existing agent
  → ProviderPool.getOrCreate (reuses cached or creates new)
  → creates new ChannelAgent with imported session state
```

## Provider Model

Each provider entry in config has:
- `type`: driver type (`bedrock` | `openai` | `anthropic` | `gemini` | `ollama`)
- `name`: user-editable display name (unique identifier, defaults to type)
- `models`: string array of model IDs
- Per-model settings stored as `model_<id>_<field>` on provider config

`ProviderPool` cache key: `${driverType}:${model}`. Cache invalidated when
API key, base URL, region, profile, or streaming flag changes.

## Notes System

Each channel gets `.arma/channels/<name>/notes.md` seeded from
`.arma/core-notes.md` template. Content is injected into agent context
on every message turn alongside sticky notes.

## Threading Model

Two modes:

1. **Direct (default)**: Agent runs in the main process. `ChannelAgent`
   wraps the iteratio `AgentLoop` directly.

2. **Threaded** (opt-in via config): Each agent runs in a `WorkerThread`
   via `AgentThreadEntry`. Communication uses a message protocol
   (`ThreadProtocol.ts`) with message types for tool calls, MCP, streaming,
   and subworkers.

`SubworkerManager` handles worker-of-worker spawning for hierarchical
agent trees. `ThreadCoordinator` manages the pool of thread workers.

## MCP Integration

MCP servers are managed by `McpManager`:
- Stdio servers (local processes)
- SSE servers (remote HTTP)
- Streamable HTTP (with OAuth2)

Servers are defined in config under `mcpServers`. On startup, configured
servers are connected and their tools become available to all agents.
Tool execution routes through `McpToolExecution` with retry/timeout logic.

