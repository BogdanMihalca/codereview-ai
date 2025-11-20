# 🤖 AI Code Review for VS Code

> AI-powered code review assistant that analyzes your changes before creating merge requests, helping you catch bugs, security issues, and code quality problems early.

## ✨ Features

### 🔍 Comprehensive Code Analysis

- **AI-Powered Reviews**: Leverages GitHub Copilot, GPT-4, GPT-3.5-Turbo, or Claude models
- **Security Vulnerability Detection**: Identifies potential security issues
- **Performance Analysis**: Detects performance bottlenecks and inefficiencies
- **Code Smell Detection**: Finds anti-patterns and maintainability issues
- **Test Coverage Suggestions**: Recommends areas needing better test coverage
- **Documentation Checks**: Ensures code is properly documented

### 🎨 Modern, Intuitive UI

- **Compact Design**: GitHub/GitLab-inspired interface with reduced spacing
- **Proper Code Rendering**: Syntax-highlighted code blocks with line numbers
- **Copy-to-Clipboard**: Quick copy buttons for all code snippets
- **Diff View**: Side-by-side comparison for suggested fixes
- **Dark/Light Theme Support**: Automatically matches VS Code theme
- **Collapsible Sections**: Organized by file with issue counts

### ⚡ Smart Features

- **One-Click Navigation**: Jump directly to issues in your code with line highlighting
- **Quick Fix Actions**: Apply AI-suggested fixes with a single click
- **Batch Operations**: Apply multiple fixes at once
- **Filter & Search**: Find specific issues by severity, file, or keyword
- **Export Reports**: Generate Markdown, HTML, or JSON reports
- **Review History**: Track and compare past reviews

### 🛠️ Configurable

- **AI Model Selection**: Choose from multiple AI models (GPT-4, GPT-3.5, Claude)
- **Review Strictness**: Adjust from strict to lenient based on your needs
- **Custom Rules**: Enable/disable specific check categories
- **Ignore Patterns**: Exclude files or directories from review
- **Custom Prompts**: Add your own review guidelines

### 🔄 Integration

- **MR Description Generation**: Auto-generate comprehensive merge request descriptions
- **Commit Message Suggestions**: Get AI-powered commit message recommendations
- **Chat Participant**: Discuss reviews with `@reviewer` in VS Code Chat
- **Side Panel**: Quick access to review summary and issues

## 📸 Screenshots

### Main Review Panel

![Review Panel](images/screenshot-panel.png)
_Modern, compact UI with proper code rendering and syntax highlighting_

### Code with Line Numbers

![Code Blocks](images/screenshot-code.png)
_Code blocks with line numbers and copy functionality_

### Side-by-Side Diff

![Diff View](images/screenshot-diff.png)
_Compare before and after with diff view_

### Side Panel

![Side Panel](images/screenshot-sidepanel.png)
_Quick navigation and statistics_

## 🚀 Getting Started

### Prerequisites

- VS Code 1.106.1 or higher
- GitHub Copilot subscription (for AI model access)
- Git repository

### Installation

1. Install from VS Code Marketplace:

   - Open VS Code
   - Go to Extensions (`Ctrl+Shift+X` or `Cmd+Shift+X`)
   - Search for "AI Code Review"
   - Click Install

2. Or install from `.vsix`:
   ```bash
   code --install-extension codereview-ai-0.0.1.vsix
   ```

### Quick Start

1. **Open your project** in VS Code
2. **Make changes** on your feature branch
3. **Run the review**:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Type "AI Code Review: Review Changes"
   - Enter your target branch (e.g., `main`, `develop`)
4. **Review the results** in the webview panel

## ⚙️ Configuration

### AI Model Selection

Choose your preferred AI model in VS Code settings:

```json
{
  "aiCodeReview.aiModel.vendor": "copilot",
  "aiCodeReview.aiModel.family": "gpt-4"
}
```

Available options:

- **Vendor**: `copilot`, `openai`, `anthropic`
- **Family**: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`, `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`

### Review Rules

Customize what to check:

```json
{
  "aiCodeReview.reviewRules.checkSecurity": true,
  "aiCodeReview.reviewRules.checkPerformance": true,
  "aiCodeReview.reviewRules.checkCodeSmells": true,
  "aiCodeReview.reviewRules.checkTestCoverage": false,
  "aiCodeReview.reviewRules.checkDocumentation": false,
  "aiCodeReview.reviewRules.checkAccessibility": false,
  "aiCodeReview.reviewRules.strictness": "balanced"
}
```

**Strictness levels:**

- `strict`: Very thorough, flags even minor issues
- `balanced`: Focus on significant issues (default)
- `lenient`: Only critical bugs and security vulnerabilities

### Exclude Patterns

Ignore specific files or directories:

```json
{
  "aiCodeReview.excludePatterns": [
    "node_modules/**",
    "dist/**",
    "build/**",
    "*.min.js",
    "*.test.ts"
  ]
}
```

### Other Settings

```json
{
  "aiCodeReview.severityThreshold": "info", // Show: "error", "warning", or "info"
  "aiCodeReview.maxDiffSize": 30000, // Max characters to analyze
  "aiCodeReview.customPrompt": "", // Additional instructions for AI
  "aiCodeReview.enableAutoReview": false, // Auto-review on save
  "aiCodeReview.autoFixOnSave": false, // Auto-apply fixes on save
  "aiCodeReview.showInlineDecorations": true // Show inline issue markers
}
```

## 🎯 Usage Tips

### Best Practices

1. **Review Before MR**: Run reviews before creating merge requests
2. **Small Changesets**: Break large changes into smaller, reviewable chunks
3. **Iterate**: Apply fixes and re-run the review
4. **Use Filters**: Focus on errors first, then warnings
5. **Export Reports**: Attach review reports to your MRs for transparency

### Keyboard Shortcuts

You can add custom shortcuts for common actions:

```json
{
  "key": "ctrl+shift+r",
  "command": "pre-mr-review.reviewChanges"
}
```

### Chat Integration

Use the `@reviewer` participant in VS Code Chat:

```
@reviewer summarize              # Get a summary of the last review
@reviewer explain line 42       # Explain a specific issue
@reviewer fix this bug          # Get help fixing an issue
```

## 📤 Export Formats

### Markdown

Perfect for documentation and MR descriptions:

- Clean, readable format
- Issue grouping by file
- Severity indicators
- Code blocks with syntax

### HTML

Professional, printable reports:

- Styled, standalone HTML
- Color-coded severity
- Print-friendly
- Shareable via browser

### JSON

For programmatic processing:

- Structured data
- Metadata included
- Easy to parse
- CI/CD integration ready

## 🔧 Advanced Features

### Quick Fixes

Click "Apply Fix" on any issue to automatically apply the suggested change. The AI provides:

- Code replacements
- Insertions
- Deletions

### Batch Apply

Select multiple fixes and apply them all at once (coming soon).

### Review History

Access past reviews in the sidebar:

- Compare changes over time
- Re-open previous reviews
- Track improvements

### Side Panel

The "Current Review" panel shows:

- Summary statistics
- Issues by severity
- Issues by file
- Quick navigation

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes.

## 🐛 Known Issues

- Very large diffs (>30,000 characters) are truncated
- Line number accuracy depends on AI response quality
- Fix suggestions may not always be perfect

## 📜 License

This extension is licensed under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with [VS Code Extension API](https://code.visualstudio.com/api)
- Powered by [GitHub Copilot](https://github.com/features/copilot)
- Inspired by code review best practices from GitHub and GitLab

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/codereview-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/codereview-ai/discussions)
- **Email**: support@example.com

---

**Made with ❤️ by developers, for developers**
