/**
 * Git Manager - Coordinate all Git-related operations
 * Provides high-level interface for Git integration features
 */

import * as vscode from 'vscode';
import { GitService } from './gitService';
import { CommitMessageGenerator, GeneratedCommitMessage, CommitMessageOptions } from './commitMessageGenerator';
import { PRDescriptionGenerator, GeneratedPRDescription, PRDescriptionOptions } from './prDescriptionGenerator';
import { ChangeAnalyzer, ChangeAnalysis } from './changeAnalyzer';
import { ModelOrchestrator } from '../models/orchestrator';

export class GitManager {
 private gitService: GitService;
 private commitGenerator: CommitMessageGenerator;
 private prGenerator: PRDescriptionGenerator;
 private changeAnalyzer: ChangeAnalyzer;
 private outputChannel: vscode.OutputChannel;
 private statusBarItem: vscode.StatusBarItem;

 constructor(
 private workspaceRoot: string,
 private modelOrchestrator: ModelOrchestrator
 ) {
 this.gitService = new GitService(workspaceRoot);
 this.commitGenerator = new CommitMessageGenerator(this.gitService, modelOrchestrator);
 this.prGenerator = new PRDescriptionGenerator(this.gitService, modelOrchestrator);
 this.changeAnalyzer = new ChangeAnalyzer(this.gitService, modelOrchestrator);
 this.outputChannel = vscode.window.createOutputChannel('Codelicious Git');
 this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
 this.statusBarItem.text = '$(git-branch) Git';
 this.statusBarItem.tooltip = 'Codelicious Git Integration';
 }

 /**
 * Initialize Git manager
 */
 async initialize(): Promise<void> {
 const isRepo = await this.gitService.isGitRepository();
 if (!isRepo) {
 this.outputChannel.appendLine('Not a Git repository');
 return;
 }

 this.statusBarItem.show();
 this.outputChannel.appendLine('Git integration initialized');

 // Update status bar with current branch
 const branch = await this.gitService.getCurrentBranch();
 this.statusBarItem.text = `$(git-branch) ${branch}`;
 }

 /**
 * Generate commit message for staged changes
 */
 async generateCommitMessage(options?: CommitMessageOptions): Promise<GeneratedCommitMessage> {
 this.outputChannel.appendLine('Generating commit message...');

 try {
 const message = await this.commitGenerator.generateCommitMessage(options);
 this.outputChannel.appendLine(`Generated: ${message.subject}`);
 return message;
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 this.outputChannel.appendLine(`Error: ${errorMessage}`);
 throw error;
 }
 }

 /**
 * Generate multiple commit message suggestions
 */
 async generateCommitSuggestions(count: number = 3, options?: CommitMessageOptions): Promise<GeneratedCommitMessage[]> {
 this.outputChannel.appendLine(`Generating ${count} commit message suggestions...`);

 try {
 const suggestions = await this.commitGenerator.generateSuggestions(count, options);
 this.outputChannel.appendLine(`Generated ${suggestions.length} suggestions`);
 return suggestions;
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 this.outputChannel.appendLine(`Error: ${errorMessage}`);
 throw error;
 }
 }

 /**
 * Show commit message picker and commit
 */
 async showCommitMessagePicker(): Promise<void> {
 try {
 // Check for staged changes
 const status = await this.gitService.getStatus();
 if (status.staged.length === 0) {
 vscode.window.showWarningMessage('No staged changes to commit');
 return;
 }

 // Generate suggestions
 await vscode.window.withProgress({
 location: vscode.ProgressLocation.Notification,
 title: 'Generating commit messages...',
 cancellable: false
 }, async () => {
 const suggestions = await this.generateCommitSuggestions(3);

 // Show quick pick
 const items = suggestions.map(s => ({
 label: s.subject,
 description: s.body?.substring(0, 100),
 detail: s.full,
 message: s
 }));

 items.push({
 label: '$(edit) Custom message',
 description: 'Write your own commit message',
 detail: '',
 message: null as any
 });

 const selected = await vscode.window.showQuickPick(items, {
 placeHolder: 'Select a commit message or write custom',
 matchOnDescription: true,
 matchOnDetail: true
 });

 if (!selected) {
 return;
 }

 let commitMessage: string;

 if (selected.message) {
 commitMessage = selected.message.full;
 } else {
 // Show input box for custom message
 const custom = await vscode.window.showInputBox({
 prompt: 'Enter commit message',
 placeHolder: 'feat: add new feature',
 validateInput: (value) => {
 if (!value || value.trim().length === 0) {
 return 'Commit message cannot be empty';
 }
 return null;
 }
 });

 if (!custom) {
 return;
 }

 commitMessage = custom;
 }

 // Commit
 const hash = await this.gitService.commit(commitMessage);
 vscode.window.showInformationMessage(`Committed: ${hash.substring(0, 7)}`);
 this.outputChannel.appendLine(`Committed: ${hash}`);
 });
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 vscode.window.showErrorMessage(`Failed to commit: ${errorMessage}`);
 this.outputChannel.appendLine(`Error: ${errorMessage}`);
 }
 }

 /**
 * Generate PR description
 */
 async generatePRDescription(options?: PRDescriptionOptions): Promise<GeneratedPRDescription> {
 this.outputChannel.appendLine('Generating PR description...');

 try {
 const description = await this.prGenerator.generatePRDescription(options);
 this.outputChannel.appendLine(`Generated: ${description.title}`);
 return description;
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 this.outputChannel.appendLine(`Error: ${errorMessage}`);
 throw error;
 }
 }

 /**
 * Show PR description in editor
 */
 async showPRDescription(): Promise<void> {
 try {
 await vscode.window.withProgress({
 location: vscode.ProgressLocation.Notification,
 title: 'Generating PR description...',
 cancellable: false
 }, async () => {
 const description = await this.generatePRDescription();

 // Create new document with PR description
 const doc = await vscode.workspace.openTextDocument({
 content: description.full,
 language: 'markdown'
 });

 await vscode.window.showTextDocument(doc);
 vscode.window.showInformationMessage('PR description generated!');
 });
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 vscode.window.showErrorMessage(`Failed to generate PR description: ${errorMessage}`);
 this.outputChannel.appendLine(`Error: ${errorMessage}`);
 }
 }

 /**
 * Analyze staged changes
 */
 async analyzeStagedChanges(): Promise<ChangeAnalysis> {
 this.outputChannel.appendLine('Analyzing staged changes...');

 try {
 const analysis = await this.changeAnalyzer.analyzeStagedChanges();
 this.outputChannel.appendLine(`Impact: ${analysis.impact}, Risk: ${analysis.risk}`);
 return analysis;
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 this.outputChannel.appendLine(`Error: ${errorMessage}`);
 throw error;
 }
 }

 /**
 * Show change analysis report
 */
 async showChangeAnalysis(): Promise<void> {
 try {
 await vscode.window.withProgress({
 location: vscode.ProgressLocation.Notification,
 title: 'Analyzing changes...',
 cancellable: false
 }, async () => {
 const analysis = await this.analyzeStagedChanges();

 // Format report
 let report = '# Change Analysis Report\n\n';
 report += `**Impact**: ${analysis.impact.toUpperCase()}\n`;
 report += `**Risk**: ${analysis.risk.toUpperCase()}\n\n`;
 report += `## Summary\n\n${analysis.summary}\n\n`;
 report += `## Metrics\n\n`;
 report += `- Files changed: ${analysis.metrics.filesChanged}\n`;
 report += `- Lines added: ${analysis.metrics.linesAdded}\n`;
 report += `- Lines deleted: ${analysis.metrics.linesDeleted}\n`;
 report += `- Complexity: ${analysis.metrics.complexity}/100\n`;
 report += `- Test coverage: ${analysis.metrics.testCoverage ? 'Yes' : 'No'}\n`;
 report += `- Breaking changes: ${analysis.metrics.hasBreakingChanges ? 'Yes' : 'No'}\n\n`;

 if (analysis.affectedAreas.length > 0) {
 report += `## Affected Areas\n\n`;
 for (const area of analysis.affectedAreas) {
 report += `- ${area}\n`;
 }
 report += '\n';
 }

 if (analysis.warnings.length > 0) {
 report += `## Warnings\n\n`;
 for (const warning of analysis.warnings) {
 report += `- ${warning}\n`;
 }
 report += '\n';
 }

 if (analysis.suggestions.length > 0) {
 report += `## Suggestions\n\n`;
 for (const suggestion of analysis.suggestions) {
 report += `- ${suggestion}\n`;
 }
 }

 // Show in editor
 const doc = await vscode.workspace.openTextDocument({
 content: report,
 language: 'markdown'
 });

 await vscode.window.showTextDocument(doc);
 });
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 vscode.window.showErrorMessage(`Failed to analyze changes: ${errorMessage}`);
 this.outputChannel.appendLine(`Error: ${errorMessage}`);
 }
 }

 /**
 * Get Git service
 */
 getGitService(): GitService {
 return this.gitService;
 }

 /**
 * Dispose resources
 */
 dispose(): void {
 this.gitService.dispose();
 this.outputChannel.dispose();
 this.statusBarItem.dispose();
 }
}

