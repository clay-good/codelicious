/**
 * Test Manager - Coordinate test generation and execution
 *
 * Features:
 * - Generate tests for files
 * - Execute tests
 * - Manage test lifecycle
 * - Provide test results
 * - Integration with VS Code
 */
import { TestSuite } from './testGenerator';
import { TestRunResult, TestExecutionOptions } from './testExecutor';
export declare class TestManager {
    private readonly workspaceRoot;
    private testGenerator;
    private testExecutor;
    private statusBarItem;
    constructor(workspaceRoot: string);
    /**
    * Generate tests for current file
    */
    generateTestsForCurrentFile(): Promise<void>;
    /**
    * Generate tests for file
    */
    generateTestsForFile(filePath: string): Promise<TestSuite>;
    /**
    * Create test file
    */
    private createTestFile;
    /**
    * Generate test file content
    */
    private generateTestFileContent;
    /**
    * Run all tests
    */
    runAllTests(options?: TestExecutionOptions): Promise<TestRunResult>;
    /**
    * Run tests for current file
    */
    runTestsForCurrentFile(): Promise<TestRunResult>;
    /**
    * Run tests with coverage
    */
    runTestsWithCoverage(): Promise<TestRunResult>;
    /**
    * Stop running tests
    */
    stopTests(): void;
    /**
    * Find test file for source file
    */
    private findTestFile;
    /**
    * Update status bar
    */
    private updateStatusBar;
    /**
    * Show test results
    */
    private showTestResults;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=testManager.d.ts.map