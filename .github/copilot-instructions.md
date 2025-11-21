# AI Code Review Extension - Development Guide

## Architecture Overview

This is a VS Code extension that performs AI-powered code reviews on git diffs before merge requests. The extension uses VS Code's Language Model API (vscode.lm) to access GitHub Copilot, OpenAI, or Anthropic models.

**Core Flow**: User triggers review → Git diff extracted → AI analyzes changes → Issues displayed in webview panel, diagnostics, comments, side panel, and chat participant.

### Key Components

- **`src/extension.ts`**: Main activation/command registration. Orchestrates git diff extraction, AI analysis, and UI updates (diagnostics, comments, status bar, history, side panel).
- **`src/services/aiService.ts`**: AI integration via `vscode.lm.selectChatModels()`. Builds structured prompts based on ReviewRules config, parses JSON responses, and verifies line numbers against actual file content.
- **`src/webview/reviewPanel.ts`**: Large HTML/CSS/JS generator (~1688 lines) for the main review UI. Handles diff rendering, syntax highlighting (highlight.js), and fix application.
- **`src/chat/participant.ts`**: Chat participant `@reviewer` with commands: `/summarize`, `/explain`, `/fix`.
- **`src/providers/historyProvider.ts`**: TreeView provider for review history (max 20 items stored in global state).
- **`src/providers/reviewSidePanelProvider.ts`**: TreeView provider for current review summary sidebar.
- **`src/utils/fixApplicator.ts`**: Applies structured CodeFix objects (replace/insert/delete) with diff preview support.

## Data Types (src/types.ts)

- **ReviewResult**: Contains summary, MR description, issues array, and metadata (branch info, file counts, statistics).
- **ReviewIssue**: file, line, severity (error/warning/info), category (Security/Performance/Bug/etc), suggestedFix (string or CodeFix object).
- **CodeFix**: Structured fix with type (replace/insert/delete), startLine, endLine, newCode.
- **ReviewRules**: Configurable checks (security, performance, code smells, test coverage, documentation, accessibility) + strictness level (strict/balanced/lenient).

## Configuration Patterns

The extension uses `vscode.workspace.getConfiguration('aiCodeReview')` extensively. Key settings:

- **aiModel.vendor/family**: Selects AI provider and model family (e.g., "copilot" + "claude-sonnet-4").
- **reviewRules.strictness**: Controls AI prompt instructions ("strict" = thorough, "lenient" = critical only).
- **excludePatterns**: Glob patterns to filter files from review (default: node_modules, dist, test files).
- **maxDiffSize**: Token limit protection (default 10000 lines, with truncation warning).

See `src/utils/config.ts` for `getConfig()` and `shouldExcludeFile()` helpers.

## Development Workflow

### Building & Testing

```bash
npm run watch          # Webpack watch mode (npm script alias for webpack --watch)
npm run watch-tests    # TypeScript watch for tests
npm run package        # Production build with source maps
npm run lint           # ESLint check
npm run test           # Run tests (vscode-test)
```

**Tasks**: The workspace has pre-configured VS Code tasks (`npm: watch`, `npm: watch-tests`, `tasks: watch-tests` composite). Use `Ctrl+Shift+B` to run default build task.

### Extension Development

1. Press `F5` to launch Extension Development Host
2. Open a git repository in the host window
3. Make changes on a feature branch
4. Run command: "AI Code Review: Review Changes"
5. Check Debug Console in main VS Code window for logs

### Git Integration

The extension shells out to `git` commands (via `util.promisify(exec)`):

- `git branch --show-current` - Get current branch
- `git diff ${targetBranch}..HEAD` - Get diff
- `git diff --name-only ${targetBranch}..HEAD` - Get changed files list

**File Filtering**: After getting changed files, the extension filters by excludePatterns, then re-fetches diff only for included files to save tokens.

## Critical Conventions

### Line Number Verification

AI models often hallucinate line numbers. `aiService.ts` implements post-processing:

1. AI returns `codeSnippet` with each issue
2. Extension verifies snippet matches actual file content at reported line
3. If mismatch, searches entire file for snippet and corrects line number
4. Logs corrections to console: `"Corrected line number for {file}: {old} -> {new}"`

### Fix Application Flow

1. AI returns `suggestedFix` (string or CodeFix object)
2. Extension stores fixes in `fixesMap` keyed by `"${uri}:${line}:${character}"`
3. `AIReviewCodeActionProvider` exposes fixes as Quick Fix actions in Problems panel
4. `FixApplicator.applyFix()` handles structured CodeFix formats with workspace edits
5. Webview panel also supports one-click fix application via message passing

### Webview Communication

`reviewPanel.ts` uses `webview.onDidReceiveMessage()` to handle actions:

- `navigateToIssue`: Opens file, highlights line, auto-dismisses decoration after 2s
- `exportReport`: Uses `ReportExporter` to generate Markdown/HTML/JSON
- `applyFix`/`applyAllFixes`: Delegates to `FixApplicator`
- `dismissIssue`/`regenerateFix`: Updates ReviewResult state and refreshes webview

### Multi-UI Synchronization

When review completes, `reviewChangesBeforeMR()` updates 5 UI surfaces:

1. **Diagnostics Collection**: `vscode.languages.createDiagnosticCollection()`
2. **Comment Threads**: `commentController.createCommentThread()` with MarkdownString body
3. **Status Bar**: Shows error count and total issues
4. **History TreeView**: Persists to `context.globalState`, max 20 items
5. **Side Panel TreeView**: Current review statistics and issue navigation

## AI Prompt Structure

`aiService.ts._buildReviewPrompt()` builds a structured prompt:

1. Strictness instructions (3 levels of detail)
2. Review focus areas (based on enabled rules)
3. Changed files list
4. Git diff content (truncated if > maxDiffSize)
5. Custom prompt (if configured)
6. JSON schema for response format

**Expected Response**: JSON with `summary`, `mrDescription`, `issues[]` array. Issues must include `file`, `line`, `codeSnippet`, `message`, `severity`, `category`, `suggestedFix`.

## Extension Manifest (package.json)

### Activation

- `activationEvents: ["onStartupFinished"]` - Loads on VS Code start
- Commands registered with `pre-mr-review.*` prefix
- Activity bar view container: `ai-code-review` with two TreeViews

### Chat Participant

- ID: `ai-reviewer.codereview-ai.reviewer`
- Name: `@reviewer`
- Commands: `/summarize`, `/explain`, `/fix`
- Accesses latest review from `historyProvider.getLatestReview()`

### Contribution Points

- 6 commands (reviewChanges, clearHistory, showHistoryItem, openSettings, navigateToIssue, refreshSidePanel)
- 2 TreeViews (reviewHistory, reviewSidePanel)
- Command palette filtering with `when` clauses to hide internal commands
- View title menu buttons with navigation icons

## Common Pitfalls

1. **Token Limits**: Always check `maxDiffSize` config. Large diffs cause timeouts or garbage responses.
2. **Path Handling**: Use `path.join(workspaceRoot, file)` for absolute paths. Git returns relative paths.
3. **Async Race Conditions**: `vscode.window.withProgress()` blocks until complete. Process results outside callback to avoid UI freezes.
4. **Webview Lifecycle**: Check `ReviewWebviewPanel.currentPanel` before creating new panel. Use `reveal()` to focus existing.
5. **Line Number Off-by-One**: VS Code uses 0-indexed lines internally, AI returns 1-indexed. Use `Math.max(0, issue.line - 1)` for Position/Range.
6. **Model Availability**: Always check `models.length === 0` after `vscode.lm.selectChatModels()`. Show actionable error about Copilot subscription.

## Testing Patterns

Test files use `@vscode/test-electron` framework:

- `src/test/extension.test.ts` - Main test suite
- Tests require Extension Development Host launch
- Use `vscode.extensions.getExtension()` to access extension API

Compile tests separately with `npm run compile-tests` (outputs to `out/`).
