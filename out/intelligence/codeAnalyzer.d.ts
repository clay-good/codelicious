/**
 * Code Analyzer - Analyze code for quality, complexity, and issues
 *
 * Features:
 * - Complexity analysis (cyclomatic, cognitive)
 * - Code smell detection
 * - Maintainability index calculation
 * - Duplication detection
 * - Security vulnerability scanning
 */
export interface AnalysisResult {
    file: string;
    metrics: CodeMetrics;
    issues: CodeIssue[];
    suggestions: CodeSuggestion[];
    score: number;
}
export interface CodeMetrics {
    lines: number;
    linesOfCode: number;
    comments: number;
    complexity: number;
    cognitiveComplexity: number;
    maintainabilityIndex: number;
    functions: number;
    classes: number;
    dependencies: number;
}
export interface CodeIssue {
    type: 'error' | 'warning' | 'info';
    category: 'complexity' | 'duplication' | 'smell' | 'security' | 'performance' | 'analysis';
    message: string;
    line: number;
    column: number;
    severity: 'critical' | 'high' | 'medium' | 'low';
}
export interface CodeSuggestion {
    type: 'refactor' | 'optimize' | 'simplify' | 'extract';
    message: string;
    line: number;
    column: number;
    priority: 'high' | 'medium' | 'low';
    effort: 'small' | 'medium' | 'large';
}
export declare class CodeAnalyzer {
    private readonly workspaceRoot;
    constructor(workspaceRoot: string);
    /**
    * Analyze a file
    */
    analyzeFile(filePath: string): Promise<AnalysisResult>;
    /**
    * Calculate code metrics
    */
    private calculateMetrics;
    /**
    * Count lines of code (excluding comments and blank lines)
    */
    private countLinesOfCode;
    /**
    * Count comment lines
    */
    private countComments;
    /**
    * Calculate cyclomatic complexity
    */
    private calculateCyclomaticComplexity;
    /**
    * Calculate cognitive complexity
    */
    private calculateCognitiveComplexity;
    /**
    * Calculate maintainability index
    * Formula: 171 - 5.2 * ln(V) - 0.23 * G - 16.2 * ln(LOC)
    * Where V = Halstead Volume, G = Cyclomatic Complexity, LOC = Lines of Code
    */
    private calculateMaintainabilityIndex;
    /**
    * Count functions
    */
    private countFunctions;
    /**
    * Count classes
    */
    private countClasses;
    /**
    * Count dependencies
    */
    private countDependencies;
    /**
    * Detect code issues
    */
    private detectIssues;
    /**
    * Detect code smells
    */
    private detectCodeSmells;
    /**
    * Generate suggestions
    */
    private generateSuggestions;
    /**
    * Calculate overall quality score (0-100)
    */
    private calculateScore;
}
//# sourceMappingURL=codeAnalyzer.d.ts.map