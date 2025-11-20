import * as vscode from "vscode";
import { ReviewHistoryProvider } from "../providers/historyProvider";
import { ReviewResult, ReviewIssue } from "../types";

export class ReviewChatParticipant {
  private static readonly ID = "ai-reviewer.codereview-ai.reviewer";

  constructor(
    private context: vscode.ExtensionContext,
    private historyProvider: ReviewHistoryProvider
  ) {}

  public register() {
    this.context.subscriptions.push(
      vscode.chat.createChatParticipant(
        ReviewChatParticipant.ID,
        async (
          request: vscode.ChatRequest,
          context: vscode.ChatContext,
          stream: vscode.ChatResponseStream,
          token: vscode.CancellationToken
        ) => {
          const latestReview = this.historyProvider.getLatestReview();

          if (!latestReview) {
            stream.markdown(
              "I don't see any recent code reviews. Please run a review first using the 'Review Changes' command."
            );
            return;
          }

          const result = latestReview.result;

          if (request.command === "summarize") {
            await this.handleSummarize(result, stream, token);
          } else if (request.command === "explain") {
            await this.handleExplain(request.prompt, result, stream, token);
          } else if (request.command === "fix") {
            await this.handleFix(request.prompt, result, stream, token);
          } else {
            await this.handleGeneralQuestion(
              request.prompt,
              result,
              stream,
              token
            );
          }
        }
      )
    );
  }

  private async handleSummarize(
    result: ReviewResult,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) {
    stream.progress("Summarizing review...");

    const stats = {
      errors: result.issues.filter((i) => i.severity === "error").length,
      warnings: result.issues.filter((i) => i.severity === "warning").length,
      info: result.issues.filter((i) => i.severity === "info").length,
    };

    stream.markdown(`### Review Summary\n\n`);
    stream.markdown(
      `**Total Issues**: ${result.issues.length} (🔴 ${stats.errors} Errors, ⚠️ ${stats.warnings} Warnings)\n\n`
    );
    stream.markdown(`${result.summary}\n\n`);

    if (stats.errors > 0) {
      stream.markdown(`#### Critical Issues:\n`);
      result.issues
        .filter((i) => i.severity === "error")
        .forEach((issue) => {
          stream.markdown(
            `- **${issue.file}** (Line ${issue.line}): ${issue.message}\n`
          );
        });
    }
  }

  private async handleExplain(
    prompt: string,
    result: ReviewResult,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) {
    // Try to find context from the prompt or active editor
    const models = await vscode.lm.selectChatModels({ family: "gpt-4" });
    if (models.length === 0) {
      stream.markdown("No AI model available.");
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    let relevantIssues = result.issues;
    let contextMsg = "All Issues";

    if (activeEditor) {
      const currentFile = vscode.workspace.asRelativePath(
        activeEditor.document.uri
      );
      const fileIssues = result.issues.filter((i) =>
        currentFile.endsWith(i.file)
      );
      if (fileIssues.length > 0) {
        relevantIssues = fileIssues;
        contextMsg = `Issues in ${currentFile}`;
      }
    }

    const systemPrompt = `You are an expert code reviewer. 
    The user is asking for an explanation regarding a code review.
    
    Context (${contextMsg}):
    ${JSON.stringify(relevantIssues.slice(0, 20))}
    
    Answer the user's question based on the review findings.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(prompt),
    ];

    const chatResponse = await models[0].sendRequest(messages, {}, token);

    for await (const fragment of chatResponse.text) {
      stream.markdown(fragment);
    }
  }

  private async handleFix(
    prompt: string,
    result: ReviewResult,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) {
    const models = await vscode.lm.selectChatModels({ family: "gpt-4" });
    if (models.length === 0) {
      stream.markdown("No AI model available.");
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    let relevantIssues = result.issues;
    let contextMsg = "All Issues";

    if (activeEditor) {
      const currentFile = vscode.workspace.asRelativePath(
        activeEditor.document.uri
      );
      const fileIssues = result.issues.filter((i) =>
        currentFile.endsWith(i.file)
      );
      if (fileIssues.length > 0) {
        relevantIssues = fileIssues;
        contextMsg = `Issues in ${currentFile}`;
      }
    }

    const systemPrompt = `You are an expert code reviewer.
    The user wants help fixing an issue found in the review.
    
    Context (${contextMsg}):
    ${JSON.stringify(
      relevantIssues.map((i) => ({
        file: i.file,
        line: i.line,
        message: i.message,
        fix: i.suggestedFix,
      }))
    )}
    
    Provide a code solution for the issue the user is referring to.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(prompt),
    ];

    const chatResponse = await models[0].sendRequest(messages, {}, token);

    for await (const fragment of chatResponse.text) {
      stream.markdown(fragment);
    }
  }

  private async handleGeneralQuestion(
    prompt: string,
    result: ReviewResult,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ) {
    const models = await vscode.lm.selectChatModels({ family: "gpt-4" });
    if (models.length === 0) {
      stream.markdown("No AI model available.");
      return;
    }

    const systemPrompt = `You are an expert code reviewer assistant.
    You have access to the following review results:
    Summary: ${result.summary}
    Issues: ${JSON.stringify(
      result.issues.map((i) => ({
        file: i.file,
        line: i.line,
        message: i.message,
        severity: i.severity,
      }))
    )}
    
    Answer the user's question about the code review.`;

    const messages = [
      vscode.LanguageModelChatMessage.User(systemPrompt),
      vscode.LanguageModelChatMessage.User(prompt),
    ];

    const chatResponse = await models[0].sendRequest(messages, {}, token);

    for await (const fragment of chatResponse.text) {
      stream.markdown(fragment);
    }
  }
}
