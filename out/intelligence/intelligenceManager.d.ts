/**
 * Intelligence Manager - Coordinate code intelligence features
 *
 * Features:
 * - Code analysis coordination
 * - Refactoring coordination
 * - Dependency analysis coordination
 * - Results caching
 * - VS Code integration
 */
export declare class IntelligenceManager {
    private readonly workspaceRoot;
    private codeAnalyzer;
    private refactoringEngine;
    private dependencyAnalyzer;
    private analysisCache;
    private diagnosticCollection;
    constructor(workspaceRoot: string);
    /**
    * Analyze current file
    */
    analyzeCurrentFile(): Promise<void>;
    /**
    * Analyze entire workspace
    */
    analyzeWorkspace(): Promise<void>;
    /**
    * Analyze dependencies
    */
    analyzeDependencies(): Promise<void>;
    /**
    * Extract method refactoring
    */
    extractMethod(): Promise<void>;
    /**
    * Extract variable refactoring
    */
    extractVariable(): Promise<void>;
    /**
    * Show code quality report
    */
    showCodeQualityReport(): Promise<void>;
    /**
    * Update diagnostics for document
    */
    private updateDiagnostics;
    /**
    * Show analysis results
    */
    private showAnalysisResults;
    /**
    * Show dependency results
    */
    private showDependencyResults;
    /**
    * Format top issues
    */
    private formatTopIssues;
    /**
    * Format recommendations
    */
    private formatRecommendations;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=intelligenceManager.d.ts.map