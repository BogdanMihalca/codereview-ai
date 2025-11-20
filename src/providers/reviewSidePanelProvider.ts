import * as vscode from "vscode";
import { ReviewResult, ReviewIssue } from "../types";

export class ReviewSidePanelProvider
  implements vscode.TreeDataProvider<ReviewTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    ReviewTreeItem | undefined | null | void
  > = new vscode.EventEmitter<ReviewTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ReviewTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private currentReview: ReviewResult | null = null;

  constructor() {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateReview(review: ReviewResult): void {
    this.currentReview = review;
    this.refresh();
  }

  clearReview(): void {
    this.currentReview = null;
    this.refresh();
  }

  getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewTreeItem): Thenable<ReviewTreeItem[]> {
    if (!this.currentReview) {
      return Promise.resolve([
        new ReviewTreeItem(
          "No active review",
          "Run a code review to see results here",
          vscode.TreeItemCollapsibleState.None,
          "info",
          new vscode.ThemeIcon("info")
        ),
      ]);
    }

    if (!element) {
      // Root level - show summary cards
      const items: ReviewTreeItem[] = [];

      // Summary card
      items.push(
        new ReviewTreeItem(
          `Summary`,
          this.currentReview.summary,
          vscode.TreeItemCollapsibleState.Collapsed,
          "summary",
          new vscode.ThemeIcon("dashboard")
        )
      );

      // Stats card
      const stats = this._calculateStats(this.currentReview.issues);
      items.push(
        new ReviewTreeItem(
          `Statistics`,
          `${stats.total} issues found`,
          vscode.TreeItemCollapsibleState.Collapsed,
          "stats",
          new vscode.ThemeIcon("graph"),
          undefined,
          stats
        )
      );

      // Issues by file
      items.push(
        new ReviewTreeItem(
          `By File`,
          `${this.currentReview.filesChanged || 0} files`,
          vscode.TreeItemCollapsibleState.Collapsed,
          "files",
          new vscode.ThemeIcon("folder")
        )
      );

      // Issues by severity
      items.push(
        new ReviewTreeItem(
          `By Severity`,
          "",
          vscode.TreeItemCollapsibleState.Collapsed,
          "severities",
          new vscode.ThemeIcon("list-filter")
        )
      );

      // Issues by category
      items.push(
        new ReviewTreeItem(
          `By Category`,
          "",
          vscode.TreeItemCollapsibleState.Collapsed,
          "categories",
          new vscode.ThemeIcon("tag")
        )
      );

      return Promise.resolve(items);
    } else {
      // Child level
      if (element.contextValue === "summary") {
        return Promise.resolve([
          new ReviewTreeItem(
            this.currentReview!.summary,
            "",
            vscode.TreeItemCollapsibleState.None,
            "text",
            new vscode.ThemeIcon("info")
          ),
        ]);
      }

      if (element.contextValue === "stats") {
        const stats = element.stats!;
        return Promise.resolve([
          new ReviewTreeItem(
            `Total Issues: ${stats.total}`,
            "",
            vscode.TreeItemCollapsibleState.None,
            "text",
            new vscode.ThemeIcon("circle-filled")
          ),
          new ReviewTreeItem(
            `Errors: ${stats.errors}`,
            "",
            vscode.TreeItemCollapsibleState.None,
            "text",
            new vscode.ThemeIcon("error", new vscode.ThemeColor("charts.red"))
          ),
          new ReviewTreeItem(
            `Warnings: ${stats.warnings}`,
            "",
            vscode.TreeItemCollapsibleState.None,
            "text",
            new vscode.ThemeIcon(
              "warning",
              new vscode.ThemeColor("charts.yellow")
            )
          ),
          new ReviewTreeItem(
            `Info: ${stats.info}`,
            "",
            vscode.TreeItemCollapsibleState.None,
            "text",
            new vscode.ThemeIcon("info", new vscode.ThemeColor("charts.blue"))
          ),
        ]);
      }

      if (element.contextValue === "severities") {
        const stats = this._calculateStats(this.currentReview!.issues);
        const items: ReviewTreeItem[] = [];

        if (stats.errors > 0) {
          items.push(
            new ReviewTreeItem(
              "Errors",
              `${stats.errors}`,
              vscode.TreeItemCollapsibleState.Collapsed,
              "error",
              new vscode.ThemeIcon("error", new vscode.ThemeColor("charts.red"))
            )
          );
        }
        if (stats.warnings > 0) {
          items.push(
            new ReviewTreeItem(
              "Warnings",
              `${stats.warnings}`,
              vscode.TreeItemCollapsibleState.Collapsed,
              "warning",
              new vscode.ThemeIcon(
                "warning",
                new vscode.ThemeColor("charts.yellow")
              )
            )
          );
        }
        if (stats.info > 0) {
          items.push(
            new ReviewTreeItem(
              "Info",
              `${stats.info}`,
              vscode.TreeItemCollapsibleState.Collapsed,
              "info",
              new vscode.ThemeIcon("info", new vscode.ThemeColor("charts.blue"))
            )
          );
        }
        return Promise.resolve(items);
      }

      if (
        element.contextValue === "error" ||
        element.contextValue === "warning" ||
        element.contextValue === "info"
      ) {
        const severity = element.contextValue;
        const issues = this.currentReview!.issues.filter(
          (i) => i.severity === severity
        );
        return Promise.resolve(
          issues.map(
            (issue) =>
              new ReviewTreeItem(
                issue.message,
                `${issue.file}:${issue.line}`,
                vscode.TreeItemCollapsibleState.None,
                "issue",
                this._getSeverityThemeIcon(issue.severity),
                issue
              )
          )
        );
      }

      if (element.contextValue === "categories") {
        const categoryMap = new Map<string, ReviewIssue[]>();
        this.currentReview!.issues.forEach((issue) => {
          if (!categoryMap.has(issue.category)) {
            categoryMap.set(issue.category, []);
          }
          categoryMap.get(issue.category)!.push(issue);
        });

        const items: ReviewTreeItem[] = [];
        categoryMap.forEach((issues, category) => {
          items.push(
            new ReviewTreeItem(
              category,
              `${issues.length}`,
              vscode.TreeItemCollapsibleState.Collapsed,
              "category",
              new vscode.ThemeIcon("tag"),
              undefined,
              undefined,
              category
            )
          );
        });
        return Promise.resolve(items);
      }

      if (element.contextValue === "category") {
        const issues = this.currentReview!.issues.filter(
          (i) => i.category === element.category
        );
        return Promise.resolve(
          issues.map(
            (issue) =>
              new ReviewTreeItem(
                issue.message,
                `${issue.file}:${issue.line}`,
                vscode.TreeItemCollapsibleState.None,
                "issue",
                this._getSeverityThemeIcon(issue.severity),
                issue
              )
          )
        );
      }

      if (element.contextValue === "files") {
        const fileMap = new Map<string, ReviewIssue[]>();
        this.currentReview!.issues.forEach((issue) => {
          if (!fileMap.has(issue.file)) {
            fileMap.set(issue.file, []);
          }
          fileMap.get(issue.file)!.push(issue);
        });

        const items: ReviewTreeItem[] = [];
        fileMap.forEach((issues, file) => {
          items.push(
            new ReviewTreeItem(
              file,
              `${issues.length} issue${issues.length > 1 ? "s" : ""}`,
              vscode.TreeItemCollapsibleState.Collapsed,
              "file",
              new vscode.ThemeIcon("file-code"),
              undefined,
              undefined,
              undefined,
              file
            )
          );
        });
        return Promise.resolve(items);
      }

      if (element.contextValue === "file") {
        const issues = this.currentReview!.issues.filter(
          (i) => i.file === element.file
        );
        return Promise.resolve(
          issues.map(
            (issue) =>
              new ReviewTreeItem(
                issue.message,
                `Line ${issue.line} • ${issue.category}`,
                vscode.TreeItemCollapsibleState.None,
                "issue",
                this._getSeverityThemeIcon(issue.severity),
                issue
              )
          )
        );
      }
    }

    return Promise.resolve([]);
  }

  private _calculateStats(issues: ReviewIssue[]) {
    return {
      total: issues.length,
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
    };
  }

  private _getSeverityThemeIcon(severity: string): vscode.ThemeIcon {
    switch (severity) {
      case "error":
        return new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("charts.red")
        );
      case "warning":
        return new vscode.ThemeIcon(
          "warning",
          new vscode.ThemeColor("charts.yellow")
        );
      case "info":
        return new vscode.ThemeIcon(
          "info",
          new vscode.ThemeColor("charts.blue")
        );
      default:
        return new vscode.ThemeIcon("circle-outline");
    }
  }
}

class ReviewTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly contextValue: string,
    public readonly iconPath?: vscode.ThemeIcon,
    public readonly issue?: ReviewIssue,
    public readonly stats?: {
      total: number;
      errors: number;
      warnings: number;
      info: number;
    },
    public readonly category?: string,
    public readonly file?: string
  ) {
    super(label, collapsibleState);
    this.tooltip = description;
    this.description = description;
    if (iconPath) {
      this.iconPath = iconPath;
    }

    // Set command for clickable items
    if (contextValue === "issue" && issue) {
      this.command = {
        command: "pre-mr-review.navigateToIssue",
        title: "Navigate to Issue",
        arguments: [issue.file, issue.line],
      };
    }
  }
}
