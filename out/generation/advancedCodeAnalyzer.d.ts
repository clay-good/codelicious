/**
 * Advanced Code Quality Analyzer - Deep analysis of generated code
 * Goal: Ensure all generated code meets high quality standards
 *
 * Features:
 * - AST-based code analysis
 * - Complexity metrics (cyclomatic, cognitive)
 * - Code smell detection
 * - Best practices validation
 * - Performance analysis
 * - Security vulnerability detection
 * - Maintainability scoring
 */
export interface CodeMetrics {
    linesOfCode: number;
    linesOfComments: number;
    blankLines: number;
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    nestingDepth: number;
    functionCount: number;
    classCount: number;
    averageFunctionLength: number;
    longestFunction: number;
    commentRatio: number;
    duplicateCodePercentage: number;
    testCoverage?: number;
}
export interface CodeSmell {
    type: 'long-method' | 'large-class' | 'long-parameter-list' | 'duplicate-code' | 'dead-code' | 'god-class' | 'feature-envy' | 'data-clumps' | 'primitive-obsession';
    severity: 'low' | 'medium' | 'high' | 'critical';
    location: {
        line: number;
        column: number;
        length: number;
    };
    message: string;
    suggestion: string;
}
export interface QualityIssue {
    category: 'style' | 'performance' | 'security' | 'maintainability' | 'reliability';
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    location: {
        line: number;
        column: number;
    };
    fix?: string;
}
export interface QualityScore {
    overall: number;
    maintainability: number;
    reliability: number;
    security: number;
    performance: number;
    testability: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
}
export interface AnalysisResult {
    metrics: CodeMetrics;
    smells: CodeSmell[];
    issues: QualityIssue[];
    score: QualityScore;
    recommendations: string[];
}
export declare class AdvancedCodeAnalyzer {
    /**
    * Analyze code quality
    */
    analyze(code: string, language: string): AnalysisResult;
    /**
    * Analyze TypeScript/JavaScript code
    */
    private analyzeTypeScript;
    /**
    * Calculate code metrics
    */
    private calculateMetrics;
    /**
    * Calculate cyclomatic complexity
    */
    private calculateCyclomaticComplexity;
    /**
    * Calculate cognitive complexity (more human-centric)
    */
    private calculateCognitiveComplexity;
    /**
    * Get function length in lines
    */
    private getFunctionLength;
    /**
    * Detect duplicate code
    */
    private detectDuplicateCode;
    /**
    * Detect code smells
    */
    private detectCodeSmells;
    /**
    * Detect quality issues
    */
    private detectQualityIssues;
    /**
    * Calculate quality score
    */
    private calculateQualityScore;
    /**
    * Generate recommendations
    */
    private generateRecommendations;
    /**
    * Analyze Python code (simplified)
    */
    private analyzePython;
    /**
    * Generic analysis for other languages
    */
    private analyzeGeneric;
}
//# sourceMappingURL=advancedCodeAnalyzer.d.ts.map