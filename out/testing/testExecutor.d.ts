/**
 * Test Executor - Run tests and collect results
 *
 * Features:
 * - Execute test suites
 * - Collect test results
 * - Generate coverage reports
 * - Watch mode support
 * - Parallel execution
 */
export interface TestResult {
    name: string;
    status: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
    stack?: string;
}
export interface TestSuiteResult {
    name: string;
    tests: TestResult[];
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    duration: number;
}
export interface TestRunResult {
    suites: TestSuiteResult[];
    totalSuites: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    duration: number;
    coverage?: CoverageReport;
}
export interface CoverageReport {
    lines: CoverageMetrics;
    statements: CoverageMetrics;
    functions: CoverageMetrics;
    branches: CoverageMetrics;
    files: FileCoverage[];
}
export interface CoverageMetrics {
    total: number;
    covered: number;
    skipped: number;
    percentage: number;
}
export interface FileCoverage {
    path: string;
    lines: CoverageMetrics;
    statements: CoverageMetrics;
    functions: CoverageMetrics;
    branches: CoverageMetrics;
    uncoveredLines: number[];
}
export interface TestExecutionOptions {
    testPattern?: string;
    coverage?: boolean;
    watch?: boolean;
    verbose?: boolean;
    bail?: boolean;
    maxWorkers?: number;
}
export declare class TestExecutor {
    private readonly workspaceRoot;
    private currentProcess?;
    private outputChannel;
    constructor(workspaceRoot: string);
    /**
    * Run tests
    */
    runTests(options?: TestExecutionOptions): Promise<TestRunResult>;
    /**
    * Run specific test file
    */
    runTestFile(filePath: string, options?: TestExecutionOptions): Promise<TestRunResult>;
    /**
    * Run tests with coverage
    */
    runTestsWithCoverage(options?: TestExecutionOptions): Promise<TestRunResult>;
    /**
    * Stop running tests
    */
    stopTests(): void;
    /**
    * Build test command arguments
    */
    private buildTestCommand;
    /**
    * Parse test output
    */
    private parseTestOutput;
    /**
    * Parse coverage output
    */
    private parseCoverageOutput;
    /**
    * Get test status icon
    */
    getStatusIcon(status: 'passed' | 'failed' | 'skipped'): string;
    /**
    * Format test results
    */
    formatResults(result: TestRunResult): string;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=testExecutor.d.ts.map