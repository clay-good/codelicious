/**
 * Advanced Testing Orchestrator
 * Coordinates pattern-matching generation, coverage analysis, test fixing, and quality analysis
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionEngine } from '../core/executionEngine';
import { RAGService } from '../rag/ragService';
import { PatternMatchingTestGenerator, GeneratedTest, TestGenerationOptions } from './patternMatchingTestGenerator';
import { CoverageAnalyzer, CoverageReport, CoverageAnalysisOptions } from './coverageAnalyzer';
import { TestFixer, TestFixResult, TestFixOptions } from './testFixer';
import { TestQualityAnalyzer, TestQualityReport, TestQualityOptions } from './testQualityAnalyzer';
export interface AdvancedTestingResult {
    phase: 'learning' | 'generation' | 'coverage' | 'fixing' | 'quality' | 'complete';
    success: boolean;
    learning?: {
        patternsLearned: number;
        frameworks: string[];
    };
    generation?: {
        testsGenerated: number;
        files: string[];
        estimatedCoverage: number;
    };
    coverage?: CoverageReport;
    fixing?: TestFixResult;
    quality?: TestQualityReport;
    duration: number;
    errors: string[];
}
export interface AdvancedTestingOptions {
    sourceFile?: string;
    sourceCode?: string;
    learnPatterns?: boolean;
    generateTests?: boolean;
    analyzeCoverage?: boolean;
    fixFailingTests?: boolean;
    analyzeQuality?: boolean;
    testGenerationOptions?: TestGenerationOptions;
    coverageOptions?: CoverageAnalysisOptions;
    fixOptions?: TestFixOptions;
    qualityOptions?: TestQualityOptions;
}
export declare class AdvancedTestingOrchestrator {
    private orchestrator;
    private executionEngine;
    private ragService;
    private workspaceRoot;
    private patternGenerator;
    private coverageAnalyzer;
    private testFixer;
    private qualityAnalyzer;
    constructor(orchestrator: ModelOrchestrator, executionEngine: ExecutionEngine, ragService: RAGService, workspaceRoot: string);
    /**
    * Execute advanced testing workflow
    */
    execute(options?: AdvancedTestingOptions): Promise<AdvancedTestingResult>;
    /**
    * Generate comprehensive test suite for file
    */
    generateComprehensiveTests(sourceFile: string, sourceCode: string, options?: TestGenerationOptions): Promise<GeneratedTest[]>;
    /**
    * Analyze and improve test suite
    */
    analyzeAndImprove(): Promise<{
        coverage: CoverageReport;
        quality: TestQualityReport;
        improvements: string[];
    }>;
    /**
    * Fix all failing tests
    */
    fixAllFailingTests(options?: TestFixOptions): Promise<TestFixResult>;
    /**
    * Get comprehensive test report
    */
    getComprehensiveReport(): Promise<{
        coverage: CoverageReport;
        quality: TestQualityReport;
        summary: {
            overallHealth: number;
            strengths: string[];
            weaknesses: string[];
            priorities: string[];
        };
    }>;
    /**
    * Get pattern generator
    */
    getPatternGenerator(): PatternMatchingTestGenerator;
    /**
    * Get coverage analyzer
    */
    getCoverageAnalyzer(): CoverageAnalyzer;
    /**
    * Get test fixer
    */
    getTestFixer(): TestFixer;
    /**
    * Get quality analyzer
    */
    getQualityAnalyzer(): TestQualityAnalyzer;
}
//# sourceMappingURL=advancedTestingOrchestrator.d.ts.map