/**
 * Tests for Project State Tracker
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProjectStateTracker, ProjectState, TaskStateEntry } from '../projectState';

// Mock fs
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ProjectStateTracker', () => {
 let tracker: ProjectStateTracker;
 const workspaceRoot = '/test/workspace';
 const projectName = 'TestProject';
 const stateFilePath = path.join(workspaceRoot, '.codelicious', 'project-state.json');

 beforeEach(() => {
 jest.clearAllMocks();
 mockFs.existsSync.mockReturnValue(false);
 tracker = new ProjectStateTracker(workspaceRoot, projectName, 50);
 });

 afterEach(() => {
 tracker.dispose();
 });

 describe('Initialization', () => {
 it('should initialize with default state', () => {
 const state = tracker.getState();

 expect(state.projectName).toBe(projectName);
 expect(state.workspaceRoot).toBe(workspaceRoot);
 expect(state.maxIterations).toBe(50);
 expect(state.iterationCount).toBe(0);
 expect(state.completionPercentage).toBe(0);
 expect(state.isComplete).toBe(false);
 expect(state.filesCreated).toEqual([]);
 expect(state.tasksCompleted).toEqual([]);
 });

 it('should generate unique project ID', () => {
 const tracker1 = new ProjectStateTracker(workspaceRoot, projectName);
 const tracker2 = new ProjectStateTracker(workspaceRoot, projectName);

 expect(tracker1.getState().projectId).not.toBe(tracker2.getState().projectId);

 tracker1.dispose();
 tracker2.dispose();
 });
 });

 describe('State Persistence', () => {
 it('should save state to disk', async () => {
 mockFs.existsSync.mockReturnValue(false);
 mockFs.mkdirSync.mockImplementation(() => undefined);
 mockFs.writeFileSync.mockImplementation(() => undefined);

 await tracker.saveState();

 expect(mockFs.mkdirSync).toHaveBeenCalledWith(
 path.dirname(stateFilePath),
 { recursive: true }
 );
 expect(mockFs.writeFileSync).toHaveBeenCalledWith(
 stateFilePath,
 expect.any(String),
 'utf8'
 );
 });

 it('should load state from disk', async () => {
 const savedState: Partial<ProjectState> = {
 projectName: 'LoadedProject',
 iterationCount: 10,
 completionPercentage: 50
 };

 mockFs.existsSync.mockReturnValue(true);
 mockFs.readFileSync.mockReturnValue(JSON.stringify(savedState));

 const loaded = await tracker.loadState();

 expect(loaded).toBe(true);
 expect(tracker.getState().projectName).toBe('LoadedProject');
 expect(tracker.getState().iterationCount).toBe(10);
 });

 it('should return false when no state file exists', async () => {
 mockFs.existsSync.mockReturnValue(false);

 const loaded = await tracker.loadState();

 expect(loaded).toBe(false);
 });
 });

 describe('Phase and Task Management', () => {
 it('should update current phase', () => {
 tracker.setPhase('building');
 expect(tracker.getState().currentPhase).toBe('building');
 });

 it('should update current task', () => {
 tracker.setCurrentTask('Creating main file');
 expect(tracker.getState().currentTask).toBe('Creating main file');
 });

 it('should set total tasks', () => {
 tracker.setTotalTasks(10);
 expect(tracker.getState().tasksTotal).toBe(10);
 });

 it('should add pending task', () => {
 const task: TaskStateEntry = {
 id: 'task1',
 name: 'Create file',
 description: 'Create main.ts',
 type: 'create'
 };

 tracker.addPendingTask(task);
 expect(tracker.getState().tasksPending).toContainEqual(task);
 });

 it('should complete task', () => {
 const task: TaskStateEntry = {
 id: 'task1',
 name: 'Create file',
 description: 'Create main.ts',
 type: 'create'
 };

 tracker.addPendingTask(task);
 tracker.startTask('task1');
 tracker.completeTask('task1', { success: true });

 const state = tracker.getState();
 expect(state.tasksPending).not.toContainEqual(expect.objectContaining({ id: 'task1' }));
 expect(state.tasksCompleted).toContainEqual(expect.objectContaining({ id: 'task1' }));
 });

 it('should fail task and add error', () => {
 const task: TaskStateEntry = {
 id: 'task1',
 name: 'Create file',
 description: 'Create main.ts',
 type: 'create'
 };

 tracker.addPendingTask(task);
 tracker.failTask('task1', 'File already exists');

 const state = tracker.getState();
 expect(state.tasksFailed).toContainEqual(expect.objectContaining({ id: 'task1' }));
 expect(state.errors.length).toBeGreaterThan(0);
 });
 });

 describe('File Tracking', () => {
 it('should track file created', () => {
 mockFs.existsSync.mockReturnValue(true);
 mockFs.statSync.mockReturnValue({ size: 1024 } as fs.Stats);

 tracker.addFileCreated('src/main.ts', 'typescript');

 const state = tracker.getState();
 expect(state.filesCreated).toContainEqual(
 expect.objectContaining({
 path: 'src/main.ts',
 language: 'typescript',
 size: 1024
 })
 );
 });

 it('should track file modified', () => {
 mockFs.existsSync.mockReturnValue(true);
 mockFs.statSync.mockReturnValue({ size: 2048 } as fs.Stats);

 tracker.addFileModified('src/main.ts', 'typescript');

 const state = tracker.getState();
 expect(state.filesModified).toContainEqual(
 expect.objectContaining({
 path: 'src/main.ts',
 size: 2048
 })
 );
 });

 it('should track file deleted', () => {
 tracker.addFileDeleted('src/old.ts');

 const state = tracker.getState();
 expect(state.filesDeleted).toContain('src/old.ts');
 });
 });

 describe('Iteration Management', () => {
 it('should increment iteration count', () => {
 const count1 = tracker.incrementIteration();
 const count2 = tracker.incrementIteration();

 expect(count1).toBe(1);
 expect(count2).toBe(2);
 expect(tracker.getState().iterationCount).toBe(2);
 });

 it('should detect max iterations reached', () => {
 for (let i = 0; i < 50; i++) {
 tracker.incrementIteration();
 }

 expect(tracker.isMaxIterationsReached()).toBe(true);
 });

 it('should not exceed max iterations', () => {
 for (let i = 0; i < 60; i++) {
 tracker.incrementIteration();
 }

 expect(tracker.getState().iterationCount).toBe(60);
 expect(tracker.isMaxIterationsReached()).toBe(true);
 });
 });

 describe('Dependency Tracking', () => {
 it('should update dependency state', () => {
 tracker.updateDependencies({
 dependenciesInstalled: true,
 dependencies: ['express', 'typescript']
 });

 const state = tracker.getState();
 expect(state.dependencies.dependenciesInstalled).toBe(true);
 expect(state.dependencies.dependencies).toEqual(['express', 'typescript']);
 });
 });

 describe('Build Status', () => {
 it('should update build status', () => {
 tracker.updateBuildStatus({
 attempted: true,
 successful: true,
 attempts: 1
 });

 const state = tracker.getState();
 expect(state.buildStatus.successful).toBe(true);
 expect(state.buildStatus.attempts).toBe(1);
 });

 it('should track build errors', () => {
 tracker.updateBuildStatus({
 attempted: true,
 successful: false,
 errors: ['Type error in main.ts']
 });

 const state = tracker.getState();
 expect(state.buildStatus.successful).toBe(false);
 expect(state.buildStatus.errors).toContain('Type error in main.ts');
 });
 });

 describe('Test Status', () => {
 it('should update test status', () => {
 tracker.updateTestStatus({
 attempted: true,
 successful: true,
 totalTests: 10,
 passedTests: 10,
 failedTests: 0
 });

 const state = tracker.getState();
 expect(state.testStatus.successful).toBe(true);
 expect(state.testStatus.totalTests).toBe(10);
 });
 });

 describe('Error Management', () => {
 it('should add error', () => {
 tracker.addError({
 timestamp: Date.now(),
 phase: 'building',
 message: 'Build failed',
 resolved: false
 });

 expect(tracker.getState().errors.length).toBe(1);
 });

 it('should resolve error', () => {
 tracker.addError({
 timestamp: Date.now(),
 phase: 'building',
 message: 'Build failed',
 resolved: false
 });

 tracker.resolveError(0, 'Fixed by updating dependencies');

 const state = tracker.getState();
 expect(state.errors[0].resolved).toBe(true);
 expect(state.errors[0].resolution).toBe('Fixed by updating dependencies');
 });
 });

 describe('Completion Detection', () => {
 it('should detect incomplete project', () => {
 tracker.setTotalTasks(10);
 const isComplete = tracker.checkCompletion();

 expect(isComplete).toBe(false);
 expect(tracker.getState().isComplete).toBe(false);
 });

 it('should detect complete project', () => {
 // Set up completion criteria
 tracker.setTotalTasks(2);

 // Add tasks
 tracker.addPendingTask({ id: 'task1', name: 'Task 1', description: 'Test', type: 'create' });
 tracker.addPendingTask({ id: 'task2', name: 'Task 2', description: 'Test', type: 'create' });

 // Complete tasks
 tracker.completeTask('task1');
 tracker.completeTask('task2');

 // Add file
 mockFs.existsSync.mockReturnValue(true);
 mockFs.statSync.mockReturnValue({ size: 100 } as fs.Stats);
 tracker.addFileCreated('main.ts');

 // Update build status
 tracker.updateBuildStatus({ attempted: true, successful: true, attempts: 1 });

 // Update dependencies
 tracker.updateDependencies({ dependenciesInstalled: true, installErrors: [] });

 const isComplete = tracker.checkCompletion();

 expect(isComplete).toBe(true);
 expect(tracker.getState().isComplete).toBe(true);
 });
 });

 describe('Summary Generation', () => {
 it('should generate summary', () => {
 tracker.setTotalTasks(5);
 mockFs.existsSync.mockReturnValue(true);
 mockFs.statSync.mockReturnValue({ size: 100 } as fs.Stats);
 tracker.addFileCreated('main.ts');
 tracker.incrementIteration();

 const summary = tracker.getSummary();

 expect(summary).toContain('TestProject');
 expect(summary).toContain('Files:');
 expect(summary).toContain('Tasks:');
 expect(summary).toContain('Iterations: 1/50');
 });
 });
});

