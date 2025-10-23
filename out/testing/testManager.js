"use strict";
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
exports.TestManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const testGenerator_1 = require("./testGenerator");
const testExecutor_1 = require("./testExecutor");
class TestManager {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.testGenerator = new testGenerator_1.TestGenerator(workspaceRoot);
        this.testExecutor = new testExecutor_1.TestExecutor(workspaceRoot);
        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.text = '$(beaker) Tests';
        this.statusBarItem.command = 'codelicious.runTests';
        this.statusBarItem.show();
    }
    /**
    * Generate tests for current file
    */
    async generateTestsForCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }
        const filePath = editor.document.uri.fsPath;
        // Check if file is a test file
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
            vscode.window.showWarningMessage('Cannot generate tests for test files');
            return;
        }
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Generating tests...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Analyzing code...' });
                const testSuite = await this.testGenerator.generateTestsForFile(filePath);
                progress.report({ increment: 50, message: 'Creating test file...' });
                await this.createTestFile(testSuite);
                progress.report({ increment: 100, message: 'Done!' });
            });
            vscode.window.showInformationMessage(' Tests generated successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to generate tests: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
    * Generate tests for file
    */
    async generateTestsForFile(filePath) {
        return this.testGenerator.generateTestsForFile(filePath);
    }
    /**
    * Create test file
    */
    async createTestFile(testSuite) {
        const testDir = path.dirname(testSuite.testFilePath);
        // Create test directory if it doesn't exist
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        // Generate test file content
        const content = this.generateTestFileContent(testSuite);
        // Write test file
        fs.writeFileSync(testSuite.testFilePath, content, 'utf8');
        // Open test file
        const document = await vscode.workspace.openTextDocument(testSuite.testFilePath);
        await vscode.window.showTextDocument(document);
    }
    /**
    * Generate test file content
    */
    generateTestFileContent(testSuite) {
        let content = '/**\n';
        content += ` * Tests for ${testSuite.fileName}\n`;
        content += ' */\n\n';
        // Add imports
        for (const imp of testSuite.imports) {
            content += `${imp}\n`;
        }
        content += '\n';
        // Add mocks
        for (const mock of testSuite.mocks) {
            content += `${mock}\n`;
        }
        if (testSuite.mocks.length > 0) {
            content += '\n';
        }
        // Add describe block
        content += `describe('${testSuite.fileName}', () => {\n`;
        // Add setup
        if (testSuite.setup) {
            content += `${testSuite.setup}\n`;
        }
        // Add teardown
        if (testSuite.teardown) {
            content += `${testSuite.teardown}\n`;
        }
        // Add test cases
        for (const testCase of testSuite.testCases) {
            content += ` it('${testCase.name}', async () => {\n`;
            content += `${testCase.code}\n`;
            content += ` });\n\n`;
        }
        content += '});\n';
        return content;
    }
    /**
    * Run all tests
    */
    async runAllTests(options = {}) {
        this.updateStatusBar('running');
        try {
            const result = await this.testExecutor.runTests(options);
            this.updateStatusBar('complete', result);
            this.showTestResults(result);
            return result;
        }
        catch (error) {
            this.updateStatusBar('error');
            vscode.window.showErrorMessage(`Test execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            throw error;
        }
    }
    /**
    * Run tests for current file
    */
    async runTestsForCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            throw new Error('No active editor');
        }
        const filePath = editor.document.uri.fsPath;
        // If current file is a test file, run it
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
            return this.testExecutor.runTestFile(filePath);
        }
        // Otherwise, find and run corresponding test file
        const testFilePath = this.findTestFile(filePath);
        if (!testFilePath) {
            vscode.window.showWarningMessage('No test file found for current file');
            throw new Error('No test file found');
        }
        return this.testExecutor.runTestFile(testFilePath);
    }
    /**
    * Run tests with coverage
    */
    async runTestsWithCoverage() {
        return this.runAllTests({ coverage: true });
    }
    /**
    * Stop running tests
    */
    stopTests() {
        this.testExecutor.stopTests();
        this.updateStatusBar('idle');
    }
    /**
    * Find test file for source file
    */
    findTestFile(filePath) {
        const dir = path.dirname(filePath);
        const fileName = path.basename(filePath, path.extname(filePath));
        // Check __tests__ directory
        const testPath1 = path.join(dir, '__tests__', `${fileName}.test.ts`);
        if (fs.existsSync(testPath1)) {
            return testPath1;
        }
        // Check same directory
        const testPath2 = path.join(dir, `${fileName}.test.ts`);
        if (fs.existsSync(testPath2)) {
            return testPath2;
        }
        return null;
    }
    /**
    * Update status bar
    */
    updateStatusBar(state, result) {
        switch (state) {
            case 'idle':
                this.statusBarItem.text = '$(beaker) Tests';
                this.statusBarItem.tooltip = 'Run tests';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'running':
                this.statusBarItem.text = '$(sync~spin) Running tests...';
                this.statusBarItem.tooltip = 'Tests are running';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'complete':
                if (result) {
                    const icon = result.failedTests === 0 ? '$(pass)' : '$(error)';
                    this.statusBarItem.text = `${icon} ${result.passedTests}/${result.totalTests} tests`;
                    this.statusBarItem.tooltip = `${result.passedTests} passed, ${result.failedTests} failed`;
                    this.statusBarItem.backgroundColor = result.failedTests === 0
                        ? undefined
                        : new vscode.ThemeColor('statusBarItem.errorBackground');
                }
                break;
            case 'error':
                this.statusBarItem.text = '$(error) Tests failed';
                this.statusBarItem.tooltip = 'Test execution failed';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
        }
    }
    /**
    * Show test results
    */
    showTestResults(result) {
        const formatted = this.testExecutor.formatResults(result);
        if (result.failedTests === 0) {
            vscode.window.showInformationMessage(` All tests passed! (${result.passedTests}/${result.totalTests})`);
        }
        else {
            vscode.window.showWarningMessage(` ${result.failedTests} test(s) failed (${result.passedTests}/${result.totalTests} passed)`);
        }
    }
    /**
    * Dispose resources
    */
    dispose() {
        this.testExecutor.dispose();
        this.statusBarItem.dispose();
    }
}
exports.TestManager = TestManager;
//# sourceMappingURL=testManager.js.map