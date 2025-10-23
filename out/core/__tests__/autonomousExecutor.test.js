"use strict";
/**
 * Tests for Autonomous Executor
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
const autonomousExecutor_1 = require("../autonomousExecutor");
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Mock VS Code API
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showTextDocument: jest.fn(),
        createTerminal: jest.fn(),
        activeTextEditor: undefined
    },
    workspace: {
        openTextDocument: jest.fn(),
        textDocuments: [],
        workspaceFolders: []
    },
    commands: {
        executeCommand: jest.fn()
    },
    Uri: {
        file: jest.fn((path) => ({ fsPath: path })),
        parse: jest.fn((uri) => ({ fsPath: uri }))
    },
    Position: jest.fn()
}));
// Mock fs
jest.mock('fs');
describe('AutonomousExecutor', () => {
    let executor;
    const workspaceRoot = '/test/workspace';
    beforeEach(() => {
        executor = new autonomousExecutor_1.AutonomousExecutor(workspaceRoot);
        jest.clearAllMocks();
        // Setup default mocks
        fs.existsSync.mockReturnValue(false);
        fs.mkdirSync.mockReturnValue(undefined);
        fs.writeFileSync.mockReturnValue(undefined);
        fs.readFileSync.mockReturnValue('original content');
        fs.unlinkSync.mockReturnValue(undefined);
        vscode.workspace.openTextDocument.mockResolvedValue({
            uri: { fsPath: '/test/file.ts' }
        });
        vscode.window.showTextDocument.mockResolvedValue({
            edit: jest.fn().mockResolvedValue(true)
        });
        vscode.commands.executeCommand.mockResolvedValue(undefined);
    });
    describe('parseFileOperations', () => {
        it('should parse create operations with language:path syntax', () => {
            const aiResponse = `
I'll create a new file:

\`\`\`typescript:src/utils/helper.ts
export function helper() {
 return 'hello';
}
\`\`\`
 `;
            const plan = executor.parseFileOperations(aiResponse);
            expect(plan).not.toBeNull();
            expect(plan.operations).toHaveLength(1);
            expect(plan.operations[0]).toEqual({
                type: 'create',
                filePath: 'src/utils/helper.ts',
                content: "export function helper() {\n return 'hello';\n}",
                language: 'typescript'
            });
        });
        it('should parse multiple create operations', () => {
            const aiResponse = `
\`\`\`typescript:src/file1.ts
content1
\`\`\`

\`\`\`javascript:src/file2.js
content2
\`\`\`
 `;
            const plan = executor.parseFileOperations(aiResponse);
            expect(plan).not.toBeNull();
            expect(plan.operations).toHaveLength(2);
            expect(plan.operations[0].filePath).toBe('src/file1.ts');
            expect(plan.operations[1].filePath).toBe('src/file2.js');
        });
        it('should parse modify operations', () => {
            const aiResponse = `
MODIFY: src/existing.ts
\`\`\`typescript
new content
\`\`\`
 `;
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('old content');
            const plan = executor.parseFileOperations(aiResponse);
            expect(plan).not.toBeNull();
            expect(plan.operations).toHaveLength(1);
            expect(plan.operations[0]).toEqual({
                type: 'modify',
                filePath: 'src/existing.ts',
                content: 'new content',
                originalContent: 'old content',
                language: 'typescript'
            });
        });
        it('should parse delete operations', () => {
            const aiResponse = `
DELETE: src/old-file.ts
 `;
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('file content');
            const plan = executor.parseFileOperations(aiResponse);
            expect(plan).not.toBeNull();
            expect(plan.operations).toHaveLength(1);
            expect(plan.operations[0]).toEqual({
                type: 'delete',
                filePath: 'src/old-file.ts',
                originalContent: 'file content'
            });
        });
        it('should return null for responses with no operations', () => {
            const aiResponse = 'Just some text without any file operations';
            const plan = executor.parseFileOperations(aiResponse);
            expect(plan).toBeNull();
        });
        it('should generate correct description', () => {
            const aiResponse = `
\`\`\`typescript:src/file1.ts
content1
\`\`\`

MODIFY: src/file2.ts
\`\`\`typescript
content2
\`\`\`

DELETE: src/file3.ts
 `;
            fs.existsSync.mockReturnValue(true);
            const plan = executor.parseFileOperations(aiResponse);
            expect(plan).not.toBeNull();
            expect(plan.description).toBe('Create 1 file, Modify 1 file, Delete 1 file');
        });
        it('should estimate impact correctly', () => {
            // Low impact: 1 create
            let aiResponse = `\`\`\`typescript:src/file.ts\ncontent\`\`\``;
            let plan = executor.parseFileOperations(aiResponse);
            expect(plan.estimatedImpact).toBe('low');
            // Medium impact: 4 creates
            aiResponse = `
\`\`\`typescript:src/file1.ts\ncontent\`\`\`
\`\`\`typescript:src/file2.ts\ncontent\`\`\`
\`\`\`typescript:src/file3.ts\ncontent\`\`\`
\`\`\`typescript:src/file4.ts\ncontent\`\`\`
\`\`\`typescript:src/file5.ts\ncontent\`\`\`
\`\`\`typescript:src/file6.ts\ncontent\`\`\`
 `;
            plan = executor.parseFileOperations(aiResponse);
            expect(plan.estimatedImpact).toBe('medium');
            // High impact: 1 delete
            aiResponse = 'DELETE: src/file.ts';
            fs.existsSync.mockReturnValue(true);
            plan = executor.parseFileOperations(aiResponse);
            expect(plan.estimatedImpact).toBe('high');
        });
    });
    describe('showExecutionPlan', () => {
        it('should show plan to user and return true on Apply All', async () => {
            const plan = {
                operations: [
                    { type: 'create', filePath: 'src/file.ts', content: 'content' }
                ],
                description: 'Create 1 file',
                estimatedImpact: 'low'
            };
            vscode.window.showInformationMessage.mockResolvedValue('Apply All');
            const result = await executor.showExecutionPlan(plan);
            expect(result).toBe(true);
            expect(vscode.window.showInformationMessage).toHaveBeenCalled();
        });
        it('should return false on Cancel', async () => {
            const plan = {
                operations: [
                    { type: 'create', filePath: 'src/file.ts', content: 'content' }
                ],
                description: 'Create 1 file',
                estimatedImpact: 'low'
            };
            vscode.window.showInformationMessage.mockResolvedValue('Cancel');
            const result = await executor.showExecutionPlan(plan);
            expect(result).toBe(false);
        });
        it('should show preview and ask again on Preview Changes', async () => {
            const plan = {
                operations: [
                    { type: 'create', filePath: 'src/file.ts', content: 'content' }
                ],
                description: 'Create 1 file',
                estimatedImpact: 'low'
            };
            vscode.window.showInformationMessage
                .mockResolvedValueOnce('Preview Changes')
                .mockResolvedValueOnce('Apply All');
            const result = await executor.showExecutionPlan(plan);
            expect(result).toBe(true);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
        });
    });
    describe('executePlan', () => {
        it('should execute create operation successfully', async () => {
            const plan = {
                operations: [
                    { type: 'create', filePath: 'src/file.ts', content: 'content', language: 'typescript' }
                ],
                description: 'Create 1 file',
                estimatedImpact: 'low'
            };
            const result = await executor.executePlan(plan);
            expect(result.success).toBe(true);
            expect(result.appliedOperations).toHaveLength(1);
            expect(result.failedOperations).toHaveLength(0);
            expect(fs.mkdirSync).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(workspaceRoot, 'src/file.ts'), 'content', 'utf8');
        });
        it('should execute modify operation successfully', async () => {
            const plan = {
                operations: [
                    {
                        type: 'modify',
                        filePath: 'src/file.ts',
                        content: 'new content',
                        originalContent: 'old content',
                        language: 'typescript'
                    }
                ],
                description: 'Modify 1 file',
                estimatedImpact: 'low'
            };
            fs.existsSync.mockReturnValue(true);
            const result = await executor.executePlan(plan);
            expect(result.success).toBe(true);
            expect(result.appliedOperations).toHaveLength(1);
            expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(workspaceRoot, 'src/file.ts'), 'new content', 'utf8');
        });
        it('should execute delete operation successfully', async () => {
            const plan = {
                operations: [
                    {
                        type: 'delete',
                        filePath: 'src/file.ts',
                        originalContent: 'content'
                    }
                ],
                description: 'Delete 1 file',
                estimatedImpact: 'high'
            };
            fs.existsSync.mockReturnValue(true);
            const result = await executor.executePlan(plan);
            expect(result.success).toBe(true);
            expect(result.appliedOperations).toHaveLength(1);
            expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(workspaceRoot, 'src/file.ts'));
        });
        it('should handle failed operations', async () => {
            const plan = {
                operations: [
                    { type: 'create', filePath: 'src/file.ts', content: 'content' }
                ],
                description: 'Create 1 file',
                estimatedImpact: 'low'
            };
            fs.writeFileSync.mockImplementation(() => {
                throw new Error('Write failed');
            });
            const result = await executor.executePlan(plan);
            expect(result.success).toBe(false);
            expect(result.appliedOperations).toHaveLength(0);
            expect(result.failedOperations).toHaveLength(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toContain('Write failed');
        });
        it('should add to undo stack on success', async () => {
            const plan = {
                operations: [
                    { type: 'create', filePath: 'src/file.ts', content: 'content' }
                ],
                description: 'Create 1 file',
                estimatedImpact: 'low'
            };
            await executor.executePlan(plan);
            expect(executor.getUndoStackSize()).toBe(1);
        });
    });
    describe('undo', () => {
        it('should undo create operation', async () => {
            const plan = {
                operations: [
                    { type: 'create', filePath: 'src/file.ts', content: 'content' }
                ],
                description: 'Create 1 file',
                estimatedImpact: 'low'
            };
            await executor.executePlan(plan);
            fs.existsSync.mockReturnValue(true);
            const result = await executor.undo();
            expect(result).toBe(true);
            expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(workspaceRoot, 'src/file.ts'));
            expect(executor.getUndoStackSize()).toBe(0);
        });
        it('should undo modify operation', async () => {
            const plan = {
                operations: [
                    {
                        type: 'modify',
                        filePath: 'src/file.ts',
                        content: 'new content',
                        originalContent: 'old content'
                    }
                ],
                description: 'Modify 1 file',
                estimatedImpact: 'low'
            };
            fs.existsSync.mockReturnValue(true);
            await executor.executePlan(plan);
            const result = await executor.undo();
            expect(result).toBe(true);
            expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(workspaceRoot, 'src/file.ts'), 'old content', 'utf8');
        });
        it('should return false when nothing to undo', async () => {
            const result = await executor.undo();
            expect(result).toBe(false);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Nothing to undo');
        });
    });
    describe('clearUndoStack', () => {
        it('should clear undo stack', async () => {
            const plan = {
                operations: [
                    { type: 'create', filePath: 'src/file.ts', content: 'content' }
                ],
                description: 'Create 1 file',
                estimatedImpact: 'low'
            };
            await executor.executePlan(plan);
            expect(executor.getUndoStackSize()).toBe(1);
            executor.clearUndoStack();
            expect(executor.getUndoStackSize()).toBe(0);
        });
    });
});
//# sourceMappingURL=autonomousExecutor.test.js.map