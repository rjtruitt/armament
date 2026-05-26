# Workflows (ArmaFlow)

`.armaflow` files define multi-step, multi-agent workflows. Stored in
`.arma/flows/`, executed via `/flow run <name>`.

## Complete Example

```
/name code-audit-swarm
/description Parallel audit with fake-context seeding
/trigger manual
/budget 8.00

# Phase 1: Spawn 4 specialists in parallel
/parallel
  /spawn dead-code "Scan for dead exports..."
  /spawn bug-hunter "Find logic bugs..."
  /spawn perf-analyst "Find performance problems..."
  /spawn consistency-checker "Find contract mismatches..."
/end

# Phase 2: Wait for all to finish
/join dead-code bug-hunter perf-analyst consistency-checker

# Phase 3: Fake-context injection (seed pretends the synthesizer
#          already gathered the data itself)
/spawn synthesizer
/seed synthesizer assistant "I've dispatched 4 specialists..."
/collect dead-code bug-hunter perf-analyst consistency-checker -> synthesizer

# Phase 4: Give real instruction
/msg synthesizer "All reports above. Deduplicate, rank by severity..."
/wait synthesizer complete
/log "Swarm audit complete"
```

## Flow Commands

| Command | Description |
|---------|-------------|
| `/spawn <name> "<task>"` | Create agent channel, send task prompt |
| `/spawn <name>` | Create agent channel (no task, starts idle) |
| `/chain <A> -> <B>` | Pipeline: A's output becomes B's context |
| `/wait <name> complete` | Pause until agent calls report_complete |
| `/join [a, b, c]` | Wait for ALL named agents to finish |
| `/pipe <script>` | Transform data through external script |
| `/msg <target> "text"` | Send message to an agent |
| `/seed <name> <role> <msg>` | Inject fake history (role: user/assistant) |
| `/collect [a, b] -> c` | Buffer A+B results, forward to C |
| `/approve "question?"` | Pause for human approval gate |
| `/sleep 5000` | Wait N milliseconds |
| `/log "text"` | Write to flow log channel |
| `/set var value` | Set a flow variable |
| `/emit event data` | Emit a flow event |
| `/complete` | Define structured output schema for chain |
| `/parallel` | Start parallel block |
| `/end` | End parallel block |

## Patterns

### Swarm (parallel fan-out)

```
/parallel
  /spawn agent-a "Task..."
  /spawn agent-b "Task..."
  /spawn agent-c "Task..."
/end
/join agent-a agent-b agent-c
```

All spawns happen concurrently. `/join` waits until every agent completes.

### Chaining with Structured Output

```
/chain researcher -> writer
  /complete --purpose "Research → documentation pipeline"
    /field key_findings string[] required "Main discoveries"
    /field confidence enum(low,medium,high) required "Rating"
    /field sources string[] "Reference URLs"
```

The `/complete` block auto-generates a `report_complete` tool with the
schema's fields. The agent must fill them in before reporting done.
Supports flags:
- `--purpose "..."` — informs the agent what the output is for
- `--sticky true/false` — whether to inject field descriptions as sticky note
- `--sticky_description "..."` — custom nudge text
- `--pipe ./script.py` — pipe structured output through external script
- `/field name type required "description"` — typed fields

Types: `string`, `string[]`, `number`, `boolean`, `enum(a,b,c)`

### Fake Context Injection (/seed + /collect)

Used to make a downstream agent think it already has context:

```
/spawn synthesizer                     # starts with no task
/seed synthesizer assistant "..."      # injects assistant message into history
/collect specialist-a specialist-b -> synthesizer  # buffers results as user msgs
/msg synthesizer "Now synthesize..."   # final instruction
/wait synthesizer complete
```

`/seed` injects fake message history (role: user or assistant). The agent
sees it as real conversation context. `/collect` buffers completed agent
results and forwards them as if they were gathered naturally.

### Approval Gates

```
/spawn reviewer "Audit the changes..."
/wait reviewer complete
/approve "Deploy to production?"
```

The flow pauses until the operator responds Yes/No. If denied, the flow
stops. Multiple approval gates can be placed at any point in the flow.

### Pipe (external data transformation)

```
/complete --pipe ./format-results.py
```

After the agent reports complete, the structured output is piped through
the script's stdin. The script's stdout replaces the result. Handy for
JSON transformations, validation, or format conversion.

## Agent Tools in Flow Context

Agents spawned by flows get additional A2A tools:

| Tool | Signature | Purpose |
|------|-----------|---------|
| `report_complete` | `(output)` | Signal done, send structured result |
| `ask_user` | `(question)` | Ask the operator a Yes/No question |
| `send_message` | `(target, message)` | Send message to another agent |
| `spawn_worker` | `(name, task, model?)` | Create a sub-agent |
| `await_worker` | `(workerId)` | Wait for sub-agent to finish |
| `get_workers` | `()` | List my running sub-agents |
| `cancel_worker` | `(workerId)` | Kill a stuck sub-agent |

## Report Complete & Sticky Nudge

When a flow spawns an agent with a task, it:
1. Registers `report_complete` tool with the output schema
2. Adds a **sticky note** (position: bottom) reminding the agent to use it:

   > "When you are 100% done with your task, call report_complete with
   > your structured output..."

The sticky stays on every message the agent receives, so it can't forget.
If the agent goes idle without calling report_complete, the **idle nudge**
kicks in after 60 seconds:

   > "You appear to be done but haven't called report_complete yet..."

The nudge repeats every 60s until the agent either calls report_complete
or starts working again. The nudge interval is cleared on completion.

## Zombie Detection (TaskRuntime)

At the A2A layer, `TaskRuntime` independently monitors all workers:
- Checks every 5 seconds for inactivity
- If a worker exceeds `zombieThresholdMs` without progress, sends a nudge
- If still unresponsive after nudge, fires `onWorkerError` with timeout
- Marked as nudged in `nudgedWorkers` set to avoid repeat nudges

## Execution Model

```
/flow run my-flow
  → FlowRuntime.runFlow("my-flow")
    → reads .arma/flows/my-flow.armaflow
    → creates #flow-my-flow channel (status log)
    → registers in ChannelLifecycle
    → ArmaFlowExecutor.executeCommands()
      → sequential commands run top-to-bottom
      → parallel blocks run all branches concurrently
      → /join waits for ALL named agents to complete
      → /wait pauses for completion promise
      → /approve blocks on user response
      → /pipe spawns subprocess, feeds stdin, reads stdout
```

## Worker Lifecycle

```
spawn → agent creates + notes.md seeded → task sent
  → agent works (calls tools, generates responses)
  → [60s idle] → nudge to call report_complete
  → agent calls report_complete(structured_output)
    → result buffered in resultBuffer[name]
    → sticky nudge cleared
    → flow continues (wait/join resolves)
```

## Flow Channel

`#flow-<name>` logs every step in real-time:
- Step start/completion
- Worker output previews
- Pipe transformations and exit codes
- Approval requests and responses
- Nudges sent to idle agents
- Final execution summary with duration

Workers appear as children of the flow channel in the sidebar.
Completed/failed agents are cleaned up on flow completion.
