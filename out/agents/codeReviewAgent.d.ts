import { ModelOrchestrator } from '../models/orchestrator';
/**
 * Code review issue severity
 */
export declare enum ReviewSeverity {
    CRITICAL = "critical",
    HIGH = "high",
    MEDIUM = "medium",
    LOW = "low",
    INFO = "info"
}
/**
 * Code review issue category
 */
export declare enum ReviewCategory {
    SECURITY = "security",
    PERFORMANCE = "performance",
    MAINTAINABILITY = "maintainability",
    CORRECTNESS = "correctness",
    STYLE = "style",
    BEST_PRACTICES = "best_practices"
}
/**
 * Code review issue
 */
export interface ReviewIssue {
    severity: ReviewSeverity;
    category: ReviewCategory;
    line?: number;
    column?: number;
    message: string;
    suggestion?: string;
    autoFixable: boolean;
    autoFix?: string;
}
/**
 * Code review result
 */
export interface CodeReviewResult {
    filePath: string;
    issues: ReviewIssue[];
    score: number;
    summary: string;
    recommendations: string[];
}
/**
 * AI-powered code review agent
 * Reviews code for security, performance, maintainability, and best practices
 */
export declare class CodeReviewAgent {
    private orchestrator;
    constructor(orchestrator: ModelOrchestrator);
    /**
    * Review code file
    */
    reviewFile(filePath: string, content: string, language: string): Promise<CodeReviewResult>;
    /**
    * Review multiple files
    */
    reviewFiles(files: Array<{
        path: string;
        content: string;
        language: string;
    }>): Promise<CodeReviewResult[]>;
    /**
    * Apply auto-fixes to code
    */
    applyAutoFixes(filePath: string, content: string, issues: ReviewIssue[]): Promise<string>;
    /**
    * Generate review summary for multiple files
    */
    generateSummary(results: CodeReviewResult[]): string;
    /**
    * Get issues grouped by category
    */
    private getIssuesByCategory;
    /**
    * Get issues grouped by severity
    */
    private getIssuesBySeverity;
    /**
    * Get top recommendations
    */
    private getTopRecommendations;
    /**
    * Check if code passes review
    */
    passesReview(result: CodeReviewResult, minScore?: number): boolean;
}
//# sourceMappingURL=codeReviewAgent.d.ts.map