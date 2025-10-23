/**
 * Iterative Refinement Engine
 *
 * The core of true autonomous capability - keeps refining code until it's perfect.
 * This is what makes Augment truly autonomous vs single-pass generation.
 *
 * Process:
 * 1. Validate current code
 * 2. If perfect (score >= 95), done!
 * 3. Analyze what's wrong (compilation, tests, linting, logic)
 * 4. Generate targeted fixes
 * 5. Apply fixes
 * 6. Repeat until perfect or max iterations
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { ProductionValidator } from './productionValidator';
import { GenerationResult } from './contextAwareCodeGenerator';
import { ParsedRequirements } from './requirementsParser';
import { ExecutionEngine } from '../core/executionEngine';
export interface RefinementOptions {
    maxIterations: number;
    targetScore: number;
    fixCompilationErrors: boolean;
    fixTestFailures: boolean;
    fixLintingIssues: boolean;
    fixLogicErrors: boolean;
    verbose: boolean;
}
export interface RefinementResult {
    success: boolean;
    finalCode: GenerationResult;
    iterations: number;
    improvements: RefinementImprovement[];
    finalScore: number;
    timeSpent: number;
}
export interface RefinementImprovement {
    iteration: number;
    issuesFound: Issue[];
    fixesApplied: Fix[];
    scoreBefore: number;
    scoreAfter: number;
    duration: number;
}
export interface Issue {
    type: 'compilation' | 'test' | 'linting' | 'logic' | 'security' | 'performance';
    severity: 'critical' | 'high' | 'medium' | 'low';
    file: string;
    line?: number;
    message: string;
    code?: string;
    suggestion?: string;
}
export interface Fix {
    issueType: string;
    file: string;
    description: string;
    oldCode?: string;
    newCode: string;
    confidence: number;
}
export declare class IterativeRefinementEngine {
    private orchestrator;
    private validator;
    private executionEngine;
    private workspaceRoot;
    constructor(orchestrator: ModelOrchestrator, validator: ProductionValidator, executionEngine: ExecutionEngine, workspaceRoot: string);
    /**
    * Refine code until it's perfect
    * This is the core autonomous loop that makes the system truly autonomous
    */
    refineUntilPerfect(generatedCode: GenerationResult, requirements: ParsedRequirements, options?: Partial<RefinementOptions>): Promise<RefinementResult>;
    /**
    * Analyze validation results to identify specific issues
    */
    private analyzeIssues;
    /**
    * Analyze compilation errors
    */
    private analyzeCompilationErrors;
    /**
    * Analyze test failures
    */
    private analyzeTestFailures;
    /**
    * Analyze linting issues
    */
    private analyzeLintingIssues;
    /**
    * Analyze logic errors
    */
    private analyzeLogicErrors;
    /**
    * Generate fixes for identified issues
    */
    private generateFixes;
    /**
    * Generate fixes for a specific file
    */
    private generateFixesForFile;
    /**
    * Build prompt for fix generation
    */
    private buildFixPrompt;
    /**
    * Parse fixes from AI response
    */
    private parseFixesFromResponse;
    /**
    * Apply fixes to code
    */
    private applyFixes;
}
//# sourceMappingURL=iterativeRefinementEngine.d.ts.map