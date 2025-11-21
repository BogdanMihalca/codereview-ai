# Contributing to AI Code Review

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Style Guidelines](#style-guidelines)

## Code of Conduct

This project follows a Code of Conduct that all contributors are expected to adhere to:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Accept responsibility and apologize for mistakes

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/codereview-ai.git
   cd codereview-ai
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/BogdanMihalca/codereview-ai.git
   ```

## Development Setup

### Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- VS Code 1.106.1 or higher
- Git

### Install Dependencies

```bash
npm install
```

### Run in Development Mode

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. Make changes and reload (`Ctrl+R` or `Cmd+R`)

### Build

```bash
# Development build with watch
npm run watch

# Production build
npm run package
```

### Run Tests

```bash
npm test
```

## Making Changes

### Branch Naming

Use descriptive branch names:

- `feature/add-new-check` - New features
- `fix/line-number-bug` - Bug fixes
- `docs/update-readme` - Documentation updates
- `refactor/ai-service` - Code refactoring

### Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(ai): add support for Claude 3.5 Sonnet
fix(webview): correct line highlighting offset
docs(readme): add troubleshooting section
```

## Testing

### Manual Testing

1. Install the extension in development mode (`F5`)
2. Open a project with a git repository
3. Make changes on a feature branch
4. Run "AI Code Review: Review Changes"
5. Verify:
   - Issues are detected correctly
   - Line numbers are accurate
   - Fixes can be applied
   - Navigation works
   - Export functions work

### Automated Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Lint code
npm run lint
```

### Test Areas

When making changes, test:

- ✅ Git diff extraction
- ✅ AI model integration
- ✅ Issue display in webview
- ✅ Fix application
- ✅ Settings synchronization
- ✅ Chat participant commands
- ✅ Export functionality

## Submitting Changes

### Before Submitting

1. **Update documentation** if needed
2. **Add tests** for new features
3. **Run linter**: `npm run lint`
4. **Test thoroughly** in development mode
5. **Update CHANGELOG.md** if it's a notable change

### Pull Request Process

1. **Update your fork**:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Push your changes**:

   ```bash
   git push origin feature/your-feature-name
   ```

3. **Open a Pull Request** on GitHub with:

   - Clear title describing the change
   - Description of what changed and why
   - Screenshots/GIFs for UI changes
   - Reference any related issues (#123)

4. **Respond to feedback** and make requested changes

5. **Wait for review** - Maintainers will review within 1-2 weeks

### Pull Request Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

Describe how you tested the changes

## Screenshots

If applicable, add screenshots

## Checklist

- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] All tests pass
- [ ] CHANGELOG.md updated
```

## Style Guidelines

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let`
- Use meaningful variable names
- Add JSDoc comments for public APIs
- Use async/await over promises
- Avoid `any` type when possible

**Example:**

```typescript
/**
 * Applies a code fix to a file
 * @param fix The fix to apply
 * @param uri The file URI
 * @returns True if successful
 */
async function applyCodeFix(fix: CodeFix, uri: vscode.Uri): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  // Implementation...
  return await vscode.workspace.applyEdit(edit);
}
```

### File Organization

```
src/
├── extension.ts          # Main entry point
├── types.ts              # Type definitions
├── services/             # Core services
│   └── aiService.ts
├── providers/            # VS Code providers
│   ├── historyProvider.ts
│   └── reviewSidePanelProvider.ts
├── utils/                # Utility functions
│   ├── config.ts
│   └── fixApplicator.ts
├── webview/              # UI components
│   └── reviewPanel.ts
└── test/                 # Tests
    └── extension.test.ts
```

### Code Style

- **Indentation**: 2 spaces
- **Line length**: 100 characters max
- **Quotes**: Single quotes for strings
- **Semicolons**: Required
- **Trailing commas**: Yes

Run `npm run lint` to check style.

## Areas Needing Contribution

We especially welcome contributions in these areas:

- 🎨 **UI/UX improvements** - Better visualization of issues
- 🧪 **Test coverage** - More comprehensive tests
- 📚 **Documentation** - Tutorials, examples, guides
- 🌐 **Internationalization** - Multi-language support
- 🔌 **Integrations** - GitLab, Bitbucket support
- 🤖 **AI models** - Support for more AI providers
- ⚡ **Performance** - Optimization of large diffs

## Getting Help

- **Questions**: Open a [GitHub Discussion](https://github.com/BogdanMihalca/codereview-ai/discussions)
- **Bugs**: Open a [GitHub Issue](https://github.com/BogdanMihalca/codereview-ai/issues)
- **Chat**: Join our Discord (coming soon)

## Recognition

Contributors will be:

- Listed in CHANGELOG.md for significant contributions
- Mentioned in release notes
- Added to CONTRIBUTORS.md

Thank you for contributing! 🎉
