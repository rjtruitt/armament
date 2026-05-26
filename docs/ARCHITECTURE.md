# Architecture Overview

Armament is built on a three-layer architecture combining LLM abstraction, agent orchestration, and terminal UI.

## Core Components

### 1. iteratio - LLM Abstraction Layer

**Repository**: [github.com/rjtruitt/iteratio](https://github.com/rjtruitt/iteratio)

Provides unified interface across multiple LLM providers:

- **Provider abstraction**: Single API for Anthropic, OpenAI, AWS Bedrock, Google Gemini, Ollama, OpenRouter, Replicate
- **Streaming support**: Real-time token streaming
- **Error handling**: Automatic retries, rate limiting, timeout management
- **Token counting**: Track input/output tokens across providers
- **Model management**: Dynamic model switching

### 2. flight-controller - Agent Orchestration

**Repository**: [github.com/rjtruitt/flight-controller](https://github.com/rjtruitt/flight-controller)

Manages agent lifecycle and tool execution:

- **Agent loop**: Implements the agent reasoning loop (think → act → observe)
- **Tool execution**: Sandboxed execution of file operations, code execution, web requests
- **Context management**: Maintains conversation history and state
- **Concurrency**: Manages multiple agents running in parallel
- **Safety**: Permission system for tool approval

### 3. armament - Terminal UI & Orchestration

**Repository**: [github.com/rjtruitt/armament](https://github.com/rjtruitt/armament)

Provides user interface and session management:

- **Terminal UI**: BBS-style interface powered by terminal-kit
- **Channel management**: IRC-style multi-agent channels
- **Command dispatch**: REPL command processing
- **Budget tracking**: Monitor token usage and costs
- **MCP integration**: Model Context Protocol server management
- **Workflow engine**: Execute multi-step agent workflows

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         ARMAMENT                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Terminal UI Layer                        │  │
│  │  • BBS/IRC-style interface (terminal-kit)            │  │
│  │  • Command palette & REPL                            │  │
│  │  • Channel manager                                   │  │
│  │  • Status bar, sidebar, chat renderer                │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          Session Management Layer                     │  │
│  │  • Agent manager                                     │  │
│  │  • Budget manager                                    │  │
│  │  • Context manager (save/load)                       │  │
│  │  • MCP manager                                       │  │
│  │  • Workflow scheduler                                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    FLIGHT-CONTROLLER                         │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Agent Orchestration Layer                  │  │
│  │  • Agent loop (think → act → observe)                │  │
│  │  • Tool registry & execution                         │  │
│  │  • Permission controller                             │  │
│  │  • Worker spawning                                   │  │
│  │  • Task scheduling                                   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                        ITERATIO                              │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              LLM Abstraction Layer                    │  │
│  │  • Provider interface                                │  │
│  │  • Streaming support                                 │  │
│  │  • Token counting                                    │  │
│  │  • Error handling & retries                          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
         ┌─────────────────────────────────────┐
         │    LLM Providers                    │
         │  • Anthropic Claude                 │
         │  • OpenAI GPT                       │
         │  • AWS Bedrock                      │
         │  • Google Gemini                    │
         │  • Ollama (local)                   │
         │  • OpenRouter                       │
         │  • Replicate                        │
         └─────────────────────────────────────┘
```

## Key Subsystems

### Channel System

Inspired by IRC, channels isolate agent contexts:

- **Channel**: Isolated conversation context with one agent
- **Multi-channel**: Run multiple agents in parallel
- **Channel switching**: Navigate between agents with `/switch` or `Alt+1-9`
- **Cross-channel messaging**: Send messages between agents with `/msg`

### Budget System

Tracks token usage and costs:

- **Per-provider pricing**: Knows input/output token costs for each model
- **Real-time tracking**: Updates costs as tokens are consumed
- **Limits**: Enforces `maxTokens` and `maxCost` budgets
- **Warnings**: Alerts at configurable threshold (default 80%)

### MCP Integration

Model Context Protocol support for extensible tools:

- **Server management**: Add/remove MCP servers dynamically
- **Tool discovery**: Automatically discovers tools from connected servers
- **OAuth support**: Handles OAuth flows for authenticated servers
- **Lifecycle management**: Starts/stops servers, handles crashes

### Context Persistence

Save and restore conversation state:

- **Format**: JSON serialization of conversation history
- **Storage**: `~/.armament/contexts/` by default
- **Metadata**: Includes model, tokens, cost, timestamp
- **Compression**: Large contexts are compressed

### Workflow Engine

Execute multi-step agent workflows:

- **Format**: YAML workflow definitions
- **Steps**: Sequential or parallel agent tasks
- **Variables**: Pass data between steps
- **Conditionals**: Branch based on results
- **Error handling**: Retry failed steps

## Data Flow

### User Input → Agent Response

1. **User types in REPL**
2. **Input handler** parses command or message
3. **Command dispatcher** routes to appropriate handler
4. **Agent manager** forwards to active channel's agent
5. **Flight-controller** executes agent loop:
   - Sends message to LLM via iteratio
   - Receives streaming response
   - Parses tool calls
   - Executes tools (with approval if needed)
   - Sends tool results back to LLM
   - Repeats until final response
6. **Renderer** displays response in TUI
7. **Budget manager** updates token/cost tracking

### Tool Execution Flow

1. **LLM requests tool** (e.g., `read_file`)
2. **Flight-controller** checks permissions
3. **Permission controller** prompts user if needed
4. **Tool executor** runs the tool
5. **Result** returned to LLM
6. **LLM continues** reasoning with tool result

## Technology Stack

### Core Dependencies

- **TypeScript**: Type-safe development
- **terminal-kit**: Terminal UI rendering
- **commander**: CLI argument parsing
- **eventemitter3**: Event-driven architecture
- **inversify**: Dependency injection
- **zod**: Runtime schema validation

### LLM SDKs (via iteratio)

- **@anthropic-ai/sdk**: Anthropic Claude
- **openai**: OpenAI GPT
- **@aws-sdk/client-bedrock-runtime**: AWS Bedrock
- **@google/generative-ai**: Google Gemini

### MCP

- **@modelcontextprotocol/sdk**: MCP protocol implementation

## Design Patterns

### Dependency Injection

Uses Inversify for loose coupling:

```typescript
@injectable()
class AgentManager {
  constructor(
    @inject('ProviderManager') private providers: ProviderManager,
    @inject('BudgetManager') private budget: BudgetManager
  ) {}
}
```

### Event-Driven Architecture

Components communicate via events:

```typescript
eventBus.on('agent:message', (msg) => { ... });
eventBus.emit('budget:warning', { usage: 0.9 });
```

### Plugin System

Extensibility through plugins:

```typescript
interface Plugin {
  name: string;
  init(context: PluginContext): void;
  commands?: Command[];
  tools?: Tool[];
}
```

## Security Considerations

### Tool Execution

- **Sandboxing**: Tools run with limited permissions
- **Approval system**: User must approve dangerous operations
- **Path restrictions**: File operations limited to approved directories
- **Timeout**: Tools have execution time limits

### API Keys

- **Environment variables**: Preferred method for API keys
- **File permissions**: Config file should be `chmod 600`
- **No logging**: API keys never logged

### MCP Servers

- **Subprocess isolation**: MCP servers run as separate processes
- **OAuth**: Supports secure OAuth flows
- **Tool approval**: MCP tools subject to same approval system

## Performance

### Streaming

All providers use streaming when available:

- **Token-by-token**: Display responses as they arrive
- **Reduced latency**: Start showing results immediately
- **Better UX**: Visual feedback that agent is thinking

### Concurrency

Multiple agents can run in parallel:

- **Async/await**: Non-blocking I/O throughout
- **Worker threads**: Heavy computation offloaded
- **Connection pooling**: Reuse HTTP connections

### Memory Management

- **Context trimming**: Old messages removed when context limit reached
- **Lazy loading**: Contexts loaded on demand
- **Garbage collection**: Unused agents cleaned up

## Extensibility Points

### Custom Tools

Add tools via flight-controller:

```typescript
registerTool({
  name: 'my_tool',
  description: 'Does something useful',
  parameters: { ... },
  execute: async (params) => { ... }
});
```

### Custom Themes

Add themes in `src/rendering/themes/`:

```typescript
export const MyTheme: ThemeColors = {
  primary: '#ff0000',
  // ...
};
```

### Custom Commands

Register REPL commands:

```typescript
registerCommand({
  name: 'mycommand',
  description: 'My custom command',
  execute: async (args) => { ... }
});
```

### MCP Servers

Any MCP-compatible server can be integrated:

```json
{
  "mcp": {
    "servers": {
      "myserver": {
        "command": "node",
        "args": ["./my-mcp-server.js"]
      }
    }
  }
}
```

## Future Architecture

Planned improvements:

- **Web UI**: Browser-based alternative to terminal UI
- **Cloud sync**: Sync contexts and config across devices
- **Distributed agents**: Run agents on remote machines
- **Plugin marketplace**: Discover and install community plugins
- **Team features**: Shared channels and workflows

## See Also

- [Development Guide](./DEVELOPMENT.md) - Contributing to Armament
- [Configuration](./CONFIGURATION.md) - Configuration options
- [MCP Integration](./MCP_INTEGRATION.md) - MCP server details
