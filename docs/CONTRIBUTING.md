# Contributing to Armament

Thank you for your interest in contributing to Armament! This document provides guidelines for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](../CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

1. **Search existing issues** to avoid duplicates
2. **Create a new issue** with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - System info (OS, Node version)
   - Logs (redact API keys!)

### Suggesting Features

1. **Check GitHub Discussions** for existing suggestions
2. **Open a discussion** to propose your idea
3. **Provide details**:
   - Use case
   - Benefits
   - Potential implementation approach

### Submitting Pull Requests

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/my-feature`
3. **Make your changes**
4. **Write/update tests**
5. **Update documentation**
6. **Commit with conventional commits**:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation
   - `refactor:` - Code refactoring
   - `test:` - Tests
   - `chore:` - Maintenance
7. **Push to your fork**
8. **Open a pull request**

## Development Setup

See [Development Guide](./DEVELOPMENT.md) for detailed setup instructions.

Quick start:

```bash
# Clone all required repositories
git clone https://github.com/rjtruitt/armament.git
git clone https://github.com/rjtruitt/iteratio.git
git clone https://github.com/rjtruitt/flight-controller.git
git clone https://github.com/rjtruitt/iteratio-plugin-tools.git

# Build dependencies
cd iteratio && npm install && npm run build && cd ..
cd flight-controller && npm install && npm run build && cd ..
cd iteratio-plugin-tools && npm install && npm run build && cd ..

# Build armament
cd armament && npm install && npm run build
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Document complex functions with JSDoc

### Code Style

- Follow existing code style
- Use meaningful variable names
- Keep functions small and focused
- Add comments for complex logic

### Testing

- Write tests for new features
- Update tests for bug fixes
- Aim for good coverage
- Use descriptive test names

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should do something specific', () => {
    // Test implementation
  });
});
```

### Documentation

- Update README.md for user-facing changes
- Update docs/ for new features
- Add JSDoc comments for public APIs
- Include examples in documentation

## Pull Request Process

### Before Submitting

- [ ] Code builds without errors
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Commit messages follow convention
- [ ] Branch is up to date with main

### PR Description

Include:
- **Summary**: What does this PR do?
- **Motivation**: Why is this change needed?
- **Changes**: List of changes made
- **Testing**: How was this tested?
- **Screenshots**: For UI changes
- **Breaking changes**: Note any breaking changes

### Code Review

- Be open to feedback
- Respond to review comments
- Make requested changes
- Be patient - maintainers are volunteers

### After Merge

- Delete your feature branch
- Close related issues
- Celebrate! 🎉

## Areas for Contribution

### Good First Issues

Look for issues labeled `good-first-issue`:

- Documentation improvements
- Bug fixes
- Small feature additions
- Test coverage improvements

### High Priority

- Performance optimizations
- Bug fixes
- Security improvements
- Documentation

### Feature Requests

- New themes
- New commands
- New tools
- Provider integrations
- MCP servers

## Development Workflow

### 1. Find an Issue

- Browse [GitHub Issues](https://github.com/rjtruitt/armament/issues)
- Comment that you're working on it
- Ask questions if unclear

### 2. Create a Branch

```bash
git checkout -b feature/issue-123-my-feature
```

### 3. Develop

```bash
# Make changes
npm run dev

# Test
npm test
npm run test:watch

# Build
npm run build
```

### 4. Commit

```bash
git add .
git commit -m "feat: add new feature"
```

### 5. Push

```bash
git push origin feature/issue-123-my-feature
```

### 6. Open PR

- Go to GitHub
- Click "New Pull Request"
- Fill in PR template
- Submit

## Testing

### Run Tests

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:coverage
```

### Manual Testing

```bash
npm run dev
```

Test your changes in the actual application.

## Documentation

### Update Docs

- **README.md**: User-facing changes
- **docs/**: Detailed guides
- **Code comments**: Complex logic
- **CHANGELOG.md**: User-visible changes

### Documentation Style

- Clear and concise
- Include examples
- Link to related docs
- Use proper markdown formatting

## Getting Help

- **GitHub Discussions**: Ask questions
- **GitHub Issues**: Report bugs
- **Discord**: (coming soon)
- **Email**: (maintainer contact)

## Recognition

Contributors are recognized in:
- GitHub contributors page
- Release notes
- CHANGELOG.md

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Questions?

Don't hesitate to ask! Open a discussion or issue if you need help.

Thank you for contributing to Armament! 🚀
