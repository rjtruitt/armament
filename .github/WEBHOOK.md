# Web API Reference

Available when running `arma --web`. Server on `http://localhost:3584`.
Use any HTTP client to test armament programmatically.

## REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/channels` | List all channels |
| `GET` | `/api/channels/:name/messages` | Get channel message history |
| `POST` | `/api/channels/:name/messages` | Send a message `{"content":"hi"}` |
| `GET` | `/api/config` | Full config with providers |
| `PUT` | `/api/config` | Update config `{"providers":[...]}` |
| `GET` | `/api/channels/:name/notes` | Get channel notes content |
| `PUT` | `/api/channels/:name/notes` | Save channel notes `{"content":"..."}` |
| `GET` | `/api/flows` | List available .armaflow files |
| `POST` | `/api/flows/:name/run` | Execute a flow |

## WebSocket

Connect to `ws://localhost:3584/ws`. Receives `init` on connect,
then streams events: `message`, `config:change`.

## Testing

```bash
# Server alive
curl -s -o /dev/null -w "%{http_code}" http://localhost:3584

# Send a message
curl -X POST http://localhost:3584/api/channels/%23general/messages \
  -H 'Content-Type: application/json' -d '{"content":"hello"}'

# Read messages
curl http://localhost:3584/api/channels/%23general/messages | jq '. | length'

# List providers
curl http://localhost:3584/api/providers

# Read notes
curl http://localhost:3584/api/channels/%23general/notes

# Save notes
curl -X PUT http://localhost:3584/api/channels/%23general/notes \
  -H 'Content-Type: application/json' -d '{"content":"[fact] project uses TypeScript"}'

# List flows
curl http://localhost:3584/api/flows

# WebSocket test (requires websocat)
# websocat ws://localhost:3584/ws
```
