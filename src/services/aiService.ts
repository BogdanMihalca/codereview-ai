import * as vscode from "vscode";
import { ReviewResult, ReviewIssue } from "../types";
import { getConfig } from "../utils/config";

export class AIService {
  static async getReview(
    diff: string,
    changedFiles: string[],
    targetBranch: string
  ): Promise<ReviewResult | null> {
    try {
      const config = getConfig();

      // Select AI model based on configuration
      const models = await vscode.lm.selectChatModels({
        vendor: config.aiModel.vendor,
        family: config.aiModel.family,
      });

      if (models.length === 0) {
        vscode.window.showWarningMessage(
          `No AI model available for ${config.aiModel.vendor}/${config.aiModel.family}. Make sure GitHub Copilot is enabled.`
        );
        return null;
      }

      const model = models[0];

      const maxSize = config.maxDiffSize || 30000;
      let diffToAnalyze = diff;
      if (diff.length > maxSize) {
        diffToAnalyze =
          diff.substring(0, maxSize) + "\n\n... (diff truncated due to size)";
      }

      const prompt = this._buildReviewPrompt(
        diffToAnalyze,
        changedFiles,
        targetBranch,
        config
      );

      const messages = [vscode.LanguageModelChatMessage.User(prompt)];

      const chatResponse = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
      );

      let fullResponse = "";
      for await (const fragment of chatResponse.text) {
        fullResponse += fragment;
      }

      fullResponse = fullResponse
        .replace(/^[ \t]*```json/m, "")
        .replace(/^[ \t]*```/m, "")
        .trim();

      try {
        const result = JSON.parse(fullResponse) as ReviewResult;

        // Verify line numbers if code snippets are provided
        if (result.issues && result.issues.length > 0) {
          const workspaceRoot =
            vscode.workspace.workspaceFolders?.[0].uri.fsPath;
          if (workspaceRoot) {
            for (const issue of result.issues) {
              if (issue.codeSnippet) {
                try {
                  const uri = vscode.Uri.file(`${workspaceRoot}/${issue.file}`);
                  const doc = await vscode.workspace.openTextDocument(uri);
                  const text = doc.getText();
                  const lines = text.split("\n");

                  // Check if the line at issue.line matches the snippet (fuzzy match)
                  const currentLineContent = lines[issue.line - 1] || "";
                  const normalizedSnippet = issue.codeSnippet.trim();
                  const normalizedLine = currentLineContent.trim();

                  if (
                    !normalizedLine.includes(normalizedSnippet) &&
                    normalizedSnippet.length > 5
                  ) {
                    // Mismatch! Search for the snippet
                    for (let i = 0; i < lines.length; i++) {
                      if (lines[i].trim().includes(normalizedSnippet)) {
                        console.log(
                          `Corrected line number for ${issue.file}: ${
                            issue.line
                          } -> ${i + 1}`
                        );
                        issue.line = i + 1;
                        break;
                      }
                    }
                  }
                } catch (e) {
                  console.warn(
                    `Could not verify line number for ${issue.file}`,
                    e
                  );
                }
              }
            }
          }
        }

        return result;
      } catch (e) {
        console.error("Failed to parse AI response", fullResponse);
        throw new Error("AI response was not valid JSON");
      }
    } catch (error) {
      const err = error as Error;
      if (err.message.includes("LanguageModelError")) {
        vscode.window.showErrorMessage(
          "GitHub Copilot not available. Please ensure you have an active Copilot subscription."
        );
      } else {
        vscode.window.showErrorMessage(`AI Review Error: ${err.message}`);
      }
      return null;
    }
  }

  private static _buildReviewPrompt(
    diff: string,
    changedFiles: string[],
    targetBranch: string,
    config: any
  ): string {
    const rules = config.reviewRules;
    const strictnessInstructions = {
      strict:
        "Be very thorough and flag even minor issues. Apply strict coding standards.",
      balanced:
        "Balance thoroughness with practicality. Focus on significant issues and important improvements.",
      lenient:
        "Focus only on critical issues, bugs, and security vulnerabilities. Overlook minor style issues.",
    };

    let reviewFocus: string[] = [];
    if (rules.checkSecurity) reviewFocus.push("Security vulnerabilities");
    if (rules.checkPerformance) reviewFocus.push("Performance issues");
    if (rules.checkCodeSmells)
      reviewFocus.push("Code smells and anti-patterns");
    if (rules.checkTestCoverage) reviewFocus.push("Test coverage gaps");
    if (rules.checkDocumentation)
      reviewFocus.push("Documentation completeness");
    if (rules.checkAccessibility) reviewFocus.push("Accessibility issues");

    let prompt = `You are a senior code reviewer with expertise in software engineering best practices. Review the following code changes that will be merged into ${targetBranch}.

**Review Configuration:**
- Strictness: ${rules.strictness} - ${
      strictnessInstructions[
        rules.strictness as keyof typeof strictnessInstructions
      ]
    }
- Focus Areas: ${reviewFocus.join(", ")}

**Changed Files:**
${changedFiles.join("\n")}

**Instructions:**
Analyze the diff and identify issues with actionable fixes.
Return the result in strict JSON format with the following schema:
{
  "summary": "Brief overview of changes and overall code quality",
  "mrDescription": "A comprehensive Markdown description suitable for a Pull Request body",
  "mrComment": "A short, concise summary suitable for a chat message or quick comment",
  "securityIssues": number_of_security_issues,
  "performanceIssues": number_of_performance_issues,
  "codeSmells": number_of_code_smells,
  "testCoverage": "brief assessment of test coverage",
  "issues": [
    {
      "file": "path/to/file",
      "line": line_number,
      "codeSnippet": "The exact line of code from the file that has the issue",
      "message": "Description of the issue",
      "severity": "error" | "warning" | "info",
      "category": "Security" | "Performance" | "Bug" | "Code Quality" | "Testing" | "Documentation" | "Code Smell" | "Best Practice" | "Accessibility" | "Maintainability",
      "suggestedFix": {
        "type": "replace" | "insert" | "delete",
        "startLine": line_number,
        "endLine": line_number,
        "newCode": "corrected code",
        "description": "what this fix does"
      }
    }
  ]
}

**IMPORTANT INSTRUCTIONS:**
- Return ONLY valid JSON. Do not wrap in markdown code blocks.
- If there are no issues, return an empty "issues" array.
- **Line Numbers**: Be extremely careful with line numbers. Use the \`@@ -old,count +new,count @@\` headers in the diff to calculate the exact line number in the NEW file.
- **Code Snippet**: You MUST include the \`codeSnippet\` field with the exact content of the line at \`line\`. This is used to verify the line number.
- Use the line numbers from the NEW file (the right side of the diff).
- For suggestedFix:
  * type="replace": Replace lines from startLine to endLine with newCode
  * type="insert": Insert newCode before startLine
  * type="delete": Delete lines from startLine to endLine
  * startLine and endLine are 1-based line numbers in the file
  * newCode should be the exact code to insert/replace (without line numbers)
  * description explains what the fix accomplishes
- Only include suggestedFix if you can provide a concrete, actionable fix
- Be specific and precise with line numbers based on the diff context
- Prioritize issues based on the configured strictness level`;

    if (config.customPrompt) {
      prompt += `\n\n**ADDITIONAL USER INSTRUCTIONS:**\n${config.customPrompt}`;
    }

    prompt += `\n\n**Code Changes:**
\`\`\`diff
${diff}
\`\`\``;

    return prompt;
  }

  static async explainIssue(
    issue: ReviewIssue,
    fileContent: string
  ): Promise<string | null> {
    try {
      const models = await vscode.lm.selectChatModels({
        vendor: "copilot",
        family: "gpt-4",
      });

      if (models.length === 0) {
        return "AI model not available.";
      }

      const model = models[0];

      // Extract context around the line
      const lines = fileContent.split("\n");
      const startLine = Math.max(0, issue.line - 5);
      const endLine = Math.min(lines.length, issue.line + 5);
      const contextCode = lines.slice(startLine, endLine).join("\n");

      const prompt = `Explain the following code issue in detail.
      
Issue: "${issue.message}"
File: ${issue.file}
Line: ${issue.line}

Code Context:
\`\`\`
${contextCode}
\`\`\`

Explain why this is an issue and how the suggested fix (if any) improves it. Keep it concise but educational.`;

      const messages = [vscode.LanguageModelChatMessage.User(prompt)];
      const chatResponse = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
      );

      let explanation = "";
      for await (const fragment of chatResponse.text) {
        explanation += fragment;
      }

      return explanation;
    } catch (error) {
      return `Failed to get explanation: ${(error as Error).message}`;
    }
  }

  static async chatAboutIssue(
    issue: ReviewIssue,
    userMessage: string,
    fileContent: string
  ): Promise<string> {
    try {
      const models = await vscode.lm.selectChatModels({
        vendor: "copilot",
        family: "gpt-4",
      });

      if (models.length === 0) {
        return "No AI model available.";
      }

      const model = models[0];

      const prompt = `You are a helpful coding assistant.
The user is asking about a specific issue found during a code review.

Issue Details:
File: ${issue.file}
Line: ${issue.line}
Severity: ${issue.severity}
Message: ${issue.message}

File Content (context):
\`\`\`
${fileContent}
\`\`\`

User Question: "${userMessage}"

Answer the user's question concisely and helpfully.`;

      const messages = [vscode.LanguageModelChatMessage.User(prompt)];

      const chatResponse = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token
      );

      let fullResponse = "";
      for await (const fragment of chatResponse.text) {
        fullResponse += fragment;
      }

      return fullResponse;
    } catch (error) {
      return `Error: ${(error as Error).message}`;
    }
  }
}
