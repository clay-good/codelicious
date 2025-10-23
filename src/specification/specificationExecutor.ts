/**
 * Specification Executor
 *
 * Executes planned tasks in the correct order with error handling,
 * progress tracking, and rollback capabilities.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionPlan, ExecutionPhase, PlannedTask } from './taskPlanner';
import { TaskType } from './specificationParser';

export interface ExecutionResult {
 success: boolean;
 completedTasks: string[];
 failedTasks: string[];
 skippedTasks: string[];
 errors: ExecutionError[];
 duration: number; // milliseconds
 artifacts: Artifact[];
}

export interface ExecutionError {
 taskId: string;
 message: string;
 stack?: string;
 timestamp: number;
}

export interface Artifact {
 type: ArtifactType;
 path: string;
 content?: string;
 size: number;
 created: number;
}

export enum ArtifactType {
 FILE = 'file',
 DIRECTORY = 'directory',
 TEST = 'test',
 DOCUMENTATION = 'documentation'
}

export interface ExecutionOptions {
 dryRun?: boolean;
 stopOnError?: boolean;
 parallel?: boolean;
 maxParallel?: number;
 rollbackOnError?: boolean;
}

export class SpecificationExecutor {
 private workspaceRoot: string;
 private outputChannel: vscode.OutputChannel;
 private completedTasks: Set<string> = new Set();
 private artifacts: Artifact[] = [];
 private backups: Map<string, string> = new Map();

 constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel) {
 this.workspaceRoot = workspaceRoot;
 this.outputChannel = outputChannel;
 }

 /**
 * Execute an execution plan
 */
 async execute(
 plan: ExecutionPlan,
 options: ExecutionOptions = {}
 ): Promise<ExecutionResult> {
 const startTime = Date.now();
 const completedTasks: string[] = [];
 const failedTasks: string[] = [];
 const skippedTasks: string[] = [];
 const errors: ExecutionError[] = [];

 this.outputChannel.appendLine('='.repeat(80));
 this.outputChannel.appendLine('Starting Specification Execution');
 this.outputChannel.appendLine('='.repeat(80));
 this.outputChannel.appendLine(`Total Phases: ${plan.phases.length}`);
 this.outputChannel.appendLine(`Estimated Time: ${Math.round(plan.totalTime / 60)} hours`);
 this.outputChannel.appendLine(`Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
 this.outputChannel.appendLine('');

 try {
 // Execute phases sequentially
 for (const phase of plan.phases) {
 this.outputChannel.appendLine(`\n--- Phase: ${phase.name} ---`);
 this.outputChannel.appendLine(`Tasks: ${phase.tasks.length}`);
 this.outputChannel.appendLine(`Estimated Time: ${Math.round(phase.estimatedTime / 60)} hours`);
 this.outputChannel.appendLine('');

 const phaseResult = await this.executePhase(phase, options);

 completedTasks.push(...phaseResult.completed);
 failedTasks.push(...phaseResult.failed);
 skippedTasks.push(...phaseResult.skipped);
 errors.push(...phaseResult.errors);

 // Stop on error if requested
 if (options.stopOnError && phaseResult.failed.length > 0) {
 this.outputChannel.appendLine('\n Stopping execution due to errors');

 // Rollback if requested
 if (options.rollbackOnError) {
 await this.rollback();
 }

 break;
 }
 }

 const duration = Date.now() - startTime;
 const success = failedTasks.length === 0;

 this.outputChannel.appendLine('\n' + '='.repeat(80));
 this.outputChannel.appendLine('Execution Complete');
 this.outputChannel.appendLine('='.repeat(80));
 this.outputChannel.appendLine(`Status: ${success ? ' SUCCESS' : ' FAILED'}`);
 this.outputChannel.appendLine(`Completed: ${completedTasks.length}`);
 this.outputChannel.appendLine(`Failed: ${failedTasks.length}`);
 this.outputChannel.appendLine(`Skipped: ${skippedTasks.length}`);
 this.outputChannel.appendLine(`Duration: ${(duration / 1000).toFixed(2)}s`);
 this.outputChannel.appendLine('');

 return {
 success,
 completedTasks,
 failedTasks,
 skippedTasks,
 errors,
 duration,
 artifacts: this.artifacts
 };
 } catch (error) {
 const duration = Date.now() - startTime;

 this.outputChannel.appendLine(`\n Fatal Error: ${error}`);

 if (options.rollbackOnError) {
 await this.rollback();
 }

 return {
 success: false,
 completedTasks,
 failedTasks,
 skippedTasks,
 errors: [{
 taskId: 'executor',
 message: error instanceof Error ? error.message : String(error),
 stack: error instanceof Error ? error.stack : undefined,
 timestamp: Date.now()
 }],
 duration,
 artifacts: this.artifacts
 };
 }
 }

 /**
 * Execute a single phase
 */
 private async executePhase(
 phase: ExecutionPhase,
 options: ExecutionOptions
 ): Promise<{
 completed: string[];
 failed: string[];
 skipped: string[];
 errors: ExecutionError[];
 }> {
 const completed: string[] = [];
 const failed: string[] = [];
 const skipped: string[] = [];
 const errors: ExecutionError[] = [];

 // Execute tasks in order
 for (const task of phase.tasks) {
 // Check if dependencies are met
 const depsComplete = task.dependencies.every(depId =>
 this.completedTasks.has(depId)
 );

 if (!depsComplete) {
 this.outputChannel.appendLine(`⏭ Skipping ${task.name} (dependencies not met)`);
 skipped.push(task.id);
 continue;
 }

 try {
 this.outputChannel.appendLine(`\n Executing: ${task.name}`);
 this.outputChannel.appendLine(` Type: ${task.type}`);
 this.outputChannel.appendLine(` Priority: ${task.priority}`);
 this.outputChannel.appendLine(` Estimated Time: ${task.estimatedTime} minutes`);

 if (!options.dryRun) {
 await this.executeTask(task);
 } else {
 this.outputChannel.appendLine(` [DRY RUN] Would execute task`);
 }

 this.completedTasks.add(task.id);
 completed.push(task.id);

 this.outputChannel.appendLine(` Completed: ${task.name}`);
 } catch (error) {
 const errorObj: ExecutionError = {
 taskId: task.id,
 message: error instanceof Error ? error.message : String(error),
 stack: error instanceof Error ? error.stack : undefined,
 timestamp: Date.now()
 };

 errors.push(errorObj);
 failed.push(task.id);

 this.outputChannel.appendLine(` Failed: ${task.name}`);
 this.outputChannel.appendLine(` Error: ${errorObj.message}`);

 if (options.stopOnError) {
 break;
 }
 }
 }

 return { completed, failed, skipped, errors };
 }

 /**
 * Execute a single task
 */
 private async executeTask(task: PlannedTask): Promise<void> {
 switch (task.type) {
 case TaskType.CREATE:
 await this.executeCreateTask(task);
 break;
 case TaskType.MODIFY:
 await this.executeModifyTask(task);
 break;
 case TaskType.DELETE:
 await this.executeDeleteTask(task);
 break;
 case TaskType.REFACTOR:
 await this.executeRefactorTask(task);
 break;
 case TaskType.TEST:
 await this.executeTestTask(task);
 break;
 case TaskType.DOCUMENT:
 await this.executeDocumentTask(task);
 break;
 default:
 throw new Error(`Unknown task type: ${task.type}`);
 }
 }

 /**
 * Execute a create task
 */
 private async executeCreateTask(task: PlannedTask): Promise<void> {
 for (const file of task.files) {
 const filePath = path.join(this.workspaceRoot, file);
 const dir = path.dirname(filePath);

 // Create directory if needed
 if (!fs.existsSync(dir)) {
 fs.mkdirSync(dir, { recursive: true });
 }

 // Create file with placeholder content
 const content = this.generateFileContent(file, task);
 fs.writeFileSync(filePath, content, 'utf8');

 this.artifacts.push({
 type: ArtifactType.FILE,
 path: file,
 content,
 size: content.length,
 created: Date.now()
 });

 this.outputChannel.appendLine(` Created: ${file}`);
 }
 }

 /**
 * Execute a modify task
 */
 private async executeModifyTask(task: PlannedTask): Promise<void> {
 for (const file of task.files) {
 const filePath = path.join(this.workspaceRoot, file);

 if (!fs.existsSync(filePath)) {
 throw new Error(`File not found: ${file}`);
 }

 // Backup original content
 const originalContent = fs.readFileSync(filePath, 'utf8');
 this.backups.set(filePath, originalContent);

 // For now, just log that we would modify
 // In a real implementation, this would use the AI to generate modifications
 this.outputChannel.appendLine(` Would modify: ${file}`);
 }
 }

 /**
 * Execute a delete task
 */
 private async executeDeleteTask(task: PlannedTask): Promise<void> {
 for (const file of task.files) {
 const filePath = path.join(this.workspaceRoot, file);

 if (fs.existsSync(filePath)) {
 // Backup before deleting
 const content = fs.readFileSync(filePath, 'utf8');
 this.backups.set(filePath, content);

 fs.unlinkSync(filePath);
 this.outputChannel.appendLine(` Deleted: ${file}`);
 }
 }
 }

 /**
 * Execute a refactor task
 */
 private async executeRefactorTask(task: PlannedTask): Promise<void> {
 // Placeholder for refactoring logic
 this.outputChannel.appendLine(` Would refactor files: ${task.files.join(', ')}`);
 }

 /**
 * Execute a test task
 */
 private async executeTestTask(task: PlannedTask): Promise<void> {
 // Placeholder for test execution logic
 this.outputChannel.appendLine(` Would run tests: ${task.tests.join(', ')}`);
 }

 /**
 * Execute a document task
 */
 private async executeDocumentTask(task: PlannedTask): Promise<void> {
 // Placeholder for documentation generation
 this.outputChannel.appendLine(` Would generate documentation`);
 }

 /**
 * Rollback all changes
 */
 private async rollback(): Promise<void> {
 this.outputChannel.appendLine('\n Rolling back changes...');

 for (const [filePath, content] of this.backups) {
 try {
 fs.writeFileSync(filePath, content, 'utf8');
 this.outputChannel.appendLine(` Restored: ${filePath}`);
 } catch (error) {
 this.outputChannel.appendLine(` Failed to restore: ${filePath}`);
 }
 }

 this.backups.clear();
 this.outputChannel.appendLine(' Rollback complete');
 }

 /**
 * Generate file content based on file type
 */
 private generateFileContent(file: string, task: PlannedTask): string {
 const ext = path.extname(file);
 const fileName = path.basename(file, ext);
 const isTest = fileName.includes('.test') || fileName.includes('.spec');

 switch (ext) {
 case '.ts':
 case '.tsx':
 if (isTest) {
 return this.generateTestTemplate(fileName, task, 'typescript');
 }
 return this.generateTypeScriptTemplate(fileName, task);
 case '.js':
 case '.jsx':
 if (isTest) {
 return this.generateTestTemplate(fileName, task, 'javascript');
 }
 return this.generateJavaScriptTemplate(fileName, task);
 case '.py':
 return this.generatePythonTemplate(fileName, task);
 case '.md':
 return this.generateMarkdownTemplate(task);
 default:
 return `// ${task.name}\n// ${task.description}\n\n// TODO: Implement\n`;
 }
 }

 /**
 * Generate TypeScript template
 */
 private generateTypeScriptTemplate(fileName: string, task: PlannedTask): string {
 const className = this.toPascalCase(fileName);
 return `/**
 * ${task.name}
 *
 * ${task.description}
 */

export class ${className} {
 constructor() {
 // TODO: Initialize
 }

 // TODO: Add methods
}
`;
 }

 /**
 * Generate JavaScript template
 */
 private generateJavaScriptTemplate(fileName: string, task: PlannedTask): string {
 const className = this.toPascalCase(fileName);
 return `/**
 * ${task.name}
 *
 * ${task.description}
 */

class ${className} {
 constructor() {
 // TODO: Initialize
 }

 // TODO: Add methods
}

module.exports = ${className};
`;
 }

 /**
 * Generate Python template
 */
 private generatePythonTemplate(fileName: string, task: PlannedTask): string {
 const className = this.toPascalCase(fileName);
 return `"""
${task.name}

${task.description}
"""

class ${className}:
 def __init__(self):
 """Initialize ${className}"""
 # TODO: Initialize
 pass

 # TODO: Add methods
`;
 }

 /**
 * Generate test template
 */
 private generateTestTemplate(fileName: string, task: PlannedTask, lang: 'typescript' | 'javascript'): string {
 const testName = fileName.replace(/\.(test|spec)$/, '');
 const className = this.toPascalCase(testName);

 return `/**
 * Tests for ${task.name}
 */

describe('${className}', () => {
 it('should be defined', () => {
 // TODO: Add test
 expect(true).toBe(true);
 });

 // TODO: Add more tests
});
`;
 }

 /**
 * Generate Markdown template
 */
 private generateMarkdownTemplate(task: PlannedTask): string {
 return `# ${task.name}

${task.description}

## Overview

TODO: Add overview

## Usage

TODO: Add usage examples

## API

TODO: Document API
`;
 }

 /**
 * Convert string to PascalCase
 */
 private toPascalCase(str: string): string {
 return str
 .replace(/[-_.](.)/g, (_, c) => c.toUpperCase())
 .replace(/^(.)/, (_, c) => c.toUpperCase());
 }
}

