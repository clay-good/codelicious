"use strict";
/**
 * Tests for AgentOrchestrator - File Writing and Test Execution
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
const agentOrchestrator_1 = require("../agentOrchestrator");
const vscode = __importStar(require("vscode"));
// Mock dependencies
jest.mock('../../models/orchestrator');
jest.mock('../../core/executionEngine');
jest.mock('vscode');
jest.mock('fs');
describe('AgentOrchestrator - File Operations', () => {
    let orchestrator;
    let mockModelOrchestrator;
    let mockExecutionEngine;
    let mockWorkspaceRoot;
    beforeEach(() => {
        jest.clearAllMocks();
        // Setup mocks
        mockModelOrchestrator = {
            sendRequest: jest.fn(),
            sendStreamingRequest: jest.fn(),
            getCostStats: jest.fn()
        };
        mockExecutionEngine = {
            execute: jest.fn()
        };
        mockWorkspaceRoot = '/test/workspace';
        // Mock vscode
        vscode.window.createOutputChannel = jest.fn().mockReturnValue({
            show: jest.fn(),
            appendLine: jest.fn(),
            dispose: jest.fn()
        });
        vscode.window.showInformationMessage = jest.fn();
        vscode.window.showWarningMessage = jest.fn();
        orchestrator = new agentOrchestrator_1.AgentOrchestrator(mockModelOrchestrator, mockExecutionEngine, mockWorkspaceRoot);
    });
    describe('getTestCommand', () => {
        it('should return npm test for TypeScript test files', () => {
            const command = orchestrator.getTestCommand('src/utils.test.ts', 'typescript');
            expect(command).toBe('npm test -- src/utils.test.ts');
        });
        it('should return npm test for JavaScript spec files', () => {
            const command = orchestrator.getTestCommand('src/utils.spec.js', 'javascript');
            expect(command).toBe('npm test -- src/utils.spec.js');
        });
        it('should return npm test for non-test TypeScript files', () => {
            const command = orchestrator.getTestCommand('src/utils.ts', 'typescript');
            expect(command).toBe('npm test');
        });
        it('should return pytest for Python test files', () => {
            const command = orchestrator.getTestCommand('test_utils.py', 'python');
            expect(command).toBe('python -m pytest test_utils.py -v');
        });
        it('should return pytest for Python files starting with test_', () => {
            const command = orchestrator.getTestCommand('test_calculator.py', 'python');
            expect(command).toBe('python -m pytest test_calculator.py -v');
        });
        it('should return pytest for directory for non-test Python files', () => {
            const command = orchestrator.getTestCommand('src/utils.py', 'python');
            expect(command).toBe('python -m pytest src -v');
        });
        it('should return cargo test for Rust', () => {
            const command = orchestrator.getTestCommand('src/lib.rs', 'rust');
            expect(command).toBe('cargo test');
        });
        it('should return go test for Go files', () => {
            const command = orchestrator.getTestCommand('pkg/utils/helper.go', 'go');
            expect(command).toBe('go test pkg/utils/...');
        });
        it('should return mvn test for Java', () => {
            const command = orchestrator.getTestCommand('src/Utils.java', 'java');
            expect(command).toBe('mvn test');
        });
        it('should return bash command for shell scripts', () => {
            const command = orchestrator.getTestCommand('scripts/deploy.sh', 'shell');
            expect(command).toBe('bash scripts/deploy.sh');
        });
        it('should return bash command for bash scripts', () => {
            const command = orchestrator.getTestCommand('scripts/build.sh', 'bash');
            expect(command).toBe('bash scripts/build.sh');
        });
        it('should return null for unsupported languages', () => {
            const command = orchestrator.getTestCommand('src/code.cpp', 'cpp');
            expect(command).toBeNull();
        });
    });
    describe('makeExecutable', () => {
        it('should execute chmod +x command', async () => {
            mockExecutionEngine.execute.mockResolvedValue({
                success: true,
                stdout: '',
                stderr: '',
                exitCode: 0,
                duration: 100,
                command: 'chmod +x "/test/script.sh"'
            });
            await orchestrator.makeExecutable('/test/script.sh');
            expect(mockExecutionEngine.execute).toHaveBeenCalledWith('chmod +x "/test/script.sh"', {
                requireConfirmation: false,
                sandbox: false
            });
        });
        it('should show success message when chmod succeeds', async () => {
            mockExecutionEngine.execute.mockResolvedValue({
                success: true,
                stdout: '',
                stderr: '',
                exitCode: 0,
                duration: 100,
                command: 'chmod +x "/test/workspace/script.sh"'
            });
            await orchestrator.makeExecutable('/test/workspace/script.sh');
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(' Made executable: script.sh');
        });
        it('should handle errors gracefully', async () => {
            mockExecutionEngine.execute.mockRejectedValue(new Error('Permission denied'));
            // Should not throw
            await expect(orchestrator.makeExecutable('/test/script.sh')).resolves.not.toThrow();
        });
    });
    describe('executeTestsInTerminal', () => {
        it('should execute tests and return success result', async () => {
            const mockOutput = 'All tests passed!\n3 tests, 3 passed';
            mockExecutionEngine.execute.mockResolvedValue({
                success: true,
                stdout: mockOutput,
                stderr: '',
                exitCode: 0,
                duration: 2500,
                command: 'npm test -- src/utils.test.ts'
            });
            const result = await orchestrator.executeTestsInTerminal('src/utils.test.ts', 'typescript', []);
            expect(result.success).toBe(true);
            expect(result.exitCode).toBe(0);
            expect(result.output).toContain(mockOutput);
        });
        it('should execute tests and return failure result', async () => {
            const mockOutput = 'Test failed: expected 5 but got 4';
            mockExecutionEngine.execute.mockResolvedValue({
                success: false,
                stdout: mockOutput,
                stderr: 'Error in test suite',
                exitCode: 1,
                duration: 1500,
                command: 'npm test -- src/utils.test.ts'
            });
            const result = await orchestrator.executeTestsInTerminal('src/utils.test.ts', 'typescript', []);
            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(1);
            expect(result.output).toContain(mockOutput);
            expect(result.output).toContain('Error in test suite');
        });
        it('should create and show output channel', async () => {
            const mockOutputChannel = {
                show: jest.fn(),
                appendLine: jest.fn(),
                dispose: jest.fn()
            };
            vscode.window.createOutputChannel.mockReturnValue(mockOutputChannel);
            mockExecutionEngine.execute.mockResolvedValue({
                success: true,
                stdout: 'Tests passed',
                stderr: '',
                exitCode: 0,
                duration: 1000,
                command: 'python -m pytest test_utils.py -v'
            });
            await orchestrator.executeTestsInTerminal('test_utils.py', 'python', []);
            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Codelicious Test Execution');
            expect(mockOutputChannel.show).toHaveBeenCalled();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Running tests for test_utils.py'));
        });
        it('should show success notification when tests pass', async () => {
            mockExecutionEngine.execute.mockResolvedValue({
                success: true,
                stdout: 'All tests passed',
                stderr: '',
                exitCode: 0,
                duration: 1000,
                command: 'npm test -- src/utils.test.ts'
            });
            await orchestrator.executeTestsInTerminal('src/utils.test.ts', 'typescript', []);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(' Tests passed!');
        });
        it('should show warning notification when tests fail', async () => {
            mockExecutionEngine.execute.mockResolvedValue({
                success: false,
                stdout: 'Test failed',
                stderr: '',
                exitCode: 1,
                duration: 1000,
                command: 'npm test -- src/utils.test.ts'
            });
            await orchestrator.executeTestsInTerminal('src/utils.test.ts', 'typescript', []);
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(' Tests failed! Check output for details.');
        });
        it('should return error result when no test command available', async () => {
            const result = await orchestrator.executeTestsInTerminal('src/code.cpp', 'cpp', []);
            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(-1);
            expect(result.output).toBe('No test command available for this language');
        });
        it('should handle execution errors', async () => {
            // Mock execution to return error result instead of throwing
            // This avoids triggering error recovery retry logic
            mockExecutionEngine.execute.mockResolvedValue({
                command: 'npm test',
                success: false,
                stdout: '',
                stderr: 'Command not found',
                exitCode: 127,
                duration: 100
            });
            const result = await orchestrator.executeTestsInTerminal('src/utils.test.ts', 'typescript', []);
            expect(result.success).toBe(false);
            expect(result.exitCode).toBe(127);
        }, 15000); // Increase timeout to 15 seconds for error recovery retries
    });
});
//# sourceMappingURL=agentOrchestrator.test.js.map