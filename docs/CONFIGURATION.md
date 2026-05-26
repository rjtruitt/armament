# Configuration Guide

Complete reference for configuring Armament.

## Configuration File Location

Armament looks for configuration in the following order:

1. `~/.armament/config.json` (recommended)
2. `./config.json` (current directory)
3. Environment variables
4. Command-line flags (highest priority)

## Configuration File Format

The configuration file is JSON format. See `config.example.json` for a complete template.

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "theme": "red",
  "budget": { ... },
  "providers": { ... },
  "mcp": { ... },
  "ui": { ... },
  "session": { ... },
  "advanced": { ... }
}
```

## Core Settings

### defaultProvider

**Type**: `string`  
**Default**: `"anthropic"`  
**Options**: `"anthropic"`, `"openai"`, `"bedrock"`, `"gemini"`, `"ollama"`, `"openrouter"`, `"replicate"`

The LLM provider to use by default when starting Armament.

```json
{
  "defaultProvider": "anthropic"
}
```

### defaultModel

**Type**: `string`  
**Required**: Yes (if provider is configured)

The specific model to use. Format varies by provider:

- **Anthropic**: `"claude-sonnet-4-20250514"`, `"claude-opus-4-20250514"`, `"claude-3-5-sonnet-20241022"`
- **OpenAI**: `"gpt-4-turbo"`, `"gpt-4"`, `"gpt-3.5-turbo"`
- **Bedrock**: `"anthropic.claude-3-5-sonnet-20241022-v2:0"`
- **Gemini**: `"gemini-2.0-flash-exp"`, `"gemini-1.5-pro"`
- **Ollama**: `"llama3.1"`, `"mistral"`, `"codellama"`
- **OpenRouter**: `"anthropic/claude-3.5-sonnet"`
- **Replicate**: `"meta/llama-2-70b-chat"`

```json
{
  "defaultModel": "claude-sonnet-4-20250514"
}
```

### theme

**Type**: `string`  
**Default**: `"red"`  
**Options**: `"ansi"`, `"red"`, `"fire"`, `"ice"`, `"pro"`

Visual theme for the terminal UI. Available themes:

- **ansi**: Classic terminal colors
- **red**: Red/crimson theme (default)
- **fire**: Orange/yellow fire theme
- **ice**: Cyan/blue ice theme
- **pro**: Muted grayscale professional theme

```json
{
  "theme": "ice"
}
```

**Note**: The README previously mentioned `green`, `purple`, `synthwave`, and `midnight` themes. These are implemented for banner/loading screens but not yet available for the main TUI. They will be added in a future release.

## Budget Settings

Control spending and token usage limits.

```json
{
  "budget": {
    "maxTokens": 1000000,
    "maxCost": 100.0,
    "warnThreshold": 0.8,
    "enabled": true
  }
}
```

### budget.maxTokens

**Type**: `number`  
**Default**: `1000000`

Maximum number of tokens (input + output) allowed per session.

### budget.maxCost

**Type**: `number` (USD)  
**Default**: `100.0`

Maximum cost in USD allowed per session.

### budget.warnThreshold

**Type**: `number` (0-1)  
**Default**: `0.8`

Warn when budget reaches this percentage (0.8 = 80%).

### budget.enabled

**Type**: `boolean`  
**Default**: `true`

Enable budget tracking and limits.

## Provider Configuration

Each provider has its own configuration block under `providers`.

### Anthropic

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-...",
      "baseUrl": "https://api.anthropic.com",
      "models": {
        "claude-sonnet-4-20250514": {
          "maxTokens": 8192,
          "temperature": 1.0
        },
        "claude-opus-4-20250514": {
          "maxTokens": 4096
        }
      }
    }
  }
}
```

**Environment Variable**: `ANTHROPIC_API_KEY`

### OpenAI

```json
{
  "providers": {
    "openai": {
      "apiKey": "sk-...",
      "organization": "org-...",
      "baseUrl": "https://api.openai.com/v1",
      "models": {
        "gpt-4-turbo": {
          "maxTokens": 4096,
          "temperature": 0.7
        }
      }
    }
  }
}
```

**Environment Variables**: `OPENAI_API_KEY`, `OPENAI_ORG_ID`

### AWS Bedrock

```json
{
  "providers": {
    "bedrock": {
      "region": "us-east-1",
      "accessKeyId": "AKIA...",
      "secretAccessKey": "...",
      "sessionToken": "...",
      "models": {
        "anthropic.claude-3-5-sonnet-20241022-v2:0": {}
      }
    }
  }
}
```

**Environment Variables**: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`

### Google Gemini

```json
{
  "providers": {
    "gemini": {
      "apiKey": "AIza...",
      "models": {
        "gemini-2.0-flash-exp": {
          "maxTokens": 8192
        }
      }
    }
  }
}
```

**Environment Variable**: `GOOGLE_API_KEY`

### Ollama

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434",
      "models": {
        "llama3.1": {},
        "mistral": {},
        "codellama": {}
      }
    }
  }
}
```

No API key required for local Ollama installations.

### OpenRouter

```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-...",
      "baseUrl": "https://openrouter.ai/api/v1",
      "models": {
        "anthropic/claude-3.5-sonnet": {},
        "openai/gpt-4-turbo": {}
      }
    }
  }
}
```

**Environment Variable**: `OPENROUTER_API_KEY`

### Replicate

```json
{
  "providers": {
    "replicate": {
      "apiKey": "r8_...",
      "models": {
        "meta/llama-2-70b-chat": {}
      }
    }
  }
}
```

**Environment Variable**: `REPLICATE_API_TOKEN`

## MCP Server Configuration

Configure Model Context Protocol servers for extended tool capabilities.

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"],
        "env": {}
      },
      "github": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_TOKEN": "ghp_..."
        }
      },
      "postgres": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-postgres"],
        "env": {
          "POSTGRES_CONNECTION_STRING": "postgresql://..."
        }
      }
    }
  }
}
```

See [MCP Integration Guide](./MCP_INTEGRATION.md) for details on available servers.

## UI Settings

Customize the terminal user interface.

```json
{
  "ui": {
    "width": 120,
    "noColor": false,
    "autoApprove": false,
    "autoApprovePaths": ["/tmp", "/home/user/safe-dir"]
  }
}
```

### ui.width

**Type**: `number`  
**Default**: Terminal width or `120`

Maximum width for text rendering.

### ui.noColor

**Type**: `boolean`  
**Default**: `false`

Disable ANSI colors (useful for logging or unsupported terminals).

### ui.autoApprove

**Type**: `boolean`  
**Default**: `false`

Automatically approve all tool executions without prompting. **Use with caution!**

### ui.autoApprovePaths

**Type**: `string[]`  
**Default**: `[]`

List of directory paths where file operations are automatically approved.

## Session Settings

Configure session persistence and logging.

```json
{
  "session": {
    "saveContexts": true,
    "contextDir": "~/.armament/contexts",
    "logLevel": "info",
    "logFile": "~/.armament/armament.log"
  }
}
```

### session.saveContexts

**Type**: `boolean`  
**Default**: `true`

Enable saving conversation contexts.

### session.contextDir

**Type**: `string`  
**Default**: `"~/.armament/contexts"`

Directory for saved contexts.

### session.logLevel

**Type**: `string`  
**Default**: `"info"`  
**Options**: `"debug"`, `"info"`, `"warn"`, `"error"`

Logging verbosity level.

### session.logFile

**Type**: `string`  
**Default**: `"~/.armament/armament.log"`

Path to log file. Set to `null` to disable file logging.

## Advanced Settings

```json
{
  "advanced": {
    "maxConcurrentAgents": 10,
    "agentTimeout": 300000,
    "retryAttempts": 3,
    "streamingEnabled": true
  }
}
```

### advanced.maxConcurrentAgents

**Type**: `number`  
**Default**: `10`

Maximum number of agents that can run simultaneously.

### advanced.agentTimeout

**Type**: `number` (milliseconds)  
**Default**: `300000` (5 minutes)

Timeout for agent operations.

### advanced.retryAttempts

**Type**: `number`  
**Default**: `3`

Number of retry attempts for failed API calls.

### advanced.streamingEnabled

**Type**: `boolean`  
**Default**: `true`

Enable streaming responses (recommended).

## Command-Line Overrides

All configuration options can be overridden via command-line flags:

```bash
# Override provider and model
npm start -- --provider openai --model gpt-4-turbo

# Override theme
npm start -- --theme ice

# Disable TUI
npm start -- --no-tui

# Set custom config file
npm start -- --config /path/to/config.json

# Enable debug logging
npm start -- --log-level debug
```

See [CLI Reference](./CLI_REFERENCE.md) for all available flags.

## Environment Variables

Armament respects these environment variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `OPENAI_ORG_ID` | OpenAI organization ID |
| `AWS_REGION` | AWS region for Bedrock |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key |
| `AWS_SESSION_TOKEN` | AWS session token |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `REPLICATE_API_TOKEN` | Replicate API token |
| `ARMA_CONFIG` | Path to config file |
| `ARMA_HOME` | Armament home directory (default: `~/.arma`) |

## Configuration Priority

Settings are applied in this order (later overrides earlier):

1. Default values
2. Configuration file (`~/.armament/config.json`)
3. Environment variables
4. Command-line flags

## Validation

Armament validates your configuration on startup. Common errors:

- **Missing API key**: Ensure the provider has a valid `apiKey` or credentials
- **Invalid model**: Check that the model ID is correct for the provider
- **Invalid budget**: Ensure `maxTokens` and `maxCost` are positive numbers
- **Invalid theme**: Use one of the available themes: `ansi`, `red`, `fire`, `ice`, `pro`

## Examples

### Minimal Configuration

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

### Multi-Provider Configuration

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-..."
    },
    "openai": {
      "apiKey": "sk-..."
    },
    "ollama": {
      "baseUrl": "http://localhost:11434"
    }
  }
}
```

Switch providers at runtime with `/model` command.

### Production Configuration

```json
{
  "defaultProvider": "anthropic",
  "defaultModel": "claude-sonnet-4-20250514",
  "theme": "pro",
  "budget": {
    "maxTokens": 5000000,
    "maxCost": 500.0,
    "warnThreshold": 0.9
  },
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-api03-..."
    }
  },
  "session": {
    "logLevel": "warn",
    "logFile": "/var/log/armament/armament.log"
  },
  "advanced": {
    "maxConcurrentAgents": 20,
    "agentTimeout": 600000
  }
}
```

## See Also

- [Getting Started](./GETTING_STARTED.md) - Initial setup
- [Provider Setup](./PROVIDER_SETUP.md) - Provider-specific guides
- [MCP Integration](./MCP_INTEGRATION.md) - MCP server configuration
- [CLI Reference](./CLI_REFERENCE.md) - Command-line options
