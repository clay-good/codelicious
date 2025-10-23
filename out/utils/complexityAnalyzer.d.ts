/**
 * Complexity Analyzer Utility
 * Consolidates duplicated complexity analysis code from multiple files
 *
 * This utility provides a single source of truth for:
 * - Cyclomatic complexity calculation
 * - Cognitive complexity calculation
 * - Code quality scoring
 * - Complexity thresholds
 */
export interface ComplexityMetrics {
    cyclomatic: number;
    cognitive: number;
    nestingDepth: number;
    linesOfCode: number;
    commentRatio: number;
}
export interface ComplexityThresholds {
    cyclomatic: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
    cognitive: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
    nesting: {
        low: number;
        medium: number;
        high: number;
        critical: number;
    };
}
export interface ComplexityIssue {
    type: 'cyclomatic' | 'cognitive' | 'nesting' | 'comments';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    suggestion: string;
    value: number;
    threshold: number;
}
/**
 * Standard complexity thresholds based on industry best practices
 */
export declare const STANDARD_THRESHOLDS: ComplexityThresholds;
/**
 * Calculate cyclomatic complexity from code string
 *
 * Cyclomatic complexity = number of decision points + 1
 * Decision points: if, else if, while, for, case, catch, &&, ||, ?:
 */
export declare function calculateCyclomaticComplexity(code: string): number;
/**
 * Calculate cognitive complexity from code string
 *
 * Cognitive complexity considers nesting depth and control flow breaks
 * More complex than cyclomatic as it accounts for human understanding
 */
export declare function calculateCognitiveComplexity(code: string): number;
/**
 * Calculate maximum nesting depth
 */
export declare function calculateNestingDepth(code: string): number;
/**
 * Calculate comment ratio
 */
export declare function calculateCommentRatio(code: string): number;
/**
 * Calculate all complexity metrics
 */
export declare function analyzeComplexity(code: string): ComplexityMetrics;
/**
 * Detect complexity issues
 */
export declare function detectComplexityIssues(metrics: ComplexityMetrics, thresholds?: ComplexityThresholds): ComplexityIssue[];
/**
 * Calculate quality score based on complexity metrics
 * Returns a score from 0-100
 */
export declare function calculateQualityScore(metrics: ComplexityMetrics, thresholds?: ComplexityThresholds): number;
/**
 * Get complexity level as string
 */
export declare function getComplexityLevel(complexity: number, type: 'cyclomatic' | 'cognitive' | 'nesting'): string;
//# sourceMappingURL=complexityAnalyzer.d.ts.map