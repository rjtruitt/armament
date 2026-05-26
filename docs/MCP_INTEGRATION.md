# MCP Integration Guide

Model Context Protocol (MCP) integration allows Armament to connect to external tool servers.

## What is MCP?

MCP is an open protocol that standardizes how applications provide context to LLMs. MCP servers expose:

- **Tools**: Functions the LLM can call
- **Resources**: Data the LLM can read
- **Prompts**: Reusable prompt templates

## Configuration

Add MCP servers in your config file:

```json
{
  "mcp": {
    "servers": {
      "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/directory"],
        "env": {}
      }
    }
  }
}
```

## Official MCP Servers

### Filesystem

Access local files and directories.

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
  }
}
```

### GitHub

Interact with GitHub repositories.

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_TOKEN": "ghp_..."
    }
  }
}
```

### PostgreSQL

Query PostgreSQL databases.

```json
{
  "postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"],
    "env": {
      "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@host/db"
    }
  }
}
```

### Google Drive

Access Google Drive files.

```json
{
  "gdrive": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-gdrive"],
    "env": {}
  }
}
```

## Runtime Management

### Add Server

```bash
/mcp add <name> {"url":"...", "transport":"stdio|sse"}
```

Example:

```bash
/mcp add filesystem {"command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/home/user/projects"]}
```

### List Servers

```bash
/mcp list
```

### Show Status

```bash
/mcp
```

### Restart Server

```bash
/mcp restart <name>
```

## Tool Discovery

Once connected, MCP tools are automatically available to agents:

```bash
/tools
```

The agent can use these tools just like built-in tools.

## OAuth Support

Some MCP servers require OAuth authentication (e.g., Google Drive). Armament handles the OAuth flow automatically:

1. Server requests OAuth
2. Armament opens browser for authorization
3. User approves access
4. Token stored securely

## Security

- **Subprocess isolation**: MCP servers run as separate processes
- **Tool approval**: MCP tools require approval like built-in tools
- **Environment variables**: Sensitive credentials passed via env vars
- **No token logging**: OAuth tokens never logged

## Creating Custom MCP Servers

See [MCP documentation](https://modelcontextprotocol.io/) for creating your own servers.

Basic structure:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server({
  name: 'my-server',
  version: '1.0.0',
});

server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'my_tool',
      description: 'Does something useful',
      inputSchema: { ... }
    }
  ]
}));

server.setRequestHandler('tools/call', async (request) => {
  // Execute tool
  return { content: [ ... ] };
});
```

## Troubleshooting

### Server won't start

- Check command path is correct
- Verify npm package is installed
- Check environment variables

### Tools not appearing

- Restart server: `/mcp restart <name>`
- Check server logs in `~/.armament/logs/mcp-<name>.log`

### OAuth issues

- Clear stored tokens in `~/.armament/oauth/`
- Ensure browser can open for authorization

## See Also

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [Configuration Guide](./CONFIGURATION.md)
