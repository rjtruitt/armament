# Getting Started with Armament

This guide will walk you through installing and configuring Armament for the first time.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18.0.0 or higher** - [Download Node.js](https://nodejs.org/)
- **npm** (comes with Node.js)
- **API key(s)** for at least one LLM provider:
  - [Anthropic Claude](https://console.anthropic.com/)
  - [OpenAI](https://platform.openai.com/)
  - [Google Gemini](https://ai.google.dev/)
  - AWS Bedrock credentials
  - [OpenRouter](https://openrouter.ai/)
  - [Replicate](https://replicate.com/)
  - Or a local [Ollama](https://ollama.ai/) installation

### System Requirements

- **Operating System**: macOS, Linux, or Windows (with WSL2 recommended)
- **Terminal**: Modern terminal with ANSI color support
- **Memory**: Minimum 4GB RAM (8GB+ recommended for multiple agents)
- **Disk Space**: ~200MB for installation plus space for logs and contexts

## Installation

### Option 1: Development Installation (Current)

**Note**: Armament is currently in alpha and not yet published to npm. You'll need to clone and build from source.

```bash
# Clone the repository
git clone https://github.com/rjtruitt/armament.git
cd armament

# Install dependencies
npm install

# Build the project
npm run build
```

#### Required Sibling Dependencies

Armament currently uses local file dependencies. Clone these repositories as siblings to the armament directory:

```bash
cd /path/to/your/projects

# Clone all required repositories
git clone https://github.com/rjtruitt/armament.git
git clone https://github.com/rjtruitt/iteratio.git
git clone https://github.com/rjtruitt/flight-controller.git
git clone https://github.com/rjtruitt/iteratio-plugin-tools.git

# Build dependencies first
cd iteratio && npm install && npm run build && cd ..
cd flight-controller && npm install && npm run build && cd ..
cd iteratio-plugin-tools && npm install && npm run build && cd ..

# Now build armament
cd armament
npm install
npm run build
```

### Option 2: npm Installation (Coming Soon)

Once published to npm, installation will be:

```bash
npm install -g armament
```

## Initial Configuration

### Interactive Setup Wizard

The easiest way to configure Armament is using the built-in setup wizard:

```bash
npm start -- --setup
```

This will guide you through:

1. **Provider Selection**: Choose your preferred LLM provider
2. **API Key Configuration**: Enter your API credentials
3. **Budget Limits**: Set spending limits (optional but recommended)
4. **Theme Selection**: Choose your visual theme
5. **Advanced Options**: Configure MCP servers, logging, etc.

### Manual Configuration

Alternatively, create a configuration file at `~/.arma/config.json`:

```bash
# Copy the example configuration
cp config.example.json ~/.arma/config.json

# Edit with your preferred editor
nano ~/.arma/config.json
```

#### Minimum Configuration

At minimum, you need to configure one provider:

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-..."
    }
  }
}
```

See [Configuration Guide](./CONFIGURATION.md) for all available options.

## First Run

### Start Armament

```bash
npm start
```

You should see the Armament banner and be dropped into an interactive REPL:

```
 ▄▄▄       ██▀███   ███▄ ▄███▓ ▄▄▄       ███▄ ▄███▓▓█████  ███▄    █ ▄▄▄█████▓
▒████▄    ▓██ ▒ ██▒▓██▒▀█▀ ██▒▒████▄    ▓██▒▀█▀ ██▒▓█   ▀  ██ ▀█   █ ▓  ██▒ ▓▒
▒██  ▀█▄  ▓██ ░▄█ ▒▓██    ▓██░▒██  ▀█▄  ▓██    ▓██░▒███   ▓██  ▀█ ██▒▒ ▓██░ ▒░
░██▄▄▄▄██ ▒██▀▀█▄  ▒██    ▒██ ░██▄▄▄▄██ ▒██    ▒██ ▒▓█  ▄ ▓██▒  ▐▌██▒░ ▓██▓ ░ 
 ▓█   ▓██▒░██▓ ▒██▒▒██▒   ░██▒ ▓█   ▓██▒▒██▒   ░██▒░▒████▒▒██░   ▓██░  ▒██▒ ░ 

[main] >
```

### Try Your First Prompt

```
[main] > Hello! Can you help me understand what you can do?
```

The agent will respond with information about its capabilities.

### Basic Commands

Try these commands to get familiar with Armament:

```bash
# Get help
/help

# Check your session status
/status

# View budget usage
/cost

# List available tools
/tools

# Change the theme
/theme ice

# Clear the screen
/clear
```

## Next Steps

### Learn Multi-Agent Workflows

Create and manage multiple agents:

```bash
# Create a new agent channel
/join researcher

# Spawn a parallel agent
/spawn coder

# Switch between channels
/switch 1
/switch 2

# Send a message to a specific agent
/msg coder Implement what the researcher found
```

### Explore MCP Integration

Add MCP servers for extended capabilities:

```bash
# Add filesystem access
/mcp add filesystem npx @modelcontextprotocol/server-filesystem /path/to/dir

# Add GitHub integration
/mcp add github npx @modelcontextprotocol/server-github
```

See [MCP Integration Guide](./MCP_INTEGRATION.md) for details.

### Save and Load Contexts

Preserve your work across sessions:

```bash
# Save current conversation
/save_context my_project

# Load it later
/load_context my_project

# List saved contexts
/list_contexts
```

### Customize Your Experience

- **Themes**: See [available themes](./CONFIGURATION.md#themes)
- **Keybindings**: Learn [keyboard shortcuts](./CLI_REFERENCE.md#keyboard-shortcuts)
- **Workflows**: Explore [workflow automation](../examples/workflows/)

## Troubleshooting

### Common Issues

#### "API key not configured"

Make sure your `~/.arma/config.json` contains valid API credentials:

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-..."
    }
  }
}
```

#### "Module not found" errors

Ensure all dependencies are built:

```bash
cd ../iteratio && npm run build
cd ../flight-controller && npm run build
cd ../iteratio-plugin-tools && npm run build
cd ../armament && npm run build
```

#### Terminal display issues

- Ensure your terminal supports ANSI colors
- Try a different theme: `npm start -- --theme ansi`
- Disable the TUI: `npm start -- --no-tui`

#### Rate limiting or quota errors

Check your budget settings and API usage:

```bash
/cost
/config
```

See [Troubleshooting Guide](./TROUBLESHOOTING.md) for more solutions.

## Getting Help

- **Documentation**: [docs/](.)
- **GitHub Issues**: [Report a bug](https://github.com/rjtruitt/armament/issues)
- **Discussions**: [Ask questions](https://github.com/rjtruitt/armament/discussions)

## What's Next?

- [Configuration Guide](./CONFIGURATION.md) - Detailed configuration options
- [CLI Reference](./CLI_REFERENCE.md) - All commands and flags
- [Architecture Overview](./ARCHITECTURE.md) - How Armament works
- [Provider Setup](./PROVIDER_SETUP.md) - Provider-specific configuration
- [Development Guide](./DEVELOPMENT.md) - Contributing to Armament
