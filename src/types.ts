export type FixType = "replace" | "insert" | "delete";

export interface CodeFix {
  type: FixType;
  startLine: number;
  endLine: number;
  newCode: string;
  description: string;
}

export type FixStatus = "pending" | "applied" | "dismissed" | "failed";

export type IssueSeverity = "error" | "warning" | "info";

export type IssueCategory =
  | "Security"
  | "Performance"
  | "Bug"
  | "Code Quality"
  | "Testing"
  | "Documentation"
  | "Code Smell"
  | "Best Practice"
  | "Accessibility"
  | "Maintainability";

export interface ReviewIssue {
  file: string;
  line: number;
  codeSnippet?: string; // The exact line of code for verification
  message: string;
  severity: IssueSeverity;
  category: IssueCategory;
  suggestedFix?: string | CodeFix;
  fixStatus?: FixStatus;
}

export interface ReviewResult {
  summary: string;
  mrDescription?: string; // Ready-to-copy MR description
  mrComment?: string; // Short MR comment
  issues: ReviewIssue[];
  timestamp?: Date;
  targetBranch?: string;
  currentBranch?: string;
  filesChanged?: number;
  changedFilesList?: string[]; // List of changed file paths
  securityIssues?: number;
  performanceIssues?: number;
  codeSmells?: number;
  testCoverage?: string;
}

export interface ReviewHistoryItem {
  id: string;
  result: ReviewResult;
  timestamp: Date;
  targetBranch: string;
  filesChanged: number;
  currentBranch?: string;
  changedFilesList?: string[];
}

export type AIModelFamily =
  | "gpt-4"
  | "gpt-4-turbo"
  | "gpt-3.5-turbo"
  | "claude-3-opus"
  | "claude-3-sonnet"
  | "claude-3-haiku";

export type AIModelVendor = "copilot" | "openai" | "anthropic";

export interface AIModelConfig {
  vendor: AIModelVendor;
  family: AIModelFamily;
  modelId?: string; // Specific model ID if needed
}

export type ReviewStrictness = "strict" | "balanced" | "lenient";

export interface ReviewRules {
  checkSecurity: boolean;
  checkPerformance: boolean;
  checkCodeSmells: boolean;
  checkTestCoverage: boolean;
  checkDocumentation: boolean;
  checkAccessibility: boolean;
  strictness: ReviewStrictness;
}

export interface ExtensionConfig {
  enableAutoReview: boolean;
  severityThreshold: IssueSeverity;
  maxDiffSize: number;
  aiModel: AIModelConfig;
  customPrompt?: string;
  excludePatterns: string[];
  autoFixOnSave: boolean;
  reviewRules: ReviewRules;
  showInlineDecorations: boolean;
}
