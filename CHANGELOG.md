# Changelog

All notable changes to the "AI Code Review" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-20

### 🎉 Initial Public Release

First production-ready release of AI Code Review extension for VS Code Marketplace.

### ✨ Features

#### AI-Powered Code Analysis

- **Modern, Compact Design**: Redesigned webview with GitHub/GitLab-inspired interface
- **Proper Code Rendering**: Code blocks with syntax highlighting and line numbers
- **Copy-to-Clipboard**: One-click copy buttons for all code snippets
- **Diff View**: Side-by-side before/after comparison for fixes
- **Enhanced Navigation**: Click on issues now properly navigates to the exact line with highlighting
- **Color-Coded Badges**: Visual severity indicators (error=red, warning=yellow, info=blue)
- **Improved Spacing**: Reduced excessive vertical spacing for more compact layout
- **Loading States**: Visual feedback during AI analysis
- **Collapsible File Sections**: Better organization of issues by file
- **Search & Filter**: Find issues by keyword and filter by severity
- **Emoji Icons**: Better visual hierarchy with contextual icons

#### Changed

- Code snippets now display in proper monospace font with left alignment (fixed centering issue)
- Stats dashboard now uses compact card layout with color-coded values
- Action buttons redesigned with icons and better hover states
- Tab navigation improved with better visual feedback

### 🤖 AI & Configuration

#### Added

- **AI Model Selection**: Choose from multiple AI models:
  - GPT-4 (default)
  - GPT-4-Turbo
  - GPT-3.5-Turbo
  - Claude 3 Opus
  - Claude 3 Sonnet
  - Claude 3 Haiku
- **Review Strictness Levels**:
  - Strict: Very thorough, flags even minor issues
  - Balanced: Focus on significant issues (default)
  - Lenient: Only critical bugs and security
- **Granular Review Rules**: Enable/disable specific checks:
  - Security vulnerability detection
  - Performance issue identification
  - Code smell detection
  - Test coverage suggestions
  - Documentation completeness
  - Accessibility checks
- **Enhanced AI Prompts**: More sophisticated prompts for better issue detection

#### Changed

- AI now provides category-specific metrics (security issues, performance issues, code smells)
- Improved prompt engineering for more accurate line number detection
- Better error handling when AI models are unavailable

### 🎯 Features

#### Added

- **Side Panel Provider**: New "Current Review" panel in sidebar showing:
  - Summary statistics
  - Issues grouped by severity
  - Issues grouped by file
  - Quick navigation to issues
- **Enhanced Export**: Improved HTML and Markdown export formats
- **Line Highlighting**: Temporary highlighting when navigating to issues
- **Issue Categories**: Expanded from 5 to 10 categories including:
  - Security
  - Performance
  - Bug
  - Code Quality
  - Testing
  - Documentation
  - Code Smell
  - Best Practice
  - Accessibility
  - Maintainability

#### Changed

- Navigation now properly scrolls to and highlights the exact line
- Webview panel opens in side column for better workflow
- Export reports now include more detailed statistics

### 🔧 Developer Experience

#### Added

- Type definitions for all new features
- Comprehensive configuration schema in package.json
- Additional commands:
  - `pre-mr-review.navigateToIssue`: Navigate to specific issue
  - `pre-mr-review.refreshSidePanel`: Refresh side panel
- New view in activity bar: "Current Review"

#### Changed

- Configuration structure improved for better organization
- Better error messages and user feedback
- Improved code organization and modularity

### 📚 Documentation

#### Added

- Comprehensive README with:
  - Feature showcase
  - Screenshot placeholders
  - Configuration guide
  - Usage tips and best practices
  - Export format documentation
  - Keyboard shortcut suggestions
- Detailed changelog

### 🐛 Bug Fixes

- Fixed code snippets displaying as centered text instead of left-aligned code blocks
- Fixed navigation only opening files without going to the specific line
- Fixed excessive spacing between UI elements
- Improved line number accuracy in issue detection
- Fixed syntax highlighting issue where HTML tags were being incorrectly parsed in code blocks
- Fixed issue where file count was always showing as 0 in the side panel
- Fixed layout issues in the review report

### 💅 UI/UX Refinements

- **Complete UI Overhaul**: Implemented a new modern, aesthetic, and compact design system
- **Improved Typography**: Better font stack and readability with system fonts
- **Refined Color Palette**: Cleaner colors for badges, status indicators, and code blocks
- **Streamlined Actions**: Removed redundant "Chat" button from issue cards to reduce clutter
- **Grid Layout**: Improved header stats with a responsive grid layout

---

## [0.0.2] - 2025-11-18

### Changed

- Development iteration
- Bug fixes and improvements

## [0.0.1] - 2025-11-15

### Added

- Initial development release
- Basic functionality proof of concept

[1.0.0]: https://github.com/BogdanMihalca/codereview-ai/releases/tag/v1.0.0
[0.0.2]: https://github.com/BogdanMihalca/codereview-ai/releases/tag/v0.0.2
[0.0.1]: https://github.com/BogdanMihalca/codereview-ai/releases/tag/v0.0.1
