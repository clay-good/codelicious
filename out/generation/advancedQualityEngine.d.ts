/**
 * Advanced Quality Engine - Ultra-high quality code generation with multi-layer validation
 *
 * Features:
 * - AST-based static analysis
 * - Design pattern enforcement
 * - SOLID principles validation
 * - Security vulnerability detection
 * - Performance anti-pattern detection
 * - Automatic code fixing
 * - Real-time quality scoring
 *
 * Goal: Generate 95%+ quality code consistently
 */
import { ModelOrchestrator } from '../models/orchestrator';
export interface QualityAnalysis {
    score: number;
    grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
    issues: QualityIssue[];
    metrics: QualityMetrics;
    recommendations: string[];
    autoFixable: boolean;
}
export interface QualityIssue {
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: 'security' | 'performance' | 'maintainability' | 'reliability' | 'style';
    message: string;
    line?: number;
    column?: number;
    fix?: string;
    suggestion?: string;
    autoFixable: boolean;
}
export interface QualityMetrics {
    complexity: number;
    maintainability: number;
    reliability: number;
    security: number;
    performance: number;
    testability: number;
    documentation: number;
}
export interface DesignPatternViolation {
    principle: 'SRP' | 'OCP' | 'LSP' | 'ISP' | 'DIP';
    message: string;
    severity: 'critical' | 'high' | 'medium';
    suggestion: string;
}
export declare class AdvancedQualityEngine {
    private orchestrator;
    private analyzer;
    private bestPractices;
    private validationPipeline;
    constructor(orchestrator: ModelOrchestrator);
    /**
    * Analyze code quality with multi-layer validation
    */
    analyze(code: string, language: string, framework?: string): Promise<QualityAnalysis>;
    /**
    * Automatically fix quality issues
    */
    autoFix(code: string, analysis: QualityAnalysis, language: string): Promise<string>;
    /**
    * AST-based static analysis
    */
    private analyzeAST;
    /**
    * Validate design patterns
    */
    private validateDesignPatterns;
    /**
    * Validate SOLID principles
    */
    private validateSOLID;
    /**
    * Analyze security vulnerabilities
    */
    private analyzeSecurityVulnerabilities;
    /**
    * Analyze performance anti-patterns
    */
    private analyzePerformance;
    private mapSeverity;
    private convertBestPracticeViolations;
    private calculateMetrics;
    private calculateScore;
    private getGrade;
    private generateRecommendations;
    private applyFix;
    private aiAssistedFix;
}
//# sourceMappingURL=advancedQualityEngine.d.ts.map