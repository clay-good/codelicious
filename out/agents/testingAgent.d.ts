/**
 * Testing Agent
 *
 * Generates and validates tests for generated code.
 * Ensures code functionality matches requirements.
 */
import { BaseAgent } from './baseAgent';
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionEngine } from '../core/executionEngine';
import { AgentContext, AgentConfig, TestingValidationResult, GeneratedTest, TestExecutionResult } from './types';
export declare class TestingAgent extends BaseAgent {
    private readonly executionEngine;
    constructor(orchestrator: ModelOrchestrator, executionEngine: ExecutionEngine, config?: Partial<AgentConfig>);
    protected getDefaultSystemPrompt(): string;
    protected buildPrompt(context: AgentContext): Promise<string>;
    protected parseResponse(response: string, context: AgentContext): Promise<TestingValidationResult>;
    /**
    * Execute generated tests
    */
    executeTests(tests: GeneratedTest[], workspaceRoot: string): Promise<TestExecutionResult[]>;
    /**
    * Get test command for framework
    */
    private getTestCommand;
    /**
    * Generate test file path from source file path
    */
    private generateTestFilePath;
    /**
    * Analyze test coverage
    */
    analyzeCoverage(code: string, tests: GeneratedTest[]): Promise<number>;
    /**
    * Extract function names from code
    */
    private extractFunctions;
    /**
    * Generate quick smoke test
    */
    generateSmokeTest(code: string, filePath: string, language: string): GeneratedTest;
}
//# sourceMappingURL=testingAgent.d.ts.map