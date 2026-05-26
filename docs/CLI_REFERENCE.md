# CLI Reference

Complete reference for Armament command-line interface.

## Command-Line Flags

### Basic Usage

```bash
npm start [options]
arma [options]  # When installed globally
```

### Options

#### `--setup`

Launch the interactive setup wizard.

```bash
npm start -- --setup
```

#### `--provider <name>`

Specify the LLM provider to use.

**Options**: `anthropic`, `openai`, `bedrock`, `gemini`, `ollama`, `openrouter`, `replicate`

```bash
npm start -- --provider openai
```

#### `--model <model-id>`

Specify the model to use. Format varies by provider.

```bash
npm start -- --model claude-sonnet-4-20250514
npm start -- --model gpt-4-turbo
npm start -- --model llama3.1
```

#### `--theme <name>`

Set the visual theme.

**Options**: `ansi`, `red`, `fire`, `ice`, `pro`

```bash
npm start -- --theme ice
```

#### `--prompt <text>`

Run a single prompt and exit (non-interactive mode).

```bash
npm start -- --prompt "Explain quantum computing"
```

#### `--no-tui`

Disable the terminal UI for simple text output.

```bash
npm start -- --no-tui
```

#### `--config <path>`

Use a custom configuration file.

```bash
npm start -- --config /path/to/config.json
```

#### `--log-level <level>`

Set logging verbosity.

**Options**: `debug`, `info`, `warn`, `error`

```bash
npm start -- --log-level debug
```

#### `--width <number>`

Set terminal width for text wrapping.

```bash
npm start -- --width 100
```

#### `--help`, `-h`

Show help information.

```bash
npm start -- --help
```

#### `--version`, `-v`

Show version information.

```bash
npm start -- --version
```

## REPL Commands

Commands available in the interactive REPL.

### Agent Management

#### `/join <name>`

Create or switch to an agent channel.

```
/join researcher
```

#### `/spawn <name>`

Spawn a new agent in its own channel.

```
/spawn coder
```

#### `/part [name]`

Leave/close the current channel or specified channel.

```
/part
/part researcher
```

#### `/list`

List all active channels and agents.

```
/list
```

#### `/switch <n>`

Switch to channel number n.

```
/switch 1
/switch 2
```

**Keyboard shortcut**: `Alt+1` through `Alt+9`

#### `/msg <agent> <text>`

Send a message to a specific agent.

```
/msg coder Implement the researcher's findings
```

#### `/whois <agent>`

Show agent statistics (model, tokens, cost).

```
/whois researcher
```

#### `/kill <agent>`

Terminate a running agent.

```
/kill researcher
```

### Session Management

#### `/help`

Show help information.

```
/help
```

#### `/quit`, `/exit`

Exit Armament.

```
/quit
```

#### `/clear`

Clear the screen.

```
/clear
```

#### `/status`

Show session status (active agents, budget usage, etc.).

```
/status
```

#### `/cost`

Show detailed budget usage and costs.

```
/cost
```

### Configuration

#### `/model <name>`

Switch to a different model.

```
/model gpt-4-turbo
/model claude-opus-4-20250514
```

#### `/theme <name>`

Change the color theme.

```
/theme ice
/theme pro
```

#### `/config`

Show current configuration.

```
/config
```

### Tools and MCP

#### `/tools`

List available tools.

```
/tools
```

#### `/mcp list`

List connected MCP servers.

```
/mcp list
```

#### `/mcp add <name> <command> [args...]`

Add an MCP server.

```
/mcp add filesystem npx @modelcontextprotocol/server-filesystem /path/to/dir
```

#### `/mcp remove <name>`

Remove an MCP server.

```
/mcp remove filesystem
```

### Context Management

#### `/save_context <name>`

Save the current conversation context.

```
/save_context my_project
```

#### `/load_context <name>`

Load a saved context.

```
/load_context my_project
```

#### `/list_contexts`

List all saved contexts.

```
/list_contexts
```

#### `/delete_context <name>`

Delete a saved context.

```
/delete_context old_project
```

### Workflow Management

#### `/workflow run <file>`

Execute a workflow from a file.

```
/workflow run examples/workflows/research-and-code.yaml
```

#### `/workflow list`

List available workflows.

```
/workflow list
```

#### `/workflow stop`

Stop the currently running workflow.

```
/workflow stop
```

## Keyboard Shortcuts

### Channel Navigation

- `Alt+1` through `Alt+9` - Switch to channel 1-9
- `Ctrl+N` - Next channel
- `Ctrl+P` - Previous channel

### Text Editing

- `Ctrl+A` - Move to beginning of line
- `Ctrl+E` - Move to end of line
- `Ctrl+K` - Delete from cursor to end of line
- `Ctrl+U` - Delete from cursor to beginning of line
- `Ctrl+W` - Delete word before cursor
- `Ctrl+L` - Clear screen

### History

- `Up Arrow` - Previous command
- `Down Arrow` - Next command
- `Ctrl+R` - Reverse search history

### Interruption

- `Ctrl+C` - Cancel current operation (agent continues in background)
- `Ctrl+D` - Exit Armament (when input is empty)

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | API error |
| 4 | Budget exceeded |
| 130 | Interrupted by user (Ctrl+C) |

## Examples

### Basic Usage

```bash
# Start with default configuration
npm start

# Use a specific model
npm start -- --model claude-opus-4-20250514

# Run a single prompt
npm start -- --prompt "Write a Python function to sort a list"

# Use a different theme
npm start -- --theme ice
```

### Advanced Usage

```bash
# Debug mode with custom config
npm start -- --config ./my-config.json --log-level debug

# Non-interactive mode without TUI
npm start -- --no-tui --prompt "Analyze this code" < input.txt

# Specific provider and model
npm start -- --provider openai --model gpt-4-turbo
```

### Multi-Agent Session

```bash
# Start Armament
npm start

# Inside REPL:
[main] > /join researcher
[researcher] > Research best practices for web scraping
[researcher] > /spawn coder
[coder] > Implement a web scraper based on researcher's findings
[coder] > /switch 1
[researcher] > /msg coder Use the requests library
[researcher] > /list
[researcher] > /status
```

## See Also

- [Getting Started](./GETTING_STARTED.md) - Initial setup
- [Configuration](./CONFIGURATION.md) - Configuration options
- [Architecture](./ARCHITECTURE.md) - How Armament works
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues
