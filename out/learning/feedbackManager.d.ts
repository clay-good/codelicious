/**
 * Feedback Manager
 *
 * Captures and processes user feedback on generated code to enable
 * continuous learning and improvement. Tracks:
 * - User approvals/rejections
 * - Code corrections and modifications
 * - Test results and quality metrics
 * - Usage patterns and preferences
 */
import * as vscode from 'vscode';
export declare enum FeedbackType {
    APPROVAL = "approval",
    REJECTION = "rejection",
    MODIFICATION = "modification",
    TEST_PASS = "test_pass",
    TEST_FAIL = "test_fail",
    ERROR = "error",
    MANUAL_FIX = "manual_fix"
}
export declare enum FeedbackSentiment {
    POSITIVE = "positive",
    NEUTRAL = "neutral",
    NEGATIVE = "negative"
}
export interface CodeFeedback {
    id: string;
    timestamp: number;
    type: FeedbackType;
    sentiment: FeedbackSentiment;
    prompt: string;
    promptHash: string;
    generatedCode: string;
    codeHash: string;
    language: string;
    taskType: string;
    approved: boolean;
    modifiedCode?: string;
    modifications?: CodeModification[];
    testResults?: TestResults;
    errorMessage?: string;
    userComment?: string;
    qualityScore: number;
    timeToApproval?: number;
    iterationCount: number;
    tags: string[];
    patterns: string[];
    antiPatterns: string[];
}
export interface CodeModification {
    type: 'addition' | 'deletion' | 'change';
    lineNumber: number;
    originalCode: string;
    modifiedCode: string;
    reason?: string;
}
export interface TestResults {
    passed: number;
    failed: number;
    total: number;
    coverage?: number;
    duration: number;
    errors: string[];
}
export interface FeedbackSummary {
    totalFeedback: number;
    approvalRate: number;
    averageQualityScore: number;
    averageIterations: number;
    commonPatterns: Array<{
        pattern: string;
        count: number;
    }>;
    commonIssues: Array<{
        issue: string;
        count: number;
    }>;
    improvementTrend: number;
}
export interface LearningInsight {
    type: 'pattern' | 'anti_pattern' | 'preference' | 'improvement';
    description: string;
    confidence: number;
    examples: string[];
    frequency: number;
    impact: 'high' | 'medium' | 'low';
}
export declare class FeedbackManager {
    private context;
    private feedback;
    private readonly STORAGE_KEY;
    private readonly MAX_FEEDBACK_ENTRIES;
    constructor(context: vscode.ExtensionContext);
    /**
    * Record user feedback on generated code
    */
    recordFeedback(feedback: Omit<CodeFeedback, 'id' | 'timestamp' | 'promptHash' | 'codeHash'>): Promise<string>;
    /**
    * Record approval
    */
    recordApproval(prompt: string, generatedCode: string, language: string, taskType: string, timeToApproval: number, iterationCount?: number): Promise<string>;
    /**
    * Record rejection
    */
    recordRejection(prompt: string, generatedCode: string, language: string, taskType: string, reason?: string): Promise<string>;
    /**
    * Record modification (user edited the generated code)
    */
    recordModification(prompt: string, generatedCode: string, modifiedCode: string, language: string, taskType: string, modifications: CodeModification[]): Promise<string>;
    /**
    * Record test results
    */
    recordTestResults(prompt: string, generatedCode: string, language: string, taskType: string, testResults: TestResults): Promise<string>;
    /**
    * Get feedback summary
    */
    getSummary(options?: {
        language?: string;
        taskType?: string;
        days?: number;
    }): FeedbackSummary;
    /**
    * Generate learning insights from feedback
    */
    generateInsights(options?: {
        language?: string;
        taskType?: string;
        minConfidence?: number;
    }): LearningInsight[];
    private generateId;
    private hashContent;
    private extractTags;
    private extractPatterns;
    private extractAntiPatternsFromModifications;
    private calculateModificationQuality;
    private calculateImprovementTrend;
    private getExamplesForPattern;
    private trimOldFeedback;
    private loadFeedback;
    private saveFeedback;
}
//# sourceMappingURL=feedbackManager.d.ts.map