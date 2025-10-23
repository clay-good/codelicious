import { RefactoringEngine } from '../refactoringEngine';
import * as vscode from 'vscode';

jest.mock('vscode');

describe('RefactoringEngine', () => {
 let engine: RefactoringEngine;
 const mockWorkspaceRoot = '/test/workspace';

 beforeEach(() => {
 engine = new RefactoringEngine(mockWorkspaceRoot);
 jest.clearAllMocks();
 });

 describe('extractMethod', () => {
 it('should extract a simple method', async () => {
 const mockDocument = {
 getText: jest.fn().mockReturnValue('const x = 1;\nconst y = 2;'),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockSelection = new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(1, 12)
 );

 const result = await engine.extractMethod(mockDocument, mockSelection, 'myMethod');

 expect(result.success).toBe(true);
 expect(result.operations.length).toBeGreaterThan(0);
 expect(result.operations[0].type).toBe('extract-method');
 expect(result.message).toContain('myMethod');
 });

 it('should detect parameters', async () => {
 const mockDocument = {
 getText: jest.fn()
 .mockReturnValueOnce('const x = 1;') // Before selection
 .mockReturnValueOnce('console.log(x);'), // Selection
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockSelection = new vscode.Range(
 new vscode.Position(1, 0),
 new vscode.Position(1, 15)
 );

 const result = await engine.extractMethod(mockDocument, mockSelection, 'logValue');

 expect(result.success).toBe(true);
 });

 it('should detect return values', async () => {
 const mockDocument = {
 getText: jest.fn().mockReturnValue('return x + y;'),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockSelection = new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(0, 13)
 );

 const result = await engine.extractMethod(mockDocument, mockSelection, 'calculate');

 expect(result.success).toBe(true);
 expect(result.operations[0].preview).toContain('return');
 });
 });

 describe('extractVariable', () => {
 it('should extract a variable', async () => {
 const mockDocument = {
 getText: jest.fn().mockReturnValue('x + y'),
 positionAt: jest.fn((index) => new vscode.Position(0, index)),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockSelection = new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(0, 5)
 );

 const result = await engine.extractVariable(mockDocument, mockSelection, 'sum');

 expect(result.success).toBe(true);
 expect(result.operations.length).toBeGreaterThan(0);
 expect(result.operations[0].type).toBe('extract-variable');
 expect(result.message).toContain('sum');
 });

 it('should find occurrences', async () => {
 const mockDocument = {
 getText: jest.fn()
 .mockReturnValueOnce('x + y') // Selection
 .mockReturnValue('const a = x + y;\nconst b = x + y;'), // Full document
 positionAt: jest.fn((index) => new vscode.Position(0, index)),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockSelection = new vscode.Range(
 new vscode.Position(0, 10),
 new vscode.Position(0, 15)
 );

 const result = await engine.extractVariable(mockDocument, mockSelection, 'result');

 expect(result.success).toBe(true);
 expect(result.message).toContain('occurrences');
 });
 });

 describe('renameSymbol', () => {
 it('should rename a symbol', async () => {
 const mockDocument = {
 getWordRangeAtPosition: jest.fn().mockReturnValue(
 new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5))
 ),
 getText: jest.fn()
 .mockReturnValueOnce('myVar') // Word at position
 .mockReturnValue('const myVar = 1;\nconsole.log(myVar);'), // Full document
 positionAt: jest.fn((index) => new vscode.Position(0, index)),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockPosition = new vscode.Position(0, 0);

 const result = await engine.renameSymbol(mockDocument, mockPosition, 'newVar');

 expect(result.success).toBe(true);
 expect(result.operations.length).toBeGreaterThan(0);
 expect(result.operations[0].type).toBe('rename');
 expect(result.message).toContain('newVar');
 });

 it('should handle no symbol found', async () => {
 const mockDocument = {
 getWordRangeAtPosition: jest.fn().mockReturnValue(null),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockPosition = new vscode.Position(0, 0);

 const result = await engine.renameSymbol(mockDocument, mockPosition, 'newVar');

 expect(result.success).toBe(false);
 expect(result.message).toContain('No symbol found');
 });
 });

 describe('inlineVariable', () => {
 it('should inline a variable', async () => {
 const mockDocument = {
 getWordRangeAtPosition: jest.fn().mockReturnValue(
 new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5))
 ),
 getText: jest.fn()
 .mockReturnValueOnce('myVar') // Word at position
 .mockReturnValueOnce('const myVar = 42;') // Declaration line
 .mockReturnValue('const myVar = 42;\nconsole.log(myVar);'), // Full document
 lineAt: jest.fn().mockReturnValue({
 range: { end: new vscode.Position(0, 17) }
 }),
 positionAt: jest.fn((index) => new vscode.Position(0, index)),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockPosition = new vscode.Position(1, 12);

 const result = await engine.inlineVariable(mockDocument, mockPosition);

 expect(result.success).toBe(true);
 expect(result.operations.length).toBeGreaterThan(0);
 expect(result.operations[0].type).toBe('inline');
 });

 it('should handle variable not found', async () => {
 const mockDocument = {
 getWordRangeAtPosition: jest.fn().mockReturnValue(null),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockPosition = new vscode.Position(0, 0);

 const result = await engine.inlineVariable(mockDocument, mockPosition);

 expect(result.success).toBe(false);
 expect(result.message).toContain('No variable found');
 });
 });

 describe('convertToArrowFunction', () => {
 it('should convert function to arrow function', async () => {
 const mockDocument = {
 getText: jest.fn().mockReturnValue('function test(x, y) { return x + y; }'),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockRange = new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(0, 38)
 );

 const result = await engine.convertToArrowFunction(mockDocument, mockRange);

 expect(result.success).toBe(true);
 expect(result.operations[0].type).toBe('convert');
 expect(result.operations[0].newCode).toContain('=>');
 });

 it('should handle anonymous functions', async () => {
 const mockDocument = {
 getText: jest.fn().mockReturnValue('function (x) { return x * 2; }'),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockRange = new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(0, 30)
 );

 const result = await engine.convertToArrowFunction(mockDocument, mockRange);

 expect(result.success).toBe(true);
 expect(result.operations[0].newCode).toContain('=>');
 });

 it('should handle invalid function', async () => {
 const mockDocument = {
 getText: jest.fn().mockReturnValue('const x = 1;'),
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockRange = new vscode.Range(
 new vscode.Position(0, 0),
 new vscode.Position(0, 12)
 );

 const result = await engine.convertToArrowFunction(mockDocument, mockRange);

 expect(result.success).toBe(false);
 expect(result.message).toContain('Not a valid function');
 });
 });

 describe('applyRefactoring', () => {
 it('should apply refactoring operations', async () => {
 const mockDocument = {
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockEdit = {
 replace: jest.fn()
 };

 (vscode as any).WorkspaceEdit = jest.fn().mockImplementation(() => mockEdit);
 (vscode as any).workspace = {
 applyEdit: jest.fn().mockResolvedValue(true)
 };

 const operations = [
 {
 type: 'rename' as const,
 description: 'Rename x to y',
 range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
 newCode: 'y',
 preview: 'x → y'
 }
 ];

 const result = await engine.applyRefactoring(mockDocument, operations);

 expect(result).toBe(true);
 expect(mockEdit.replace).toHaveBeenCalled();
 expect((vscode as any).workspace.applyEdit).toHaveBeenCalled();
 });

 it('should handle multiple operations', async () => {
 const mockDocument = {
 uri: { fsPath: '/test/file.ts' }
 } as any;

 const mockEdit = {
 replace: jest.fn()
 };

 (vscode as any).WorkspaceEdit = jest.fn().mockImplementation(() => mockEdit);
 (vscode as any).workspace = {
 applyEdit: jest.fn().mockResolvedValue(true)
 };

 const operations = [
 {
 type: 'rename' as const,
 description: 'Rename x to y',
 range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
 newCode: 'y',
 preview: 'x → y'
 },
 {
 type: 'rename' as const,
 description: 'Rename a to b',
 range: new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 1)),
 newCode: 'b',
 preview: 'a → b'
 }
 ];

 const result = await engine.applyRefactoring(mockDocument, operations);

 expect(result).toBe(true);
 expect(mockEdit.replace).toHaveBeenCalledTimes(2);
 });
 });
});

