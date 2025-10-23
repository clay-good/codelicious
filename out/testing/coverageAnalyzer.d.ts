/**
 * Automatic Coverage Analyzer
 * Analyzes test coverage and detects gaps
 */
import { ExecutionEngine } from '../core/executionEngine';
import { ModelOrchestrator } from '../models/orchestrator';
export interface CoverageReport {
    overall: {
        lines: {
            total: number;
            covered: number;
            percentage: number;
        };
        branches: {
            total: number;
            covered: number;
            percentage: number;
        };
        functions: {
            total: number;
            covered: number;
            percentage: number;
        };
        statements: {
            total: number;
            covered: number;
            percentage: number;
        };
    };
    files: FileCoverage[];
    gaps: CoverageGap[];
    recommendations: string[];
    score: number;
}
export interface FileCoverage {
    path: string;
    lines: {
        total: number;
        covered: number;
        percentage: number;
    };
    branches: {
        total: number;
        covered: number;
        percentage: number;
    };
    functions: {
        total: number;
        covered: number;
        percentage: number;
    };
    uncoveredLines: number[];
    uncoveredBranches: BranchInfo[];
    uncoveredFunctions: FunctionInfo[];
}
export interface BranchInfo {
    line: number;
    type: 'if' | 'switch' | 'ternary' | 'logical';
    covered: boolean[];
}
export interface FunctionInfo {
    name: string;
    line: number;
    covered: boolean;
}
export interface CoverageGap {
    file: string;
    type: 'line' | 'branch' | 'function';
    location: {
        line: number;
        column?: number;
    };
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    suggestion: string;
}
export interface CoverageAnalysisOptions {
    threshold?: number;
    includeGapAnalysis?: boolean;
    includeRecommendations?: boolean;
    focusFiles?: string[];
}
export declare class CoverageAnalyzer {
    private executionEngine;
    private orchestrator;
    private workspaceRoot;
    constructor(executionEngine: ExecutionEngine, orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Analyze test coverage
    */
    analyze(options?: CoverageAnalysisOptions): Promise<CoverageReport>;
    /**
    * Run coverage tool
    */
    private runCoverage;
    /**
    * Detect coverage tool
    */
    private detectCoverageTool;
    /**
    * Find coverage file
    */
    private findCoverageFile;
    /**
    * Parse coverage data
    */
    private parseCoverageData;
    /**
    * Extract uncovered lines
    */
    private extractUncoveredLines;
    /**
    * Extract uncovered branches
    */
    private extractUncoveredBranches;
    /**
    * Extract uncovered functions
    */
    private extractUncoveredFunctions;
    /**
    * Detect coverage gaps
    */
    private detectGaps;
    /**
    * Generate recommendations using AI
    */
    private generateRecommendations;
    /**
    * Calculate coverage score
    */
    private calculateScore;
}
//# sourceMappingURL=coverageAnalyzer.d.ts.map