"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestExecutor = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
class TestExecutor {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = vscode.window.createOutputChannel('Codelicious Tests');
    }
    /**
    * Run tests
    */
    async runTests(options = {}) {
        this.outputChannel.clear();
        this.outputChannel.show();
        const args = this.buildTestCommand(options);
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let output = '';
            this.currentProcess = (0, child_process_1.spawn)('npm', ['run', 'test:unit', '--', ...args], {
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
                }
                else {
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
    async runTestFile(filePath, options = {}) {
        return this.runTests({
            ...options,
            testPattern: filePath
        });
    }
    /**
    * Run tests with coverage
    */
    async runTestsWithCoverage(options = {}) {
        return this.runTests({
            ...options,
            coverage: true
        });
    }
    /**
    * Stop running tests
    */
    stopTests() {
        if (this.currentProcess) {
            this.currentProcess.kill();
            this.currentProcess = undefined;
            this.outputChannel.appendLine('\n Tests stopped by user');
        }
    }
    /**
    * Build test command arguments
    */
    buildTestCommand(options) {
        const args = [];
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
    parseTestOutput(output, duration) {
        const suites = [];
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
        let coverage;
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
    parseCoverageOutput(output) {
        const lines = { total: 0, covered: 0, skipped: 0, percentage: 0 };
        const statements = { total: 0, covered: 0, skipped: 0, percentage: 0 };
        const functions = { total: 0, covered: 0, skipped: 0, percentage: 0 };
        const branches = { total: 0, covered: 0, skipped: 0, percentage: 0 };
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
    getStatusIcon(status) {
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
    formatResults(result) {
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
    dispose() {
        this.stopTests();
        this.outputChannel.dispose();
    }
}
exports.TestExecutor = TestExecutor;
//# sourceMappingURL=testExecutor.js.map