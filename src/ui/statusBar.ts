import * as vscode from "vscode";

export class ReviewStatusBar {
  private statusBarItem: vscode.StatusBarItem;
  private issueCount = 0;
  private errorCount = 0;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "pre-mr-review.reviewChanges";
    this.update(0, 0);
    this.statusBarItem.show();
  }

  update(errors: number, total: number): void {
    this.errorCount = errors;
    this.issueCount = total;

    if (total === 0) {
      this.statusBarItem.text = "$(check) AI Review: No Issues";
      this.statusBarItem.backgroundColor = undefined;
    } else if (errors > 0) {
      this.statusBarItem.text = `$(error) AI Review: ${errors} errors, ${total} total`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
    } else {
      this.statusBarItem.text = `$(warning) AI Review: ${total} issues`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }

    this.statusBarItem.tooltip = "Click to run code review";
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }
}
