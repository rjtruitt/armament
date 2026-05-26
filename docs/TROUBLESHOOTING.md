# Troubleshooting Guide

Common issues and solutions for Armament.

## Installation Issues

### "Module not found" errors

**Cause**: Dependencies not built.

**Solution**:

```bash
cd ../iteratio && npm run build
cd ../flight-controller && npm run build
cd ../iteratio-plugin-tools && npm run build
cd ../armament && npm run build
```

### "Cannot find package" errors

**Cause**: Sibling dependencies not cloned.

**Solution**: Clone all required repositories as siblings (see [Getting Started](./GETTING_STARTED.md)).

## Configuration Issues

### "API key not configured"

**Cause**: Missing or invalid API key.

**Solution**:

1. Check `~/.arma/config.json` exists
2. Verify API key is correct
3. Or set environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### "Invalid model ID"

**Cause**: Model ID doesn't match provider format.

**Solution**: Use exact model IDs from [Provider Setup](./PROVIDER_SETUP.md).

Examples:
- Anthropic: `claude-sonnet-4-20250514`
- OpenAI: `gpt-4-turbo`
- Ollama: `llama3.1`

### "Provider not found"

**Cause**: Provider not configured.

**Solution**: Add provider to config:

```json
{
  "providers": {
    "anthropic": {
      "apiKey": "..."
    }
  }
}
```

## Runtime Issues

### "Rate limit exceeded"

**Cause**: Too many API requests.

**Solution**:
- Wait a few minutes
- Reduce concurrent agents
- Upgrade API plan

### "Budget exceeded"

**Cause**: Token or cost limit reached.

**Solution**:

```bash
# Check budget
/cost

# Increase limits in config
{
  "budget": {
    "maxTokens": 2000000,
    "maxCost": 200.0
  }
}
```

### Agent not responding

**Cause**: Network issue, API timeout, or agent crashed.

**Solution**:

```bash
# Check status
/status

# Kill and restart agent
/kill agent_name
/join agent_name
```

### "Context length exceeded"

**Cause**: Conversation too long for model's context window.

**Solution**:
- Start a new channel: `/join new_agent`
- Save context and start fresh: `/save_context old && /clear`
- Use a model with larger context

## Terminal UI Issues

### Colors not displaying

**Cause**: Terminal doesn't support ANSI colors.

**Solution**:

```bash
# Use ansi theme
npm start -- --theme ansi

# Or disable TUI
npm start -- --no-tui
```

### Terminal too small

**Cause**: Terminal width too narrow.

**Solution**:
- Resize terminal window
- Or set custom width: `npm start -- --width 100`

### Garbled output

**Cause**: Terminal encoding issues.

**Solution**:
- Ensure terminal uses UTF-8 encoding
- Try different terminal emulator
- Disable TUI: `npm start -- --no-tui`

## MCP Issues

### MCP server won't start

**Cause**: Missing npm package or incorrect command.

**Solution**:

```bash
# Test command manually
npx -y @modelcontextprotocol/server-filesystem /path

# Check logs
cat ~/.arma/logs/mcp-<name>.log
```

### MCP tools not appearing

**Cause**: Server not connected or crashed.

**Solution**:

```bash
# List servers
/mcp list

# Restart server
/mcp restart filesystem

# Check logs
cat ~/.arma/logs/mcp-filesystem.log
```

### OAuth not working

**Cause**: Browser not opening or token expired.

**Solution**:
- Clear tokens: `rm -rf ~/.arma/oauth/`
- Ensure browser can open
- Manually authorize in browser

## Performance Issues

### Slow responses

**Cause**: Network latency, model processing time, or system load.

**Solution**:
- Use faster model (e.g., Haiku, GPT-3.5)
- Check network connection
- Reduce concurrent agents
- Use local Ollama for instant responses

### High memory usage

**Cause**: Multiple agents with long contexts.

**Solution**:
- Close unused channels: `/part`
- Clear old contexts
- Reduce `maxConcurrentAgents` in config

### Slow startup

**Cause**: Loading large contexts or MCP servers.

**Solution**:
- Remove unused MCP servers from config
- Archive old contexts
- Use SSD for faster file I/O

## Error Messages

### "ECONNREFUSED"

**Cause**: Cannot connect to API endpoint.

**Solution**:
- Check internet connection
- Verify API endpoint URL
- Check firewall settings

### "ETIMEDOUT"

**Cause**: Request timed out.

**Solution**:
- Check network stability
- Increase timeout in config
- Try again

### "ENOTFOUND"

**Cause**: DNS resolution failed.

**Solution**:
- Check DNS settings
- Try different network
- Verify API endpoint URL

### "Permission denied"

**Cause**: File permission error.

**Solution**:

```bash
# Fix config permissions
chmod 600 ~/.arma/config.json

# Fix directory permissions
chmod 755 ~/.arma
```

## Debugging

### Enable Debug Logging

```bash
npm start -- --log-level debug
```

### Check Logs

```bash
# Main log
tail -f ~/.arma/logs/armament.log

# MCP logs
tail -f ~/.arma/logs/mcp-*.log
```

### Inspect Configuration

```bash
/config
```

### Check Session State

```bash
/status
/cost
/list
```

## Getting Help

If you can't resolve an issue:

1. **Check logs**: `~/.arma/logs/armament.log`
2. **Search issues**: [GitHub Issues](https://github.com/rjtruitt/armament/issues)
3. **Ask community**: [GitHub Discussions](https://github.com/rjtruitt/armament/discussions)
4. **Report bug**: [New Issue](https://github.com/rjtruitt/armament/issues/new)

Include:
- Error message
- Steps to reproduce
- Config (redact API keys!)
- Logs
- System info (OS, Node version)

## See Also

- [Getting Started](./GETTING_STARTED.md)
- [Configuration](./CONFIGURATION.md)
- [FAQ](./FAQ.md)
