"use strict";
/**
 * Tests for Test Manager
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
const testManager_1 = require("../testManager");
const testGenerator_1 = require("../testGenerator");
const testExecutor_1 = require("../testExecutor");
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
// Mock vscode
jest.mock('vscode');
// Mock fs
jest.mock('fs');
// Mock TestGenerator
jest.mock('../testGenerator');
// Mock TestExecutor
jest.mock('../testExecutor');
describe('TestManager', () => {
    let testManager;
    let mockStatusBarItem;
    let mockTestGenerator;
    let mockTestExecutor;
    const workspaceRoot = '/test/workspace';
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock status bar item
        mockStatusBarItem = {
            text: '',
            tooltip: '',
            backgroundColor: undefined,
            command: '',
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        };
        vscode.window.createStatusBarItem.mockReturnValue(mockStatusBarItem);
        // Mock vscode.workspace
        vscode.workspace = {
            openTextDocument: jest.fn(),
            workspaceFolders: []
        };
        // Mock vscode.window methods
        vscode.window.showTextDocument = jest.fn();
        vscode.window.withProgress = jest.fn().mockImplementation(async (options, task) => {
            return task({ report: jest.fn() });
        });
        vscode.window.showInformationMessage = jest.fn();
        vscode.window.showWarningMessage = jest.fn();
        vscode.window.showErrorMessage = jest.fn();
        // Mock vscode.ThemeColor
        vscode.ThemeColor = jest.fn().mockImplementation((id) => ({ id }));
        // Mock vscode.ProgressLocation
        vscode.ProgressLocation = {
            Notification: 15,
            Window: 10,
            SourceControl: 1
        };
        // Mock TestGenerator
        mockTestGenerator = {
            generateTestsForFile: jest.fn()
        };
        testGenerator_1.TestGenerator.mockImplementation(() => mockTestGenerator);
        // Mock TestExecutor
        mockTestExecutor = {
            runTests: jest.fn(),
            runTestFile: jest.fn(),
            runTestsWithCoverage: jest.fn(),
            stopTests: jest.fn(),
            formatResults: jest.fn(),
            getStatusIcon: jest.fn(),
            dispose: jest.fn()
        };
        testExecutor_1.TestExecutor.mockImplementation(() => mockTestExecutor);
        testManager = new testManager_1.TestManager(workspaceRoot);
    });
    afterEach(() => {
        testManager.dispose();
    });
    describe('initialization', () => {
        it('should create status bar item', () => {
            expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
            expect(mockStatusBarItem.show).toHaveBeenCalled();
        });
        it('should set status bar text', () => {
            expect(mockStatusBarItem.text).toContain('Tests');
        });
        it('should set status bar command', () => {
            expect(mockStatusBarItem.command).toBe('codelicious.runTests');
        });
    });
    describe('generateTestsForCurrentFile', () => {
        it('should generate tests for active file', async () => {
            const mockEditor = {
                document: {
                    uri: {
                        fsPath: '/test/workspace/src/utils.ts'
                    }
                }
            };
            vscode.window.activeTextEditor = mockEditor;
            const mockTestSuite = {
                fileName: 'utils.ts',
                testFilePath: '/test/workspace/src/__tests__/utils.test.ts',
                imports: [],
                testCases: [],
                mocks: [],
                setup: '',
                teardown: ''
            };
            mockTestGenerator.generateTestsForFile.mockResolvedValue(mockTestSuite);
            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockReturnValue(undefined);
            fs.writeFileSync.mockReturnValue(undefined);
            const mockDocument = {};
            vscode.workspace.openTextDocument.mockResolvedValue(mockDocument);
            vscode.window.showTextDocument.mockResolvedValue(undefined);
            await testManager.generateTestsForCurrentFile();
            expect(mockTestGenerator.generateTestsForFile).toHaveBeenCalledWith('/test/workspace/src/utils.ts');
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('generated successfully'));
        });
        it('should show warning if no active editor', async () => {
            vscode.window.activeTextEditor = undefined;
            await testManager.generateTestsForCurrentFile();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No active editor');
        });
        it('should show warning for test files', async () => {
            const mockEditor = {
                document: {
                    uri: {
                        fsPath: '/test/workspace/src/utils.test.ts'
                    }
                }
            };
            vscode.window.activeTextEditor = mockEditor;
            await testManager.generateTestsForCurrentFile();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Cannot generate tests for test files');
        });
        it('should handle errors', async () => {
            const mockEditor = {
                document: {
                    uri: {
                        fsPath: '/test/workspace/src/utils.ts'
                    }
                }
            };
            vscode.window.activeTextEditor = mockEditor;
            const error = new Error('Generation failed');
            mockTestGenerator.generateTestsForFile.mockRejectedValue(error);
            await testManager.generateTestsForCurrentFile();
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Failed to generate tests'));
        });
        it('should create test directory if it does not exist', async () => {
            const mockEditor = {
                document: {
                    uri: {
                        fsPath: '/test/workspace/src/utils.ts'
                    }
                }
            };
            vscode.window.activeTextEditor = mockEditor;
            const mockTestSuite = {
                fileName: 'utils.ts',
                testFilePath: '/test/workspace/src/__tests__/utils.test.ts',
                imports: [],
                testCases: [],
                mocks: [],
                setup: '',
                teardown: ''
            };
            mockTestGenerator.generateTestsForFile.mockResolvedValue(mockTestSuite);
            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockReturnValue(undefined);
            fs.writeFileSync.mockReturnValue(undefined);
            const mockDocument = {};
            vscode.workspace.openTextDocument.mockResolvedValue(mockDocument);
            vscode.window.showTextDocument.mockResolvedValue(undefined);
            await testManager.generateTestsForCurrentFile();
            expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('__tests__'), expect.any(Object));
        });
    });
    describe('runAllTests', () => {
        it('should run all tests', async () => {
            const mockResult = {
                suites: [],
                totalSuites: 2,
                totalTests: 10,
                passedTests: 10,
                failedTests: 0,
                skippedTests: 0,
                duration: 5000
            };
            mockTestExecutor.runTests.mockResolvedValue(mockResult);
            mockTestExecutor.formatResults.mockReturnValue('Test results');
            const result = await testManager.runAllTests();
            expect(mockTestExecutor.runTests).toHaveBeenCalled();
            expect(result).toEqual(mockResult);
        });
        it('should update status bar during test run', async () => {
            const mockResult = {
                suites: [],
                totalSuites: 2,
                totalTests: 10,
                passedTests: 10,
                failedTests: 0,
                skippedTests: 0,
                duration: 5000
            };
            mockTestExecutor.runTests.mockResolvedValue(mockResult);
            mockTestExecutor.formatResults.mockReturnValue('Test results');
            await testManager.runAllTests();
            expect(mockStatusBarItem.text).toContain('10/10');
        });
        it('should show success message for passing tests', async () => {
            const mockResult = {
                suites: [],
                totalSuites: 2,
                totalTests: 10,
                passedTests: 10,
                failedTests: 0,
                skippedTests: 0,
                duration: 5000
            };
            mockTestExecutor.runTests.mockResolvedValue(mockResult);
            mockTestExecutor.formatResults.mockReturnValue('Test results');
            await testManager.runAllTests();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('All tests passed'));
        });
        it('should show warning message for failing tests', async () => {
            const mockResult = {
                suites: [],
                totalSuites: 2,
                totalTests: 10,
                passedTests: 8,
                failedTests: 2,
                skippedTests: 0,
                duration: 5000
            };
            mockTestExecutor.runTests.mockResolvedValue(mockResult);
            mockTestExecutor.formatResults.mockReturnValue('Test results');
            await testManager.runAllTests();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('failed'));
        });
        it('should handle test execution errors', async () => {
            const error = new Error('Execution failed');
            mockTestExecutor.runTests.mockRejectedValue(error);
            await expect(testManager.runAllTests()).rejects.toThrow('Execution failed');
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });
    describe('runTestsForCurrentFile', () => {
        it('should run tests for current test file', async () => {
            const mockEditor = {
                document: {
                    uri: {
                        fsPath: '/test/workspace/src/utils.test.ts'
                    }
                }
            };
            vscode.window.activeTextEditor = mockEditor;
            const mockResult = {
                suites: [],
                totalSuites: 1,
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 2000
            };
            mockTestExecutor.runTestFile.mockResolvedValue(mockResult);
            await testManager.runTestsForCurrentFile();
            expect(mockTestExecutor.runTestFile).toHaveBeenCalledWith('/test/workspace/src/utils.test.ts');
        });
        it('should find and run corresponding test file', async () => {
            const mockEditor = {
                document: {
                    uri: {
                        fsPath: '/test/workspace/src/utils.ts'
                    }
                }
            };
            vscode.window.activeTextEditor = mockEditor;
            fs.existsSync.mockReturnValue(true);
            const mockResult = {
                suites: [],
                totalSuites: 1,
                totalTests: 5,
                passedTests: 5,
                failedTests: 0,
                skippedTests: 0,
                duration: 2000
            };
            mockTestExecutor.runTestFile.mockResolvedValue(mockResult);
            await testManager.runTestsForCurrentFile();
            expect(mockTestExecutor.runTestFile).toHaveBeenCalled();
        });
        it('should show warning if no test file found', async () => {
            const mockEditor = {
                document: {
                    uri: {
                        fsPath: '/test/workspace/src/utils.ts'
                    }
                }
            };
            vscode.window.activeTextEditor = mockEditor;
            fs.existsSync.mockReturnValue(false);
            await expect(testManager.runTestsForCurrentFile()).rejects.toThrow();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No test file found for current file');
        });
    });
    describe('runTestsWithCoverage', () => {
        it('should run tests with coverage', async () => {
            const mockResult = {
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
            mockTestExecutor.runTests.mockResolvedValue(mockResult);
            mockTestExecutor.formatResults.mockReturnValue('Test results with coverage');
            const result = await testManager.runTestsWithCoverage();
            expect(mockTestExecutor.runTests).toHaveBeenCalledWith({ coverage: true });
            expect(result.coverage).toBeDefined();
        });
    });
    describe('stopTests', () => {
        it('should stop running tests', () => {
            testManager.stopTests();
            expect(mockTestExecutor.stopTests).toHaveBeenCalled();
        });
        it('should update status bar', () => {
            testManager.stopTests();
            expect(mockStatusBarItem.text).toContain('Tests');
        });
    });
    describe('dispose', () => {
        it('should dispose resources', () => {
            testManager.dispose();
            expect(mockTestExecutor.dispose).toHaveBeenCalled();
            expect(mockStatusBarItem.dispose).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=testManager.test.js.map