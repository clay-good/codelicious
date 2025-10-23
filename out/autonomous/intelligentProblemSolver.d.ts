/**
 * Intelligent Problem Solver - AI-Powered Code Problem Solving & Troubleshooting
 *
 * This system uses Claude Sonnet 4/4.5 to deeply analyze, troubleshoot, and solve
 * code problems during generation, refactoring, and validation.
 *
 * Features:
 * - Deep problem analysis with root cause detection
 * - Multi-step problem solving with iterative refinement
 * - Context-aware troubleshooting using RAG
 * - Automatic test generation for problem validation
 * - Learning from past solutions
 * - Refactoring intelligence with AI suggestions
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { RAGService } from '../rag/ragService';
import { LearningManager } from '../learning/learningManager';
export interface Problem {
    id: string;
    type: 'compilation' | 'runtime' | 'logic' | 'performance' | 'security' | 'quality' | 'refactoring';
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    context: ProblemContext;
    affectedFiles: string[];
    stackTrace?: string;
    errorMessage?: string;
    detectedAt: Date;
}
export interface ProblemContext {
    code: string;
    filePath: string;
    language: string;
    framework?: string;
    dependencies: string[];
    relatedCode: string[];
    testResults?: unknown;
    buildOutput?: string;
}
export interface Solution {
    id: string;
    problemId: string;
    approach: string;
    steps: SolutionStep[];
    codeChanges: CodeChange[];
    tests: GeneratedTest[];
    confidence: number;
    reasoning: string;
    alternatives: AlternativeSolution[];
    estimatedImpact: 'low' | 'medium' | 'high';
}
export interface SolutionStep {
    order: number;
    description: string;
    action: 'analyze' | 'modify' | 'test' | 'validate' | 'refactor';
    details: string;
    completed: boolean;
}
export interface CodeChange {
    filePath: string;
    operation: 'create' | 'modify' | 'delete';
    originalCode?: string;
    newCode: string;
    lineStart?: number;
    lineEnd?: number;
    explanation: string;
}
export interface GeneratedTest {
    filePath: string;
    testCode: string;
    testType: 'unit' | 'integration' | 'e2e';
    purpose: string;
}
export interface AlternativeSolution {
    approach: string;
    pros: string[];
    cons: string[];
    confidence: number;
}
export interface ProblemSolvingResult {
    success: boolean;
    problem: Problem;
    solution: Solution;
    validationResults: ValidationResult[];
    iterations: number;
    timeSpent: number;
    lessonsLearned: string[];
}
export interface ValidationResult {
    type: 'compilation' | 'tests' | 'linting' | 'runtime';
    passed: boolean;
    details: string;
    issues: string[];
}
export declare class IntelligentProblemSolver {
    private orchestrator;
    private ragService;
    private learningManager?;
    private solutionHistory;
    constructor(orchestrator: ModelOrchestrator, ragService: RAGService, learningManager?: LearningManager | undefined);
    /**
    * Analyze and solve a problem using AI
    * Uses Claude Sonnet 4/4.5 for deep reasoning
    */
    solveProblem(problem: Problem, options?: {
        maxIterations?: number;
        requireTests?: boolean;
        considerAlternatives?: boolean;
        useRAG?: boolean;
        learnFromSolution?: boolean;
    }): Promise<ProblemSolvingResult>;
    /**
    * Deep problem analysis using Claude Sonnet with RAG context
    */
    private analyzeProblem;
    /**
    * Generate solution using Claude Sonnet
    */
    private generateSolution;
    /**
    * Validate solution by running tests and checks
    */
    private validateSolution;
    /**
    * Refine solution based on validation failures
    */
    private refineSolution;
    /**
    * Apply solution steps sequentially
    */
    private applySolutionSteps;
    /**
    * Learn from successful solution
    */
    private learnFromSolution;
    /**
    * Store solution in history
    */
    private storeSolution;
    /**
    * Find similar problems from history
    */
    private findSimilarProblems;
    private validateCompilation;
    private validateRuntime;
    private validateLogic;
    private validatePerformance;
    private validateSecurity;
    private validateTests;
    private buildAnalysisPrompt;
    private buildSolutionPrompt;
    private getAnalysisSystemPrompt;
    private getSolutionSystemPrompt;
    private parseAnalysisResponse;
    private parseSolutionResponse;
    private parseCodeChanges;
}
//# sourceMappingURL=intelligentProblemSolver.d.ts.map