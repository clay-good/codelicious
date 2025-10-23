/**
 * Project State Tracker
 *
 * Tracks the complete state of an autonomous build project including:
 * - Files created/modified/deleted
 * - Tasks completed/pending/failed
 * - Dependencies installed
 * - Build and test status
 * - Completion percentage
 * - Error history
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const logger = createLogger('ProjectState');

export interface ProjectState {
 // Project identification
 projectId: string;
 projectName: string;
 workspaceRoot: string;
 specificationPath?: string;

 // Timestamps
 startTime: number;
 lastUpdateTime: number;
 endTime?: number;

 // File tracking
 filesCreated: FileStateEntry[];
 filesModified: FileStateEntry[];
 filesDeleted: string[];

 // Task tracking
 tasksTotal: number;
 tasksCompleted: TaskStateEntry[];
 tasksPending: TaskStateEntry[];
 tasksFailed: TaskStateEntry[];

 // Dependency tracking
 dependencies: DependencyState;

 // Build and test status
 buildStatus: BuildStatus;
 testStatus: TestStatus;

 // Progress tracking
 completionPercentage: number;
 currentPhase: string;
 currentTask?: string;

 // Error tracking
 errors: ErrorEntry[];
 warnings: WarningEntry[];

 // Iteration tracking
 iterationCount: number;
 maxIterations: number;

 // Completion criteria
 completionCriteria: CompletionCriteria;
 isComplete: boolean;

 // Metadata
 metadata: Record<string, any>;
}

export interface FileStateEntry {
 path: string;
 language?: string;
 size: number;
 timestamp: number;
 checksum?: string;
}

export interface TaskStateEntry {
 id: string;
 name: string;
 description: string;
 type: string;
 startTime?: number;
 endTime?: number;
 duration?: number;
 result?: unknown;
}

export interface DependencyState {
 packageJsonExists: boolean;
 dependenciesInstalled: boolean;
 dependencies: string[];
 devDependencies: string[];
 installAttempts: number;
 lastInstallTime?: number;
 installErrors: string[];
}

export interface BuildStatus {
 attempted: boolean;
 successful: boolean;
 lastAttemptTime?: number;
 attempts: number;
 errors: string[];
 warnings: string[];
 outputPath?: string;
}

export interface TestStatus {
 attempted: boolean;
 successful: boolean;
 lastAttemptTime?: number;
 attempts: number;
 totalTests: number;
 passedTests: number;
 failedTests: number;
 errors: string[];
}

export interface ErrorEntry {
 timestamp: number;
 phase: string;
 task?: string;
 message: string;
 stack?: string;
 resolved: boolean;
 resolution?: string;
}

export interface WarningEntry {
 timestamp: number;
 phase: string;
 message: string;
 acknowledged: boolean;
}

export interface CompletionCriteria {
 requireAllTasksComplete: boolean;
 requireBuildSuccess: boolean;
 requireTestsPass: boolean;
 requireNoDependencyErrors: boolean;
 minimumFilesCreated: number;
 customCriteria: Record<string, boolean>;
}

export class ProjectStateTracker {
 private state: ProjectState;
 private stateFilePath: string;
 private autoSaveInterval: NodeJS.Timeout | null = null;

 constructor(
 workspaceRoot: string,
 projectName: string,
 maxIterations: number = 100
 ) {
 this.stateFilePath = path.join(workspaceRoot, '.codelicious', 'project-state.json');

 this.state = {
 projectId: this.generateProjectId(),
 projectName,
 workspaceRoot,
 startTime: Date.now(),
 lastUpdateTime: Date.now(),
 filesCreated: [],
 filesModified: [],
 filesDeleted: [],
 tasksTotal: 0,
 tasksCompleted: [],
 tasksPending: [],
 tasksFailed: [],
 dependencies: {
 packageJsonExists: false,
 dependenciesInstalled: false,
 dependencies: [],
 devDependencies: [],
 installAttempts: 0,
 installErrors: []
 },
 buildStatus: {
 attempted: false,
 successful: false,
 attempts: 0,
 errors: [],
 warnings: []
 },
 testStatus: {
 attempted: false,
 successful: false,
 attempts: 0,
 totalTests: 0,
 passedTests: 0,
 failedTests: 0,
 errors: []
 },
 completionPercentage: 0,
 currentPhase: 'initialization',
 errors: [],
 warnings: [],
 iterationCount: 0,
 maxIterations,
 completionCriteria: {
 requireAllTasksComplete: true,
 requireBuildSuccess: true,
 requireTestsPass: false, // Optional by default
 requireNoDependencyErrors: true,
 minimumFilesCreated: 1,
 customCriteria: {}
 },
 isComplete: false,
 metadata: {}
 };
 }

 /**
 * Load existing state from disk
 */
 async loadState(): Promise<boolean> {
 try {
 if (fs.existsSync(this.stateFilePath)) {
 const data = fs.readFileSync(this.stateFilePath, 'utf8');
 this.state = JSON.parse(data);
 logger.info(` Loaded project state from ${this.stateFilePath}`);
 return true;
 }
 return false;
 } catch (error) {
 logger.error('Failed to load project state:', error);
 return false;
 }
 }

 /**
 * Save state to disk
 */
 async saveState(): Promise<void> {
 try {
 this.state.lastUpdateTime = Date.now();

 // Ensure directory exists
 const dir = path.dirname(this.stateFilePath);
 if (!fs.existsSync(dir)) {
 fs.mkdirSync(dir, { recursive: true });
 }

 fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf8');
 logger.info(` Saved project state to ${this.stateFilePath}`);
 } catch (error) {
 logger.error('Failed to save project state:', error);
 throw error;
 }
 }

 /**
 * Enable auto-save every N seconds
 */
 enableAutoSave(intervalSeconds: number = 30): void {
 if (this.autoSaveInterval) {
 clearInterval(this.autoSaveInterval);
 }

 this.autoSaveInterval = setInterval(async () => {
 await this.saveState();
 }, intervalSeconds * 1000);

 // Use unref() to prevent blocking process exit
 this.autoSaveInterval.unref();
 }

 /**
 * Disable auto-save
 */
 disableAutoSave(): void {
 if (this.autoSaveInterval) {
 clearInterval(this.autoSaveInterval);
 this.autoSaveInterval = null;
 }
 }

 /**
 * Get current state (read-only copy)
 */
 getState(): Readonly<ProjectState> {
 return { ...this.state };
 }

 /**
 * Update current phase
 */
 setPhase(phase: string): void {
 this.state.currentPhase = phase;
 this.state.lastUpdateTime = Date.now();
 }

 /**
 * Update current task
 */
 setCurrentTask(task: string): void {
 this.state.currentTask = task;
 this.state.lastUpdateTime = Date.now();
 }

 /**
 * Increment iteration count
 */
 incrementIteration(): number {
 this.state.iterationCount++;
 this.state.lastUpdateTime = Date.now();
 return this.state.iterationCount;
 }

 /**
 * Check if max iterations reached
 */
 isMaxIterationsReached(): boolean {
 return this.state.iterationCount >= this.state.maxIterations;
 }

 /**
 * Add file created
 */
 addFileCreated(filePath: string, language?: string): void {
 const fullPath = path.join(this.state.workspaceRoot, filePath);

 if (fs.existsSync(fullPath)) {
 const stats = fs.statSync(fullPath);
 this.state.filesCreated.push({
 path: filePath,
 language,
 size: stats.size,
 timestamp: Date.now()
 });
 }

 this.updateCompletionPercentage();
 }

 /**
 * Add file modified
 */
 addFileModified(filePath: string, language?: string): void {
 const fullPath = path.join(this.state.workspaceRoot, filePath);

 if (fs.existsSync(fullPath)) {
 const stats = fs.statSync(fullPath);
 this.state.filesModified.push({
 path: filePath,
 language,
 size: stats.size,
 timestamp: Date.now()
 });
 }
 }

 /**
 * Add file deleted
 */
 addFileDeleted(filePath: string): void {
 this.state.filesDeleted.push(filePath);
 }

 /**
 * Generate unique project ID
 */
 private generateProjectId(): string {
 return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 }

 /**
 * Update completion percentage based on current state
 */
 private updateCompletionPercentage(): void {
 let percentage = 0;
 let weight = 0;

 // Tasks completion (40% weight)
 if (this.state.tasksTotal > 0) {
 const taskProgress = (this.state.tasksCompleted.length / this.state.tasksTotal) * 40;
 percentage += taskProgress;
 }
 weight += 40;

 // Files created (20% weight)
 if (this.state.completionCriteria.minimumFilesCreated > 0) {
 const fileProgress = Math.min(
 (this.state.filesCreated.length / this.state.completionCriteria.minimumFilesCreated) * 20,
 20
 );
 percentage += fileProgress;
 }
 weight += 20;

 // Dependencies (15% weight)
 if (this.state.dependencies.dependenciesInstalled) {
 percentage += 15;
 }
 weight += 15;

 // Build (15% weight)
 if (this.state.buildStatus.successful) {
 percentage += 15;
 }
 weight += 15;

 // Tests (10% weight)
 if (this.state.testStatus.successful || !this.state.completionCriteria.requireTestsPass) {
 percentage += 10;
 }
 weight += 10;

 this.state.completionPercentage = Math.min(Math.round(percentage), 100);
 }

 /**
 * Set total tasks
 */
 setTotalTasks(total: number): void {
 this.state.tasksTotal = total;
 this.updateCompletionPercentage();
 }

 /**
 * Add task to pending
 */
 addPendingTask(task: TaskStateEntry): void {
 this.state.tasksPending.push(task);
 }

 /**
 * Mark task as started
 */
 startTask(taskId: string): void {
 const task = this.state.tasksPending.find(t => t.id === taskId);
 if (task) {
 task.startTime = Date.now();
 }
 }

 /**
 * Mark task as completed
 */
 completeTask(taskId: string, result?: unknown): void {
 const index = this.state.tasksPending.findIndex(t => t.id === taskId);
 if (index !== -1) {
 const task = this.state.tasksPending.splice(index, 1)[0];
 task.endTime = Date.now();
 task.duration = task.startTime ? task.endTime - task.startTime : 0;
 task.result = result;
 this.state.tasksCompleted.push(task);
 this.updateCompletionPercentage();
 }
 }

 /**
 * Mark task as failed
 */
 failTask(taskId: string, error: string): void {
 const index = this.state.tasksPending.findIndex(t => t.id === taskId);
 if (index !== -1) {
 const task = this.state.tasksPending.splice(index, 1)[0];
 task.endTime = Date.now();
 task.duration = task.startTime ? task.endTime - task.startTime : 0;
 this.state.tasksFailed.push(task);

 this.addError({
 timestamp: Date.now(),
 phase: this.state.currentPhase,
 task: taskId,
 message: error,
 resolved: false
 });
 }
 }

 /**
 * Add error
 */
 addError(error: ErrorEntry): void {
 this.state.errors.push(error);
 }

 /**
 * Add warning
 */
 addWarning(warning: WarningEntry): void {
 this.state.warnings.push(warning);
 }

 /**
 * Mark error as resolved
 */
 resolveError(errorIndex: number, resolution: string): void {
 if (errorIndex >= 0 && errorIndex < this.state.errors.length) {
 this.state.errors[errorIndex].resolved = true;
 this.state.errors[errorIndex].resolution = resolution;
 }
 }

 /**
 * Update dependency state
 */
 updateDependencies(deps: Partial<DependencyState>): void {
 this.state.dependencies = { ...this.state.dependencies, ...deps };
 this.updateCompletionPercentage();
 }

 /**
 * Update build status
 */
 updateBuildStatus(status: Partial<BuildStatus>): void {
 this.state.buildStatus = { ...this.state.buildStatus, ...status };
 this.updateCompletionPercentage();
 }

 /**
 * Update test status
 */
 updateTestStatus(status: Partial<TestStatus>): void {
 this.state.testStatus = { ...this.state.testStatus, ...status };
 this.updateCompletionPercentage();
 }

 /**
 * Check if project is complete based on completion criteria
 */
 checkCompletion(): boolean {
 const criteria = this.state.completionCriteria;

 // Check all tasks complete
 if (criteria.requireAllTasksComplete) {
 if (this.state.tasksCompleted.length < this.state.tasksTotal) {
 return false;
 }
 }

 // Check build success
 if (criteria.requireBuildSuccess) {
 if (!this.state.buildStatus.successful) {
 return false;
 }
 }

 // Check tests pass
 if (criteria.requireTestsPass) {
 if (!this.state.testStatus.successful) {
 return false;
 }
 }

 // Check no dependency errors
 if (criteria.requireNoDependencyErrors) {
 if (this.state.dependencies.installErrors.length > 0) {
 return false;
 }
 }

 // Check minimum files created
 if (this.state.filesCreated.length < criteria.minimumFilesCreated) {
 return false;
 }

 // Check custom criteria
 for (const [key, required] of Object.entries(criteria.customCriteria)) {
 if (required && !this.state.metadata[key]) {
 return false;
 }
 }

 this.state.isComplete = true;
 this.state.endTime = Date.now();
 return true;
 }

 /**
 * Get summary of current state
 */
 getSummary(): string {
 const duration = this.state.endTime
 ? this.state.endTime - this.state.startTime
 : Date.now() - this.state.startTime;

 const durationMinutes = Math.round(duration / 60000);

 return `
Project: ${this.state.projectName}
Status: ${this.state.isComplete ? 'Complete' : 'In Progress'}
Progress: ${this.state.completionPercentage}%
Phase: ${this.state.currentPhase}
Duration: ${durationMinutes} minutes
Iterations: ${this.state.iterationCount}/${this.state.maxIterations}

Files:
 Created: ${this.state.filesCreated.length}
 Modified: ${this.state.filesModified.length}
 Deleted: ${this.state.filesDeleted.length}

Tasks:
 Total: ${this.state.tasksTotal}
 Completed: ${this.state.tasksCompleted.length}
 Pending: ${this.state.tasksPending.length}
 Failed: ${this.state.tasksFailed.length}

Dependencies: ${this.state.dependencies.dependenciesInstalled ? '' : ''}
Build: ${this.state.buildStatus.successful ? '' : this.state.buildStatus.attempted ? '' : '⏳'}
Tests: ${this.state.testStatus.successful ? '' : this.state.testStatus.attempted ? '' : '⏳'}

Errors: ${this.state.errors.filter(e => !e.resolved).length} unresolved
Warnings: ${this.state.warnings.filter(w => !w.acknowledged).length} unacknowledged
 `.trim();
 }

 /**
 * Dispose resources
 */
 dispose(): void {
 this.disableAutoSave();
 }
}

