/**
 * Comprehensive Test Generator - Generate high-quality, behavior-focused tests
 *
 * Features:
 * - Edge case generation (boundary values, null/undefined, empty arrays)
 * - Integration test generation (API, database, external services)
 * - E2E test generation (user flows, visual regression)
 * - Behavior-focused assertions (verify behavior, not just structure)
 * - Test quality scoring
 *
 * Goal: Generate tests that actually catch bugs
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionEngine } from '../core/executionEngine';
export interface TestGenerationRequest {
    code: string;
    language: string;
    framework?: string;
    filePath: string;
    description: string;
    testTypes: TestType[];
    enableMutationTesting?: boolean;
    workspaceRoot?: string;
}
export type TestType = 'unit' | 'integration' | 'e2e';
export interface TestGenerationResult {
    tests: GeneratedTest[];
    quality: TestQualityReport;
    coverage: CoverageEstimate;
    mutationScore?: number;
    totalTests?: number;
}
export interface GeneratedTest {
    type: TestType;
    code: string;
    description: string;
    testCount: number;
    edgeCases: string[];
    assertions: number;
}
export interface TestQualityReport {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    strengths: string[];
    weaknesses: string[];
    recommendations: string[];
}
export interface CoverageEstimate {
    lines: number;
    branches: number;
    functions: number;
    edgeCases: number;
}
export declare class ComprehensiveTestGenerator {
    private orchestrator;
    private executionEngine?;
    private workspaceRoot?;
    private mutationEngine?;
    constructor(orchestrator: ModelOrchestrator, executionEngine?: ExecutionEngine | undefined, workspaceRoot?: string | undefined);
    /**
    * Generate comprehensive tests
    */
    generate(request: TestGenerationRequest): Promise<TestGenerationResult>;
    /**
    * Generate unit tests with edge cases
    */
    private generateUnitTests;
    /**
    * Generate integration tests
    */
    private generateIntegrationTests;
    /**
    * Generate E2E tests
    */
    private generateE2ETests;
    /**
    * Get unit test system prompt
    */
    private getUnitTestSystemPrompt;
    /**
    * Get integration test system prompt
    */
    private getIntegrationTestSystemPrompt;
    /**
    * Get E2E test system prompt
    */
    private getE2ETestSystemPrompt;
    /**
    * Get framework-specific guidelines
    */
    private getFrameworkSpecificGuidelines;
    /**
    * Build unit test prompt
    */
    private buildUnitTestPrompt;
    /**
    * Build integration test prompt
    */
    private buildIntegrationTestPrompt;
    /**
    * Build E2E test prompt
    */
    private buildE2ETestPrompt;
    /**
    * Extract code from response
    */
    private extractCode;
    /**
    * Extract edge cases from response
    */
    private extractEdgeCases;
    /**
    * Count tests in code
    */
    private countTests;
    /**
    * Count assertions in code
    */
    private countAssertions;
    /**
    * Calculate test quality
    */
    private calculateQuality;
    /**
    * Get test file path
    */
    private getTestFilePath;
    /**
    * Estimate coverage
    */
    private estimateCoverage;
}
//# sourceMappingURL=comprehensiveTestGenerator.d.ts.map