/**
 * Automatic Test Fixer
 * Analyzes failing tests and automatically fixes them
 */
import { ExecutionEngine } from '../core/executionEngine';
import { ModelOrchestrator } from '../models/orchestrator';
import { ArchitecturalContext } from '../context/persistentContextEngine';
export interface FailingTest {
    file: string;
    testName: string;
    error: string;
    stackTrace: string;
    line: number;
    type: 'assertion' | 'runtime' | 'timeout' | 'setup' | 'teardown';
}
export interface TestFix {
    file: string;
    testName: string;
    originalCode: string;
    fixedCode: string;
    explanation: string;
    confidence: number;
    changes: CodeChange[];
}
export interface CodeChange {
    type: 'add' | 'modify' | 'remove';
    line: number;
    oldCode?: string;
    newCode?: string;
    reason: string;
}
export interface TestFixResult {
    fixes: TestFix[];
    applied: number;
    successful: number;
    failed: number;
    duration: number;
}
export interface TestFixOptions {
    maxRetries?: number;
    autoApply?: boolean;
    requireConfirmation?: boolean;
    focusFiles?: string[];
}
export declare class TestFixer {
    private executionEngine;
    private orchestrator;
    private workspaceRoot;
    constructor(executionEngine: ExecutionEngine, orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Fix failing tests
    */
    fixTests(context: ArchitecturalContext, options?: TestFixOptions): Promise<TestFixResult>;
    /**
    * Find failing tests
    */
    private findFailingTests;
    /**
    * Get test command
    */
    private getTestCommand;
    /**
    * Parse test output
    */
    private parseTestOutput;
    /**
    * Classify error type
    */
    private classifyError;
    /**
    * Generate fix for failing test
    */
    private generateFix;
    /**
    * Parse fix response
    */
    private parseFixResponse;
    /**
    * Confirm fix with user
    */
    private confirmFix;
    /**
    * Apply fix
    */
    private applyFix;
    /**
    * Find source file for test
    */
    private findSourceFile;
}
//# sourceMappingURL=testFixer.d.ts.map