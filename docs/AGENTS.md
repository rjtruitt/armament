# AGENTS.md — Armament

> See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full cross-repo architecture
> covering armament, flight-controller, and iteratio.
> See [TUI.md](./TUI.md) for screen layout, input processing, and rendering pipeline.
> See [CHANNELS.md](./CHANNELS.md) for channel lifecycle, agent loop, and context injection.
> See [WORKFLOW.md](./WORKFLOW.md) for flow command reference and execution model.
> See [WEBHOOK.md](./WEBHOOK.md) for REST/WS API reference (arma --web).
> See [WEB_TESTING.md](./WEB_TESTING.md) for curl-driven test suite (arma --web).
> See [WEBUI.md](./WEBUI.md) for React component tree and WebSocket protocol.
> See [DRIFT.md](./DRIFT.md) for git-worktree-based channel isolation and drift tracking.

## Keeping Docs in Sync

The `../armament-site` repo has user-facing docs. When you ADD, CHANGE, or
REMOVE a feature, update the corresponding site doc too:

| Code Area | Site Doc |
|-----------|----------|
| Config UI, persistence, provider config | `src/content/docs/configuration.md` |
| Channel lifecycle, /join, /part, /model | `src/content/docs/session-lifecycle.md` |
| Flows, /chain, /complete, /pipe | `src/content/docs/workflows.md` |
| MCP servers, MCP tools | `src/content/docs/mcp.md` |
| Scripting, aliases, macros | `src/content/docs/scripting.md` |
| Drift, git worktrees | `src/content/docs/drift.md` |
| Theme system, gradient rendering | `src/content/docs/themes.md` |
| ProviderPool, flight-controller | `src/content/docs/flight-controller.md` |
| iteratio, agent loop | `src/content/docs/iteratio.md` |
| New feature, major section | Add a new doc + update `getting-started.md` |

Check `../armament-site/src/content/docs/` for the full list.
If the site uses features that no longer exist, REMOVE them from the doc.
The source of truth is the code, not the site.

## Commands

```bash
npx tsc --noEmit          # type-check only (no output)
npx tsc                   # compile src/ → dist/
npm run dev               # run via tsx (no compile needed)
npm run test              # vitest run
npm run test:watch        # vitest in watch mode
node dist/index.js        # run compiled app
npm run build             # same as `npx tsc`
```

Run a single test:
```bash
npx vitest run src/__tests__/path/to/test.test.ts
```

There is **no lint or format script**. Only type-checking and tests.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full cross-repo architecture
(armament + flight-controller + iteratio data flow, provider model, channel lifecycle).

Armament's src/ layout:

```
src/
  app/          Wiring: TuiRenderer, ConfigHandler, ConfigPanes, MCP, commands
  core/         Framework: agents, channels, events, scripting, session, health
  config/       UserConfig singleton — persists to ~/.armament/config.json
  providers/    ProviderPool, registry, ModelToLLMAdapter
  tui/          Screen buffer, SessionMenu, ConfigPane, sidebar, widgets
  rendering/    ANSI rendering, themes, markdown
  drift/        Git worktree per channel
  plugins/      Plugin definitions
  scripting/    Script engine
  a2a/          Agent-to-agent protocols
  session/      Session persistence interfaces
```

Entry point: `src/index.ts` → `ArmamentApp` (`src/app/ArmamentApp.ts`).
Binary name: `arma`.
ES modules (`"type": "module"`), `moduleResolution: "NodeNext"`, target ES2022.

## Dependencies from parent directory

Three packages are local file deps outside this repo:
- `flight-controller` (`../flight-controller`) — provides `BedrockProvider`, `OpenAIProvider`, `ModelIdentity`, etc.
- `iteratio` (`../iteratio`) — agent execution loop
- `iteratio-plugin-tools` (`../iteratio-plugin-tools`)

These must exist on disk relative to armament to install/build.

## Two config systems (both active)

1. **SessionMenu (hierarchical)** — `src/tui/SessionMenu.ts` + `src/tui/session-menu/panels/*.ts`. Arrow-key nav, inline editing, save via submenu actions. Events: `config:change`, `config:save`, `menu:complete`.
2. **ConfigPane (CRM list view)** — `src/tui/ConfigPane.ts` + `src/app/TuiConfigSchemas.ts`. F2 to open. Columns/sort/filter/detail split view. Changes flow through `TuiConfigPanes.handlePaneConfigChange()`.

Both must persist to `~/.armament/config.json` via `UserConfig`.

Bridge: `TuiConfigHandler` (SessionMenu → UserConfig) and `TuiConfigPanes` (ConfigPane → UserConfig).

## Key files

| File | Role |
|---|---|
| `src/config/UserConfig.ts` | Singleton config, persists to `~/.armament/config.json` |
| `src/providers/ProviderPool.ts` | Creates provider instances for bedrock, openai, anthropic, gemini, ollama |
| `src/app/TuiConfigHandler.ts` | SessionMenu events → UserConfig persistence |
| `src/app/TuiConfigPanes.ts` | ConfigPane onChange → UserConfig persistence |
| `src/app/TuiConfigSchemas.ts` | CRM list view schemas for providers, models, MCP, scheduler |
| `src/tui/session-menu/panels/providers.ts` | SessionMenu provider panel definitions |
| `src/core/interfaces/IProviderConfig.ts` | `ProviderType` and `IProviderConfig` types |
| `src/tui/SessionMenu.ts` | Core menu class — panel stack, navigation, edit state |

## Provider types

Supported: `bedrock`, `openai`, `anthropic`, `gemini`, `ollama`.
The `openai` type covers DeepSeek, OpenRouter, and any OpenAI-compatible endpoint.

## Config persistence gotchas

- `TuiConfigPanes.handlePaneConfigChange` maps `authType` → `auth` via fieldMap (line 274). Add entries there when adding provider detail fields with different names.
- `TuiConfigHandler.saveNewProvider` has **no fieldMap** — it uses raw field suffixes from the SessionMenu form. If a form field name differs from the `IProviderConfig` key, it won't save correctly. The SessionMenu provider forms use `endpoint` and `host` for some provider types, but `IProviderConfig` uses `baseUrl`.
- `TuiConfigHandler.handleConfigChange` only persists these SessionMenu paths: `display.theme`, `models.default`, `providers.*.settings.defaultModel`, remove/delete actions, and MCP field changes. Other SessionMenu settings edits (e.g. `providers.*.settings.baseUrl`) are **not** persisted by this handler — they must go through ConfigPane.

## UserConfig writes to disk on every set()

`UserConfig.set()` calls `save()` to disk every time. If a test calls `UserConfig.set()` without `setNoPersist(true)`, it will corrupt the user's real `~/.armament/config.json`. The global vitest setup calls `UserConfig.instance().setNoPersist(true)`, but **any new test file that uses UserConfig before the setup runs, or outside vitest, silently destroys config**.

## Sidebar: duplicate render code

Two files render sidebar navigation, and they aren't synced:
- `src/tui/Sidebar.ts` — `getItemsForSection()` and `getAllNavigableItems()` generate the item lists.
- `src/tui/SidebarRenderer.ts` — has additional hardcoded entries (e.g. `@models` was removed from Sidebar.ts but still rendered because SidebarRenderer.ts had its own copy).

**When adding, removing, or renaming a sidebar entry, grep and update BOTH files.**

## Test setup

Test file: `src/__tests__/setup.ts` — calls `UserConfig.instance().setNoPersist(true)` to prevent tests from writing to `~/.armament/config.json`.
Tests: `src/__tests__/**/*.test.ts`, using vitest.

## Hard rules

- **Tests match the code, never the reverse.** Agents default to reverting code changes when tests fail — they will undo edits they just made. When a code change is correct but a test breaks, **update the test assertions**. Do not revert the code. Look at what the test expects vs. what the code now does, and fix the test.
- **Models are children of providers.** There is no top-level models panel. Models live under each provider (press 'm' on a provider row in ConfigPane, or navigate `providers.<type>.models` in SessionMenu). Never create a standalone models view.
- **Provider name is a user-editable display name** (defaults to provider type). Provider rows show `name`, not `type`.
- **Config changes must persist to `~/.armament/config.json`** via UserConfig. If an edit doesn't save, the persistence routing or schema field definition is wrong.

## Other

- `dist/` may contain stale output — run `npx tsc` after source changes to rebuild.
- `make binary` bundles a portable launcher via esbuild (CJS bundle with import-meta shim).
- `.arma/sessions/` and `.arma/.drift/` are git-ignored runtime directories.
