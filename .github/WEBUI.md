# Web UI Architecture

```
armament-web-ui/
  src/server/           Express + WebSocket server
    index.ts            startWebServer(deps, opts) — accepts ArmamentDeps
                        Standalone mode when run directly

  src/client/           React 19 SPA (Vite)
    index.html          Entry point
    src/App.tsx          Root: WS connection, state, page routing
    src/main.tsx         ReactDOM mount

    components/
      Sidebar.tsx        Channel list, flow channels, provider tree, nav
      WelcomeView.tsx    Landing page with quick-start buttons

    channels/
      ChatView.tsx       Message list, input bar, thinking block toggle,
                         inline notes panel (side-by-side)

    config/
      ConfigView.tsx     Provider CRUD, model management, type/region/streaming

    flows/
      FlowsView.tsx      Flow library grid, run button, execution log

    notes/
      NotesView.tsx      Full-screen notes editor with save indicator
```

## WebSocket Protocol

```
Client connects → Server sends:
  { type: "init", channels: [...], messages: {...}, config: {...} }

On each event → Server broadcasts:
  { type: "message", channel: "#name", message: {...} }
  { type: "config:change", config: {...} }
```

## React Component Tree

```
<App>
  <Sidebar>
    Channels section
    Flows section
    Nav: Config, Flow Library
    Provider status list
  </Sidebar>

  <WelcomeView>           / route
  <ChatView>              channel route
    Message list with:
      - Text bubbles
      - Togglable thinking/reasoning blocks
      - Tool call displays
    Input bar
    Inline notes panel (side panel toggle)
  </ConfigView>           config route
    Provider cards (add/delete/edit)
    Model chips (add/remove)
    Settings tab (placeholder)
  <FlowsView>             flows route
    Flow grid with run buttons
    Execution log panel
  <NotesView>             notes route
    Full editor + save
    Usage instructions
```

## State Management

- WebSocket receives `init` with full state on connect
- Messages pushed via `message` events
- Config changes via `config:change` events
- No client-side caching — server is source of truth
- React updates via `useState` + prop drilling (no external lib needed yet)

## Key Differences from TUI

| Feature | Terminal TUI | Web UI |
|---------|-------------|--------|
| Message list | Scrollable buffer | Infinite scroll |
| Thinking blocks | Inline | Togglable collapsible |
| Notes editing | File-based | Inline editor with save |
| Provider config | ConfigPane forms | Inline editable cards |
| Model chips | Deep navigation | Inline add/remove |
| Flow execution | Flow channel | Grid + log panel |
| Sidebar | Fixed sections | Collapsible sections |
| Input | Single line | Full input with keyboard support |
| Mouse | SGR mode limited | Full click interactions |
