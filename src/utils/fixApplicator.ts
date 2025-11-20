// FixApplicator.ts
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { CodeFix, FixType } from "../types";

export interface FixApplicationResult {
  success: boolean;
  error?: string;
  appliedLines?: { start: number; end: number };
}

export class FixApplicator {
  /**
   * Shows a diff preview of the suggested fix without applying it
   */
  static async showDiff(
    file: string,
    fix: string | CodeFix,
    workspaceRoot: string
  ): Promise<void> {
    const filePath = path.isAbsolute(file)
      ? file
      : path.join(workspaceRoot, file);
    const uri = vscode.Uri.file(filePath);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const structuredFix = this.parseFixFormat(fix, doc);

      if (!structuredFix) {
        vscode.window.showErrorMessage("Invalid fix format");
        return;
      }

      // Create a .vscode/temp directory in workspace for previews
      const tempDir = path.join(workspaceRoot, ".vscode", "temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const fileName = path.basename(doc.fileName);
      const previewPath = path.join(tempDir, `${fileName}.fixed`);

      // Calculate new content
      const range = this.createRange(doc, structuredFix);
      const originalContent = doc.getText();
      const startOffset = doc.offsetAt(range.start);
      const endOffset = doc.offsetAt(range.end);

      let newContent = originalContent;
      if (structuredFix.type === "replace") {
        newContent =
          originalContent.substring(0, startOffset) +
          structuredFix.newCode +
          originalContent.substring(endOffset);
      } else if (structuredFix.type === "insert") {
        const insertCode = structuredFix.newCode.endsWith("\n")
          ? structuredFix.newCode
          : structuredFix.newCode + "\n";

        newContent =
          originalContent.substring(0, startOffset) +
          insertCode +
          originalContent.substring(startOffset);
      } else if (structuredFix.type === "delete") {
        newContent =
          originalContent.substring(0, startOffset) +
          originalContent.substring(endOffset);
      }

      // Write preview file
      fs.writeFileSync(previewPath, newContent);

      // Show diff
      const previewUri = vscode.Uri.file(previewPath);
      await vscode.commands.executeCommand(
        "vscode.diff",
        doc.uri,
        previewUri,
        `${fileName} ↔ Suggested Fix (Lines ${structuredFix.startLine}-${structuredFix.endLine})`
      );

      // Show info message
      vscode.window.showInformationMessage(
        `Review the suggested changes for ${fileName}. You can manually apply the changes from the diff.`,
        "Got it"
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to show diff: ${(error as Error).message}`
      );
    }
  }

  /**
   * Applies a single code fix to a document
   */
  static async applyFix(
    file: string,
    fix: string | CodeFix,
    showConfirmation: boolean = true
  ): Promise<FixApplicationResult> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceRoot) {
      return { success: false, error: "No workspace folder open" };
    }

    const filePath = path.isAbsolute(file)
      ? file
      : path.join(workspaceRoot, file);
    const uri = vscode.Uri.file(filePath);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const structuredFix = this.parseFixFormat(fix, doc);

      if (!structuredFix) {
        return { success: false, error: "Invalid fix format" };
      }

      // Validate line numbers
      if (
        structuredFix.startLine < 1 ||
        structuredFix.startLine > doc.lineCount + 1
      ) {
        return {
          success: false,
          error: `Start line ${structuredFix.startLine} is out of range (1-${
            doc.lineCount + 1
          })`,
        };
      }
      if (structuredFix.endLine < 1 || structuredFix.endLine > doc.lineCount) {
        return {
          success: false,
          error: `End line ${structuredFix.endLine} is out of range (1-${doc.lineCount})`,
        };
      }

      // Confirmation + preview
      if (showConfirmation) {
        const preview = this.generateInlinePreview(doc, structuredFix);
        const choice = await vscode.window.showInformationMessage(
          `Apply fix to ${path.basename(filePath)} (lines ${
            structuredFix.startLine
          }-${structuredFix.endLine})?\n\n${
            structuredFix.description || ""
          }\n\n${preview}`,
          { modal: true, detail: "Review changes before applying" },
          "Apply",
          "Show Diff",
          "Cancel"
        );

        if (choice === "Show Diff") {
          await this.showDiffPreview(doc, structuredFix, workspaceRoot);
          const confirm2 = await vscode.window.showInformationMessage(
            "Apply this fix?",
            { modal: true },
            "Apply",
            "Cancel"
          );
          if (confirm2 !== "Apply")
            return { success: false, error: "User cancelled" };
        } else if (choice !== "Apply") {
          return { success: false, error: "User cancelled" };
        }
      }

      // Apply the edit
      const edit = new vscode.WorkspaceEdit();
      const range = this.createRange(doc, structuredFix);

      switch (structuredFix.type) {
        case "replace":
          edit.replace(uri, range, structuredFix.newCode);
          break;
        case "insert":
          edit.insert(uri, range.start, structuredFix.newCode + "\n");
          break;
        case "delete":
          edit.delete(uri, range);
          break;
      }

      const success = await vscode.workspace.applyEdit(edit);
      if (!success) {
        return { success: false, error: "Failed to apply edit" };
      }

      await doc.save();

      // Open file and highlight affected area
      const editor = await vscode.window.showTextDocument(doc, {
        preview: false,
      });
      const highlightStart = Math.max(0, structuredFix.startLine - 1);
      const highlightRange = new vscode.Range(
        highlightStart,
        0,
        highlightStart,
        0
      );
      editor.selection = new vscode.Selection(
        highlightRange.start,
        highlightRange.end
      );
      editor.revealRange(highlightRange, vscode.TextEditorRevealType.InCenter);

      vscode.window.showInformationMessage(
        `✅ Fix applied to ${path.basename(filePath)} (lines ${
          structuredFix.startLine
        }-${structuredFix.endLine})`
      );

      return {
        success: true,
        appliedLines: {
          start: structuredFix.startLine,
          end: structuredFix.endLine,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  /**
   * Creates the correct VS Code Range for replace/insert/delete
   */
  private static createRange(
    doc: vscode.TextDocument,
    fix: CodeFix
  ): vscode.Range {
    const startLineIdx = Math.max(0, fix.startLine - 1);
    const endLineIdx = Math.min(
      Math.max(0, fix.endLine - 1),
      doc.lineCount - 1
    );

    if (fix.type === "insert") {
      // Insert exactly at the beginning of the specified line
      return new vscode.Range(startLineIdx, 0, startLineIdx, 0);
    }

    if (fix.type === "delete") {
      // Delete full lines including trailing newline
      const deleteEndLine = Math.min(endLineIdx + 1, doc.lineCount);
      return new vscode.Range(startLineIdx, 0, deleteEndLine, 0);
    }

    // replace: full lines (from start of first line to end of last line)
    const endChar =
      endLineIdx < doc.lineCount ? doc.lineAt(endLineIdx).text.length : 0;
    return new vscode.Range(startLineIdx, 0, endLineIdx, endChar);
  }

  /**
   * Generates a readable inline preview of the change
   */
  private static generateInlinePreview(
    doc: vscode.TextDocument,
    fix: CodeFix
  ): string {
    const startIdx = fix.startLine - 1;
    const endIdx = fix.endLine - 1;

    let preview = "━━━ BEFORE ━━━\n";
    for (let i = startIdx; i <= endIdx && i < doc.lineCount; i++) {
      preview += `${i + 1}: ${doc.lineAt(i).text}\n`;
    }

    preview += "\n━━━ AFTER ━━━\n";
    if (fix.type === "delete") {
      preview += `(Lines ${fix.startLine}–${fix.endLine} will be deleted)\n`;
    } else if (fix.type === "insert") {
      preview += `(Inserting ${
        fix.newCode.split("\n").length
      } line(s) at line ${fix.startLine})\n${fix.newCode}\n`;
    } else {
      const lines = fix.newCode.split("\n");
      lines.forEach((line, i) => {
        if (line.trim() || i < lines.length - 1) {
          preview += `${fix.startLine + i}: ${line}\n`;
        }
      });
    }

    return preview;
  }

  /**
   * Shows a full side-by-side diff in a temporary file
   */
  private static async showDiffPreview(
    doc: vscode.TextDocument,
    fix: CodeFix,
    workspaceRoot: string
  ): Promise<void> {
    const tempDir = path.join(workspaceRoot, ".vscode", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = path.basename(doc.fileName);
    const previewPath = path.join(tempDir, `${fileName}.fixed`);

    const range = this.createRange(doc, fix);
    const original = doc.getText();
    const startOffset = doc.offsetAt(range.start);
    const endOffset = doc.offsetAt(range.end);

    let newContent = original;
    if (fix.type === "replace") {
      newContent =
        original.slice(0, startOffset) +
        fix.newCode +
        original.slice(endOffset);
    } else if (fix.type === "insert") {
      newContent =
        original.slice(0, startOffset) +
        fix.newCode +
        "\n" +
        original.slice(startOffset);
    } else if (fix.type === "delete") {
      newContent = original.slice(0, startOffset) + original.slice(endOffset);
    }

    fs.writeFileSync(previewPath, newContent, "utf-8");

    const previewUri = vscode.Uri.file(previewPath);
    await vscode.commands.executeCommand(
      "vscode.diff",
      doc.uri,
      previewUri,
      `${fileName} ↔ Proposed Fix (Lines ${fix.startLine}-${fix.endLine})`
    );
  }

  /**
   * Parse string fixes or already-structured fixes
   */
  private static parseFixFormat(
    fix: string | CodeFix,
    _doc: vscode.TextDocument
  ): CodeFix | null {
    if (typeof fix !== "string") return fix;

    // Try JSON first
    try {
      const parsed = JSON.parse(fix);
      if (
        parsed.type &&
        parsed.startLine !== undefined &&
        parsed.newCode !== undefined
      ) {
        return parsed as CodeFix;
      }
    } catch {}

    // Fallback: not supported yet (you can extend this later)
    return null;
  }

  /**
   * Apply multiple fixes in batch mode (no individual confirmations)
   */
  static async applyMultipleFixes(
    fixes: Array<{ file: string; fix: string | CodeFix }>
  ): Promise<{ succeeded: number; failed: number; errors: string[] }> {
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Applying AI fixes",
        cancellable: false,
      },
      async (progress) => {
        for (let i = 0; i < fixes.length; i++) {
          progress.report({
            message: `(${i + 1}/${fixes.length}) ${path.basename(
              fixes[i].file
            )}`,
            increment: 100 / fixes.length,
          });

          const result = await this.applyFix(
            fixes[i].file,
            fixes[i].fix,
            false
          );
          if (result.success) succeeded++;
          else {
            failed++;
            errors.push(`${fixes[i].file}: ${result.error || "Unknown error"}`);
          }
        }
      }
    );

    return { succeeded, failed, errors };
  }
}
