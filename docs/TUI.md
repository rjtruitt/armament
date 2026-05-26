# Terminal UI (TUI)

## Screen Layout

```
┌─ Sidebar ──┬─ Main Content Area ───────────────────────┐
│ #general   │  [USER MESSAGE]                            │
│ #dev       │  hello world                              │
│ @config    │                                            │
│            │  [ASSISTANT RESPONSE]                      │
│ providers  │  Hi! I'm Armament. How can I help?        │
│  openai    │                                            │
│  deepseek  │                                            │
│            │                                            │
│ scheduler  │                                            │
│            │                                            │
├────────────┴────────────────────────────────────────────┤
│ F1 Help │ F2 Config │ F3 MCP │ F4 Agents │ F5 Theme    │
├────────────────────────────────────────────────────────┤
│ > /model deepseek-chat                                  │
└────────────────────────────────────────────────────────┘
```

## Regions

Managed by `LayoutManager` (`src/tui/LayoutManager.ts`):

| Region | File | Purpose |
|--------|------|---------|
| Sidebar | `Sidebar.ts`, `SidebarRenderer.ts` | Channel list, provider tree, MCP servers |
| Main | `ChatRenderer.ts` | Message history, tool blocks |
| Input | `InputBar.ts` | Text input with history, tab-completion |
| Status | `StatusBar.ts` | Provider/model display, cost, agents |
| F-Keys | `TuiPainter.ts` | F1-F10 shortcut bar |

## Input Processing

```
stdin bytes
  → TuiInputHandler.onStdin()
    → tokenizes escape sequences
    → routes to appropriate handler:
      → handlePaneKey()   if active @channel and not sidebar-focused
      → handleApprovalKey()  if approval modal is open
      → handleFKey()     F1-F10
      → handleSidebarKey()  if sidebar focused
      → inputBar.handleKey()  character input
```

## Config Pane

Two overlapping UIs, both persist to `~/.armament/config.json`:

1. **SessionMenu** (`src/tui/SessionMenu.ts`) — hierarchical menu with arrow keys,
   inline editing. Events: `config:change`, `config:save`, `menu:complete`.
2. **ConfigPane** (`src/tui/ConfigPane.ts`) — CRM-style list view with sortable
   columns, filter, detail split. Opened via F2.

Bridges:
- `TuiConfigHandler` — SessionMenu events → UserConfig
- `TuiConfigPanes` — ConfigPane edits → UserConfig

## Rendering Pipeline

```
TuiRenderer.render()
  → SidebarRenderer.render()     — channel list + provider tree
  → ChatRenderer.render()        — messages + tool blocks
  → InputBar.render()            — text input
  → StatusBar.render()           — model/status line
  → renderSelectionOverlay()     — reverse-video highlight
  → CommandPalette.render()      — filter overlay (if visible)
  → F-key bar render             — bottom shortcut bar
  → ScreenBuffer.flush()         — write escape sequences to stdout
```

## Mouse Handling

`MouseHandler` (`src/tui/MouseHandler.ts`) parses SGR mouse sequences.
`TuiMouseController` (`src/app/TuiMouseController.ts`) handles:
- Click → sidebar navigation, tool block toggle, selection start
- Drag → text selection, sidebar resize
- Scroll → chat history scroll
- Right-click → disabled (native terminal menu suppressed in SGR mode)
- Shift+drag → native terminal selection (bypasses SGR)

## Focus Manager

`FocusManager` (`src/tui/FocusManager.ts`) manages keyboard focus between:
input, sidebar, main, palette, approval. Tab cycles forward, Shift+Tab cycles back.
