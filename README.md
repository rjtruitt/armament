# Armament

Multi-agent AI terminal with IRC-style channels, multi-provider routing, and scriptable workflows.

Armament is a terminal UI and orchestration layer for running multiple AI agents simultaneously. Each agent lives in its own channel (like IRC), can use different models/providers, and has access to tools (file I/O, shell, web, MCP servers, todo tracking, drift snapshots). It sits on top of [iteratio](https://github.com/rjtruitt/iteratio) (LLM abstraction) and provides the user-facing terminal, command dispatch, session management, and workflow engine.

---

## Quick Start

```bash
# Install globally
npm install -g armament

# Or from source
git clone https://github.com/rjtruitt/armament
cd armament && npm install && npm run build && npm link

# Start
armament
armament --theme ice        # With a specific theme
armament --debug            # Debug mode (mock providers)
```

Once running, you're in the `#armament` channel by default. Type messages to chat, use `/commands` for actions:

```
#armament> /spawn reviewer --model claude-sonnet
#armament> /join refactor
#refactor> Refactor the auth module to use middleware pattern
```

---

## Architecture

### Layer Stack

```
┌──────────────────────────────────────────────────────────────┐
│                       ARMAMENT (this repo)                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            Terminal UI (src/tui/)                       │  │
│  │  ScreenBuffer, MarkdownRenderer, Sidebar, InputBar,    │  │
│  │  FocusManager, CommandPalette, ConfigPane, StatusBar    │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │         App Layer (src/app/)                            │  │
│  │  ChannelLifecycle, ChannelManager, AgentManager,        │  │
│  │  MCP Manager, FlowRuntime, SessionState, EventBus,      │  │
│  │  PermissionStore, AuthManager, NudgeManager             │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │      Providers / Tools (src/providers/)                 │  │
│  │  ProviderPool, ChannelAgent, BuiltinToolDefs,           │  │
│  │  CrossChannelTool, NudgeTools, PlanModeTools            │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │     Scripting (src/scripting/)                          │  │
│  │  ArmaScript (aliases/macros), ArmaFlow (workflows)      │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │     Drift (src/drift/) — Snapshot system                │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  iteratio (LLM abstraction)                   │
│  Provider abstraction, streaming, retries, rate limiting,    │
│  token counting, model management, agent loop                │
└──────────────────────────────────────────────────────────────┘
```

### Source Directory Layout

| Directory | Responsibility |
|---|---|
| `src/app/` | Application shell: `ArmamentApp.ts` (entry), `createAppServices.ts` (DI wiring), `ChannelLifecycle.ts`, `FlowRuntime.ts`, `MCP manager`, `CommandDispatch`, `EventBus`, `SessionState`, `PermissionStore`, `NudgeManager`, `AuthManager`, TUI wiring |
| `src/tui/` | Terminal UI components: `ScreenBuffer` (double-buffered diff rendering), `MarkdownRenderer`, `Sidebar`, `InputBar`, `ConfigPane`, `FocusManager`, `CommandPalette`, `LoadingAnimator`, `MouseHandler` |
| `src/rendering/` | ANSI gradient renderer, color themes, banner rendering |
| `src/providers/` | `ProviderPool` (LLM provider pool), `ChannelAgent` (agent per channel), `BuiltinTools` (default tool defs), `CrossChannelTool`, `NudgeTools`, `PlanModeTools`, `CatalogAdapter`, `ProviderRegistry` |
| `src/scripting/` | `ArmaScript` (`.arma` alias/trigger engine), `ArmaFlow` (`.armaflow` DAG workflow engine with parallel execution + approval gates) |
| `src/drift/` | `DriftManager` (git tag-based snapshot system), `DriftTools` (available to agents), multi-project support |
| `src/config/` | `UserConfig` singleton — reads/writes `~/.armament/config.json` |
| `src/session/` | Session persistence, context save/load |
| `src/plugins/` | `PluginLoader`, `PluginRegistry` — install plugins from git or local paths |
| `src/threads/` | `ThreadCoordinator`, `SubworkerManager`, `AgentThreadEntry` — multi-agent threading |
| `src/core/` | Shared interfaces, `KeyboardNav`, `InputHandler`, `CommandHandler`, `PluginRegistry`, `ScriptEngine`, `HealthMonitor`, `BudgetManager`, `ChannelManager`, `AgentManager`, `ContextManager` |
| `src/a2a/` | Agent-to-agent: `TaskTools`, `WorkerTools`, `CompletionManager`, `TaskRuntime` |
| `src/debug/` | `DebugMode`, `MockDriftManager`, `MockSessionPersistence`, `MockCompletionManager` |

### Key Files

| File | Role |
|---|---|
| `src/index.ts` | CLI entry point — parses args, boots `ArmamentApp`, optionally starts web UI |
| `src/app/ArmamentApp.ts` | Main app class — extends `ReplPublicAPI`, wires channels, agents, MCP, flows |
| `src/app/createAppServices.ts` | Factory that wires all ~20+ services (DI in one place) |
| `src/app/ChannelLifecycle.ts` | Channel creation, agent spawning, lifecycle management |
| `src/app/FlowRuntime.ts` | Workflow runtime — triggers, queue, execution |
| `src/app/TuiRenderer.ts` | TUI render loop — manages screen layout, key handling, painting |
| `src/app/SessionState.ts` | Session persistence — messages, tokens, cost, budget tracking |
| `src/app/CommandDispatch.ts` | Slash command registry and dispatch |
| `src/app/McpManager.ts` | MCP server lifecycle — stdio, SSE, HTTP with OAuth2 |
| `src/tui/ScreenBuffer.ts` | Double-buffered screen with diff-based rendering |
| `src/tui/MarkdownRenderer.ts` | Markdown → ANSI rendering with syntax highlighting |
| `src/providers/ChannelAgent.ts` | Agent per channel — wraps iteratio's agent loop |
| `src/providers/ProviderPool.ts` | Pool of LLM providers with rate limiting |
| `src/providers/BuiltinToolDefs.ts` | Default tool definitions available to agents |
| `src/scripting/ArmaScript.ts` | `.arma` script engine — aliases, triggers, keybindings |
| `src/scripting/ArmaFlow.ts` | DAG workflow engine — spawn, chain, wait, gate |
| `src/drift/DriftManager.ts` | Snapshot system — git tags via `git stash create` |
| `src/config/UserConfig.ts` | User config singleton (providers, models, theme, budget) |

---

## Key Decisions & Patterns

### Why TypeScript with Node.js?
TypeScript gives us type safety across a large codebase, and Node.js provides the event loop model needed for multiple concurrent agent channels without thread coordination overhead.

### Why IRC-style channels?
Each channel = an independent agent with its own context, tools, and model config. Channels are isolated but can communicate via cross-channel tools. This maps naturally to the problem of running multiple AI agents side-by-side.

### Provider abstraction via iteratio
All LLM providers (Bedrock, Anthropic, OpenAI, Gemini, Ollama, OpenRouter, Replicate) are handled through the `iteratio` package, which provides a unified streaming API, retry logic, and token counting. Armament itself only deals with `ProviderPool` and `ChannelAgent` — it doesn't know provider details.

### Service wiring in one place
`createAppServices.ts` is a single factory function that instantiates and wires all ~20+ services (catalog, drift, MCP, channels, threads, flows, etc.). This avoids circular dependencies and makes the dependency graph explicit. The `AppHost` interface defines what callbacks the app shell provides to services.

### ScreenBuffer diff rendering
The TUI uses a double-buffered `ScreenBuffer` that computes diffs (character-level + attribute-level) between frames. Only changed cells are written to the terminal, minimizing flicker and escape code output. This is essential for a responsive terminal UI.

### Drift is snapshot-only (not worktrees)
Drift was originally a full `git worktree` system for parallel edits. After evaluation, it was simplified to **snapshot-only**: `git stash create` + git tags. No worktrees, no dual-write, no merge/rebase tools. The result is a lightweight reference history — save state before risky edits, rollback if things break. Supports multiple external project repos via `drift_add_project`.

### Config is layered
Settings flow: CLI args → `UserConfig` (file) → defaults. The sidebar config panes (`@providers`, `@session`, `@mcp`, etc.) read/write directly to `UserConfig`. Dead config (rate limit, max retries, agent/swarm/output subsystems that were never read by logic) has been removed.

### Budget warning fires in-channel
When session cost exceeds `budgetAmount`, a warning message is sent to the user's active channel. This required tracking budget state across restarts (cost persists in session state, but the "already warned" flag resets on restart to avoid false positives).

---

## How to Use

### Basic commands

```
/join <name>              Create/switch to channel
/spawn <name>             Spawn agent on current channel
/kill <name>              Stop an agent
/msg <agent> <text>       Send message to specific agent
/model <model>            Switch model on current channel
/list                     List all channels/agents
/whois <agent>            Show agent info (model, tokens, cost)
/nick <name>              Rename current agent
/topic <prompt>           Set system prompt for current channel
/compact                  Compress context window
/save_context             Checkpoint current session
/load_context <name>      Restore a saved context
/cost                     Token usage and cost breakdown
/status                   Session stats
/set <key> <value>        Set a config value
/mcp add <name>           Connect an MCP server
/flow run <name>          Run a .armaflow workflow
/drift snapshot           Save a git snapshot
/drift snapshots          List snapshots
/drift rollback <hash>    Restore from snapshot
/quit                     Exit
```

### Configuration

Edit `~/.armament/config.json` or use the sidebar config panes (`@providers`, `@session`, `@mcp`):

```json
{
  "providers": [
    {
      "type": "bedrock",
      "region": "us-west-2",
      "profile": "default",
      "models": ["us.anthropic.claude-sonnet-4-5-20250929-v1:0"]
    }
  ],
  "defaultModel": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "theme": "ice",
  "budget": 5.00
}
```

### Themes

8 built-in themes: `red`, `fire`, `ice`, `green`, `purple`, `synthwave`, `midnight`, `pro`, `random`.

### Scripting

**`.arma` files** — aliases, triggers, keybindings, macros. Place in `~/.armament/scripts/`.

**`.armaflow` files** — multi-agent DAG workflows with parallel execution, wait/chain nodes, and approval gates.

---

## How to Extend

### Adding a new tool for agents
1. Create a class implementing `ITool` (from `iteratio`) with `name`, `description`, `schema` (zod), and `execute()`.
2. Register it in `BuiltinToolDefs.ts` or via the catalog system.

### Adding a new slash command
1. Add the command handler to `src/app/commands/` (follow existing patterns like `getSessionCommands`, `getIrcCommands`).
2. Register it in `CommandDispatch.ts`.

### Adding a new config panel
1. Add schema rows in `TuiConfigSchemas.ts` or `TuiConfigSchemasExt.ts`.
2. Add config path mappings in `handlePaneConfigChange` in `TuiConfigPanes.ts`.
3. Wire save/load through `UserConfig`.

### Adding a new LLM provider
Handle it in `iteratio` (the LLM abstraction layer). Armament auto-discovers providers from the `ProviderPool`.

### Adding a new theme
Add to the theme list in `src/rendering/` and update the theme names array in `src/index.ts`.

### Plugin system
Plugins can add commands (aliases/macros) and reference data. Install via:

```
/plugin install <git-url|local-path>
```

See `src/plugins/PluginLoader.ts` and `PluginRegistry.ts`.

---

## Project Dependencies

| Package | Role |
|---|---|
| [iteratio](https://github.com/rjtruitt/iteratio) | LLM abstraction layer (providers, streaming, retries) |
| [iteratio-plugin-tools](https://github.com/rjtruitt/iteratio-plugin-tools) | Additional tool catalogs (git, web, data, infra, pentest, monitoring) |
| terminal-kit | Terminal rendering engine (raw TTY, screen buffer) |
| commander | CLI argument parsing |
| zod | Runtime schema validation for tools |

## License

MIT
