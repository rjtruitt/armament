# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

**Note**: Armament is currently in alpha. Security updates will be provided for the latest alpha version.

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please follow these steps:

### 1. Do Not Open a Public Issue

Security vulnerabilities should **not** be reported through public GitHub issues.

### 2. Report Privately

Send a detailed report to: **security@armament.dev** (or create a private security advisory on GitHub)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### 3. Response Timeline

- **Initial response**: Within 48 hours
- **Status update**: Within 7 days
- **Fix timeline**: Depends on severity

### 4. Disclosure

We follow coordinated disclosure:
- We'll work with you to understand and fix the issue
- We'll credit you in the security advisory (if desired)
- We'll coordinate the public disclosure timing

## Security Best Practices

### API Keys

- **Never commit API keys** to version control
- Store keys in `~/.arma/config.json` with restricted permissions (`chmod 600`)
- Use environment variables for sensitive credentials
- Rotate keys regularly

### File Permissions

```bash
# Secure your config file
chmod 600 ~/.arma/config.json

# Secure your home directory
chmod 700 ~/.arma
```

### Tool Execution

- **Review tool calls** before approving
- Use `autoApprovePaths` carefully - only for trusted directories
- Never set `autoApprove: true` in production
- Monitor tool execution logs

### MCP Servers

- Only use trusted MCP servers
- Review MCP server code before running
- Limit MCP server permissions
- Use environment variables for MCP credentials

### Network Security

- Use HTTPS for all API endpoints
- Verify SSL certificates
- Be cautious on untrusted networks
- Consider using a VPN for sensitive work

## Known Security Considerations

### Alpha Software

Armament is in alpha. Security features are still being hardened. Use caution in production environments.

### Tool Execution

Agents can execute arbitrary code through tools. Always review tool calls before approval.

### API Key Storage

API keys are stored in plaintext in the config file. Ensure file permissions are restrictive.

### MCP Servers

MCP servers run as subprocesses with access to your system. Only use trusted servers.

### Logging

Logs may contain sensitive information. Secure log files and rotate them regularly.

## Security Features

### Tool Approval System

Armament prompts for approval before executing potentially dangerous operations:
- File writes
- Code execution
- Network requests
- Database queries

### Path Restrictions

File operations are restricted to approved paths. Configure in `autoApprovePaths`.

### Budget Limits

Prevent runaway costs with token and cost limits.

### Subprocess Isolation

MCP servers run as isolated subprocesses.

### No Telemetry

Armament does not collect or transmit usage data.

## Vulnerability Disclosure

Past vulnerabilities will be listed here after disclosure:

- None reported yet

## Security Updates

Security updates will be released as patch versions (e.g., 0.1.1) and noted in:
- CHANGELOG.md
- GitHub Security Advisories
- Release notes

## Contact

- **Security issues**: security@armament.dev
- **General issues**: [GitHub Issues](https://github.com/rjtruitt/armament/issues)
- **Questions**: [GitHub Discussions](https://github.com/rjtruitt/armament/discussions)

Thank you for helping keep Armament secure!
