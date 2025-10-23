/**
 * Specification Manager
 *
 * Coordinates parsing, planning, and execution of specifications.
 * Provides progress tracking, status updates, and VS Code integration.
 */

import * as vscode from 'vscode';
import { SpecificationParser, ParsedSpecification } from './specificationParser';
import { TaskPlanner, ExecutionPlan } from './taskPlanner';
import { SpecificationExecutor, ExecutionResult, ExecutionOptions } from './specificationExecutor';

export interface SpecificationStatus {
 state: SpecificationState;
 specification?: ParsedSpecification;
 plan?: ExecutionPlan;
 result?: ExecutionResult;
 progress: number; // 0-100
 currentPhase?: string;
 currentTask?: string;
 startTime?: number;
 endTime?: number;
}

export enum SpecificationState {
 IDLE = 'idle',
 PARSING = 'parsing',
 PLANNING = 'planning',
 EXECUTING = 'executing',
 COMPLETED = 'completed',
 FAILED = 'failed',
 CANCELLED = 'cancelled'
}

export class SpecificationManager {
 private workspaceRoot: string;
 private outputChannel: vscode.OutputChannel;
 private statusBarItem: vscode.StatusBarItem;
 private parser: SpecificationParser;
 private planner: TaskPlanner;
 private executor: SpecificationExecutor;
 private currentStatus: SpecificationStatus;
 private progressReporter?: vscode.Progress<{ message?: string; increment?: number }>;

 constructor(workspaceRoot: string) {
 this.workspaceRoot = workspaceRoot;
 this.outputChannel = vscode.window.createOutputChannel('Codelicious Specifications');
 this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
 this.parser = new SpecificationParser(workspaceRoot);
 this.planner = new TaskPlanner(workspaceRoot);
 this.executor = new SpecificationExecutor(workspaceRoot, this.outputChannel);
 this.currentStatus = {
 state: SpecificationState.IDLE,
 progress: 0
 };

 this.statusBarItem.text = '$(file-code) Spec: Idle';
 this.statusBarItem.show();
 }

 /**
 * Process a specification from text
 */
 async processSpecification(
 text: string,
 options: ExecutionOptions = {}
 ): Promise<ExecutionResult> {
 return vscode.window.withProgress(
 {
 location: vscode.ProgressLocation.Notification,
 title: 'Processing Specification',
 cancellable: true
 },
 async (progress, token) => {
 this.progressReporter = progress;

 try {
 // Parse
 this.updateStatus(SpecificationState.PARSING, 0);
 progress.report({ message: 'Parsing specification...', increment: 0 });

 const specification = await this.parser.parse(text);
 this.currentStatus.specification = specification;

 progress.report({ increment: 20 });
 this.outputChannel.appendLine(` Parsed specification: ${specification.title}`);
 this.outputChannel.appendLine(` Requirements: ${specification.requirements.length}`);
 this.outputChannel.appendLine(` Tasks: ${specification.tasks.length}`);
 this.outputChannel.appendLine(` Constraints: ${specification.constraints.length}`);
 this.outputChannel.appendLine('');

 // Check for cancellation
 if (token.isCancellationRequested) {
 this.updateStatus(SpecificationState.CANCELLED, 20);
 throw new Error('Cancelled by user');
 }

 // Plan
 this.updateStatus(SpecificationState.PLANNING, 20);
 progress.report({ message: 'Planning execution...', increment: 0 });

 const plan = await this.planner.plan(specification);
 this.currentStatus.plan = plan;

 progress.report({ increment: 20 });
 this.outputChannel.appendLine(` Created execution plan`);
 this.outputChannel.appendLine(` Phases: ${plan.phases.length}`);
 this.outputChannel.appendLine(` Total Time: ${Math.round(plan.totalTime / 60)} hours`);
 this.outputChannel.appendLine(` Critical Path: ${plan.criticalPath.length} tasks`);

 if (plan.warnings.length > 0) {
 this.outputChannel.appendLine(` Warnings:`);
 plan.warnings.forEach(w => this.outputChannel.appendLine(` - ${w}`));
 }
 this.outputChannel.appendLine('');

 // Check for cancellation
 if (token.isCancellationRequested) {
 this.updateStatus(SpecificationState.CANCELLED, 40);
 throw new Error('Cancelled by user');
 }

 // Execute
 this.updateStatus(SpecificationState.EXECUTING, 40);
 progress.report({ message: 'Executing plan...', increment: 0 });

 const result = await this.executor.execute(plan, options);
 this.currentStatus.result = result;

 progress.report({ increment: 40 });

 // Update final status
 if (result.success) {
 this.updateStatus(SpecificationState.COMPLETED, 100);
 vscode.window.showInformationMessage(
 ` Specification completed: ${result.completedTasks.length} tasks`
 );
 } else {
 this.updateStatus(SpecificationState.FAILED, 100);
 vscode.window.showErrorMessage(
 ` Specification failed: ${result.failedTasks.length} tasks failed`
 );
 }

 return result;
 } catch (error) {
 this.updateStatus(SpecificationState.FAILED, 0);
 this.outputChannel.appendLine(`\n Error: ${error}`);

 vscode.window.showErrorMessage(
 `Failed to process specification: ${error instanceof Error ? error.message : String(error)}`
 );

 throw error;
 } finally {
 this.progressReporter = undefined;
 }
 }
 );
 }

 /**
 * Process a specification from a file
 */
 async processSpecificationFile(filePath: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
 const uri = vscode.Uri.file(filePath);
 const document = await vscode.workspace.openTextDocument(uri);
 const text = document.getText();
 return this.processSpecification(text, options);
 }

 /**
 * Parse a specification without executing
 */
 async parseSpecification(text: string): Promise<ParsedSpecification> {
 this.updateStatus(SpecificationState.PARSING, 0);

 try {
 const specification = await this.parser.parse(text);
 this.currentStatus.specification = specification;
 this.updateStatus(SpecificationState.IDLE, 100);
 return specification;
 } catch (error) {
 this.updateStatus(SpecificationState.FAILED, 0);
 throw error;
 }
 }

 /**
 * Create an execution plan without executing
 */
 async planSpecification(specification: ParsedSpecification): Promise<ExecutionPlan> {
 this.updateStatus(SpecificationState.PLANNING, 0);

 try {
 const plan = await this.planner.plan(specification);
 this.currentStatus.plan = plan;
 this.updateStatus(SpecificationState.IDLE, 100);
 return plan;
 } catch (error) {
 this.updateStatus(SpecificationState.FAILED, 0);
 throw error;
 }
 }

 /**
 * Get current status
 */
 getStatus(): SpecificationStatus {
 return { ...this.currentStatus };
 }

 /**
 * Show specification summary
 */
 async showSpecificationSummary(specification: ParsedSpecification): Promise<void> {
 const doc = await vscode.workspace.openTextDocument({
 content: this.formatSpecificationSummary(specification),
 language: 'markdown'
 });
 await vscode.window.showTextDocument(doc);
 }

 /**
 * Show execution plan
 */
 async showExecutionPlan(plan: ExecutionPlan): Promise<void> {
 const doc = await vscode.workspace.openTextDocument({
 content: this.formatExecutionPlan(plan),
 language: 'markdown'
 });
 await vscode.window.showTextDocument(doc);
 }

 /**
 * Show execution result
 */
 async showExecutionResult(result: ExecutionResult): Promise<void> {
 const doc = await vscode.workspace.openTextDocument({
 content: this.formatExecutionResult(result),
 language: 'markdown'
 });
 await vscode.window.showTextDocument(doc);
 }

 /**
 * Update status
 */
 private updateStatus(state: SpecificationState, progress: number): void {
 this.currentStatus.state = state;
 this.currentStatus.progress = progress;

 if (state === SpecificationState.EXECUTING && !this.currentStatus.startTime) {
 this.currentStatus.startTime = Date.now();
 }

 if (state === SpecificationState.COMPLETED || state === SpecificationState.FAILED) {
 this.currentStatus.endTime = Date.now();
 }

 // Update status bar
 const icon = this.getStateIcon(state);
 this.statusBarItem.text = `$(${icon}) Spec: ${state} (${progress}%)`;
 }

 /**
 * Get icon for state
 */
 private getStateIcon(state: SpecificationState): string {
 switch (state) {
 case SpecificationState.IDLE:
 return 'file-code';
 case SpecificationState.PARSING:
 return 'loading~spin';
 case SpecificationState.PLANNING:
 return 'loading~spin';
 case SpecificationState.EXECUTING:
 return 'loading~spin';
 case SpecificationState.COMPLETED:
 return 'check';
 case SpecificationState.FAILED:
 return 'error';
 case SpecificationState.CANCELLED:
 return 'circle-slash';
 default:
 return 'file-code';
 }
 }

 /**
 * Format specification summary
 */
 private formatSpecificationSummary(spec: ParsedSpecification): string {
 let md = `# ${spec.title}\n\n`;
 md += `${spec.description}\n\n`;
 md += `---\n\n`;
 md += `## Metadata\n\n`;
 md += `- **Version**: ${spec.metadata.version}\n`;
 md += `- **Complexity**: ${spec.metadata.complexity}/10\n`;
 md += `- **Created**: ${new Date(spec.metadata.created).toLocaleString()}\n\n`;
 md += `## Requirements (${spec.requirements.length})\n\n`;
 spec.requirements.forEach((req, i) => {
 md += `${i + 1}. **[${req.priority}]** ${req.description}\n`;
 });
 md += `\n## Tasks (${spec.tasks.length})\n\n`;
 spec.tasks.forEach((task, i) => {
 md += `${i + 1}. **${task.name}** (${task.type}, ${task.estimatedTime}min)\n`;
 md += ` - ${task.description}\n`;
 });
 md += `\n## Constraints (${spec.constraints.length})\n\n`;
 spec.constraints.forEach((constraint, i) => {
 md += `${i + 1}. **[${constraint.type}]** ${constraint.description}\n`;
 });
 return md;
 }

 /**
 * Format execution plan
 */
 private formatExecutionPlan(plan: ExecutionPlan): string {
 let md = `# Execution Plan\n\n`;
 md += `- **Total Time**: ${Math.round(plan.totalTime / 60)} hours\n`;
 md += `- **Phases**: ${plan.phases.length}\n`;
 md += `- **Critical Path**: ${plan.criticalPath.length} tasks\n\n`;

 if (plan.warnings.length > 0) {
 md += `## Warnings\n\n`;
 plan.warnings.forEach(w => md += `- ${w}\n`);
 md += `\n`;
 }

 md += `## Phases\n\n`;
 plan.phases.forEach((phase, i) => {
 md += `### Phase ${i + 1}: ${phase.name}\n\n`;
 md += `- **Tasks**: ${phase.tasks.length}\n`;
 md += `- **Estimated Time**: ${Math.round(phase.estimatedTime / 60)} hours\n\n`;
 phase.tasks.forEach((task, j) => {
 md += `${j + 1}. **${task.name}** (${task.estimatedTime}min)\n`;
 });
 md += `\n`;
 });

 return md;
 }

 /**
 * Format execution result
 */
 private formatExecutionResult(result: ExecutionResult): string {
 let md = `# Execution Result\n\n`;
 md += `- **Status**: ${result.success ? ' SUCCESS' : ' FAILED'}\n`;
 md += `- **Duration**: ${(result.duration / 1000).toFixed(2)}s\n`;
 md += `- **Completed**: ${result.completedTasks.length}\n`;
 md += `- **Failed**: ${result.failedTasks.length}\n`;
 md += `- **Skipped**: ${result.skippedTasks.length}\n\n`;

 if (result.errors.length > 0) {
 md += `## Errors\n\n`;
 result.errors.forEach((error, i) => {
 md += `${i + 1}. **Task ${error.taskId}**: ${error.message}\n`;
 });
 md += `\n`;
 }

 if (result.artifacts.length > 0) {
 md += `## Artifacts\n\n`;
 result.artifacts.forEach((artifact, i) => {
 md += `${i + 1}. **${artifact.type}**: ${artifact.path} (${artifact.size} bytes)\n`;
 });
 }

 return md;
 }

 /**
 * Dispose resources
 */
 dispose(): void {
 this.outputChannel.dispose();
 this.statusBarItem.dispose();
 }
}

