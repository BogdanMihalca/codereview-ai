import * as vscode from "vscode";
import { ReviewHistoryItem, ReviewResult } from "../types";

export class ReviewHistoryProvider
  implements vscode.TreeDataProvider<ReviewTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ReviewTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private history: ReviewHistoryItem[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.loadHistory();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  addReview(
    result: ReviewResult,
    targetBranch: string,
    filesChanged: number,
    currentBranch?: string,
    changedFilesList?: string[]
  ): void {
    const item: ReviewHistoryItem = {
      id: Date.now().toString(),
      result,
      timestamp: new Date(),
      targetBranch,
      filesChanged,
      currentBranch,
      changedFilesList,
    };
    this.history.unshift(item);
    if (this.history.length > 20) {
      this.history = this.history.slice(0, 20);
    }
    this.saveHistory();
    this.refresh();
  }

  clearHistory(): void {
    this.history = [];
    this.saveHistory();
    this.refresh();
  }

  private loadHistory(): void {
    const saved = this.context.globalState.get<ReviewHistoryItem[]>(
      "reviewHistory",
      []
    );
    this.history = saved.map((item) => ({
      ...item,
      timestamp: new Date(item.timestamp),
    }));
  }

  private saveHistory(): void {
    this.context.globalState.update("reviewHistory", this.history);
  }

  getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewTreeItem): Thenable<ReviewTreeItem[]> {
    if (!element) {
      // Root level - show history items
      if (this.history.length === 0) {
        return Promise.resolve([]);
      }
      return Promise.resolve(
        this.history.map((item) => {
          const stats = this.calculateStats(item.result.issues);
          return new ReviewTreeItem(
            `${item.targetBranch}`,
            vscode.TreeItemCollapsibleState.Collapsed,
            "review",
            item,
            `${item.timestamp.toLocaleString()} • ${stats.errors} errors, ${
              stats.warnings
            } warnings`
          );
        })
      );
    } else if (element.contextValue === "review" && element.historyItem) {
      const items: ReviewTreeItem[] = [];

      // Action to open the full report
      const openReportItem = new ReviewTreeItem(
        "Open Full Report",
        vscode.TreeItemCollapsibleState.None,
        "action",
        element.historyItem
      );
      openReportItem.iconPath = new vscode.ThemeIcon("preview");
      openReportItem.command = {
        command: "pre-mr-review.showHistoryItem",
        title: "Show Review",
        arguments: [element.historyItem],
      };
      items.push(openReportItem);

      // Group issues by file
      const issuesByFile = new Map<string, number>();
      element.historyItem.result.issues.forEach((issue) => {
        issuesByFile.set(issue.file, (issuesByFile.get(issue.file) || 0) + 1);
      });

      // Add file items
      for (const [file, count] of issuesByFile) {
        const fileItem = new ReviewTreeItem(
          `${path.basename(file)} (${count})`,
          vscode.TreeItemCollapsibleState.None,
          "file"
        );
        fileItem.description = path.dirname(file);
        fileItem.resourceUri = vscode.Uri.file(
          path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, file)
        );
        fileItem.command = {
          command: "vscode.open",
          title: "Open File",
          arguments: [fileItem.resourceUri],
        };
        items.push(fileItem);
      }

      return Promise.resolve(items);
    }
    return Promise.resolve([]);
  }

  private calculateStats(issues: any[]) {
    return {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
    };
  }

  getLatestReview(): ReviewHistoryItem | undefined {
    return this.history[0];
  }
}

import * as path from "path";

class ReviewTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly historyItem?: ReviewHistoryItem,
    description?: string
  ) {
    super(label, collapsibleState);
    if (description) {
      this.description = description;
    }

    if (contextValue === "review") {
      this.iconPath = new vscode.ThemeIcon("history");
      // No command for root item to allow expansion
    } else if (contextValue === "file") {
      this.iconPath = vscode.ThemeIcon.File;
    }
  }
}
