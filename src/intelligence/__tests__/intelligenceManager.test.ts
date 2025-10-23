import { IntelligenceManager } from '../intelligenceManager';
import { CodeAnalyzer } from '../codeAnalyzer';
import { RefactoringEngine } from '../refactoringEngine';
import { DependencyAnalyzer } from '../dependencyAnalyzer';
import * as vscode from 'vscode';

jest.mock('../codeAnalyzer');
jest.mock('../refactoringEngine');
jest.mock('../dependencyAnalyzer');
jest.mock('vscode');

describe('IntelligenceManager', () => {
 let manager: IntelligenceManager;
 const mockWorkspaceRoot = '/test/workspace';

 beforeEach(() => {
 jest.clearAllMocks();

 // Mock vscode.languages.createDiagnosticCollection
 (vscode as any).languages = {
 createDiagnosticCollection: jest.fn().mockReturnValue({
 set: jest.fn(),
 dispose: jest.fn()
 })
 };

 manager = new IntelligenceManager(mockWorkspaceRoot);

 // Mock vscode.window
 (vscode as any).window = {
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
 (vscode as any).workspace = {
 findFiles: jest.fn().mockResolvedValue([]),
 openTextDocument: jest.fn().mockResolvedValue({})
 };

 // Mock ProgressLocation
 (vscode as any).ProgressLocation = {
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

 (CodeAnalyzer.prototype.analyzeFile as jest.Mock).mockResolvedValue(mockResult);

 await manager.analyzeCurrentFile();

 expect(CodeAnalyzer.prototype.analyzeFile).toHaveBeenCalled();
 expect(vscode.window.showInformationMessage).toHaveBeenCalled();
 });

 it('should show warning for no active editor', async () => {
 (vscode.window as any).activeTextEditor = undefined;

 await manager.analyzeCurrentFile();

 expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No active editor');
 });

 it('should handle analysis errors', async () => {
 (CodeAnalyzer.prototype.analyzeFile as jest.Mock).mockRejectedValue(
 new Error('Analysis failed')
 );

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

 (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);

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

 (CodeAnalyzer.prototype.analyzeFile as jest.Mock).mockResolvedValue(mockResult);

 await manager.analyzeWorkspace();

 expect(CodeAnalyzer.prototype.analyzeFile).toHaveBeenCalledTimes(2);
 expect(vscode.window.showInformationMessage).toHaveBeenCalled();
 });

 it('should handle workspace analysis errors', async () => {
 (vscode.workspace.findFiles as jest.Mock).mockRejectedValue(
 new Error('Find files failed')
 );

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

 (DependencyAnalyzer.prototype.analyzeWorkspace as jest.Mock).mockResolvedValue(mockGraph);
 (DependencyAnalyzer.prototype.suggestImprovements as jest.Mock).mockReturnValue([]);

 await manager.analyzeDependencies();

 expect(DependencyAnalyzer.prototype.analyzeWorkspace).toHaveBeenCalled();
 expect(vscode.window.showInformationMessage).toHaveBeenCalled();
 });

 it('should handle dependency analysis errors', async () => {
 (DependencyAnalyzer.prototype.analyzeWorkspace as jest.Mock).mockRejectedValue(
 new Error('Analysis failed')
 );

 await manager.analyzeDependencies();

 expect(vscode.window.showErrorMessage).toHaveBeenCalled();
 });
 });

 describe('extractMethod', () => {
 it('should extract method', async () => {
 (vscode.window as any).activeTextEditor = {
 document: { uri: { fsPath: '/test/file.ts' } },
 selection: new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(1, 0)
 )
 };

 const mockResult = {
 success: true,
 operations: [
 {
 type: 'extract-method' as const,
 description: 'Extract method',
 range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 0)),
 newCode: 'myMethod();',
 preview: 'private myMethod() { ... }'
 }
 ],
 message: 'Extracted method successfully'
 };

 (RefactoringEngine.prototype.extractMethod as jest.Mock).mockResolvedValue(mockResult);
 (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Apply');
 (RefactoringEngine.prototype.applyRefactoring as jest.Mock).mockResolvedValue(true);

 await manager.extractMethod();

 expect(RefactoringEngine.prototype.extractMethod).toHaveBeenCalled();
 expect(RefactoringEngine.prototype.applyRefactoring).toHaveBeenCalled();
 });

 it('should show warning for no active editor', async () => {
 (vscode.window as any).activeTextEditor = undefined;

 await manager.extractMethod();

 expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('No active editor');
 });

 it('should show warning for empty selection', async () => {
 (vscode.window as any).activeTextEditor = {
 document: { uri: { fsPath: '/test/file.ts' } },
 selection: {
 isEmpty: true
 }
 };

 await manager.extractMethod();

 expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Please select code to extract');
 });

 it('should handle cancelled input', async () => {
 (vscode.window as any).activeTextEditor = {
 document: { uri: { fsPath: '/test/file.ts' } },
 selection: new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(1, 0)
 )
 };

 (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

 await manager.extractMethod();

 expect(RefactoringEngine.prototype.extractMethod).not.toHaveBeenCalled();
 });
 });

 describe('extractVariable', () => {
 it('should extract variable', async () => {
 (vscode.window as any).activeTextEditor = {
 document: { uri: { fsPath: '/test/file.ts' } },
 selection: new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(0, 5)
 )
 };

 const mockResult = {
 success: true,
 operations: [
 {
 type: 'extract-variable' as const,
 description: 'Extract variable',
 range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5)),
 newCode: 'myVar',
 preview: 'const myVar = ...'
 }
 ],
 message: 'Extracted variable successfully'
 };

 (RefactoringEngine.prototype.extractVariable as jest.Mock).mockResolvedValue(mockResult);
 (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Apply');
 (RefactoringEngine.prototype.applyRefactoring as jest.Mock).mockResolvedValue(true);

 await manager.extractVariable();

 expect(RefactoringEngine.prototype.extractVariable).toHaveBeenCalled();
 expect(RefactoringEngine.prototype.applyRefactoring).toHaveBeenCalled();
 });

 it('should show warning for empty selection', async () => {
 (vscode.window as any).activeTextEditor = {
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
 type: 'warning' as const,
 category: 'complexity' as const,
 message: 'High complexity',
 line: 1,
 column: 1,
 severity: 'high' as const
 }
 ],
 suggestions: [],
 score: 85
 };

 (CodeAnalyzer.prototype.analyzeFile as jest.Mock).mockResolvedValue(mockResult);
 (vscode.window as any).activeTextEditor = {
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

 expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
 'No analysis data available. Run "Analyze Workspace" first.'
 );
 });
 });

 describe('dispose', () => {
 it('should dispose resources', () => {
 const mockDispose = jest.fn();
 (vscode as any).languages = {
 createDiagnosticCollection: jest.fn().mockReturnValue({
 set: jest.fn(),
 dispose: mockDispose
 })
 };

 const newManager = new IntelligenceManager(mockWorkspaceRoot);
 newManager.dispose();

 expect(mockDispose).toHaveBeenCalled();
 });
 });
});

