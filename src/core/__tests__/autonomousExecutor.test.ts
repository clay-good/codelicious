/**
 * Tests for Autonomous Executor
 */

import { AutonomousExecutor, FileOperation, ExecutionPlan } from '../autonomousExecutor';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
 let executor: AutonomousExecutor;
 const workspaceRoot = '/test/workspace';

 beforeEach(() => {
 executor = new AutonomousExecutor(workspaceRoot);
 jest.clearAllMocks();

 // Setup default mocks
 (fs.existsSync as jest.Mock).mockReturnValue(false);
 (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
 (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
 (fs.readFileSync as jest.Mock).mockReturnValue('original content');
 (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);

 (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
 uri: { fsPath: '/test/file.ts' }
 });
 (vscode.window.showTextDocument as jest.Mock).mockResolvedValue({
 edit: jest.fn().mockResolvedValue(true)
 });
 (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
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
 expect(plan!.operations).toHaveLength(1);
 expect(plan!.operations[0]).toEqual({
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
 expect(plan!.operations).toHaveLength(2);
 expect(plan!.operations[0].filePath).toBe('src/file1.ts');
 expect(plan!.operations[1].filePath).toBe('src/file2.js');
 });

 it('should parse modify operations', () => {
 const aiResponse = `
MODIFY: src/existing.ts
\`\`\`typescript
new content
\`\`\`
 `;

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readFileSync as jest.Mock).mockReturnValue('old content');

 const plan = executor.parseFileOperations(aiResponse);

 expect(plan).not.toBeNull();
 expect(plan!.operations).toHaveLength(1);
 expect(plan!.operations[0]).toEqual({
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

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readFileSync as jest.Mock).mockReturnValue('file content');

 const plan = executor.parseFileOperations(aiResponse);

 expect(plan).not.toBeNull();
 expect(plan!.operations).toHaveLength(1);
 expect(plan!.operations[0]).toEqual({
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

 (fs.existsSync as jest.Mock).mockReturnValue(true);

 const plan = executor.parseFileOperations(aiResponse);

 expect(plan).not.toBeNull();
 expect(plan!.description).toBe('Create 1 file, Modify 1 file, Delete 1 file');
 });

 it('should estimate impact correctly', () => {
 // Low impact: 1 create
 let aiResponse = `\`\`\`typescript:src/file.ts\ncontent\`\`\``;
 let plan = executor.parseFileOperations(aiResponse);
 expect(plan!.estimatedImpact).toBe('low');

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
 expect(plan!.estimatedImpact).toBe('medium');

 // High impact: 1 delete
 aiResponse = 'DELETE: src/file.ts';
 (fs.existsSync as jest.Mock).mockReturnValue(true);
 plan = executor.parseFileOperations(aiResponse);
 expect(plan!.estimatedImpact).toBe('high');
 });
 });

 describe('showExecutionPlan', () => {
 it('should show plan to user and return true on Apply All', async () => {
 const plan: ExecutionPlan = {
 operations: [
 { type: 'create', filePath: 'src/file.ts', content: 'content' }
 ],
 description: 'Create 1 file',
 estimatedImpact: 'low'
 };

 (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Apply All');

 const result = await executor.showExecutionPlan(plan);

 expect(result).toBe(true);
 expect(vscode.window.showInformationMessage).toHaveBeenCalled();
 });

 it('should return false on Cancel', async () => {
 const plan: ExecutionPlan = {
 operations: [
 { type: 'create', filePath: 'src/file.ts', content: 'content' }
 ],
 description: 'Create 1 file',
 estimatedImpact: 'low'
 };

 (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Cancel');

 const result = await executor.showExecutionPlan(plan);

 expect(result).toBe(false);
 });

 it('should show preview and ask again on Preview Changes', async () => {
 const plan: ExecutionPlan = {
 operations: [
 { type: 'create', filePath: 'src/file.ts', content: 'content' }
 ],
 description: 'Create 1 file',
 estimatedImpact: 'low'
 };

 (vscode.window.showInformationMessage as jest.Mock)
 .mockResolvedValueOnce('Preview Changes')
 .mockResolvedValueOnce('Apply All');

 const result = await executor.showExecutionPlan(plan);

 expect(result).toBe(true);
 expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
 });
 });

 describe('executePlan', () => {
 it('should execute create operation successfully', async () => {
 const plan: ExecutionPlan = {
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
 expect(fs.writeFileSync).toHaveBeenCalledWith(
 path.join(workspaceRoot, 'src/file.ts'),
 'content',
 'utf8'
 );
 });

 it('should execute modify operation successfully', async () => {
 const plan: ExecutionPlan = {
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

 (fs.existsSync as jest.Mock).mockReturnValue(true);

 const result = await executor.executePlan(plan);

 expect(result.success).toBe(true);
 expect(result.appliedOperations).toHaveLength(1);
 expect(fs.writeFileSync).toHaveBeenCalledWith(
 path.join(workspaceRoot, 'src/file.ts'),
 'new content',
 'utf8'
 );
 });

 it('should execute delete operation successfully', async () => {
 const plan: ExecutionPlan = {
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

 (fs.existsSync as jest.Mock).mockReturnValue(true);

 const result = await executor.executePlan(plan);

 expect(result.success).toBe(true);
 expect(result.appliedOperations).toHaveLength(1);
 expect(fs.unlinkSync).toHaveBeenCalledWith(
 path.join(workspaceRoot, 'src/file.ts')
 );
 });

 it('should handle failed operations', async () => {
 const plan: ExecutionPlan = {
 operations: [
 { type: 'create', filePath: 'src/file.ts', content: 'content' }
 ],
 description: 'Create 1 file',
 estimatedImpact: 'low'
 };

 (fs.writeFileSync as jest.Mock).mockImplementation(() => {
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
 const plan: ExecutionPlan = {
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
 const plan: ExecutionPlan = {
 operations: [
 { type: 'create', filePath: 'src/file.ts', content: 'content' }
 ],
 description: 'Create 1 file',
 estimatedImpact: 'low'
 };

 await executor.executePlan(plan);
 (fs.existsSync as jest.Mock).mockReturnValue(true);

 const result = await executor.undo();

 expect(result).toBe(true);
 expect(fs.unlinkSync).toHaveBeenCalledWith(
 path.join(workspaceRoot, 'src/file.ts')
 );
 expect(executor.getUndoStackSize()).toBe(0);
 });

 it('should undo modify operation', async () => {
 const plan: ExecutionPlan = {
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

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 await executor.executePlan(plan);

 const result = await executor.undo();

 expect(result).toBe(true);
 expect(fs.writeFileSync).toHaveBeenCalledWith(
 path.join(workspaceRoot, 'src/file.ts'),
 'old content',
 'utf8'
 );
 });

 it('should return false when nothing to undo', async () => {
 const result = await executor.undo();

 expect(result).toBe(false);
 expect(vscode.window.showInformationMessage).toHaveBeenCalledWith('Nothing to undo');
 });
 });

 describe('clearUndoStack', () => {
 it('should clear undo stack', async () => {
 const plan: ExecutionPlan = {
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

