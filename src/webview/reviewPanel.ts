import * as vscode from "vscode";
import { ReviewIssue, ReviewResult, CodeFix, FixStatus } from "../types";
import { ReportExporter } from "../utils/exporters";
import { AIService } from "../services/aiService";
import { FixApplicator } from "../utils/fixApplicator";

export class ReviewWebviewPanel {
  public static currentPanel: ReviewWebviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _reviewResult: ReviewResult;
  private _targetBranch: string;
  private _fileCount: number;

  public static createOrShow(
    extensionUri: vscode.Uri,
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number
  ) {
    const column = vscode.ViewColumn.Beside;

    if (ReviewWebviewPanel.currentPanel) {
      ReviewWebviewPanel.currentPanel._panel.reveal(column);
      ReviewWebviewPanel.currentPanel.update(
        reviewResult,
        targetBranch,
        fileCount
      );
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "aiCodeReview",
      "AI Code Review",
      column,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "media"),
          vscode.Uri.joinPath(extensionUri, "out"),
        ],
      }
    );

    ReviewWebviewPanel.currentPanel = new ReviewWebviewPanel(
      panel,
      extensionUri,
      reviewResult,
      targetBranch,
      fileCount
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number
  ) {
    this._panel = panel;
    this._reviewResult = reviewResult;
    this._targetBranch = targetBranch;
    this._fileCount = fileCount;

    this.update(reviewResult, targetBranch, fileCount);

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "navigateToIssue":
            await this.navigateToIssue(message.file, message.line);
            break;
          case "exportReport":
            await this.exportReport(message.format);
            break;
          case "dismissIssue":
            await this.handleDismissIssue(message.issueIndex);
            break;
          case "explainIssue":
            await this.handleExplainIssue(message.issueIndex);
            break;
          case "openChat":
            const issueToChat = this._reviewResult.issues[message.issueIndex];
            const chatQuery = issueToChat 
                ? `@workspace Fix the issue in ${issueToChat.file}:${issueToChat.line}: "${issueToChat.message}". \n\nContext:\n${issueToChat.codeSnippet || ''}`
                : `Fix issue: ${message.message}`;
            
            await vscode.commands.executeCommand("workbench.action.chat.open", {
              query: chatQuery,
            });
            break;
          case "chatAboutIssue":
            await this.handleChatAboutIssue(
              message.issueIndex,
              message.message
            );
            break;
          case "applyFix":
            await this.handleApplyFix(message.issueIndex);
            break;
          case "showFixDiff":
            await this.handleShowFixDiff(message.issueIndex);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async handleApplyFix(issueIndex: number) {
    const issue = this._reviewResult.issues[issueIndex];
    if (!issue || !issue.suggestedFix) {
      return;
    }

    const fixContent =
      typeof issue.suggestedFix === "string"
        ? issue.suggestedFix
        : issue.suggestedFix.newCode;

    // Open Chat with the fix request
    await vscode.commands.executeCommand("workbench.action.chat.open", {
      query: `@workspace Fix the issue "${issue.message}" in ${issue.file}:${issue.line}. \n\nContext:\n${issue.codeSnippet || ''}\n\nSuggested fix:\n${fixContent}`,
    });
  }

  private async handleShowFixDiff(issueIndex: number) {
    const issue = this._reviewResult.issues[issueIndex];
    if (!issue || !issue.suggestedFix) {
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
      return;
    }

    try {
      await FixApplicator.showDiff(
        issue.file,
        issue.suggestedFix,
        workspaceRoot
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to show diff: ${(error as Error).message}`
      );
    }
  }

  private async navigateToIssue(file: string, line: number) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
      return;
    }

    try {
      const uri = vscode.Uri.file(`${workspaceRoot}/${file}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.One,
      });

      // Adjust for 0-based indexing
      const lineIndex = Math.max(0, line - 1);
      const position = new vscode.Position(lineIndex, 0);

      // Move cursor to the line
      editor.selection = new vscode.Selection(position, position);

      // Reveal and center the line
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );

      // Highlight the entire line temporarily
      const lineRange = doc.lineAt(lineIndex).range;
      editor.selection = new vscode.Selection(lineRange.start, lineRange.end);

      // Optional: Show decoration for better visibility
      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor(
          "editor.findMatchHighlightBackground"
        ),
        isWholeLine: true,
      });

      editor.setDecorations(decorationType, [lineRange]);

      // Remove decoration after 2 seconds
      setTimeout(() => {
        decorationType.dispose();
      }, 2000);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to navigate to ${file}:${line} - ${(error as Error).message}`
      );
    }
  }

  private async handleDismissIssue(issueIndex: number) {
    const issue = this._reviewResult.issues[issueIndex];
    if (!issue) {
      return;
    }

    issue.fixStatus = "dismissed";
    this.update(this._reviewResult, this._targetBranch, this._fileCount);
    vscode.window.showInformationMessage("Issue dismissed");
  }

  private async exportReport(format: "json" | "markdown" | "html") {
    await ReportExporter.export(
      this._reviewResult,
      format,
      this._targetBranch,
      this._fileCount
    );
  }

  public update(
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number
  ) {
    this._panel.webview.html = this._getHtmlContent(
      reviewResult,
      targetBranch,
      fileCount
    );
  }

  private _getHtmlContent(
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number
  ): string {
    const stats = this._calculateStats(reviewResult.issues);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Code Review</title>
    <style>
        :root {
            --container-padding: 0;
            --card-radius: 4px;
            --font-family: var(--vscode-font-family);
            --font-size: var(--vscode-font-size);
            --line-height: 1.5;
            
            --bg-color: var(--vscode-editor-background);
            --text-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-panel-border);
            --hover-bg: var(--vscode-list-hoverBackground);
            --active-bg: var(--vscode-list-activeSelectionBackground);
            --header-bg: var(--vscode-sideBar-background);
            
            --code-bg: var(--vscode-textCodeBlock-background);
            --code-border: var(--vscode-textSeparator-foreground);
            
            --accent-color: var(--vscode-textLink-foreground);
            --success-color: var(--vscode-charts-green, #4ec9b0);
            --warning-color: var(--vscode-charts-yellow, #dcdcaa);
            --error-color: var(--vscode-charts-red, #f48771);
            --info-color: var(--vscode-charts-blue, #569cd6);
            
            --keyword-color: #569cd6;
            --string-color: #ce9178;
            --comment-color: #6a9955;
            --function-color: #dcdcaa;
        }
        
        * { box-sizing: border-box; }
        
        body {
            font-family: var(--font-family);
            font-size: var(--font-size);
            color: var(--text-color);
            background-color: var(--bg-color);
            padding: 0;
            margin: 0;
            line-height: var(--line-height);
        }
        
        /* Header Stats */
        .header-stats {
            display: flex;
            gap: 1px;
            background: var(--border-color);
            margin-bottom: 16px;
            border-bottom: 1px solid var(--border-color);
        }
        
        .stat-item {
            flex: 1;
            padding: 12px;
            text-align: center;
            background: var(--header-bg);
            cursor: default;
        }
        
        .stat-value {
            font-size: 24px;
            font-weight: 300;
            display: block;
            margin-bottom: 4px;
        }
        
        .stat-label {
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.7;
            font-weight: 600;
        }
        
        .stat-item.error .stat-value { color: var(--error-color); }
        .stat-item.warning .stat-value { color: var(--warning-color); }
        .stat-item.info .stat-value { color: var(--info-color); }
        
        /* Tabs */
        .tabs {
            display: flex;
            padding: 0 16px;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 16px;
        }
        
        .tab {
            padding: 8px 16px;
            cursor: pointer;
            background: transparent;
            color: var(--text-color);
            border: none;
            border-bottom: 2px solid transparent;
            opacity: 0.7;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: 600;
        }
        
        .tab.active {
            opacity: 1;
            border-bottom-color: var(--accent-color);
        }
        
        .tab-content { display: none; padding: 0 16px 16px; }
        .tab-content.active { display: block; }

        /* Controls */
        .controls {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
            align-items: center;
        }
        
        .search-box {
            flex: 1;
            display: flex;
            align-items: center;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            padding: 4px 8px;
        }
        
        .search-box input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--vscode-input-foreground);
            outline: none;
            font-family: inherit;
        }
        
        .filter-btn {
            background: transparent;
            border: 1px solid var(--border-color);
            color: var(--text-color);
            padding: 4px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 11px;
            opacity: 0.7;
        }
        
        .filter-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
            opacity: 1;
        }

        /* File Groups */
        .file-group {
            margin-bottom: 16px;
            border: 1px solid var(--border-color);
            border-radius: var(--card-radius);
            overflow: hidden;
        }
        
        .file-header {
            background: var(--header-bg);
            padding: 8px 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
            border-bottom: 1px solid var(--border-color);
        }
        
        .file-header:hover { background: var(--hover-bg); }
        
        .file-issues { padding: 0; }
        .file-issues.collapsed { display: none; }
        
        /* Issue Card */
        .issue-card {
            padding: 12px;
            border-bottom: 1px solid var(--border-color);
            position: relative;
        }
        
        .issue-card:last-child { border-bottom: none; }
        
        .issue-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            align-items: center;
        }
        
        .issue-badges { display: flex; gap: 6px; align-items: center; }
        
        .badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 2px;
            font-weight: 600;
            text-transform: uppercase;
            border: 1px solid currentColor;
        }
        
        .badge.error { color: var(--error-color); background: rgba(244, 135, 113, 0.1); }
        .badge.warning { color: var(--warning-color); background: rgba(220, 220, 170, 0.1); }
        .badge.info { color: var(--info-color); background: rgba(86, 156, 214, 0.1); }
        
        .issue-location {
            font-family: monospace;
            font-size: 11px;
            opacity: 0.6;
            cursor: pointer;
        }
        .issue-location:hover { opacity: 1; color: var(--accent-color); }
        
        .issue-message {
            margin-bottom: 12px;
            font-size: 13px;
        }
        
        /* Code Block */
        .code-block {
            background: var(--code-bg);
            border: 1px solid var(--code-border);
            border-radius: 2px;
            margin: 8px 0;
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            overflow-x: auto;
        }
        
        .code-line {
            display: flex;
            padding: 0 4px;
        }
        
        .line-number {
            width: 30px;
            text-align: right;
            padding-right: 8px;
            color: var(--vscode-editorLineNumber-foreground);
            border-right: 1px solid var(--code-border);
            margin-right: 8px;
            user-select: none;
            opacity: 0.5;
        }
        
        .code-content { white-space: pre; flex: 1; }
        
        /* Syntax Highlighting */
        .keyword { color: var(--keyword-color); }
        .string { color: var(--string-color); }
        .comment { color: var(--comment-color); }
        .function { color: var(--function-color); }
        
        /* Actions */
        .actions {
            display: flex;
            gap: 8px;
            margin-top: 12px;
        }
        
        .btn {
            padding: 4px 10px;
            border: 1px solid var(--border-color);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 2px;
            cursor: pointer;
            font-size: 11px;
        }
        
        .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        
        .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
        
        /* Diff View */
        .diff-view {
            display: flex;
            border: 1px solid var(--code-border);
            border-radius: 2px;
            margin: 8px 0;
            font-family: monospace;
            font-size: 12px;
        }
        
        .diff-view.stacked {
            display: block;
        }

        .diff-header {
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 600;
            background: var(--header-bg);
            border-bottom: 1px solid var(--code-border);
            opacity: 0.8;
        }
        
        .diff-section {
            padding: 4px 0;
        }
        
        .diff-section.old {
            border-bottom: 1px solid var(--code-border);
        }

        .diff-col { flex: 1; overflow: hidden; }
        .diff-col.old { border-right: 1px solid var(--code-border); }
        
        .diff-line { padding: 2px 4px; white-space: pre; overflow-x: auto; min-height: 18px; }
        .diff-line.del { background: rgba(244, 135, 113, 0.2); }
        .diff-line.add { background: rgba(78, 201, 176, 0.2); }
        
        .loading { opacity: 0.6; font-style: italic; }
    </style>
</head>
<body>
    <div class="header-stats">
        <div class="stat-item error">
            <span class="stat-value">${stats.errors}</span>
            <span class="stat-label">Errors</span>
        </div>
        <div class="stat-item warning">
            <span class="stat-value">${stats.warnings}</span>
            <span class="stat-label">Warnings</span>
        </div>
        <div class="stat-item info">
            <span class="stat-value">${stats.info}</span>
            <span class="stat-label">Info</span>
        </div>
        <div class="stat-item">
            <span class="stat-value">${fileCount}</span>
            <span class="stat-label">Files</span>
        </div>
    </div>

    <div class="tabs">
        <button class="tab active" onclick="switchTab('issues')">Issues</button>
        <button class="tab" onclick="switchTab('mr-details')">MR Details</button>
    </div>

    <div id="tab-issues" class="tab-content active">
        <div class="controls">
            <div class="search-box">
                <span class="search-icon">🔍</span>
                <input type="text" id="issue-search" placeholder="Search issues..." oninput="filterIssues()">
            </div>
            <div style="display: flex; gap: 4px;">
                <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">All</button>
                <button class="filter-btn" data-filter="error" onclick="setFilter('error')">Errors</button>
                <button class="filter-btn" data-filter="warning" onclick="setFilter('warning')">Warnings</button>
                <button class="filter-btn" data-filter="info" onclick="setFilter('info')">Info</button>
            </div>
            <button class="btn" onclick="exportReport('markdown')">Export</button>
        </div>

        <div id="issues-container">
            ${this._renderIssues(reviewResult.issues)}
        </div>
    </div>

    <div id="tab-mr-details" class="tab-content">
        ${
          reviewResult.mrDescription || reviewResult.mrComment
            ? `
        <div class="mr-info-section">
            <div class="mr-info-header">
                <span>Pull Request Details</span>
            </div>
            
            ${
              reviewResult.mrDescription
                ? `
                <div style="margin-bottom: 8px; font-weight: 600; font-size: 11px; text-transform: uppercase; opacity: 0.7;">Description</div>
                <div class="mr-info-content" id="mr-desc">${this._escapeHtml(
                  reviewResult.mrDescription
                )}</div>
                <button class="btn" onclick="copyText('mr-desc')" style="margin-bottom: 16px;">Copy Description</button>
            `
                : ""
            }

            ${
              reviewResult.mrComment
                ? `
                <div style="margin-bottom: 8px; font-weight: 600; font-size: 11px; text-transform: uppercase; opacity: 0.7;">Quick Comment</div>
                <div class="mr-info-content" id="mr-comment">${this._escapeHtml(
                  reviewResult.mrComment
                )}</div>
                <button class="btn" onclick="copyText('mr-comment')">Copy Comment</button>
            `
                : ""
            }
        </div>
        `
            : '<div class="empty-state"><p>No MR details available.</p></div>'
        }
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function switchTab(tabId) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById('tab-' + tabId).classList.add('active');
        }

        function toggleFile(header) {
            header.classList.toggle('collapsed');
            const content = header.nextElementSibling;
            content.classList.toggle('collapsed');
        }

        function navigateTo(file, line) {
            vscode.postMessage({ type: 'navigateToIssue', file, line });
        }

        function explain(index) {
            const box = document.getElementById('explain-' + index);
            if (box.classList.contains('visible')) {
                box.classList.remove('visible');
            } else {
                box.innerHTML = '<div class="loading">Analyzing...</div>';
                vscode.postMessage({ type: 'explainIssue', issueIndex: index });
            }
        }

        function chatAbout(index, message) {
            vscode.postMessage({ type: 'openChat', issueIndex: index, message });
        }

        function applyFix(index) {
            vscode.postMessage({ type: 'applyFix', issueIndex: index });
        }

        function dismiss(index) {
            vscode.postMessage({ type: 'dismissIssue', issueIndex: index });
        }
        
        function exportReport(format) {
            vscode.postMessage({ type: 'exportReport', format });
        }

        function copyText(elementId) {
            const text = document.getElementById(elementId).innerText;
            navigator.clipboard.writeText(text).then(() => {
                // Show toast or feedback
            });
        }

        function copyCode(codeId) {
            const codeElement = document.getElementById(codeId);
            if (!codeElement) return;
            
            const text = codeElement.innerText;
            navigator.clipboard.writeText(text).then(() => {
                // Feedback
            });
        }

        // Message Handling
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'explanationLoading') {
                const box = document.getElementById('explain-' + msg.issueIndex);
                box.classList.add('visible');
                box.innerHTML = '<div class="loading">Thinking...</div>';
            } else if (msg.type === 'explanationResult') {
                const box = document.getElementById('explain-' + msg.issueIndex);
                box.innerHTML = '<strong>AI Explanation:</strong><br><br>' + msg.explanation.replace(/\\n/g, '<br>');
            }
        });

        function setFilter(filter) {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.filter-btn[data-filter="' + filter + '"]').classList.add('active');
            filterIssues();
        }

        function filterIssues() {
            const severityFilter = document.querySelector('.filter-btn.active').dataset.filter;
            const searchInput = document.getElementById('issue-search');
            const searchText = searchInput ? searchInput.value.toLowerCase() : '';
            
            document.querySelectorAll('.issue-card').forEach(card => {
                const severity = card.dataset.severity;
                const content = card.innerText.toLowerCase();
                
                const matchesSeverity = severityFilter === 'all' || severity === severityFilter;
                const matchesSearch = content.includes(searchText);
                
                if (matchesSeverity && matchesSearch) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
            
            // Update file visibility
            document.querySelectorAll('.file-group').forEach(group => {
                const visibleIssues = group.querySelectorAll('.issue-card:not([style*="display: none"])').length;
                if (visibleIssues > 0) {
                    group.style.display = 'block';
                } else {
                    group.style.display = 'none';
                }
            });
        }
        
        // Syntax Highlighting
        function highlightCode() {
            document.querySelectorAll('.code-line').forEach(el => {
                let html = el.innerHTML;
                // Comments
                html = html.replace(/(\\/\\/.*$)/gm, '<span class="comment">$1</span>');
                // Strings
                html = html.replace(/('.*?'|".*?")/g, '<span class="string">$1</span>');
                // Keywords
                html = html.replace(/\\b(const|let|var|function|class|import|export|return|if|else|for|while|async|await|new|this|super|extends|implements|interface|type|public|private|protected|static|readonly)\\b/g, '<span class="keyword">$1</span>');
                el.innerHTML = html;
            });
        }
        
        // Run highlighting
        highlightCode();
    </script>
</body>
</html>`;
  }

  private _calculateStats(issues: ReviewIssue[]) {
    return {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
      total: issues.length,
    };
  }

  private _getFixPreview(fix: string | CodeFix): string {
    if (typeof fix === "string") {
      return fix;
    }
    return `${fix.description}\n\n${fix.newCode}`;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  private _escapeJson(text: string): string {
    return JSON.stringify(text);
  }

  private _escapeString(text: string): string {
    return text.replace(/'/g, "\\'");
  }

  private _renderIssues(issues: ReviewIssue[]): string {
    if (issues.length === 0) {
      return '<div class="empty-state"><h2>✅ Clean Code!</h2><p>No issues found in this review.</p></div>';
    }

    const issuesByFile = new Map<
      string,
      { issues: ReviewIssue[]; indices: number[] }
    >();
    issues.forEach((issue, index) => {
      if (!issuesByFile.has(issue.file)) {
        issuesByFile.set(issue.file, { issues: [], indices: [] });
      }
      issuesByFile.get(issue.file)!.issues.push(issue);
      issuesByFile.get(issue.file)!.indices.push(index);
    });

    let html = "";
    for (const [file, group] of issuesByFile) {
      html += `
            <div class="file-group">
                <div class="file-header" onclick="toggleFile(this)">
                    <div class="file-name">
                        <span class="toggle-icon">▼</span>
                        ${this._escapeHtml(file)}
                    </div>
                    <span class="file-issues-count">${
                      group.issues.length
                    }</span>
                </div>
                <div class="file-issues">
        `;

      group.issues.forEach((issue, i) => {
        const index = group.indices[i];

        html += `
                <div class="issue-card" data-severity="${issue.severity}">
                    <div class="issue-header">
                        <div class="issue-badges">
                            <span class="badge ${issue.severity}">${
          issue.severity
        }</span>
                            <span class="badge category">${
                              issue.category
                            }</span>
                        </div>
                        <div class="issue-location" onclick="navigateTo('${this._escapeString(
                          issue.file
                        )}', ${issue.line})">
                            ${issue.file}:${issue.line}
                        </div>
                    </div>
                    
                    <div class="issue-message">${this._escapeHtml(
                      issue.message
                    )}</div>
                    
                    ${
                      issue.codeSnippet
                        ? this._renderCodeBlock(
                            issue.codeSnippet,
                            issue.line,
                            index
                          )
                        : ""
                    }
                    
                    ${
                      issue.suggestedFix
                        ? this._renderFixPreview(
                            issue.suggestedFix,
                            index,
                            issue.codeSnippet
                          )
                        : ""
                    }
                    
                    <div class="explanation" id="explain-${index}"></div>
                    
                    <div class="actions">
                        ${
                          issue.suggestedFix
                            ? `<button class="btn btn-primary" onclick="applyFix(${index})">✨ Apply with AI</button>`
                            : ""
                        }
                        <button class="btn" onclick="navigateTo('${this._escapeString(
                          issue.file
                        )}', ${issue.line})">Go to File</button>
                        <button class="btn" onclick="explain(${index})">Explain</button>
                        ${
                          issue.fixStatus !== "applied"
                            ? `<button class="btn" onclick="dismiss(${index})">Dismiss</button>`
                            : ""
                        }
                        <button class="btn ai-chat-btn" onclick="chatAbout(${index}, '${this._escapeString(
          issue.message
        )}')">
                            Chat
                        </button>
                    </div>
                </div>
            `;
      });

      html += `</div></div>`;
    }
    return html;
  }

  private _renderCodeBlock(
    code: string,
    lineNumber: number,
    issueIndex: number
  ): string {
    const lines = code.split("\n");
    const startLine = lineNumber;

    let html = `<div class="code-block" id="code-${issueIndex}">`;

    lines.forEach((line, idx) => {
      const currentLine = startLine + idx;
      html += `
        <div class="code-line">
            <span class="line-number">${currentLine}</span>
            <span class="code-content">${this._escapeHtml(line)}</span>
        </div>`;
    });

    html += `</div>`;
    return html;
  }

  private _renderFixPreview(
    fix: string | CodeFix,
    issueIndex: number,
    originalCode?: string
  ): string {
    const fixContent = typeof fix === "string" ? fix : fix.newCode;
    const fixDescription =
      typeof fix === "string" ? "Suggested Fix" : fix.description;

    // If we have both original and fixed code, show a diff view
    if (originalCode && typeof fix !== "string") {
      return this._renderDiffView(originalCode, fixContent, issueIndex);
    }

    // Otherwise show simple fix preview
    const lines = fixContent.split("\n");

    let html = `<div class="code-block" style="border-left: 3px solid var(--success-color);">`;

    // Add description header
    html += `<div style="padding: 4px 8px; font-size: 11px; opacity: 0.7; border-bottom: 1px solid var(--code-border);">✨ ${this._escapeHtml(
      fixDescription
    )}</div>`;

    lines.forEach((line, idx) => {
      html += `
        <div class="code-line">
            <span class="line-number">${idx + 1}</span>
            <span class="code-content">${this._escapeHtml(line)}</span>
        </div>`;
    });

    html += `</div>`;
    return html;
  }

  private _renderDiffView(
    oldCode: string,
    newCode: string,
    issueIndex: number
  ): string {
    const oldLines = oldCode.split("\n");
    const newLines = newCode.split("\n");

    let html = '<div class="diff-view">';
    
    // Simple side-by-side if line counts match, otherwise stacked
    if (oldLines.length === newLines.length) {
        let oldHtml = "";
        let newHtml = "";
        
        oldLines.forEach((line, i) => {
            const newLine = newLines[i];
            const isDiff = line !== newLine;
            const oldClass = isDiff ? "diff-line del" : "diff-line";
            const newClass = isDiff ? "diff-line add" : "diff-line";
            
            oldHtml += `<div class="${oldClass}">${this._escapeHtml(line || ' ')}</div>`;
            newHtml += `<div class="${newClass}">${this._escapeHtml(newLine || ' ')}</div>`;
        });
        
        html += `<div class="diff-col old">${oldHtml}</div>`;
        html += `<div class="diff-col new">${newHtml}</div>`;
    } else {
        // Stacked view for mismatched line counts
        html = '<div class="diff-view stacked">';
        html += '<div class="diff-header">Original</div>';
        html += '<div class="diff-section old">';
        oldLines.forEach(line => {
            html += `<div class="diff-line del">- ${this._escapeHtml(line)}</div>`;
        });
        html += '</div>';
        
        html += '<div class="diff-header">Suggested</div>';
        html += '<div class="diff-section new">';
        newLines.forEach(line => {
            html += `<div class="diff-line add">+ ${this._escapeHtml(line)}</div>`;
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
  }

  private async handleExplainIssue(issueIndex: number) {
    const issue = this._reviewResult.issues[issueIndex];
    if (!issue) {
      return;
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
      return;
    }

    try {
      // Read file content for context
      const uri = vscode.Uri.file(`${workspaceRoot}/${issue.file}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      const content = doc.getText();

      // Show loading state in UI
      this._panel.webview.postMessage({
        type: "explanationLoading",
        issueIndex,
      });

      const explanation = await AIService.explainIssue(issue, content);

      // Send explanation back to UI
      this._panel.webview.postMessage({
        type: "explanationResult",
        issueIndex,
        explanation,
      });
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to explain issue: ${(error as Error).message}`
      );
      this._panel.webview.postMessage({
        type: "explanationError",
        issueIndex,
      });
    }
  }

  private async handleChatAboutIssue(issueIndex: number, message: string) {
    const issue = this._reviewResult.issues[issueIndex];
    if (!issue) {
      return;
    }

    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
      if (!workspaceRoot) {
        return;
      }

      // Read file content for context
      const uri = vscode.Uri.file(`${workspaceRoot}/${issue.file}`);
      const doc = await vscode.workspace.openTextDocument(uri);
      const content = doc.getText();

      // Send to AI service and get response
      const response = await AIService.chatAboutIssue(issue, message, content);

      // Show response in a new webview or a notification
      vscode.window.showInformationMessage(response);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to chat about issue: ${(error as Error).message}`
      );
    }
  }

  public dispose() {
    ReviewWebviewPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
