# Session persistence

## Files

| File | Role |
|------|------|
| `src/session/interfaces/ISessionPersistence.ts` | Types: IChannelStateFile, IManifest |
| `src/app/ChannelLifecycle.ts` | persistChannelState(), resumeChannel() |
| `src/session/persistence/SessionBridge.ts` | Glue between live agents and persistence |

## Data stored

- `IChannelStateFile.messages[]` — each message: id, role, content, timestamp, tool_call_id?, tool_calls?
- `chatMessages[]` — TUI display messages (type, sender, content, timestamp)
- `agentConfig` — model, provider, active tools
- `manifest.json` — per-channel state file paths, global config

## Known issues

- tool_call_id was missing from serialization (fixed) — broke session resume with OpenAI
