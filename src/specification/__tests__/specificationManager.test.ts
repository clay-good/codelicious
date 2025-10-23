import { SpecificationManager, SpecificationState } from '../specificationManager';
import { ParsedSpecification, RequirementType, TaskType, Priority } from '../specificationParser';
import * as vscode from 'vscode';

// Mock VS Code
jest.mock('vscode');

describe('SpecificationManager', () => {
 let manager: SpecificationManager;
 const mockWorkspaceRoot = '/test/workspace';

 beforeEach(() => {
 // Mock VS Code window methods
 (vscode.window as any) = {
 createOutputChannel: jest.fn().mockReturnValue({
 appendLine: jest.fn(),
 append: jest.fn(),
 clear: jest.fn(),
 show: jest.fn(),
 hide: jest.fn(),
 dispose: jest.fn()
 }),
 createStatusBarItem: jest.fn().mockReturnValue({
 text: '',
 show: jest.fn(),
 hide: jest.fn(),
 dispose: jest.fn()
 }),
 showInformationMessage: jest.fn(),
 showErrorMessage: jest.fn(),
 showTextDocument: jest.fn(),
 withProgress: jest.fn((options, task) => {
 const progress = {
 report: jest.fn()
 };
 const token = {
 isCancellationRequested: false,
 onCancellationRequested: jest.fn()
 };
 return task(progress, token);
 })
 };

 // Mock ProgressLocation
 (vscode as any).ProgressLocation = {
 Notification: 15,
 Window: 10,
 SourceControl: 1
 };

 // Mock StatusBarAlignment
 (vscode as any).StatusBarAlignment = {
 Left: 1,
 Right: 2
 };

 (vscode.workspace as any) = {
 openTextDocument: jest.fn().mockResolvedValue({
 getText: jest.fn().mockReturnValue('# Test Spec')
 })
 };

 manager = new SpecificationManager(mockWorkspaceRoot);
 });

 afterEach(() => {
 manager.dispose();
 });

 const createMockSpec = (): ParsedSpecification => ({
 title: 'Test Specification',
 description: 'Test description',
 requirements: [{
 id: 'req-1',
 type: RequirementType.FUNCTIONAL,
 description: 'Test requirement',
 priority: Priority.MEDIUM,
 acceptance: [],
 tags: []
 }],
 tasks: [{
 id: 'task-1',
 name: 'Test Task',
 description: 'Test task description',
 type: TaskType.CREATE,
 priority: Priority.MEDIUM,
 estimatedTime: 60,
 dependencies: [],
 requirements: [],
 files: [],
 tests: []
 }],
 constraints: [],
 dependencies: [],
 metadata: {
 version: '1.0.0',
 created: Date.now(),
 updated: Date.now(),
 tags: [],
 complexity: 5
 }
 });

 describe('initialization', () => {
 it('should initialize with idle state', () => {
 const status = manager.getStatus();
 expect(status.state).toBe(SpecificationState.IDLE);
 expect(status.progress).toBe(0);
 });

 it('should create output channel', () => {
 expect(vscode.window.createOutputChannel).toHaveBeenCalledWith(
 'Codelicious Specifications'
 );
 });

 it('should create status bar item', () => {
 expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
 });
 });

 describe('parseSpecification', () => {
 it('should parse specification text', async () => {
 const text = `
# Test Spec

## Requirements
1. Requirement 1

## Tasks
1. Task 1
 `;

 const spec = await manager.parseSpecification(text);

 expect(spec.title).toBe('Test Spec');
 expect(spec.requirements.length).toBeGreaterThan(0);
 expect(spec.tasks.length).toBeGreaterThan(0);
 });

 it('should update status during parsing', async () => {
 const text = '# Test';

 await manager.parseSpecification(text);

 const status = manager.getStatus();
 expect(status.specification).toBeDefined();
 });

 it('should handle parsing errors', async () => {
 // Test with invalid specification that will cause parsing issues
 const text = ''; // Empty text should still parse but with defaults

 const spec = await manager.parseSpecification(text);

 // Should return a valid spec with defaults
 expect(spec.title).toBeDefined();
 expect(spec.tasks).toBeDefined();
 });
 });

 describe('planSpecification', () => {
 it('should create execution plan', async () => {
 const spec = createMockSpec();

 const plan = await manager.planSpecification(spec);

 expect(plan.phases.length).toBeGreaterThan(0);
 expect(plan.totalTime).toBeGreaterThan(0);
 });

 it('should update status during planning', async () => {
 const spec = createMockSpec();

 await manager.planSpecification(spec);

 const status = manager.getStatus();
 expect(status.plan).toBeDefined();
 });

 it('should handle planning errors', async () => {
 const spec = createMockSpec();
 spec.tasks = []; // Empty tasks will cause error

 await expect(manager.planSpecification(spec)).rejects.toThrow();
 });
 });

 describe('processSpecification', () => {
 it('should process specification end-to-end', async () => {
 const text = `
# Test Spec

## Requirements
1. Requirement 1

## Tasks
1. Task 1
 `;

 const result = await manager.processSpecification(text, { dryRun: true });

 expect(result.success).toBe(true);
 expect(result.completedTasks.length).toBeGreaterThan(0);
 });

 it('should show progress notifications', async () => {
 const text = '# Test\n\n## Tasks\n1. Task 1';

 await manager.processSpecification(text, { dryRun: true });

 expect(vscode.window.withProgress).toHaveBeenCalled();
 });

 it('should show success message on completion', async () => {
 const text = '# Test\n\n## Tasks\n1. Task 1';

 await manager.processSpecification(text, { dryRun: true });

 expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
 expect.stringContaining('completed')
 );
 });

 it('should show error message on failure', async () => {
 const text = '# Test'; // No tasks will cause failure

 try {
 await manager.processSpecification(text, { dryRun: true });
 } catch (error) {
 // Expected to fail
 }

 expect(vscode.window.showErrorMessage).toHaveBeenCalled();
 });

 it('should update status to completed on success', async () => {
 const text = '# Test\n\n## Tasks\n1. Task 1';

 await manager.processSpecification(text, { dryRun: true });

 const status = manager.getStatus();
 expect(status.state).toBe(SpecificationState.COMPLETED);
 expect(status.progress).toBe(100);
 });
 });

 describe('processSpecificationFile', () => {
 it('should read and process file', async () => {
 const filePath = '/test/spec.md';

 (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({
 getText: jest.fn().mockReturnValue('# Test\n\n## Tasks\n1. Task 1')
 });

 const result = await manager.processSpecificationFile(filePath, { dryRun: true });

 expect(result.success).toBe(true);
 expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
 });
 });

 describe('getStatus', () => {
 it('should return current status', () => {
 const status = manager.getStatus();

 expect(status).toHaveProperty('state');
 expect(status).toHaveProperty('progress');
 });

 it('should return copy of status', () => {
 const status1 = manager.getStatus();
 const status2 = manager.getStatus();

 expect(status1).not.toBe(status2);
 expect(status1).toEqual(status2);
 });
 });

 describe('showSpecificationSummary', () => {
 it('should open document with summary', async () => {
 const spec = createMockSpec();

 (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});

 await manager.showSpecificationSummary(spec);

 expect(vscode.workspace.openTextDocument).toHaveBeenCalledWith(
 expect.objectContaining({
 language: 'markdown'
 })
 );
 });

 it('should format specification as markdown', async () => {
 const spec = createMockSpec();

 (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});

 await manager.showSpecificationSummary(spec);

 const call = (vscode.workspace.openTextDocument as jest.Mock).mock.calls[0][0];
 expect(call.content).toContain(spec.title);
 expect(call.content).toContain('Requirements');
 expect(call.content).toContain('Tasks');
 });
 });

 describe('showExecutionPlan', () => {
 it('should open document with plan', async () => {
 const spec = createMockSpec();
 const plan = await manager.planSpecification(spec);

 (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});

 await manager.showExecutionPlan(plan);

 expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
 });
 });

 describe('showExecutionResult', () => {
 it('should open document with result', async () => {
 const result = {
 success: true,
 completedTasks: ['task-1'],
 failedTasks: [],
 skippedTasks: [],
 errors: [],
 duration: 1000,
 artifacts: []
 };

 (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});

 await manager.showExecutionResult(result);

 expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
 });
 });

 describe('dispose', () => {
 it('should dispose resources', () => {
 const outputChannel = (manager as any).outputChannel;
 const statusBarItem = (manager as any).statusBarItem;

 manager.dispose();

 expect(outputChannel.dispose).toHaveBeenCalled();
 expect(statusBarItem.dispose).toHaveBeenCalled();
 });
 });
});

