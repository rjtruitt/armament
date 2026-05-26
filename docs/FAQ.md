# Frequently Asked Questions

## General

### What is Armament?

Armament is a terminal-based AI interaction platform with a retro BBS/IRC-style interface. It allows you to manage multiple AI agents simultaneously across different LLM providers.

### Is Armament free?

Yes, Armament is open-source (MIT license) and free to use. However, you'll need API keys for LLM providers, which have their own pricing.

### Which LLM providers are supported?

- Anthropic Claude
- OpenAI GPT
- AWS Bedrock
- Google Gemini
- Ollama (local, free)
- OpenRouter

### Can I use Armament offline?

Yes, if you use Ollama with local models. Otherwise, you need internet for cloud LLM providers.

## Installation

### Do I need to install npm packages globally?

No, Armament currently requires local installation. Global npm installation will be available after the first stable release.

### Why do I need sibling directories?

Armament uses local file dependencies during alpha development. This will change when published to npm.

### Can I use yarn or pnpm instead of npm?

Yes, but npm is recommended for consistency with documentation.

## Configuration

### Where is the config file?

`~/.armament/config.json` by default.

### How do I get an API key?

See [Provider Setup](./PROVIDER_SETUP.md) for instructions for each provider.

### Can I use multiple providers?

Yes! Configure multiple providers and switch between them with `/model`.

### How do I set a budget?

Add to your config:

```json
{
  "budget": {
    "maxTokens": 1000000,
    "maxCost": 100.0
  }
}
```

## Usage

### How do I create multiple agents?

Use `/join <name>` or `/spawn <name>`:

```bash
/join researcher
/spawn coder
/spawn reviewer
```

### How do I switch between agents?

Use `/switch <n>` or `Alt+1-9`:

```bash
/switch 1
/switch 2
```

Or press `Alt+1`, `Alt+2`, etc.

### How do agents communicate?

Use `/msg <agent> <message>`:

```bash
/msg coder Implement the researcher's findings
```

### Can agents see each other's conversations?

No, each agent has its own isolated context (channel). Use `/msg` to pass information between them.

### How do I save my work?

```bash
/save_context my_project
```

Load it later:

```bash
/load_context my_project
```

## Features

### What are MCP servers?

Model Context Protocol servers provide additional tools to agents (filesystem access, GitHub integration, database queries, etc.). See [MCP Integration](./MCP_INTEGRATION.md).

### What themes are available?

Currently: `ansi`, `red`, `fire`, `ice`, `pro`

Change with:

```bash
/theme ice
```

Or:

```bash
npm start -- --theme ice
```

### Can I customize themes?

Yes, by editing theme files in `src/rendering/themes/` and rebuilding.

### What is a workflow?

A workflow is a YAML file defining a sequence of agent tasks. See `examples/workflows/`.

### How do I run a workflow?

```bash
/workflow run examples/workflows/my-workflow.yaml
```

## Troubleshooting

### "API key not configured"

Add your API key to `~/.armament/config.json` or set environment variable. See [Troubleshooting](./TROUBLESHOOTING.md).

### Agent isn't responding

Check `/status`. The agent might be waiting for tool approval, or there may be a network issue.

### "Budget exceeded"

You've hit your token or cost limit. Check `/cost` and increase limits in config if needed.

### Terminal looks garbled

- Ensure your terminal supports ANSI colors
- Try `--theme ansi`
- Or use `--no-tui` for plain text

### "Module not found"

Build dependencies:

```bash
cd ../iteratio && npm run build
cd ../flight-controller && npm run build
cd ../iteratio-plugin-tools && npm run build
```

## Development

### How do I contribute?

See [Development Guide](./DEVELOPMENT.md) and [Contributing](./CONTRIBUTING.md).

### Can I create custom tools?

Yes! Add tools in the `flight-controller` repository.

### Can I create custom commands?

Yes! Register commands in `src/app/CommandRegistry.ts`.

### How do I report a bug?

Open an issue on [GitHub](https://github.com/rjtruitt/armament/issues).

## Performance

### Why is it slow?

- Network latency to LLM API
- Model processing time
- Large context size

Try:
- Faster model (Haiku, GPT-3.5)
- Local Ollama
- Reduce context size

### How much does it cost?

Depends on usage and model:
- Claude Sonnet: ~$3-15 per million tokens
- GPT-4: ~$10-30 per million tokens
- Ollama: Free (local)

Use `/cost` to track spending.

### Can I run it on a server?

Yes, but you'll need a terminal multiplexer (tmux/screen) for the TUI. Or use `--no-tui` mode.

## Roadmap

### When will it be on npm?

After the alpha phase stabilizes. Follow [GitHub](https://github.com/rjtruitt/armament) for updates.

### Will there be a web UI?

Yes, it's on the roadmap.

### Will there be team features?

Yes, shared channels and workflows are planned.

### Can I request a feature?

Yes! Open a feature request on [GitHub Discussions](https://github.com/rjtruitt/armament/discussions).

## Security

### Are my API keys secure?

API keys are stored in `~/.armament/config.json`. Ensure this file has restricted permissions (`chmod 600`). API keys are never logged.

### Can agents access my files?

Only with your approval. Armament prompts before executing file operations. You can configure auto-approved paths in config.

### Is my data sent anywhere?

Only to the configured LLM provider's API. Armament doesn't collect or transmit telemetry.

## See Also

- [Getting Started](./GETTING_STARTED.md)
- [Configuration](./CONFIGURATION.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
- [GitHub Issues](https://github.com/rjtruitt/armament/issues)
