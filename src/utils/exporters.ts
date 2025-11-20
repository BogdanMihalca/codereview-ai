import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ReviewResult, ReviewIssue } from "../types";

export class ReportExporter {
  /**
   * Export report in the specified format
   */
  static async export(
    reviewResult: ReviewResult,
    format: "json" | "markdown" | "html",
    targetBranch: string,
    fileCount: number
  ): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
      vscode.window.showErrorMessage("No workspace folder open");
      return;
    }

    let content: string;
    let filename: string;
    let language: string;

    switch (format) {
      case "json":
        content = this.generateJSON(reviewResult, targetBranch, fileCount);
        filename = `code-review-${Date.now()}.json`;
        language = "json";
        break;
      case "markdown":
        content = this.generateMarkdown(reviewResult, targetBranch, fileCount);
        filename = `code-review-${Date.now()}.md`;
        language = "markdown";
        break;
      case "html":
        content = this.generateHTML(reviewResult, targetBranch, fileCount);
        filename = `code-review-${Date.now()}.html`;
        language = "html";
        break;
      default:
        vscode.window.showErrorMessage(`Unsupported format: ${format}`);
        return;
    }

    // Ask user where to save
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(workspaceRoot, filename)),
      filters: {
        [format.toUpperCase()]: [format],
        "All Files": ["*"],
      },
    });

    if (uri) {
      try {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));

        const action = await vscode.window.showInformationMessage(
          `Report exported to ${path.basename(uri.fsPath)}`,
          "Open File"
        );

        if (action === "Open File") {
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to export: ${(error as Error).message}`
        );
      }
    }
  }

  /**
   * Generate JSON format
   */
  private static generateJSON(
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number
  ): string {
    const report = {
      metadata: {
        targetBranch,
        filesChanged: fileCount,
        timestamp: new Date().toISOString(),
        totalIssues: reviewResult.issues.length,
        errors: reviewResult.issues.filter((i) => i.severity === "error")
          .length,
        warnings: reviewResult.issues.filter((i) => i.severity === "warning")
          .length,
        info: reviewResult.issues.filter((i) => i.severity === "info").length,
      },
      summary: reviewResult.summary,
      issues: reviewResult.issues,
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate Markdown format
   */
  private static generateMarkdown(
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number
  ): string {
    const stats = {
      errors: reviewResult.issues.filter((i) => i.severity === "error").length,
      warnings: reviewResult.issues.filter((i) => i.severity === "warning")
        .length,
      info: reviewResult.issues.filter((i) => i.severity === "info").length,
    };

    let report = `# 🤖 AI Code Review Report

**Target Branch**: \`${targetBranch}\`  
**Files Changed**: ${fileCount}  
**Review Date**: ${new Date().toLocaleString()}  

## 📊 Summary

${reviewResult.summary}

### Statistics

| Severity | Count |
|----------|-------|
| 🔴 Errors | ${stats.errors} |
| ⚠️ Warnings | ${stats.warnings} |
| ℹ️ Info | ${stats.info} |
| **Total** | **${reviewResult.issues.length}** |

## 🔍 Issues Breakdown

`;

    if (reviewResult.issues.length === 0) {
      report += "✅ **No issues found!** Your code looks great!\n";
    } else {
      // Group by file
      const issuesByFile = new Map<string, ReviewIssue[]>();
      for (const issue of reviewResult.issues) {
        if (!issuesByFile.has(issue.file)) {
          issuesByFile.set(issue.file, []);
        }
        issuesByFile.get(issue.file)?.push(issue);
      }

      for (const [file, issues] of issuesByFile) {
        report += `\n### 📄 \`${file}\`\n\n`;
        for (const issue of issues) {
          const icon =
            issue.severity === "error"
              ? "🔴"
              : issue.severity === "warning"
              ? "⚠️"
              : "ℹ️";

          report += `${icon} **Line ${issue.line}** - \`${issue.category}\`\n\n`;
          report += `${issue.message}\n\n`;

          if (issue.suggestedFix) {
            const fixText =
              typeof issue.suggestedFix === "string"
                ? issue.suggestedFix
                : `${issue.suggestedFix.description}\n\n\`\`\`\n${issue.suggestedFix.newCode}\n\`\`\``;

            report += `💡 **Suggested Fix:**\n${fixText}\n\n`;
          }

          report += `---\n\n`;
        }
      }
    }

    report += `\n---\n*Generated by CodeReview-AI Extension*`;
    return report;
  }

  /**
   * Generate standalone HTML format
   */
  private static generateHTML(
    reviewResult: ReviewResult,
    targetBranch: string,
    fileCount: number
  ): string {
    const stats = {
      errors: reviewResult.issues.filter((i) => i.severity === "error").length,
      warnings: reviewResult.issues.filter((i) => i.severity === "warning")
        .length,
      info: reviewResult.issues.filter((i) => i.severity === "info").length,
    };

    // Group by file
    const issuesByFile = new Map<string, ReviewIssue[]>();
    for (const issue of reviewResult.issues) {
      if (!issuesByFile.has(issue.file)) {
        issuesByFile.set(issue.file, []);
      }
      issuesByFile.get(issue.file)?.push(issue);
    }

    let issuesHTML = "";
    for (const [file, issues] of issuesByFile) {
      issuesHTML += `
        <div class="file-section">
          <h3>📄 ${this.escapeHtml(file)}</h3>`;

      for (const issue of issues) {
        const severityIcon =
          issue.severity === "error"
            ? "🔴"
            : issue.severity === "warning"
            ? "⚠️"
            : "ℹ️";
        const fixPreview = issue.suggestedFix
          ? typeof issue.suggestedFix === "string"
            ? issue.suggestedFix
            : `${issue.suggestedFix.description}\n\n${issue.suggestedFix.newCode}`
          : "";

        issuesHTML += `
          <div class="issue ${issue.severity}">
            <div class="issue-header">
              <span class="severity">${severityIcon} ${issue.severity.toUpperCase()}</span>
              <span class="category">${this.escapeHtml(issue.category)}</span>
              <span class="location">Line ${issue.line}</span>
            </div>
            <div class="message">${this.escapeHtml(issue.message)}</div>
            ${
              issue.suggestedFix
                ? `
              <div class="fix">
                <strong>💡 Suggested Fix:</strong>
                <pre><code>${this.escapeHtml(fixPreview)}</code></pre>
              </div>
            `
                : ""
            }
          </div>`;
      }

      issuesHTML += `</div>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Review Report - ${targetBranch}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f5f5f5;
            padding: 40px 20px;
            line-height: 1.6;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 20px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
        }
        .header h1 { font-size: 32px; margin-bottom: 20px; }
        .header-info { display: flex; gap: 30px; font-size: 14px; opacity: 0.9; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px 40px;
            background: #fafafa;
            border-bottom: 1px solid #e0e0e0;
        }
        .stat {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 8px; }
        .stat-value { font-size: 36px; font-weight: bold; }
        .stat.error .stat-value { color: #e53e3e; }
        .stat.warning .stat-value { color: #dd6b20; }
        .stat.info .stat-value { color: #3182ce; }
        .stat.total .stat-value { color: #38a169; }
        .summary {
            padding: 30px 40px;
            background: #fff8e1;
            border-left: 4px solid #ffd700;
            margin: 20px 40px;
            border-radius: 4px;
        }
        .content { padding: 20px 40px 40px; }
        .file-section { margin-bottom: 40px; }
        .file-section h3 {
            font-size: 20px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e0e0e0;
        }
        .issue {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            border-left: 4px solid;
        }
        .issue.error { border-left-color: #e53e3e; }
        .issue.warning { border-left-color: #dd6b20; }
        .issue.info { border-left-color: #3182ce; }
        .issue-header {
            display: flex;
            gap: 15px;
            margin-bottom: 12px;
            font-size: 13px;
        }
        .severity {
            font-weight: bold;
            padding: 4px 8px;
            border-radius: 4px;
            background: #f0f0f0;
        }
        .category {
            padding: 4px 8px;
            border-radius: 4px;
            background: #e8f4f8;
            color: #0066cc;
        }
        .location {
            padding: 4px 8px;
            color: #666;
            font-family: monospace;
        }
        .message { margin-bottom: 15px; }
        .fix {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 6px;
            padding: 15px;
            margin-top: 15px;
        }
        .fix strong { color: #0066cc; display: block; margin-bottom: 10px; }
        .fix pre {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            margin-top: 10px;
        }
        .fix code { font-family: 'Courier New', monospace; font-size: 13px; }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 14px;
            border-top: 1px solid #e0e0e0;
        }
        .empty-state {
            text-align: center;
            padding: 60px 40px;
            color: #666;
        }
        .empty-state h2 { font-size: 32px; margin-bottom: 15px; }
        @media print {
            body { background: white; padding: 0; }
            .container { box-shadow: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 AI Code Review Report</h1>
            <div class="header-info">
                <span>📋 Target: <strong>${this.escapeHtml(
                  targetBranch
                )}</strong></span>
                <span>📁 Files: <strong>${fileCount}</strong></span>
                <span>📅 ${new Date().toLocaleString()}</span>
            </div>
        </div>

        <div class="stats">
            <div class="stat error">
                <div class="stat-label">Errors</div>
                <div class="stat-value">${stats.errors}</div>
            </div>
            <div class="stat warning">
                <div class="stat-label">Warnings</div>
                <div class="stat-value">${stats.warnings}</div>
            </div>
            <div class="stat info">
                <div class="stat-label">Info</div>
                <div class="stat-value">${stats.info}</div>
            </div>
            <div class="stat total">
                <div class="stat-label">Total Issues</div>
                <div class="stat-value">${reviewResult.issues.length}</div>
            </div>
        </div>

        <div class="summary">
            <strong>Summary:</strong> ${this.escapeHtml(reviewResult.summary)}
        </div>

        <div class="content">
            ${
              reviewResult.issues.length === 0
                ? '<div class="empty-state"><h2>✅ No Issues Found!</h2><p>Your code looks great!</p></div>'
                : issuesHTML
            }
        </div>

        <div class="footer">
            Generated by <strong>CodeReview-AI Extension</strong>
        </div>
    </div>
</body>
</html>`;
  }

  private static escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
