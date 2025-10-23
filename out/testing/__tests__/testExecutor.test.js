"use strict";
/**
 * Tests for Test Executor
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
const testExecutor_1 = require("../testExecutor");
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const events_1 = require("events");
// Mock vscode
jest.mock('vscode');
// Mock child_process
jest.mock('child_process');
describe('TestExecutor', () => {
    let testExecutor;
    let mockOutputChannel;
    let mockProcess;
    const workspaceRoot = '/test/workspace';
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock output channel
        mockOutputChannel = {
            clear: jest.fn(),
            show: jest.fn(),
            append: jest.fn(),
            appendLine: jest.fn(),
            dispose: jest.fn()
        };
        vscode.window.createOutputChannel.mockReturnValue(mockOutputChannel);
        // Mock process
        mockProcess = new events_1.EventEmitter();
        mockProcess.stdout = new events_1.EventEmitter();
        mockProcess.stderr = new events_1.EventEmitter();
        mockProcess.kill = jest.fn();
        child_process_1.spawn.mockReturnValue(mockProcess);
        testExecutor = new testExecutor_1.TestExecutor(workspaceRoot);
    });
    afterEach(() => {
        testExecutor.dispose();
    });
    describe('runTests', () => {
        it('should run tests successfully', async () => {
            const resultPromise = testExecutor.runTests();
            // Simulate test output
            mockProcess.stdout.emit('data', 'PASS src/utils.test.ts\n');
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            const result = await resultPromise;
            expect(result).toBeDefined();
            expect(result.totalTests).toBe(5);
            expect(result.passedTests).toBe(5);
            expect(result.failedTests).toBe(0);
        });
        it('should handle test failures', async () => {
            const resultPromise = testExecutor.runTests();
            // Simulate test output with failures
            mockProcess.stdout.emit('data', 'FAIL src/utils.test.ts\n');
            mockProcess.stdout.emit('data', 'Tests: 3 passed, 5 total\n');
            mockProcess.emit('close', 1);
            const result = await resultPromise;
            expect(result).toBeDefined();
            expect(result.totalTests).toBe(5);
            expect(result.passedTests).toBe(3);
            expect(result.failedTests).toBe(2);
        });
        it('should clear and show output channel', async () => {
            const resultPromise = testExecutor.runTests();
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(mockOutputChannel.clear).toHaveBeenCalled();
            expect(mockOutputChannel.show).toHaveBeenCalled();
        });
        it('should append output to channel', async () => {
            const resultPromise = testExecutor.runTests();
            const output = 'Test output\n';
            mockProcess.stdout.emit('data', output);
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(mockOutputChannel.append).toHaveBeenCalledWith(output);
        });
        it('should handle stderr output', async () => {
            const resultPromise = testExecutor.runTests();
            const errorOutput = 'Warning: deprecated API\n';
            mockProcess.stderr.emit('data', errorOutput);
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(mockOutputChannel.append).toHaveBeenCalledWith(errorOutput);
        });
        it('should reject on process error', async () => {
            const resultPromise = testExecutor.runTests();
            const error = new Error('Process failed');
            mockProcess.emit('error', error);
            await expect(resultPromise).rejects.toThrow('Process failed');
        });
        it('should reject on non-zero/non-one exit code', async () => {
            const resultPromise = testExecutor.runTests();
            mockProcess.emit('close', 2);
            await expect(resultPromise).rejects.toThrow('Test execution failed with code 2');
        });
    });
    describe('runTestFile', () => {
        it('should run specific test file', async () => {
            const filePath = 'src/utils.test.ts';
            const resultPromise = testExecutor.runTestFile(filePath);
            mockProcess.stdout.emit('data', 'Tests: 3 passed, 3 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(child_process_1.spawn).toHaveBeenCalledWith('npm', expect.arrayContaining(['--testPathPattern', filePath]), expect.any(Object));
        });
    });
    describe('runTestsWithCoverage', () => {
        it('should run tests with coverage', async () => {
            const resultPromise = testExecutor.runTestsWithCoverage();
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.stdout.emit('data', 'Coverage\n');
            mockProcess.stdout.emit('data', 'All files | 80.5 | 75.2 | 85.3 | 82.1\n');
            mockProcess.emit('close', 0);
            const result = await resultPromise;
            expect(child_process_1.spawn).toHaveBeenCalledWith('npm', expect.arrayContaining(['--coverage']), expect.any(Object));
            expect(result.coverage).toBeDefined();
        });
        it('should parse coverage report', async () => {
            const resultPromise = testExecutor.runTestsWithCoverage();
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.stdout.emit('data', 'Coverage\n');
            mockProcess.stdout.emit('data', 'All files | 80.5 | 75.2 | 85.3 | 82.1\n');
            mockProcess.emit('close', 0);
            const result = await resultPromise;
            expect(result.coverage).toBeDefined();
            expect(result.coverage?.statements.percentage).toBe(80.5);
            expect(result.coverage?.branches.percentage).toBe(75.2);
            expect(result.coverage?.functions.percentage).toBe(85.3);
            expect(result.coverage?.lines.percentage).toBe(82.1);
        });
    });
    describe('stopTests', () => {
        it('should kill running process', () => {
            testExecutor.runTests();
            testExecutor.stopTests();
            expect(mockProcess.kill).toHaveBeenCalled();
        });
        it('should append stop message to output', () => {
            testExecutor.runTests();
            testExecutor.stopTests();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('stopped by user'));
        });
        it('should do nothing if no process is running', () => {
            testExecutor.stopTests();
            expect(mockProcess.kill).not.toHaveBeenCalled();
        });
    });
    describe('test command building', () => {
        it('should build command with test pattern', async () => {
            const resultPromise = testExecutor.runTests({ testPattern: 'utils' });
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(child_process_1.spawn).toHaveBeenCalledWith('npm', expect.arrayContaining(['--testPathPattern', 'utils']), expect.any(Object));
        });
        it('should build command with watch mode', async () => {
            const resultPromise = testExecutor.runTests({ watch: true });
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(child_process_1.spawn).toHaveBeenCalledWith('npm', expect.arrayContaining(['--watch']), expect.any(Object));
        });
        it('should build command with verbose mode', async () => {
            const resultPromise = testExecutor.runTests({ verbose: true });
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(child_process_1.spawn).toHaveBeenCalledWith('npm', expect.arrayContaining(['--verbose']), expect.any(Object));
        });
        it('should build command with bail option', async () => {
            const resultPromise = testExecutor.runTests({ bail: true });
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(child_process_1.spawn).toHaveBeenCalledWith('npm', expect.arrayContaining(['--bail']), expect.any(Object));
        });
        it('should build command with max workers', async () => {
            const resultPromise = testExecutor.runTests({ maxWorkers: 4 });
            mockProcess.stdout.emit('data', 'Tests: 5 passed, 5 total\n');
            mockProcess.emit('close', 0);
            await resultPromise;
            expect(child_process_1.spawn).toHaveBeenCalledWith('npm', expect.arrayContaining(['--maxWorkers', '4']), expect.any(Object));
        });
    });
    describe('formatResults', () => {
        it('should format test results', () => {
            const result = {
                suites: [],
                totalSuites: 2,
                totalTests: 10,
                passedTests: 8,
                failedTests: 2,
                skippedTests: 0,
                duration: 5000
            };
            const formatted = testExecutor.formatResults(result);
            expect(formatted).toContain('Total Tests: 10');
            expect(formatted).toContain('Passed: 8');
            expect(formatted).toContain('Failed: 2');
            expect(formatted).toContain('Duration: 5.00s');
        });
        it('should include coverage in formatted results', () => {
            const result = {
                suites: [],
                totalSuites: 2,
                totalTests: 10,
                passedTests: 10,
                failedTests: 0,
                skippedTests: 0,
                duration: 5000,
                coverage: {
                    lines: { total: 100, covered: 80, skipped: 0, percentage: 80 },
                    statements: { total: 100, covered: 85, skipped: 0, percentage: 85 },
                    functions: { total: 20, covered: 18, skipped: 0, percentage: 90 },
                    branches: { total: 50, covered: 40, skipped: 0, percentage: 80 },
                    files: []
                }
            };
            const formatted = testExecutor.formatResults(result);
            expect(formatted).toContain('Coverage Report');
            expect(formatted).toContain('Lines: 80.00%');
            expect(formatted).toContain('Statements: 85.00%');
            expect(formatted).toContain('Functions: 90.00%');
            expect(formatted).toContain('Branches: 80.00%');
        });
    });
    describe('getStatusIcon', () => {
        it('should return correct icon for passed', () => {
            expect(testExecutor.getStatusIcon('passed')).toBe('');
        });
        it('should return correct icon for failed', () => {
            expect(testExecutor.getStatusIcon('failed')).toBe('');
        });
        it('should return correct icon for skipped', () => {
            expect(testExecutor.getStatusIcon('skipped')).toBe('⏭');
        });
    });
});
//# sourceMappingURL=testExecutor.test.js.map