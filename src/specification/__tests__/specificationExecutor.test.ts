import { SpecificationExecutor, ExecutionOptions } from '../specificationExecutor';
import { ExecutionPlan, ExecutionPhase, PlannedTask } from '../taskPlanner';
import { TaskType, Priority } from '../specificationParser';
import * as vscode from 'vscode';

// Mock VS Code
jest.mock('vscode');

describe('SpecificationExecutor', () => {
 let executor: SpecificationExecutor;
 let mockOutputChannel: vscode.OutputChannel;
 const mockWorkspaceRoot = '/test/workspace';

 beforeEach(() => {
 mockOutputChannel = {
 appendLine: jest.fn(),
 append: jest.fn(),
 clear: jest.fn(),
 show: jest.fn(),
 hide: jest.fn(),
 dispose: jest.fn(),
 name: 'Test',
 replace: jest.fn()
 } as any;

 executor = new SpecificationExecutor(mockWorkspaceRoot, mockOutputChannel);
 });

 const createMockPlan = (tasks: Partial<PlannedTask>[]): ExecutionPlan => {
 const plannedTasks: PlannedTask[] = tasks.map((t, i) => ({
 id: t.id || `task-${i + 1}`,
 name: t.name || `Task ${i + 1}`,
 description: t.description || `Description ${i + 1}`,
 type: t.type || TaskType.CREATE,
 priority: t.priority || Priority.MEDIUM,
 estimatedTime: t.estimatedTime || 60,
 dependencies: t.dependencies || [],
 requirements: t.requirements || [],
 files: t.files || [],
 tests: t.tests || [],
 order: t.order || i,
 canParallelize: t.canParallelize !== undefined ? t.canParallelize : true
 }));

 const phases: ExecutionPhase[] = [{
 id: 'phase-1',
 name: 'Execution',
 tasks: plannedTasks,
 estimatedTime: plannedTasks.reduce((sum, t) => sum + t.estimatedTime, 0),
 dependencies: []
 }];

 return {
 phases,
 totalTime: phases.reduce((sum, p) => sum + p.estimatedTime, 0),
 criticalPath: plannedTasks.map(t => t.id),
 parallelizable: [plannedTasks.map(t => t.id)],
 warnings: []
 };
 };

 describe('execute', () => {
 it('should execute simple plan successfully', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 expect(result.completedTasks.length).toBe(1);
 expect(result.failedTasks.length).toBe(0);
 });

 it('should execute multiple tasks', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] },
 { name: 'Task 2', type: TaskType.CREATE, files: [] },
 { name: 'Task 3', type: TaskType.CREATE, files: [] }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 expect(result.completedTasks.length).toBe(3);
 });

 it('should handle dry run mode', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: ['test.ts'] }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
 expect.stringContaining('Dry Run')
 );
 });

 it('should track execution duration', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.duration).toBeGreaterThanOrEqual(0);
 expect(typeof result.duration).toBe('number');
 });

 it('should skip tasks with unmet dependencies', async () => {
 const plan = createMockPlan([
 { id: 'task-1', name: 'Task 1', dependencies: ['task-999'] }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.skippedTasks.length).toBe(1);
 expect(result.completedTasks.length).toBe(0);
 });
 });

 describe('execution options', () => {
 it('should stop on error when stopOnError is true', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] },
 { name: 'Task 2', type: TaskType.CREATE, files: [] }
 ]);

 // Mock first task to fail
 jest.spyOn(executor as any, 'executeTask').mockRejectedValueOnce(new Error('Task failed'));

 const result = await executor.execute(plan, {
 dryRun: false,
 stopOnError: true
 });

 expect(result.success).toBe(false);
 expect(result.failedTasks.length).toBeGreaterThan(0);
 });

 it('should continue on error when stopOnError is false', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] },
 { name: 'Task 2', type: TaskType.CREATE, files: [] }
 ]);

 // Mock first task to fail
 jest.spyOn(executor as any, 'executeTask')
 .mockRejectedValueOnce(new Error('Task failed'))
 .mockResolvedValueOnce(undefined);

 const result = await executor.execute(plan, {
 dryRun: false,
 stopOnError: false
 });

 expect(result.failedTasks.length).toBe(1);
 expect(result.completedTasks.length).toBe(1);
 });
 });

 describe('task execution', () => {
 it('should handle CREATE tasks', async () => {
 const plan = createMockPlan([
 {
 name: 'Create file',
 type: TaskType.CREATE,
 files: []
 }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 });

 it('should handle MODIFY tasks', async () => {
 const plan = createMockPlan([
 {
 name: 'Modify file',
 type: TaskType.MODIFY,
 files: []
 }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 });

 it('should handle DELETE tasks', async () => {
 const plan = createMockPlan([
 {
 name: 'Delete file',
 type: TaskType.DELETE,
 files: []
 }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 });

 it('should handle REFACTOR tasks', async () => {
 const plan = createMockPlan([
 {
 name: 'Refactor code',
 type: TaskType.REFACTOR,
 files: []
 }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 });

 it('should handle TEST tasks', async () => {
 const plan = createMockPlan([
 {
 name: 'Run tests',
 type: TaskType.TEST,
 tests: []
 }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 });

 it('should handle DOCUMENT tasks', async () => {
 const plan = createMockPlan([
 {
 name: 'Generate docs',
 type: TaskType.DOCUMENT,
 files: []
 }
 ]);

 const result = await executor.execute(plan, { dryRun: true });

 expect(result.success).toBe(true);
 });
 });

 describe('error handling', () => {
 it('should capture task errors', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] }
 ]);

 jest.spyOn(executor as any, 'executeTask').mockRejectedValueOnce(
 new Error('Test error')
 );

 const result = await executor.execute(plan, { dryRun: false });

 expect(result.errors.length).toBeGreaterThan(0);
 expect(result.errors[0].message).toBe('Test error');
 });

 it('should include error timestamps', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] }
 ]);

 jest.spyOn(executor as any, 'executeTask').mockRejectedValueOnce(
 new Error('Test error')
 );

 const result = await executor.execute(plan, { dryRun: false });

 expect(result.errors[0].timestamp).toBeGreaterThan(0);
 });
 });

 describe('output logging', () => {
 it('should log execution start', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] }
 ]);

 await executor.execute(plan, { dryRun: true });

 expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
 expect.stringContaining('Starting Specification Execution')
 );
 });

 it('should log execution complete', async () => {
 const plan = createMockPlan([
 { name: 'Task 1', type: TaskType.CREATE, files: [] }
 ]);

 await executor.execute(plan, { dryRun: true });

 expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
 expect.stringContaining('Execution Complete')
 );
 });

 it('should log task execution', async () => {
 const plan = createMockPlan([
 { name: 'My Task', type: TaskType.CREATE, files: [] }
 ]);

 await executor.execute(plan, { dryRun: true });

 expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
 expect.stringContaining('My Task')
 );
 });
 });

 describe('file generation templates', () => {
 it('should generate TypeScript class template', () => {
 const task: PlannedTask = {
 id: 'task-1',
 name: 'User Service',
 description: 'Service for user management',
 type: TaskType.CREATE,
 priority: Priority.HIGH,
 estimatedTime: 60,
 dependencies: [],
 requirements: [],
 files: ['userService.ts'],
 tests: [],
 order: 0,
 canParallelize: true
 };

 const content = (executor as any).generateFileContent('userService.ts', task);

 expect(content).toContain('export class UserService');
 expect(content).toContain('User Service');
 expect(content).toContain('Service for user management');
 expect(content).toContain('constructor()');
 });

 it('should generate JavaScript class template', () => {
 const task: PlannedTask = {
 id: 'task-1',
 name: 'Data Handler',
 description: 'Handles data operations',
 type: TaskType.CREATE,
 priority: Priority.MEDIUM,
 estimatedTime: 60,
 dependencies: [],
 requirements: [],
 files: ['dataHandler.js'],
 tests: [],
 order: 0,
 canParallelize: true
 };

 const content = (executor as any).generateFileContent('dataHandler.js', task);

 expect(content).toContain('class DataHandler');
 expect(content).toContain('module.exports = DataHandler');
 expect(content).toContain('Data Handler');
 });

 it('should generate Python class template', () => {
 const task: PlannedTask = {
 id: 'task-1',
 name: 'API Client',
 description: 'Client for API calls',
 type: TaskType.CREATE,
 priority: Priority.MEDIUM,
 estimatedTime: 60,
 dependencies: [],
 requirements: [],
 files: ['api_client.py'],
 tests: [],
 order: 0,
 canParallelize: true
 };

 const content = (executor as any).generateFileContent('api_client.py', task);

 expect(content).toContain('class ApiClient:');
 expect(content).toContain('def __init__(self):');
 expect(content).toContain('API Client');
 });

 it('should generate test template for TypeScript', () => {
 const task: PlannedTask = {
 id: 'task-1',
 name: 'User Service Tests',
 description: 'Tests for user service',
 type: TaskType.TEST,
 priority: Priority.HIGH,
 estimatedTime: 30,
 dependencies: [],
 requirements: [],
 files: ['userService.test.ts'],
 tests: [],
 order: 0,
 canParallelize: true
 };

 const content = (executor as any).generateFileContent('userService.test.ts', task);

 expect(content).toContain("describe('UserService'");
 expect(content).toContain("it('should be defined'");
 expect(content).toContain('expect(true).toBe(true)');
 });

 it('should generate Markdown template', () => {
 const task: PlannedTask = {
 id: 'task-1',
 name: 'API Documentation',
 description: 'Documentation for the API',
 type: TaskType.DOCUMENT,
 priority: Priority.MEDIUM,
 estimatedTime: 60,
 dependencies: [],
 requirements: [],
 files: ['API.md'],
 tests: [],
 order: 0,
 canParallelize: true
 };

 const content = (executor as any).generateFileContent('API.md', task);

 expect(content).toContain('# API Documentation');
 expect(content).toContain('## Overview');
 expect(content).toContain('## Usage');
 expect(content).toContain('## API');
 });

 it('should convert file names to PascalCase', () => {
 const toPascalCase = (executor as any).toPascalCase.bind(executor);

 expect(toPascalCase('user-service')).toBe('UserService');
 expect(toPascalCase('api_client')).toBe('ApiClient');
 expect(toPascalCase('data.handler')).toBe('DataHandler');
 expect(toPascalCase('simple')).toBe('Simple');
 });
 });
});

