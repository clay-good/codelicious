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

import * as vscode from 'vscode';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

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

export class TestExecutor {
 private currentProcess?: ChildProcess;
 private outputChannel: vscode.OutputChannel;

 constructor(
 private readonly workspaceRoot: string
 ) {
 this.outputChannel = vscode.window.createOutputChannel('Codelicious Tests');
 }

 /**
 * Run tests
 */
 async runTests(options: TestExecutionOptions = {}): Promise<TestRunResult> {
 this.outputChannel.clear();
 this.outputChannel.show();

 const args = this.buildTestCommand(options);

 return new Promise((resolve, reject) => {
 const startTime = Date.now();
 let output = '';

 this.currentProcess = spawn('npm', ['run', 'test:unit', '--', ...args], {
 cwd: this.workspaceRoot,
 shell: true
 });

 this.currentProcess.stdout?.on('data', (data) => {
 const text = data.toString();
 output += text;
 this.outputChannel.append(text);
 });

 this.currentProcess.stderr?.on('data', (data) => {
 const text = data.toString();
 output += text;
 this.outputChannel.append(text);
 });

 this.currentProcess.on('close', (code) => {
 const duration = Date.now() - startTime;

 if (code === 0 || code === 1) {
 // Parse test results
 const result = this.parseTestOutput(output, duration);
 resolve(result);
 } else {
 reject(new Error(`Test execution failed with code ${code}`));
 }
 });

 this.currentProcess.on('error', (error) => {
 reject(error);
 });
 });
 }

 /**
 * Run specific test file
 */
 async runTestFile(filePath: string, options: TestExecutionOptions = {}): Promise<TestRunResult> {
 return this.runTests({
 ...options,
 testPattern: filePath
 });
 }

 /**
 * Run tests with coverage
 */
 async runTestsWithCoverage(options: TestExecutionOptions = {}): Promise<TestRunResult> {
 return this.runTests({
 ...options,
 coverage: true
 });
 }

 /**
 * Stop running tests
 */
 stopTests(): void {
 if (this.currentProcess) {
 this.currentProcess.kill();
 this.currentProcess = undefined;
 this.outputChannel.appendLine('\n Tests stopped by user');
 }
 }

 /**
 * Build test command arguments
 */
 private buildTestCommand(options: TestExecutionOptions): string[] {
 const args: string[] = [];

 if (options.testPattern) {
 args.push('--testPathPattern', options.testPattern);
 }

 if (options.coverage) {
 args.push('--coverage');
 }

 if (options.watch) {
 args.push('--watch');
 }

 if (options.verbose) {
 args.push('--verbose');
 }

 if (options.bail) {
 args.push('--bail');
 }

 if (options.maxWorkers) {
 args.push('--maxWorkers', options.maxWorkers.toString());
 }

 return args;
 }

 /**
 * Parse test output
 */
 private parseTestOutput(output: string, duration: number): TestRunResult {
 const suites: TestSuiteResult[] = [];
 let totalTests = 0;
 let passedTests = 0;
 let failedTests = 0;
 const skippedTests = 0;

 // Parse test summary
 const summaryMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
 if (summaryMatch) {
 passedTests = parseInt(summaryMatch[1]);
 totalTests = parseInt(summaryMatch[2]);
 failedTests = totalTests - passedTests;
 }

 // Parse test suites
 const suiteRegex = /PASS\s+(.+\.test\.ts)/g;
 let match;
 while ((match = suiteRegex.exec(output)) !== null) {
 const suiteName = match[1];
 suites.push({
 name: suiteName,
 tests: [],
 totalTests: 0,
 passedTests: 0,
 failedTests: 0,
 skippedTests: 0,
 duration: 0
 });
 }

 // Parse coverage if available
 let coverage: CoverageReport | undefined;
 if (output.includes('Coverage')) {
 coverage = this.parseCoverageOutput(output);
 }

 return {
 suites,
 totalSuites: suites.length,
 totalTests,
 passedTests,
 failedTests,
 skippedTests,
 duration,
 coverage
 };
 }

 /**
 * Parse coverage output
 */
 private parseCoverageOutput(output: string): CoverageReport {
 const lines: CoverageMetrics = { total: 0, covered: 0, skipped: 0, percentage: 0 };
 const statements: CoverageMetrics = { total: 0, covered: 0, skipped: 0, percentage: 0 };
 const functions: CoverageMetrics = { total: 0, covered: 0, skipped: 0, percentage: 0 };
 const branches: CoverageMetrics = { total: 0, covered: 0, skipped: 0, percentage: 0 };

 // Parse coverage percentages
 const coverageRegex = /All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/;
 const match = output.match(coverageRegex);

 if (match) {
 statements.percentage = parseFloat(match[1]);
 branches.percentage = parseFloat(match[2]);
 functions.percentage = parseFloat(match[3]);
 lines.percentage = parseFloat(match[4]);
 }

 return {
 lines,
 statements,
 functions,
 branches,
 files: []
 };
 }

 /**
 * Get test status icon
 */
 getStatusIcon(status: 'passed' | 'failed' | 'skipped'): string {
 switch (status) {
 case 'passed':
 return '';
 case 'failed':
 return '';
 case 'skipped':
 return '⏭';
 }
 }

 /**
 * Format test results
 */
 formatResults(result: TestRunResult): string {
 let output = '\n';
 output += '\n';
 output += ' Test Results\n';
 output += '\n\n';

 output += `Total Tests: ${result.totalTests}\n`;
 output += ` Passed: ${result.passedTests}\n`;
 output += ` Failed: ${result.failedTests}\n`;
 output += `⏭ Skipped: ${result.skippedTests}\n`;
 output += `⏱ Duration: ${(result.duration / 1000).toFixed(2)}s\n\n`;

 if (result.coverage) {
 output += '\n';
 output += ' Coverage Report\n';
 output += '\n\n';
 output += `Lines: ${result.coverage.lines.percentage.toFixed(2)}%\n`;
 output += `Statements: ${result.coverage.statements.percentage.toFixed(2)}%\n`;
 output += `Functions: ${result.coverage.functions.percentage.toFixed(2)}%\n`;
 output += `Branches: ${result.coverage.branches.percentage.toFixed(2)}%\n\n`;
 }

 output += '\n';

 return output;
 }

 /**
 * Dispose resources
 */
 dispose(): void {
 this.stopTests();
 this.outputChannel.dispose();
 }
}

