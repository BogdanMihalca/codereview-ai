# Quick Start Guide

## Installation & Setup

1. **Install Extension**

   - Open VS Code
   - Go to Extensions (Cmd+Shift+X)
   - Search for "CodeReview-AI"
   - Click Install

2. **Prerequisites**
   - GitHub Copilot subscription active
   - Working in a Git repository

## Basic Usage

### Running Your First Review

1. **Make Some Changes**

   ```bash
   # Edit some files in your project
   git add .
   git commit -m "my changes"
   ```

2. **Launch Review**
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "AI Code Review"
   - Select "AI Code Review: Review Changes"
3. **Enter Target Branch**

   - Type the branch you want to merge into (e.g., `main`, `develop`)
   - Press Enter

4. **View Results**
   - Interactive dashboard opens automatically
   - Issues appear in Problems panel
   - Inline comments show in your code

### Using the Dashboard

#### Filter Issues

Click the filter buttons to show specific severity levels:

- **All** - Show everything
- **Errors** - Critical issues only
- **Warnings** - Potential problems
- **Info** - Suggestions

#### Navigate to Code

- Click the file path (e.g., `src/app.ts:42`)
- Editor jumps to that line
- Issue is highlighted

#### Apply Quick Fixes

1. Find an issue with a "💡 Suggested Fix"
2. Click "Apply Fix" button
3. Code is automatically updated

#### Export Reports

Choose from multiple formats:

- **JSON** - For automation/CI
- **Markdown** - For documentation
- **HTML** - For sharing

### Using the Side Panel

1. **Open Activity Bar**
   - Click the "AI Code Review" icon (🔴 feedback icon)
2. **View History**
   - See all past reviews
   - Click any review to view details
3. **Quick Actions**
   - **Review Changes** - Start new review
   - **Clear History** - Delete all history

### Status Bar

The bottom status bar shows:

- ✅ `AI Review: No Issues` - All clear!
- ⚠️ `AI Review: 5 issues` - Warnings found
- ❌ `AI Review: 3 errors, 8 total` - Errors detected

Click it to launch a review instantly!

## Configuration

### Open Settings

1. Press `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)
2. Search for "AI Code Review"
3. Adjust settings

### Recommended Settings

```json
{
  // Only show errors and warnings (hide info)
  "aiCodeReview.severityThreshold": "warning",

  // Exclude test files
  "aiCodeReview.excludePatterns": [
    "**/*.test.ts",
    "**/*.spec.ts",
    "node_modules/**"
  ],

  // Custom focus areas
  "aiCodeReview.customPrompt": "Focus on React hooks and TypeScript types"
}
```

## Common Workflows

### Pre-Merge Review

```bash
# 1. Finish feature work
git add .
git commit -m "feat: new dashboard"

# 2. Review locally
# Run: AI Code Review: Review Changes
# Target: develop

# 3. Fix any issues found
# Apply quick fixes or edit manually

# 4. Push with confidence
git push origin feature/dashboard
```

### Daily Code Quality Check

```bash
# Review changes made today
git diff main..HEAD | less

# Run review to catch issues
# Fix before end of day
```

### Refactoring Validation

```bash
# After large refactor
git diff --stat

# Run review on all changes
# Ensure no regressions introduced
```

## Troubleshooting

### "No AI model available"

- **Solution**: Enable GitHub Copilot
  1. Install GitHub Copilot extension
  2. Sign in to GitHub
  3. Activate subscription

### "Git error"

- **Solution**: Ensure clean Git state
  ```bash
  git fetch origin
  git status
  ```

### "No changes to review"

- **Solution**: Commit changes first
  ```bash
  git add .
  git commit -m "changes"
  ```

### Large Diffs Truncated

- **Solution**: Adjust size limit
  ```json
  {
    "aiCodeReview.maxDiffSize": 50000
  }
  ```

## Tips & Best Practices

### ✅ Do's

- Run reviews on feature branches before MR
- Address all errors before pushing
- Use warnings as learning opportunities
- Export reports for team discussions
- Keep review history for tracking progress

### ❌ Don'ts

- Don't review on target branch (main/develop)
- Don't ignore critical security issues
- Don't set maxDiffSize too high (API limits)
- Don't disable diagnostics integration

## Keyboard Shortcuts

| Action               | Shortcut                       |
| -------------------- | ------------------------------ |
| Open Command Palette | `Cmd+Shift+P` / `Ctrl+Shift+P` |
| Open Settings        | `Cmd+,` / `Ctrl+,`             |
| Go to Line           | `Ctrl+G`                       |
| Quick Fix            | `Cmd+.` / `Ctrl+.`             |

## Next Steps

- Explore the webview dashboard features
- Customize settings for your project
- Set up team-wide configurations
- Integrate with your CI/CD pipeline

---

Need help? Check the full [README](./README.md) or report issues on GitHub.
