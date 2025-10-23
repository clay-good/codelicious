"use strict";
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
const intelligenceManager_1 = require("../intelligenceManager");
const codeAnalyzer_1 = require("../codeAnalyzer");
const refactoringEngine_1 = require("../refactoringEngine");
const dependencyAnalyzer_1 = require("../dependencyAnalyzer");
const vscode = __importStar(require("vscode"));
jest.mock('../codeAnalyzer');
jest.mock('../refactoringEngine');
jest.mock('../dependencyAnalyzer');
jest.mock('vscode');
describe('IntelligenceManager', () => {
    let manager;
    const mockWorkspaceRoot = '/test/workspace';
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock vscode.languages.createDiagnosticCollection
        vscode.languages = {
            createDiagnosticCollection: jest.fn().mockReturnValue({
                set: jest.fn(),
                dispose: jest.fn()
            })
        };
        manager = new intelligenceManager_1.IntelligenceManager(mockWorkspaceRoot);
        // Mock vscode.window
        vscode.window = {
            activeTextEditor: {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    getText: jest.fn().mockReturnValue('test content')
                }
            },
            withProgress: jest.fn().mockImplementation(async (options, task) => {
                return task({ report: jest.fn() });
            }),
            showInformationMessage: jest.fn().mockResolvedValue(undefined),
            showWarningMessage: jest.fn().mockResolvedValue(undefined),
            showErrorMessage: jest.fn().mockResolvedValue(undefined),
            showInputBox: jest.fn().mockResolvedValue('testName'),
            showTextDocument: jest.fn().mockResolvedValue({})
        };
        // Mock vscode.workspace
        vscode.workspace = {
            findFiles: jest.fn().mockResolvedValue([]),
            openTextDocument: jest.fn().mockResolvedValue({})
        };
        // Mock ProgressLocation
        vscode.ProgressLocation = {
            Notification: 15
        };
    });
    describe('analyzeCurrentFile', () => {
        it('should analyze current file', async () => {
            const mockResult = {
                file: '/test/file.ts',
                metrics: {
                    lines: 10,
                    linesOfCode: 8,
                    comments: 2,
                    complexity: 5,
                    cognitiveComplexity: 3,
                    maintainabilityIndex: 80,
                    functions: 2,
                    classes: 1,
                    dependencies: 3
                },
                issues: [],
                suggestions: [],
                score: 85
            };
            codeAnalyzer_1.CodeAnalyzer.prototype.analyzeFile.mockResolvedValue(mockResult);
            await manager.analyzeCurrentFile();
            expect(codeAnalyzer_1.CodeAnalyzer.prototype.analyzeFile).toHaveBeenCalled();
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });
        it('should show warning for no active editor', async () => {
            vscode.window.activeTextEditor = undefined;
            await manager.analyzeCurrentFile();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No active editor');
        });
        it('should handle analysis errors', async () => {
            codeAnalyzer_1.CodeAnalyzer.prototype.analyzeFile.mockRejectedValue(new Error('Analysis failed'));
            await manager.analyzeCurrentFile();
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });
    describe('analyzeWorkspace', () => {
        it('should analyze entire workspace', async () => {
            const mockFiles = [
                { fsPath: '/test/file1.ts' },
                { fsPath: '/test/file2.ts' }
            ];
            vscode.workspace.findFiles.mockResolvedValue(mockFiles);
            const mockResult = {
                file: '/test/file.ts',
                metrics: {
                    lines: 10,
                    linesOfCode: 8,
                    comments: 2,
                    complexity: 5,
                    cognitiveComplexity: 3,
                    maintainabilityIndex: 80,
                    functions: 2,
                    classes: 1,
                    dependencies: 3
                },
                issues: [],
                suggestions: [],
                score: 85
            };
            codeAnalyzer_1.CodeAnalyzer.prototype.analyzeFile.mockResolvedValue(mockResult);
            await manager.analyzeWorkspace();
            expect(codeAnalyzer_1.CodeAnalyzer.prototype.analyzeFile).toHaveBeenCalledTimes(2);
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });
        it('should handle workspace analysis errors', async () => {
            vscode.workspace.findFiles.mockRejectedValue(new Error('Find files failed'));
            await manager.analyzeWorkspace();
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });
    describe('analyzeDependencies', () => {
        it('should analyze dependencies', async () => {
            const mockGraph = {
                nodes: [],
                edges: [],
                circular: [],
                unused: [],
                metrics: {
                    totalDependencies: 10,
                    internalDependencies: 5,
                    externalDependencies: 5,
                    averageDependenciesPerFile: 2,
                    maxDependencies: 5,
                    circularDependencies: 0,
                    unusedDependencies: 0,
                    couplingScore: 30
                }
            };
            dependencyAnalyzer_1.DependencyAnalyzer.prototype.analyzeWorkspace.mockResolvedValue(mockGraph);
            dependencyAnalyzer_1.DependencyAnalyzer.prototype.suggestImprovements.mockReturnValue([]);
            await manager.analyzeDependencies();
            expect(dependencyAnalyzer_1.DependencyAnalyzer.prototype.analyzeWorkspace).toHaveBeenCalled();
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });
        it('should handle dependency analysis errors', async () => {
            dependencyAnalyzer_1.DependencyAnalyzer.prototype.analyzeWorkspace.mockRejectedValue(new Error('Analysis failed'));
            await manager.analyzeDependencies();
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });
    describe('extractMethod', () => {
        it('should extract method', async () => {
            vscode.window.activeTextEditor = {
                document: { uri: { fsPath: '/test/file.ts' } },
                selection: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0))
            };
            const mockResult = {
                success: true,
                operations: [
                    {
                        type: 'extract-method',
                        description: 'Extract method',
                        range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)),
                        newCode: 'myMethod();',
                        preview: 'private myMethod() { ... }'
                    }
                ],
                message: 'Extracted method successfully'
            };
            refactoringEngine_1.RefactoringEngine.prototype.extractMethod.mockResolvedValue(mockResult);
            vscode.window.showInformationMessage.mockResolvedValue('Apply');
            refactoringEngine_1.RefactoringEngine.prototype.applyRefactoring.mockResolvedValue(true);
            await manager.extractMethod();
            expect(refactoringEngine_1.RefactoringEngine.prototype.extractMethod).toHaveBeenCalled();
            expect(refactoringEngine_1.RefactoringEngine.prototype.applyRefactoring).toHaveBeenCalled();
        });
        it('should show warning for no active editor', async () => {
            vscode.window.activeTextEditor = undefined;
            await manager.extractMethod();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No active editor');
        });
        it('should show warning for empty selection', async () => {
            vscode.window.activeTextEditor = {
                document: { uri: { fsPath: '/test/file.ts' } },
                selection: {
                    isEmpty: true
                }
            };
            await manager.extractMethod();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Please select code to extract');
        });
        it('should handle cancelled input', async () => {
            vscode.window.activeTextEditor = {
                document: { uri: { fsPath: '/test/file.ts' } },
                selection: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0))
            };
            vscode.window.showInputBox.mockResolvedValue(undefined);
            await manager.extractMethod();
            expect(refactoringEngine_1.RefactoringEngine.prototype.extractMethod).not.toHaveBeenCalled();
        });
    });
    describe('extractVariable', () => {
        it('should extract variable', async () => {
            vscode.window.activeTextEditor = {
                document: { uri: { fsPath: '/test/file.ts' } },
                selection: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5))
            };
            const mockResult = {
                success: true,
                operations: [
                    {
                        type: 'extract-variable',
                        description: 'Extract variable',
                        range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)),
                        newCode: 'myVar',
                        preview: 'const myVar = ...'
                    }
                ],
                message: 'Extracted variable successfully'
            };
            refactoringEngine_1.RefactoringEngine.prototype.extractVariable.mockResolvedValue(mockResult);
            vscode.window.showInformationMessage.mockResolvedValue('Apply');
            refactoringEngine_1.RefactoringEngine.prototype.applyRefactoring.mockResolvedValue(true);
            await manager.extractVariable();
            expect(refactoringEngine_1.RefactoringEngine.prototype.extractVariable).toHaveBeenCalled();
            expect(refactoringEngine_1.RefactoringEngine.prototype.applyRefactoring).toHaveBeenCalled();
        });
        it('should show warning for empty selection', async () => {
            vscode.window.activeTextEditor = {
                document: { uri: { fsPath: '/test/file.ts' } },
                selection: {
                    isEmpty: true
                }
            };
            await manager.extractVariable();
            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Please select an expression to extract');
        });
    });
    describe('showCodeQualityReport', () => {
        it('should show code quality report', async () => {
            // Add some analysis results to cache
            const mockResult = {
                file: '/test/file.ts',
                metrics: {
                    lines: 10,
                    linesOfCode: 8,
                    comments: 2,
                    complexity: 5,
                    cognitiveComplexity: 3,
                    maintainabilityIndex: 80,
                    functions: 2,
                    classes: 1,
                    dependencies: 3
                },
                issues: [
                    {
                        type: 'warning',
                        category: 'complexity',
                        message: 'High complexity',
                        line: 1,
                        column: 1,
                        severity: 'high'
                    }
                ],
                suggestions: [],
                score: 85
            };
            codeAnalyzer_1.CodeAnalyzer.prototype.analyzeFile.mockResolvedValue(mockResult);
            vscode.window.activeTextEditor = {
                document: {
                    uri: { fsPath: '/test/file.ts' },
                    getText: jest.fn().mockReturnValue('test content')
                }
            };
            await manager.analyzeCurrentFile();
            await manager.showCodeQualityReport();
            expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
            expect(vscode.window.showTextDocument).toHaveBeenCalled();
        });
        it('should show message when no analysis data available', async () => {
            await manager.showCodeQualityReport();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('No analysis data available. Run "Analyze Workspace" first.');
        });
    });
    describe('dispose', () => {
        it('should dispose resources', () => {
            const mockDispose = jest.fn();
            vscode.languages = {
                createDiagnosticCollection: jest.fn().mockReturnValue({
                    set: jest.fn(),
                    dispose: mockDispose
                })
            };
            const newManager = new intelligenceManager_1.IntelligenceManager(mockWorkspaceRoot);
            newManager.dispose();
            expect(mockDispose).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=intelligenceManager.test.js.map