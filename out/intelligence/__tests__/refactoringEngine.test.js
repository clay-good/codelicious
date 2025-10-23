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
const refactoringEngine_1 = require("../refactoringEngine");
const vscode = __importStar(require("vscode"));
jest.mock('vscode');
describe('RefactoringEngine', () => {
    let engine;
    const mockWorkspaceRoot = '/test/workspace';
    beforeEach(() => {
        engine = new refactoringEngine_1.RefactoringEngine(mockWorkspaceRoot);
        jest.clearAllMocks();
    });
    describe('extractMethod', () => {
        it('should extract a simple method', async () => {
            const mockDocument = {
                getText: jest.fn().mockReturnValue('const x = 1;\nconst y = 2;'),
                uri: { fsPath: '/test/file.ts' }
            };
            const mockSelection = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(1, 12));
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
            };
            const mockSelection = new vscode.Range(new vscode.Position(1, 0), new vscode.Position(1, 15));
            const result = await engine.extractMethod(mockDocument, mockSelection, 'logValue');
            expect(result.success).toBe(true);
        });
        it('should detect return values', async () => {
            const mockDocument = {
                getText: jest.fn().mockReturnValue('return x + y;'),
                uri: { fsPath: '/test/file.ts' }
            };
            const mockSelection = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 13));
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
            };
            const mockSelection = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));
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
            };
            const mockSelection = new vscode.Range(new vscode.Position(0, 10), new vscode.Position(0, 15));
            const result = await engine.extractVariable(mockDocument, mockSelection, 'result');
            expect(result.success).toBe(true);
            expect(result.message).toContain('occurrences');
        });
    });
    describe('renameSymbol', () => {
        it('should rename a symbol', async () => {
            const mockDocument = {
                getWordRangeAtPosition: jest.fn().mockReturnValue(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5))),
                getText: jest.fn()
                    .mockReturnValueOnce('myVar') // Word at position
                    .mockReturnValue('const myVar = 1;\nconsole.log(myVar);'), // Full document
                positionAt: jest.fn((index) => new vscode.Position(0, index)),
                uri: { fsPath: '/test/file.ts' }
            };
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
            };
            const mockPosition = new vscode.Position(0, 0);
            const result = await engine.renameSymbol(mockDocument, mockPosition, 'newVar');
            expect(result.success).toBe(false);
            expect(result.message).toContain('No symbol found');
        });
    });
    describe('inlineVariable', () => {
        it('should inline a variable', async () => {
            const mockDocument = {
                getWordRangeAtPosition: jest.fn().mockReturnValue(new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5))),
                getText: jest.fn()
                    .mockReturnValueOnce('myVar') // Word at position
                    .mockReturnValueOnce('const myVar = 42;') // Declaration line
                    .mockReturnValue('const myVar = 42;\nconsole.log(myVar);'), // Full document
                lineAt: jest.fn().mockReturnValue({
                    range: { end: new vscode.Position(0, 17) }
                }),
                positionAt: jest.fn((index) => new vscode.Position(0, index)),
                uri: { fsPath: '/test/file.ts' }
            };
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
            };
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
            };
            const mockRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 38));
            const result = await engine.convertToArrowFunction(mockDocument, mockRange);
            expect(result.success).toBe(true);
            expect(result.operations[0].type).toBe('convert');
            expect(result.operations[0].newCode).toContain('=>');
        });
        it('should handle anonymous functions', async () => {
            const mockDocument = {
                getText: jest.fn().mockReturnValue('function (x) { return x * 2; }'),
                uri: { fsPath: '/test/file.ts' }
            };
            const mockRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 30));
            const result = await engine.convertToArrowFunction(mockDocument, mockRange);
            expect(result.success).toBe(true);
            expect(result.operations[0].newCode).toContain('=>');
        });
        it('should handle invalid function', async () => {
            const mockDocument = {
                getText: jest.fn().mockReturnValue('const x = 1;'),
                uri: { fsPath: '/test/file.ts' }
            };
            const mockRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 12));
            const result = await engine.convertToArrowFunction(mockDocument, mockRange);
            expect(result.success).toBe(false);
            expect(result.message).toContain('Not a valid function');
        });
    });
    describe('applyRefactoring', () => {
        it('should apply refactoring operations', async () => {
            const mockDocument = {
                uri: { fsPath: '/test/file.ts' }
            };
            const mockEdit = {
                replace: jest.fn()
            };
            vscode.WorkspaceEdit = jest.fn().mockImplementation(() => mockEdit);
            vscode.workspace = {
                applyEdit: jest.fn().mockResolvedValue(true)
            };
            const operations = [
                {
                    type: 'rename',
                    description: 'Rename x to y',
                    range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                    newCode: 'y',
                    preview: 'x → y'
                }
            ];
            const result = await engine.applyRefactoring(mockDocument, operations);
            expect(result).toBe(true);
            expect(mockEdit.replace).toHaveBeenCalled();
            expect(vscode.workspace.applyEdit).toHaveBeenCalled();
        });
        it('should handle multiple operations', async () => {
            const mockDocument = {
                uri: { fsPath: '/test/file.ts' }
            };
            const mockEdit = {
                replace: jest.fn()
            };
            vscode.WorkspaceEdit = jest.fn().mockImplementation(() => mockEdit);
            vscode.workspace = {
                applyEdit: jest.fn().mockResolvedValue(true)
            };
            const operations = [
                {
                    type: 'rename',
                    description: 'Rename x to y',
                    range: new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                    newCode: 'y',
                    preview: 'x → y'
                },
                {
                    type: 'rename',
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
//# sourceMappingURL=refactoringEngine.test.js.map