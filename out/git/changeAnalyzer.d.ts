/**
 * Change Analyzer - Analyze code changes for impact and risk
 * Provides insights about changes before committing or creating PRs
 */
import { GitService } from './gitService';
import { ModelOrchestrator } from '../models/orchestrator';
export interface ChangeAnalysis {
    impact: ImpactLevel;
    risk: RiskLevel;
    affectedAreas: string[];
    suggestions: string[];
    warnings: string[];
    metrics: ChangeMetrics;
    summary: string;
}
export declare enum ImpactLevel {
    MINIMAL = "minimal",
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export declare enum RiskLevel {
    SAFE = "safe",
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
export interface ChangeMetrics {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
    linesModified: number;
    complexity: number;
    testCoverage: boolean;
    hasBreakingChanges: boolean;
}
export declare class ChangeAnalyzer {
    private gitService;
    private modelOrchestrator;
    constructor(gitService: GitService, modelOrchestrator: ModelOrchestrator);
    /**
    * Analyze staged changes
    */
    analyzeStagedChanges(): Promise<ChangeAnalysis>;
    /**
    * Analyze unstaged changes
    */
    analyzeUnstagedChanges(): Promise<ChangeAnalysis>;
    /**
    * Analyze all changes (staged + unstaged)
    */
    analyzeAllChanges(): Promise<ChangeAnalysis>;
    /**
    * Analyze changes and provide insights
    */
    private analyzeChanges;
    /**
    * Calculate change metrics
    */
    private calculateMetrics;
    /**
    * Calculate complexity score (0-100)
    */
    private calculateComplexity;
    /**
    * Detect potential breaking changes
    */
    private detectBreakingChanges;
    /**
    * Determine impact level
    */
    private determineImpact;
    /**
    * Determine risk level
    */
    private determineRisk;
    /**
    * Get affected areas
    */
    private getAffectedAreas;
    /**
    * Generate suggestions
    */
    private generateSuggestions;
    /**
    * Generate warnings
    */
    private generateWarnings;
    /**
    * Generate AI-powered summary
    */
    private generateSummary;
}
//# sourceMappingURL=changeAnalyzer.d.ts.map