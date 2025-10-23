/**
 * Mutation Testing Engine - Test the tests to ensure they catch bugs
 *
 * Features:
 * - Automatic mutation generation (change operators, remove conditions, etc.)
 * - Test execution against mutations
 * - Mutation score calculation
 * - Weak test detection
 * - Test improvement suggestions
 *
 * Goal: Ensure tests actually catch bugs (95%+ mutation score)
 */
import { ExecutionEngine } from '../core/executionEngine';
import { ModelOrchestrator } from '../models/orchestrator';
export interface MutationTestResult {
    mutationScore: number;
    totalMutations: number;
    killedMutations: number;
    survivedMutations: number;
    weakTests: WeakTest[];
    recommendations: string[];
    grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
}
export interface WeakTest {
    testFile: string;
    testName: string;
    survivedMutations: Mutation[];
    severity: 'critical' | 'high' | 'medium';
    suggestion: string;
}
export interface Mutation {
    id: string;
    type: MutationType;
    original: string;
    mutated: string;
    line: number;
    killed: boolean;
    killedBy?: string;
}
export type MutationType = 'arithmetic-operator' | 'comparison-operator' | 'logical-operator' | 'conditional-boundary' | 'return-value' | 'remove-condition' | 'negate-condition' | 'remove-statement' | 'constant-replacement';
export declare class MutationTestingEngine {
    private executionEngine;
    private orchestrator;
    private workspaceRoot;
    constructor(executionEngine: ExecutionEngine, orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Run mutation testing on code
    */
    test(sourceFile: string, testFile: string, code: string): Promise<MutationTestResult>;
    /**
    * Generate mutations from code
    */
    private generateMutations;
    /**
    * Test a single mutation
    */
    private testMutation;
    /**
    * Apply mutation to code
    */
    private applyMutation;
    /**
    * Identify weak tests that didn't catch mutations
    */
    private identifyWeakTests;
    /**
    * Generate test improvement suggestion
    */
    private generateTestSuggestion;
    /**
    * Generate recommendations
    */
    private generateRecommendations;
    private getMutatedArithmeticOperators;
    private getMutatedComparisonOperators;
    private isComparisonOperator;
    private isLogicalOperator;
    private getGrade;
}
//# sourceMappingURL=mutationTestingEngine.d.ts.map