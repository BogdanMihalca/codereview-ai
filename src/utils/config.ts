import * as vscode from "vscode";
import {
  ExtensionConfig,
  AIModelConfig,
  ReviewRules,
  AIModelFamily,
  AIModelVendor,
  ReviewStrictness,
  IssueSeverity,
} from "../types";

export function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration("aiCodeReview");

  const aiModel: AIModelConfig = {
    vendor: config.get<AIModelVendor>("aiModel.vendor", "copilot"),
    family: config.get<AIModelFamily>("aiModel.family", "gpt-4"),
    modelId: config.get<string>("aiModel.modelId"),
  };

  const reviewRules: ReviewRules = {
    checkSecurity: config.get<boolean>("reviewRules.checkSecurity", true),
    checkPerformance: config.get<boolean>("reviewRules.checkPerformance", true),
    checkCodeSmells: config.get<boolean>("reviewRules.checkCodeSmells", true),
    checkTestCoverage: config.get<boolean>(
      "reviewRules.checkTestCoverage",
      false
    ),
    checkDocumentation: config.get<boolean>(
      "reviewRules.checkDocumentation",
      false
    ),
    checkAccessibility: config.get<boolean>(
      "reviewRules.checkAccessibility",
      false
    ),
    strictness: config.get<ReviewStrictness>(
      "reviewRules.strictness",
      "balanced"
    ),
  };

  return {
    enableAutoReview: config.get<boolean>("enableAutoReview", false),
    severityThreshold: config.get<IssueSeverity>("severityThreshold", "info"),
    maxDiffSize: config.get<number>("maxDiffSize", 30000),
    aiModel,
    customPrompt: config.get<string>("customPrompt", ""),
    excludePatterns: config.get<string[]>("excludePatterns", [
      "node_modules/**",
      "dist/**",
      "build/**",
      "*.min.js",
    ]),
    autoFixOnSave: config.get<boolean>("autoFixOnSave", false),
    reviewRules,
    showInlineDecorations: config.get<boolean>("showInlineDecorations", true),
  };
}

export function shouldExcludeFile(
  filePath: string,
  patterns: string[]
): boolean {
  const fileName = filePath.split("/").pop() || "";

  for (const pattern of patterns) {
    if (pattern.includes("**")) {
      // Simple glob matching for ** patterns
      const regex = new RegExp(
        pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*")
      );
      if (regex.test(filePath)) {
        return true;
      }
    } else if (pattern.includes("*")) {
      // Simple wildcard matching
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      if (regex.test(fileName)) {
        return true;
      }
    } else if (filePath.includes(pattern)) {
      return true;
    }
  }
  return false;
}
