import * as vscode from "vscode";
import { ReviewIssue, ReviewResult, CodeFix, FixStatus } from "../types";
import { ReportExporter } from "../utils/exporters";
import { AIService } from "../services/aiService";
import { FixApplicator } from "../utils/fixApplicator";
import hljs from "highlight.js";

export class ReviewWebviewPanel {
  public static currentPanel: ReviewWebviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _reviewResult: ReviewResult;
  private _targetBranch: string;
  private _fileCount: number;
  private _currentBranch: string;
  private _changedFiles: string[];

  public static createOrShow(
    extensionUri: vscode.Uri,
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number,
    currentBranch: string = "",
    changedFiles: string[] = []
  ) {
    const column = vscode.ViewColumn.Beside;

    if (ReviewWebviewPanel.currentPanel) {
      ReviewWebviewPanel.currentPanel._panel.reveal(column);
      ReviewWebviewPanel.currentPanel.update(
        reviewResult,
        targetBranch,
        fileCount,
        currentBranch,
        changedFiles
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
      fileCount,
      currentBranch,
      changedFiles
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number,
    currentBranch: string = "",
    changedFiles: string[] = []
  ) {
    this._panel = panel;
    this._reviewResult = reviewResult;
    this._targetBranch = targetBranch;
    this._fileCount = fileCount;
    this._currentBranch = currentBranch;
    this._changedFiles = changedFiles;

    this.update(
      reviewResult,
      targetBranch,
      fileCount,
      currentBranch,
      changedFiles
    );

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
              ? `workspace /fix the issue in ${issueToChat.file}:${
                  issueToChat.line
                }: "${issueToChat.message}". \n\nContext:\n${
                  issueToChat.codeSnippet || ""
                }`
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
      query: `@workspace /fix the issue "${issue.message}" in ${issue.file}:${
        issue.line
      }. \n\nContext:\n${
        issue.codeSnippet || ""
      }\n\nSuggested fix:\n${fixContent}`,
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
    this.update(
      this._reviewResult,
      this._targetBranch,
      this._fileCount,
      this._currentBranch,
      this._changedFiles
    );
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
    fileCount: number,
    currentBranch: string = "",
    changedFiles: string[] = []
  ) {
    this._currentBranch = currentBranch;
    this._changedFiles = changedFiles;
    this._panel.webview.html = this._getHtmlContent(
      reviewResult,
      targetBranch,
      fileCount,
      currentBranch,
      changedFiles
    );
  }

  private _getHtmlContent(
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number,
    currentBranch: string = "",
    changedFiles: string[] = []
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
            --container-padding: 16px;
            --card-radius: 6px;
            --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            --font-size: 13px;
            --line-height: 1.5;
            
            --bg-color: var(--vscode-editor-background);
            --text-color: var(--vscode-editor-foreground);
            --border-color: var(--vscode-widget-border);
            --hover-bg: var(--vscode-list-hoverBackground);
            --active-bg: var(--vscode-list-activeSelectionBackground);
            --header-bg: var(--vscode-editor-background);
            --card-bg: var(--vscode-editor-background);
            
            --code-bg: var(--vscode-textBlockQuote-background);
            --code-border: var(--vscode-textBlockQuote-border);
            
            --accent-color: var(--vscode-textLink-foreground);
            --success-color: #4ec9b0;
            --warning-color: #cca700;
            --error-color: #f14c4c;
            --info-color: #3794ff;
            
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
            padding: var(--container-padding);
            margin: 0;
            line-height: var(--line-height);
        }
        
        /* Header Stats */
        .header-stats {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
        }
        
        .stat-item {
            padding: 12px;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: var(--card-radius);
            text-align: center;
            transition: transform 0.1s ease;
        }
        
        .stat-item:hover {
            transform: translateY(-1px);
            border-color: var(--accent-color);
        }
        
        .stat-value {
            font-size: 20px;
            font-weight: 600;
            display: block;
            margin-bottom: 4px;
        }
        
        .stat-label {
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.7;
            font-weight: 600;
            letter-spacing: 0.5px;
        }
        
        .stat-item.error .stat-value { color: var(--error-color); }
        .stat-item.warning .stat-value { color: var(--warning-color); }
        .stat-item.info .stat-value { color: var(--info-color); }
        
        /* Tabs */
        .tabs {
            display: flex;
            gap: 20px;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 20px;
            padding: 0 4px;
        }
        
        .tab {
            padding: 8px 0;
            cursor: pointer;
            background: transparent;
            color: var(--text-color);
            border: none;
            border-bottom: 2px solid transparent;
            opacity: 0.6;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s;
        }
        
        .tab:hover { opacity: 1; }
        
        .tab.active {
            opacity: 1;
            border-bottom-color: var(--accent-color);
            color: var(--accent-color);
        }
        
        .tab-content { display: none; animation: fadeIn 0.3s ease; }
        .tab-content.active { display: block; }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Controls */
        .controls {
            display: flex;
            gap: 12px;
            margin-bottom: 20px;
            align-items: center;
        }
        
        .search-box {
            flex: 1;
            display: flex;
            align-items: center;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 6px 10px;
        }
        
        .search-box:focus-within {
            border-color: var(--vscode-focusBorder);
        }
        
        .search-box input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--vscode-input-foreground);
            outline: none;
            font-family: inherit;
            font-size: 13px;
            margin-left: 8px;
        }
        
        .filter-group {
            display: flex;
            background: var(--vscode-button-secondaryBackground);
            border-radius: 4px;
            padding: 2px;
        }
        
        .filter-btn {
            background: transparent;
            border: none;
            color: var(--vscode-button-secondaryForeground);
            padding: 4px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
        }
        
        .filter-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }

        /* File Groups */
        .file-group {
            margin-bottom: 16px;
            border: 1px solid var(--border-color);
            border-radius: var(--card-radius);
            overflow: hidden;
            background: var(--card-bg);
        }
        
        .file-header {
            background: var(--vscode-sideBar-background);
            padding: 10px 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            border-bottom: 1px solid var(--border-color);
            user-select: none;
        }
        
        .file-header:hover { background: var(--hover-bg); }
        
        .file-name { display: flex; align-items: center; gap: 8px; }
        .toggle-icon { font-size: 10px; transition: transform 0.2s; }
        .file-header.collapsed .toggle-icon { transform: rotate(-90deg); }
        .file-header.collapsed { border-bottom: none; }
        
        .file-issues-count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }
        
        .file-issues { padding: 0; }
        .file-issues.collapsed { display: none; }
        
        /* Issue Card */
        .issue-card {
            padding: 16px;
            border-bottom: 1px solid var(--border-color);
            position: relative;
        }
        
        .issue-card:last-child { border-bottom: none; }
        
        .issue-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            align-items: flex-start;
        }
        
        .issue-badges { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        
        .badge {
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 12px;
            font-weight: 600;
            text-transform: capitalize;
            display: inline-flex;
            align-items: center;
            gap: 4px;
        }
        
        .badge.error { color: var(--error-color); background: rgba(241, 76, 76, 0.1); border: 1px solid rgba(241, 76, 76, 0.2); }
        .badge.warning { color: var(--warning-color); background: rgba(204, 167, 0, 0.1); border: 1px solid rgba(204, 167, 0, 0.2); }
        .badge.info { color: var(--info-color); background: rgba(55, 148, 255, 0.1); border: 1px solid rgba(55, 148, 255, 0.2); }
        
        .badge.category {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border: none;
            opacity: 0.8;
        }
        
        .issue-location {
            font-family: 'Menlo', 'Monaco', monospace;
            font-size: 11px;
            opacity: 0.6;
            cursor: pointer;
            padding: 2px 6px;
            border-radius: 4px;
            transition: all 0.2s;
        }
        .issue-location:hover { 
            opacity: 1; 
            background: var(--hover-bg);
            color: var(--accent-color); 
        }
        
        .issue-message {
            margin-bottom: 16px;
            font-size: 14px;
            line-height: 1.6;
        }
        
        /* Code Block */
        .code-block {
            background: var(--code-bg);
            border: 1px solid var(--code-border);
            border-radius: 4px;
            margin: 12px 0;
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            font-size: 12px;
            overflow-x: auto;
            padding: 8px 0;
        }
        
        .code-line {
            display: flex;
            padding: 2px 12px;
            line-height: 1.5;
        }
        
        .code-line:hover { background: rgba(255,255,255,0.05); }
        
        .line-number {
            width: 35px;
            text-align: right;
            padding-right: 12px;
            color: var(--vscode-editorLineNumber-foreground);
            border-right: 1px solid var(--code-border);
            margin-right: 12px;
            user-select: none;
            opacity: 0.5;
            font-size: 11px;
        }
        
        .code-content { white-space: pre; flex: 1; color: var(--vscode-editor-foreground); }
        
        /* Syntax Highlighting - highlight.js classes */
        .hljs-keyword { color: var(--keyword-color); font-weight: bold; }
        .hljs-string { color: var(--string-color); }
        .hljs-comment { color: var(--comment-color); font-style: italic; }
        .hljs-function { color: var(--function-color); }
        .hljs-title { color: var(--function-color); }
        .hljs-params { color: var(--vscode-editor-foreground); }
        .hljs-number { color: #b5cea8; }
        .hljs-literal { color: #569cd6; }
        .hljs-built_in { color: #4ec9b0; }
        .hljs-class { color: #4ec9b0; }
        .hljs-variable { color: #9cdcfe; }
        .hljs-attr { color: #9cdcfe; }
        .hljs-property { color: #9cdcfe; }
        .hljs-operator { color: var(--vscode-editor-foreground); }
        
        /* Actions */
        .actions {
            display: flex;
            gap: 8px;
            margin-top: 16px;
            flex-wrap: wrap;
        }
        
        .btn {
            padding: 6px 12px;
            border: 1px solid var(--border-color);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        
        .btn:hover { 
            background: var(--vscode-button-secondaryHoverBackground);
            transform: translateY(-1px);
        }
        
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        
        .btn-primary:hover { 
            background: var(--vscode-button-hoverBackground);
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        /* Diff View */
        .diff-view {
            display: flex;
            border: 1px solid var(--code-border);
            border-radius: 4px;
            margin: 12px 0;
            font-family: monospace;
            font-size: 12px;
            overflow: hidden;
        }
        
        .diff-view.stacked {
            display: block;
        }

        .diff-header {
            padding: 6px 12px;
            font-size: 11px;
            font-weight: 600;
            background: var(--header-bg);
            border-bottom: 1px solid var(--code-border);
            opacity: 0.8;
            text-transform: uppercase;
        }
        
        .diff-section {
            padding: 4px 0;
        }
        
        .diff-section.old {
            border-bottom: 1px solid var(--code-border);
        }

        .diff-col { flex: 1; overflow: hidden; }
        .diff-col.old { border-right: 1px solid var(--code-border); }
        
        .diff-line { padding: 2px 12px; white-space: pre; overflow-x: auto; min-height: 20px; }
        .diff-line.del { background: rgba(244, 135, 113, 0.15); text-decoration: line-through; opacity: 0.8; }
        .diff-line.add { background: rgba(78, 201, 176, 0.15); }
        
        .loading { opacity: 0.6; font-style: italic; padding: 12px; }
        
        .explanation {
            margin-top: 12px;
            padding: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--accent-color);
            border-radius: 0 4px 4px 0;
            display: none;
        }
        
        .explanation.visible { display: block; animation: fadeIn 0.3s; }
        
        /* MR Details Styles */
        .mr-section {
            margin-bottom: 20px;
            border: 1px solid var(--border-color);
            border-radius: var(--card-radius);
            overflow: hidden;
            background: var(--card-bg);
        }
        
        .mr-section-header {
            padding: 12px 16px;
            background: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--border-color);
            font-weight: 600;
            font-size: 13px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        
        .mr-section-header-title {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .mr-section-content {
            padding: 16px;
        }
        
        .mr-metadata {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }
        
        .mr-metadata-item {
            padding: 12px;
            background: var(--vscode-input-background);
            border: 1px solid var(--border-color);
            border-radius: 4px;
        }
        
        .mr-metadata-label {
            font-size: 11px;
            text-transform: uppercase;
            opacity: 0.6;
            font-weight: 600;
            margin-bottom: 4px;
        }
        
        .mr-metadata-value {
            font-family: 'Menlo', 'Monaco', monospace;
            font-size: 13px;
            font-weight: 500;
        }
        
        .mr-text-block {
            background: var(--code-bg);
            border: 1px solid var(--code-border);
            border-radius: 4px;
            padding: 12px;
            margin-bottom: 12px;
            font-size: 13px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .mr-file-list {
            margin: 0;
            padding: 0;
            list-style: none;
        }
        
        .mr-file-item {
            padding: 8px 12px;
            border-bottom: 1px solid var(--border-color);
            font-family: 'Menlo', 'Monaco', monospace;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.2s;
        }
        
        .mr-file-item:last-child {
            border-bottom: none;
        }
        
        .mr-file-item:hover {
            background: var(--hover-bg);
        }
        
        .mr-file-icon {
            opacity: 0.6;
            font-size: 14px;
        }
        
        .mr-command-block {
            background: var(--code-bg);
            border: 1px solid var(--code-border);
            border-radius: 4px;
            padding: 12px;
            font-family: 'Menlo', 'Monaco', monospace;
            font-size: 12px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        }
        
        .mr-command-text {
            flex: 1;
            color: var(--string-color);
        }
        
        .copy-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--border-color);
            padding: 4px 10px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s;
            white-space: nowrap;
        }
        
        .copy-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            transform: translateY(-1px);
        }
        
        .copy-btn.copied {
            background: var(--success-color);
            color: white;
            border-color: var(--success-color);
        }
        
        .empty-state {
            padding: 40px 20px;
            text-align: center;
            opacity: 0.6;
        }
        
        .empty-state h2 {
            font-size: 18px;
            margin-bottom: 8px;
        }
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
        ${this._renderMRDetails(
          reviewResult,
          targetBranch,
          currentBranch,
          changedFiles
        )}
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
            const element = document.getElementById(elementId);
            if (!element) return;
            
            const text = element.innerText;
            navigator.clipboard.writeText(text).then(() => {
                // Find the button that triggered this (if any)
                const btn = event?.target;
                if (btn && btn.classList.contains('copy-btn')) {
                    const originalText = btn.innerText;
                    btn.innerText = '✓ Copied!';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.classList.remove('copied');
                    }, 2000);
                }
            }).catch(err => {
                console.error('Failed to copy:', err);
            });
        }

        function copyCommand(command) {
            navigator.clipboard.writeText(command).then(() => {
                const btn = event?.target;
                if (btn) {
                    const originalText = btn.innerText;
                    btn.innerText = '✓ Copied!';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.classList.remove('copied');
                    }, 2000);
                }
            }).catch(err => {
                console.error('Failed to copy:', err);
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
                box.innerHTML = '<div style="font-weight: 600; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-color);">💡 AI Explanation</div>' + msg.explanation;
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
        
        // Syntax highlighting is now done server-side during rendering
        // No need to run client-side highlighting
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

  private _highlightSyntax(code: string): string {
    // Use highlight.js for proper syntax highlighting
    try {
      const result = hljs.highlightAuto(code, [
        "typescript",
        "javascript",
        "python",
        "java",
        "go",
        "rust",
      ]);
      return result.value;
    } catch (error) {
      // Fallback to escaped HTML if highlighting fails
      return this._escapeHtml(code);
    }
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
      // Apply syntax highlighting directly here instead of in JS
      const highlightedLine = this._highlightSyntax(line);
      html += `
        <div class="code-line">
            <span class="line-number">${currentLine}</span>
            <span class="code-content">${highlightedLine}</span>
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
      const highlightedLine = this._highlightSyntax(line);
      html += `
        <div class="code-line">
            <span class="line-number">${idx + 1}</span>
            <span class="code-content">${highlightedLine}</span>
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

        oldHtml += `<div class="${oldClass}">${this._escapeHtml(
          line || " "
        )}</div>`;
        newHtml += `<div class="${newClass}">${this._escapeHtml(
          newLine || " "
        )}</div>`;
      });

      html += `<div class="diff-col old">${oldHtml}</div>`;
      html += `<div class="diff-col new">${newHtml}</div>`;
    } else {
      // Stacked view for mismatched line counts
      html = '<div class="diff-view stacked">';
      html += '<div class="diff-header">Original</div>';
      html += '<div class="diff-section old">';
      oldLines.forEach((line) => {
        html += `<div class="diff-line del">- ${this._escapeHtml(line)}</div>`;
      });
      html += "</div>";

      html += '<div class="diff-header">Suggested</div>';
      html += '<div class="diff-section new">';
      newLines.forEach((line) => {
        html += `<div class="diff-line add">+ ${this._escapeHtml(line)}</div>`;
      });
      html += "</div>";
    }

    html += "</div>";
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

      // Format explanation with markdown and syntax highlighting
      const formattedExplanation = explanation
        ? this._formatMRText(explanation)
        : "No explanation available.";

      // Send explanation back to UI
      this._panel.webview.postMessage({
        type: "explanationResult",
        issueIndex,
        explanation: formattedExplanation,
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

  private _renderMRDetails(
    reviewResult: ReviewResult,
    targetBranch: string,
    currentBranch: string,
    changedFiles: string[]
  ): string {
    const hasDescription = reviewResult.mrDescription;
    const hasComment = reviewResult.mrComment;
    const hasFiles = changedFiles && changedFiles.length > 0;

    if (!hasDescription && !hasComment && !hasFiles) {
      return '<div class="empty-state"><h2>📋 No MR Details</h2><p>No merge request information available.</p></div>';
    }

    const gitCommands = this._getGitCommands(currentBranch, targetBranch);

    return `
      <!-- MR Metadata -->
      <div class="mr-section">
        <div class="mr-section-header">
          <div class="mr-section-header-title">
            <span>🔀</span>
            <span>Merge Request Overview</span>
          </div>
        </div>
        <div class="mr-section-content">
          <div class="mr-metadata">
            <div class="mr-metadata-item">
              <div class="mr-metadata-label">Source Branch</div>
              <div class="mr-metadata-value">${this._escapeHtml(
                currentBranch || "N/A"
              )}</div>
            </div>
            <div class="mr-metadata-item">
              <div class="mr-metadata-label">Target Branch</div>
              <div class="mr-metadata-value">${this._escapeHtml(
                targetBranch
              )}</div>
            </div>
            <div class="mr-metadata-item">
              <div class="mr-metadata-label">Files Changed</div>
              <div class="mr-metadata-value">${changedFiles.length} files</div>
            </div>
            <div class="mr-metadata-item">
              <div class="mr-metadata-label">Issues Found</div>
              <div class="mr-metadata-value">${
                reviewResult.issues.length
              } issues</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Git Commands -->
      ${
        currentBranch
          ? `
      <div class="mr-section">
        <div class="mr-section-header">
          <div class="mr-section-header-title">
            <span>⚡</span>
            <span>Quick Commands</span>
          </div>
        </div>
        <div class="mr-section-content">
          ${gitCommands
            .map(
              (cmd) => `
            <div class="mr-command-block">
              <div class="mr-command-text">${this._escapeHtml(
                cmd.command
              )}</div>
              <button class="copy-btn" onclick="copyCommand('${this._escapeString(
                cmd.command
              )}')">
                📋 Copy
              </button>
            </div>
            <div style="font-size: 11px; opacity: 0.6; margin-bottom: 12px; padding-left: 12px;">
              ${this._escapeHtml(cmd.description)}
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      `
          : ""
      }

      <!-- Changed Files -->
      ${
        hasFiles
          ? `
      <div class="mr-section">
        <div class="mr-section-header">
          <div class="mr-section-header-title">
            <span>📁</span>
            <span>Changed Files (${changedFiles.length})</span>
          </div>
        </div>
        <div class="mr-section-content" style="padding: 0;">
          <ul class="mr-file-list">
            ${changedFiles
              .map(
                (file) => `
              <li class="mr-file-item">
                <span class="mr-file-icon">${this._getFileIcon(file)}</span>
                <span>${this._escapeHtml(file)}</span>
              </li>
            `
              )
              .join("")}
          </ul>
        </div>
      </div>
      `
          : ""
      }

      <!-- MR Description -->
      ${
        hasDescription
          ? `
      <div class="mr-section">
        <div class="mr-section-header">
          <div class="mr-section-header-title">
            <span>📝</span>
            <span>Merge Request Description</span>
          </div>
          <button class="copy-btn" onclick="copyText('mr-description')">
            📋 Copy
          </button>
        </div>
        <div class="mr-section-content">
          <div class="mr-text-block" id="mr-description">${this._formatMRText(
            reviewResult.mrDescription || ""
          )}</div>
        </div>
      </div>
      `
          : ""
      }

      <!-- MR Comment -->
      ${
        hasComment
          ? `
      <div class="mr-section">
        <div class="mr-section-header">
          <div class="mr-section-header-title">
            <span>💬</span>
            <span>Quick Comment</span>
          </div>
          <button class="copy-btn" onclick="copyText('mr-comment')">
            📋 Copy
          </button>
        </div>
        <div class="mr-section-content">
          <div class="mr-text-block" id="mr-comment">${this._formatMRText(
            reviewResult.mrComment || ""
          )}</div>
        </div>
      </div>
      `
          : ""
      }
    `;
  }

  private _getGitCommands(
    currentBranch: string,
    targetBranch: string
  ): Array<{ command: string; description: string }> {
    if (!currentBranch) {
      return [];
    }

    return [
      {
        command: `git push origin ${currentBranch}`,
        description: "Push your branch to remote",
      },
      {
        command: `git push -u origin ${currentBranch}`,
        description: "Push and set upstream (first time)",
      },
      {
        command: `gh pr create --base ${targetBranch} --head ${currentBranch}`,
        description: "Create PR using GitHub CLI",
      },
      {
        command: `git request-pull ${targetBranch} origin ${currentBranch}`,
        description: "Generate pull request summary",
      },
    ];
  }

  private _getFileIcon(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const fileIcons: Record<string, string> = {
      ts: "📘",
      tsx: "⚛️",
      js: "📜",
      jsx: "⚛️",
      json: "📋",
      md: "📄",
      css: "🎨",
      scss: "🎨",
      html: "🌐",
      py: "🐍",
      java: "☕",
      go: "🐹",
      rs: "🦀",
      vue: "💚",
      yaml: "⚙️",
      yml: "⚙️",
      xml: "📰",
      sql: "🗄️",
      sh: "🐚",
      env: "🔒",
      lock: "🔒",
    };
    return fileIcons[ext || ""] || "📄";
  }

  private _formatMRText(text: string): string {
    // Apply syntax highlighting to code blocks in markdown
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let formatted = this._escapeHtml(text);

    // Highlight code blocks
    formatted = formatted.replace(codeBlockRegex, (match, lang, code) => {
      const highlighted = this._highlightSyntax(code);
      return `<div class="code-block">${highlighted}</div>`;
    });

    // Convert markdown bold/italic (simple)
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*(.+?)\*/g, "<em>$1</em>");

    // Convert inline code
    formatted = formatted.replace(
      /`([^`]+)`/g,
      '<code style="background: var(--code-bg); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 12px;">$1</code>'
    );

    return formatted;
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
