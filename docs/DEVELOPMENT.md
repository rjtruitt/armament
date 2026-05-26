# Development Guide

Guide for contributing to Armament.

## Development Setup

### Prerequisites

- Node.js 18.0.0+
- Git
- npm or yarn

### Clone Repositories

Armament uses local file dependencies. Clone all required repositories:

```bash
cd /path/to/your/projects

git clone https://github.com/rjtruitt/armament.git
git clone https://github.com/rjtruitt/iteratio.git
git clone https://github.com/rjtruitt/flight-controller.git
git clone https://github.com/rjtruitt/iteratio-plugin-tools.git
```

### Build Dependencies

Build in this order:

```bash
# Build iteratio first
cd iteratio
npm install
npm run build

# Build flight-controller
cd ../flight-controller
npm install
npm run build

# Build iteratio-plugin-tools
cd ../iteratio-plugin-tools
npm install
npm run build

# Build armament
cd ../armament
npm install
npm run build
```

### Development Mode

```bash
cd armament
npm run dev
```

This uses `tsx` to run TypeScript directly without building.

## Project Structure

```
armament/
├── src/
│   ├── app/           # Main application logic
│   ├── core/          # Core systems (agents, channels, budget)
│   ├── tui/           # Terminal UI components
│   ├── rendering/     # ANSI rendering, themes
│   ├── scripting/     # Workflow engine
│   ├── config/        # Configuration management
│   ├── providers/     # Provider-specific code
│   └── index.ts       # Entry point
├── dist/              # Compiled JavaScript
├── docs/              # Documentation
├── examples/          # Example workflows
└── __tests__/         # Tests
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/my-feature
```

### 2. Make Changes

Edit files in `src/`.

### 3. Test

```bash
npm test
npm run test:watch  # Watch mode
```

### 4. Build

```bash
npm run build
```

### 5. Run

```bash
npm start
```

### 6. Commit

```bash
git add .
git commit -m "feat: add new feature"
```

Use conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Tests
- `chore:` - Maintenance

### 7. Push and PR

```bash
git push origin feature/my-feature
```

Open a pull request on GitHub.

## Testing

### Run Tests

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

### Write Tests

Use Vitest:

```typescript
import { describe, it, expect } from 'vitest';

describe('MyComponent', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

## Code Style

- **TypeScript**: All new code in TypeScript
- **ESLint**: Follow linting rules
- **Prettier**: Format with Prettier (if configured)
- **Types**: Prefer explicit types over `any`
- **Comments**: Document complex logic

## Adding Features

### New Command

1. Add command handler in `src/app/CommandDispatch.ts`
2. Register in `src/app/CommandRegistry.ts`
3. Add help text
4. Test

### New Tool

1. Add tool in `flight-controller` repository
2. Register in tool registry
3. Add tests
4. Document

### New Theme

1. Create theme in `src/rendering/themes/`
2. Export in `src/rendering/themes/index.ts`
3. Add to `THEMES` object
4. Test rendering

### New Provider

1. Implement in `iteratio` repository
2. Add configuration schema
3. Add tests
4. Document in `PROVIDER_SETUP.md`

## Debugging

### Debug Mode

```bash
npm start -- --log-level debug
```

### Inspect Logs

```bash
tail -f ~/.armament/armament.log
```

### VS Code

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Armament",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Contributing Guidelines

### Before Submitting

- [ ] Tests pass
- [ ] Code builds without errors
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] Branch is up to date with main

### Pull Request

Include:
- Clear description of changes
- Link to related issues
- Screenshots (for UI changes)
- Breaking changes noted

### Code Review

Be open to feedback. Maintainers may request changes.

## Release Process

(For maintainers)

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Commit: `chore: release v0.2.0`
4. Tag: `git tag v0.2.0`
5. Push: `git push && git push --tags`
6. Publish: `npm publish`

## Getting Help

- **GitHub Issues**: Report bugs
- **GitHub Discussions**: Ask questions
- **Discord**: (coming soon)

## See Also

- [Architecture](./ARCHITECTURE.md) - System design
- [Contributing](./CONTRIBUTING.md) - Contribution guidelines
