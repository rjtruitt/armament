# TUI layer

## Files

| File | Role |
|------|------|
| `src/app/TuiRenderer.ts` | Main TUI loop — render, handleSubmit, stop |
| `src/app/TuiInputHandler.ts` | Raw stdin parsing, key mapping, tokenization |
| `src/app/TuiWiring.ts` | Wires deps into TuiOptions |
| `src/app/TuiChannelHelpers.ts` | Tool block rendering, streaming re-render |
| `src/app/TuiContentPainter.ts` | Screen layout — sidebar, chat, input bar, modals |
| `src/tui/ChatRenderer.ts` | IRC-style message formatting per type |
| `src/tui/InputBar.ts` | Text input, history, completions, submit |

## Input flow

stdin → TuiInputHandler.tokenize() → processKey() → InputBar.handleKey() → submit() → emit → TuiRenderer.handleSubmit() → opts.onSubmit() → ArmamentApp.handleInput()

## Known issues

- Some terminals send \r\n instead of \r for enter — tokenizer treats \r\n as single token
- ChatRenderer had maxLines=40 cap on agent messages (fixed — now only tool results truncate)
