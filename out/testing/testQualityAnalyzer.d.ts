/**
 * Test Quality Analyzer
 * Analyzes test quality and suggests improvements
 */
import { ModelOrchestrator } from '../models/orchestrator';
export interface TestQualityReport {
    overall: {
        score: number;
        grade: 'A' | 'B' | 'C' | 'D' | 'F';
        totalTests: number;
        totalFiles: number;
    };
    files: FileQuality[];
    issues: QualityIssue[];
    recommendations: string[];
    bestPractices: BestPractice[];
}
export interface FileQuality {
    path: string;
    score: number;
    metrics: {
        testCount: number;
        assertionCount: number;
        averageAssertionsPerTest: number;
        hasSetup: boolean;
        hasTeardown: boolean;
        hasMocking: boolean;
        hasEdgeCases: boolean;
        hasErrorHandling: boolean;
    };
    issues: QualityIssue[];
}
export interface QualityIssue {
    file: string;
    line: number;
    type: 'smell' | 'antipattern' | 'missing' | 'redundant';
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    suggestion: string;
    example?: string;
}
export interface BestPractice {
    category: string;
    practice: string;
    reason: string;
    example: string;
    adopted: boolean;
}
export interface TestQualityOptions {
    includeRecommendations?: boolean;
    includeBestPractices?: boolean;
    focusFiles?: string[];
}
export declare class TestQualityAnalyzer {
    private orchestrator;
    private workspaceRoot;
    constructor(orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Analyze test quality
    */
    analyze(options?: TestQualityOptions): Promise<TestQualityReport>;
    /**
    * Find test files
    */
    private findTestFiles;
    /**
    * Analyze single test file
    */
    private analyzeFile;
    /**
    * Count tests
    */
    private countTests;
    /**
    * Count assertions
    */
    private countAssertions;
    /**
    * Check for setup
    */
    private hasSetup;
    /**
    * Check for teardown
    */
    private hasTeardown;
    /**
    * Check for mocking
    */
    private hasMocking;
    /**
    * Check for edge cases
    */
    private hasEdgeCases;
    /**
    * Check for error handling
    */
    private hasErrorHandling;
    /**
    * Detect quality issues
    */
    private detectIssues;
    /**
    * Calculate file score
    */
    private calculateFileScore;
    /**
    * Calculate overall score
    */
    private calculateOverallScore;
    /**
    * Convert score to grade
    */
    private scoreToGrade;
    /**
    * Generate recommendations
    */
    private generateRecommendations;
    /**
    * Identify best practices
    */
    private identifyBestPractices;
}
//# sourceMappingURL=testQualityAnalyzer.d.ts.map