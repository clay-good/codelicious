"use strict";
/**
 * Git Manager - Coordinate all Git-related operations
 * Provides high-level interface for Git integration features
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
exports.GitManager = void 0;
const vscode = __importStar(require("vscode"));
const gitService_1 = require("./gitService");
const commitMessageGenerator_1 = require("./commitMessageGenerator");
const prDescriptionGenerator_1 = require("./prDescriptionGenerator");
const changeAnalyzer_1 = require("./changeAnalyzer");
class GitManager {
    constructor(workspaceRoot, modelOrchestrator) {
        this.workspaceRoot = workspaceRoot;
        this.modelOrchestrator = modelOrchestrator;
        this.gitService = new gitService_1.GitService(workspaceRoot);
        this.commitGenerator = new commitMessageGenerator_1.CommitMessageGenerator(this.gitService, modelOrchestrator);
        this.prGenerator = new prDescriptionGenerator_1.PRDescriptionGenerator(this.gitService, modelOrchestrator);
        this.changeAnalyzer = new changeAnalyzer_1.ChangeAnalyzer(this.gitService, modelOrchestrator);
        this.outputChannel = vscode.window.createOutputChannel('Codelicious Git');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.text = '$(git-branch) Git';
        this.statusBarItem.tooltip = 'Codelicious Git Integration';
    }
    /**
    * Initialize Git manager
    */
    async initialize() {
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
    async generateCommitMessage(options) {
        this.outputChannel.appendLine('Generating commit message...');
        try {
            const message = await this.commitGenerator.generateCommitMessage(options);
            this.outputChannel.appendLine(`Generated: ${message.subject}`);
            return message;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
            throw error;
        }
    }
    /**
    * Generate multiple commit message suggestions
    */
    async generateCommitSuggestions(count = 3, options) {
        this.outputChannel.appendLine(`Generating ${count} commit message suggestions...`);
        try {
            const suggestions = await this.commitGenerator.generateSuggestions(count, options);
            this.outputChannel.appendLine(`Generated ${suggestions.length} suggestions`);
            return suggestions;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
            throw error;
        }
    }
    /**
    * Show commit message picker and commit
    */
    async showCommitMessagePicker() {
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
                    message: null
                });
                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a commit message or write custom',
                    matchOnDescription: true,
                    matchOnDetail: true
                });
                if (!selected) {
                    return;
                }
                let commitMessage;
                if (selected.message) {
                    commitMessage = selected.message.full;
                }
                else {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to commit: ${errorMessage}`);
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
        }
    }
    /**
    * Generate PR description
    */
    async generatePRDescription(options) {
        this.outputChannel.appendLine('Generating PR description...');
        try {
            const description = await this.prGenerator.generatePRDescription(options);
            this.outputChannel.appendLine(`Generated: ${description.title}`);
            return description;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
            throw error;
        }
    }
    /**
    * Show PR description in editor
    */
    async showPRDescription() {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to generate PR description: ${errorMessage}`);
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
        }
    }
    /**
    * Analyze staged changes
    */
    async analyzeStagedChanges() {
        this.outputChannel.appendLine('Analyzing staged changes...');
        try {
            const analysis = await this.changeAnalyzer.analyzeStagedChanges();
            this.outputChannel.appendLine(`Impact: ${analysis.impact}, Risk: ${analysis.risk}`);
            return analysis;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
            throw error;
        }
    }
    /**
    * Show change analysis report
    */
    async showChangeAnalysis() {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to analyze changes: ${errorMessage}`);
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
        }
    }
    /**
    * Get Git service
    */
    getGitService() {
        return this.gitService;
    }
    /**
    * Dispose resources
    */
    dispose() {
        this.gitService.dispose();
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }
}
exports.GitManager = GitManager;
//# sourceMappingURL=gitManager.js.map