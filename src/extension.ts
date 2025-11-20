// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { exec } from "child_process";
import util from "util";
import * as path from "path";
import { ReviewWebviewPanel } from "./webview/reviewPanel";
import { ReviewHistoryProvider } from "./providers/historyProvider";
import { ReviewSidePanelProvider } from "./providers/reviewSidePanelProvider";
import { ReviewStatusBar } from "./ui/statusBar";
import { ReviewResult, ReviewIssue, CodeFix } from "./types";
import { getConfig, shouldExcludeFile } from "./utils/config";

import { AIService } from "./services/aiService";
import { ReviewChatParticipant } from "./chat/participant";

const execPromise = util.promisify(exec);

let diagnosticCollection: vscode.DiagnosticCollection;
let commentController: vscode.CommentController;
let commentThreads: vscode.CommentThread[] = [];
let historyProvider: ReviewHistoryProvider;
let sidePanelProvider: ReviewSidePanelProvider;
let statusBar: ReviewStatusBar;

function getWorkspaceRoot(): string | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("No workspace folder open");
    return undefined;
  }
  return workspaceFolders[0].uri.fsPath;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "codereview-ai" is now active!');

  diagnosticCollection =
    vscode.languages.createDiagnosticCollection("ai-code-review");
  context.subscriptions.push(diagnosticCollection);

  commentController = vscode.comments.createCommentController(
    "ai-code-review",
    "AI Code Review"
  );
  context.subscriptions.push(commentController);

  // Initialize History Provider
  historyProvider = new ReviewHistoryProvider(context);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("reviewHistory", historyProvider)
  );

  // Initialize Side Panel Provider
  sidePanelProvider = new ReviewSidePanelProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("reviewSidePanel", sidePanelProvider)
  );

  // Initialize Status Bar
  statusBar = new ReviewStatusBar();
  context.subscriptions.push(statusBar);

  // Register Code Action Provider for Quick Fixes
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      new AIReviewCodeActionProvider(),
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    )
  );

  // Command to review changes before MR
  let reviewCommand = vscode.commands.registerCommand(
    "pre-mr-review.reviewChanges",
    async function () {
      try {
        await reviewChangesBeforeMR(context);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Review failed: ${(error as Error).message}`
        );
      }
    }
  );

  // Command to clear history
  let clearHistoryCommand = vscode.commands.registerCommand(
    "pre-mr-review.clearHistory",
    async function () {
      const result = await vscode.window.showWarningMessage(
        "Are you sure you want to clear all review history?",
        "Yes",
        "No"
      );
      if (result === "Yes") {
        historyProvider.clearHistory();
        vscode.window.showInformationMessage("Review history cleared");
      }
    }
  );

  // Command to show history item
  let showHistoryCommand = vscode.commands.registerCommand(
    "pre-mr-review.showHistoryItem",
    async function (historyItem: any) {
      if (historyItem?.result) {
        ReviewWebviewPanel.createOrShow(
          context.extensionUri,
          historyItem.result,
          historyItem.targetBranch,
          historyItem.filesChanged
        );
      }
    }
  );

  // Command to open settings
  let openSettingsCommand = vscode.commands.registerCommand(
    "pre-mr-review.openSettings",
    function () {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "aiCodeReview"
      );
    }
  );

  // Command to navigate to issue (used by side panel)
  let navigateToIssueCommand = vscode.commands.registerCommand(
    "pre-mr-review.navigateToIssue",
    async function (file: string, line: number) {
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

        const lineIndex = Math.max(0, line - 1);
        const position = new vscode.Position(lineIndex, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
          new vscode.Range(position, position),
          vscode.TextEditorRevealType.InCenter
        );

        const lineRange = doc.lineAt(lineIndex).range;
        editor.selection = new vscode.Selection(lineRange.start, lineRange.end);

        const decorationType = vscode.window.createTextEditorDecorationType({
          backgroundColor: new vscode.ThemeColor(
            "editor.findMatchHighlightBackground"
          ),
          isWholeLine: true,
        });

        editor.setDecorations(decorationType, [lineRange]);

        setTimeout(() => {
          decorationType.dispose();
        }, 2000);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to navigate to ${file}:${line}`);
      }
    }
  );

  // Command to refresh side panel
  let refreshSidePanelCommand = vscode.commands.registerCommand(
    "pre-mr-review.refreshSidePanel",
    function () {
      sidePanelProvider.refresh();
    }
  );

  context.subscriptions.push(
    reviewCommand,
    clearHistoryCommand,
    showHistoryCommand,
    openSettingsCommand,
    navigateToIssueCommand,
    refreshSidePanelCommand
  );

  // Initialize Chat Participant
  const chatParticipant = new ReviewChatParticipant(context, historyProvider);
  chatParticipant.register();
}

// This method is called when your extension is deactivated
export function deactivate() {}

async function reviewChangesBeforeMR(context: vscode.ExtensionContext) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return;
  }

  const targetBranch = await vscode.window.showInputBox({
    prompt: "Target branch name",
    value: "develop",
    placeHolder: "develop",
  });

  if (!targetBranch) {
    return;
  }

  // Run analysis in progress notification, then show results outside
  const analysisResult = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AI Code Review",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Getting git diff..." });

      // Get current branch
      const { stdout: currentBranch } = await execPromise(
        "git branch --show-current",
        { cwd: workspaceRoot }
      );
      const branch = currentBranch.trim();

      if (branch === targetBranch.trim()) {
        vscode.window.showWarningMessage(
          "You are on the target branch. Switch to your feature branch first."
        );
        return null;
      }

      // Get diff
      let diff, changedFiles;
      try {
        const { stdout: diffOutput } = await execPromise(
          `git diff ${targetBranch}..HEAD`,
          { cwd: workspaceRoot }
        );
        const { stdout: filesOutput } = await execPromise(
          `git diff --name-only ${targetBranch}..HEAD`,
          { cwd: workspaceRoot }
        );

        const config = getConfig();
        const allFiles = filesOutput.trim().split("\n").filter(Boolean);

        // Filter out excluded files
        changedFiles = allFiles.filter(
          (file) => !shouldExcludeFile(file, config.excludePatterns)
        );

        if (changedFiles.length === 0) {
          vscode.window.showInformationMessage(
            "No relevant changes to review (all changes are in excluded files)."
          );
          return null;
        }

        // Re-fetch diff only for included files to save tokens and avoid noise
        // This is a bit more complex with git diff, so we might just filter the diff output or
        // fetch diffs for specific files. For now, let's just use the filtered file list
        // and rely on the AI to ignore others if we pass the file list,
        // OR better: fetch diff for specific files.

        const { stdout: filteredDiffOutput } = await execPromise(
          `git diff ${targetBranch}..HEAD -- ${changedFiles
            .map((f) => `"${f}"`)
            .join(" ")}`,
          { cwd: workspaceRoot }
        );
        diff = filteredDiffOutput;
      } catch (error) {
        vscode.window.showErrorMessage(
          `Git error: ${
            (error as Error).message
          }. Make sure you have the latest ${targetBranch} branch.`
        );
        return null;
      }

      if (!diff) {
        vscode.window.showInformationMessage("No changes to review.");
        return null;
      }

      progress.report({ message: "Analyzing with AI..." });

      // Clear previous diagnostics
      diagnosticCollection.clear();
      // Clear previous comments
      commentThreads.forEach((t) => t.dispose());
      commentThreads = [];

      // Try to use VSCode's Language Model API (Copilot)
      const reviewResult = await AIService.getReview(
        diff,
        changedFiles,
        targetBranch
      );

      if (!reviewResult) {
        return null;
      }

      // Apply diagnostics
      applyDiagnostics(reviewResult.issues);

      // Update status bar
      const errorCount = reviewResult.issues.filter(
        (i) => i.severity === "error"
      ).length;
      statusBar.update(errorCount, reviewResult.issues.length);

      // Add to history
      historyProvider.addReview(
        reviewResult,
        targetBranch,
        changedFiles.length
      );

      progress.report({ message: "Preparing results..." });

      // Return data for processing outside progress callback
      return {
        reviewResult,
        targetBranch,
        changedFiles,
        branch,
      };
    }
  );

  // Progress notification is now complete
  // Process results outside of progress callback to avoid blocking
  if (analysisResult) {
    const { reviewResult, targetBranch, changedFiles, branch } = analysisResult;

    // Update side panel with the new review
    sidePanelProvider.updateReview(reviewResult);

    // Show Webview Panel (no longer blocking progress)
    ReviewWebviewPanel.createOrShow(
      context.extensionUri,
      reviewResult,
      targetBranch,
      changedFiles.length
    );

    // Notify about Chat Participant
    vscode.window
      .showInformationMessage(
        "Review complete! You can use @reviewer in Chat to discuss the results.",
        "Open Chat"
      )
      .then((selection) => {
        if (selection === "Open Chat") {
          vscode.commands.executeCommand("workbench.action.chat.open", {
            query: "@reviewer summarize",
          });
        }
      });
  }
}

function applyDiagnostics(issues: ReviewIssue[]) {
  const diagnosticsMap = new Map<string, vscode.Diagnostic[]>();
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

  if (!workspaceRoot) {
    return;
  }

  // Clear old fixes
  fixesMap.clear();

  for (const issue of issues) {
    const absolutePath = path.join(workspaceRoot, issue.file);
    const uri = vscode.Uri.file(absolutePath);

    const range = new vscode.Range(
      Math.max(0, issue.line - 1),
      0,
      Math.max(0, issue.line - 1),
      100
    );

    const severity =
      issue.severity === "error"
        ? vscode.DiagnosticSeverity.Error
        : issue.severity === "warning"
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information;

    const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
    diagnostic.source = "AI Code Review";
    diagnostic.code = issue.category;

    if (!diagnosticsMap.has(absolutePath)) {
      diagnosticsMap.set(absolutePath, []);
    }
    diagnosticsMap.get(absolutePath)?.push(diagnostic);

    // Add Comment Thread
    const thread = commentController.createCommentThread(uri, range, [
      {
        body: new vscode.MarkdownString(issue.message),
        mode: vscode.CommentMode.Preview,
        author: { name: "AI Reviewer" },
      },
    ]);
    thread.canReply = false;
    commentThreads.push(thread);

    // Store suggested fix
    if (issue.suggestedFix) {
      const key = `${uri.toString()}:${range.start.line}:${
        range.start.character
      }`;
      fixesMap.set(key, issue.suggestedFix);
    }
  }

  for (const [path, diagnostics] of diagnosticsMap) {
    diagnosticCollection.set(vscode.Uri.file(path), diagnostics);
  }
}

class AIReviewCodeActionProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<(vscode.Command | vscode.CodeAction)[]> {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source === "AI Code Review" && diagnostic.code) {
        // Check if we have a suggested fix stored (we'll need a way to retrieve it)
        const key = `${document.uri.toString()}:${
          diagnostic.range.start.line
        }:${diagnostic.range.start.character}`;
        const fix = fixesMap.get(key);

        if (fix) {
          const action = new vscode.CodeAction(
            "Apply AI Fix",
            vscode.CodeActionKind.QuickFix
          );
          action.edit = new vscode.WorkspaceEdit();

          // Handle both string and CodeFix formats
          if (typeof fix === "string") {
            action.edit.replace(document.uri, diagnostic.range, fix);
          } else {
            // For structured CodeFix, create appropriate range
            const fixRange = new vscode.Range(
              Math.max(0, fix.startLine - 1),
              0,
              Math.max(0, fix.endLine - 1),
              document.lineAt(Math.max(0, fix.endLine - 1)).text.length
            );

            if (fix.type === "replace") {
              action.edit.replace(document.uri, fixRange, fix.newCode);
            } else if (fix.type === "insert") {
              action.edit.insert(
                document.uri,
                fixRange.start,
                fix.newCode + "\n"
              );
            } else if (fix.type === "delete") {
              action.edit.delete(document.uri, fixRange);
            }
          }
          action.diagnostics = [diagnostic];
          actions.push(action);
        }
      }
    }
    return actions;
  }
}

// Helper to store fixes
const fixesMap = new Map<string, string | CodeFix>();

function generateMarkdownReport(
  result: ReviewResult,
  targetBranch: string,
  fileCount: number
): string {
  let report = `# 🤖 AI Code Review Results

**Target Branch**: \`${targetBranch}\`
**Files Changed**: ${fileCount}
**Review Date**: ${new Date().toLocaleString()}

## Summary
${result.summary}

## Issues Found
`;

  if (result.issues.length === 0) {
    report += "✅ No issues found!\n";
  } else {
    // Group by file
    const issuesByFile = new Map<string, ReviewIssue[]>();
    for (const issue of result.issues) {
      if (!issuesByFile.has(issue.file)) {
        issuesByFile.set(issue.file, []);
      }
      issuesByFile.get(issue.file)?.push(issue);
    }

    for (const [file, issues] of issuesByFile) {
      report += `\n### 📄 [${file}](${file})\n`;
      for (const issue of issues) {
        const icon =
          issue.severity === "error"
            ? "🔴"
            : issue.severity === "warning"
            ? "⚠️"
            : "ℹ️";
        report += `- ${icon} **Line ${issue.line}**: ${issue.message} _(${issue.category})_\n`;
      }
    }
  }

  report += `\n---\n*Review generated by Pre-MR Review Extension*`;
  return report;
}

async function getCurrentBranch() {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return "";
  }
  const { stdout } = await execPromise("git branch --show-current", {
    cwd: workspaceRoot,
  });
  return stdout.trim();
}
