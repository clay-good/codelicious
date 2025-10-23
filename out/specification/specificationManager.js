"use strict";
/**
 * Specification Manager
 *
 * Coordinates parsing, planning, and execution of specifications.
 * Provides progress tracking, status updates, and VS Code integration.
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
exports.SpecificationManager = exports.SpecificationState = void 0;
const vscode = __importStar(require("vscode"));
const specificationParser_1 = require("./specificationParser");
const taskPlanner_1 = require("./taskPlanner");
const specificationExecutor_1 = require("./specificationExecutor");
var SpecificationState;
(function (SpecificationState) {
    SpecificationState["IDLE"] = "idle";
    SpecificationState["PARSING"] = "parsing";
    SpecificationState["PLANNING"] = "planning";
    SpecificationState["EXECUTING"] = "executing";
    SpecificationState["COMPLETED"] = "completed";
    SpecificationState["FAILED"] = "failed";
    SpecificationState["CANCELLED"] = "cancelled";
})(SpecificationState || (exports.SpecificationState = SpecificationState = {}));
class SpecificationManager {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = vscode.window.createOutputChannel('Codelicious Specifications');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.parser = new specificationParser_1.SpecificationParser(workspaceRoot);
        this.planner = new taskPlanner_1.TaskPlanner(workspaceRoot);
        this.executor = new specificationExecutor_1.SpecificationExecutor(workspaceRoot, this.outputChannel);
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
    async processSpecification(text, options = {}) {
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Processing Specification',
            cancellable: true
        }, async (progress, token) => {
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
                    vscode.window.showInformationMessage(` Specification completed: ${result.completedTasks.length} tasks`);
                }
                else {
                    this.updateStatus(SpecificationState.FAILED, 100);
                    vscode.window.showErrorMessage(` Specification failed: ${result.failedTasks.length} tasks failed`);
                }
                return result;
            }
            catch (error) {
                this.updateStatus(SpecificationState.FAILED, 0);
                this.outputChannel.appendLine(`\n Error: ${error}`);
                vscode.window.showErrorMessage(`Failed to process specification: ${error instanceof Error ? error.message : String(error)}`);
                throw error;
            }
            finally {
                this.progressReporter = undefined;
            }
        });
    }
    /**
    * Process a specification from a file
    */
    async processSpecificationFile(filePath, options = {}) {
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        const text = document.getText();
        return this.processSpecification(text, options);
    }
    /**
    * Parse a specification without executing
    */
    async parseSpecification(text) {
        this.updateStatus(SpecificationState.PARSING, 0);
        try {
            const specification = await this.parser.parse(text);
            this.currentStatus.specification = specification;
            this.updateStatus(SpecificationState.IDLE, 100);
            return specification;
        }
        catch (error) {
            this.updateStatus(SpecificationState.FAILED, 0);
            throw error;
        }
    }
    /**
    * Create an execution plan without executing
    */
    async planSpecification(specification) {
        this.updateStatus(SpecificationState.PLANNING, 0);
        try {
            const plan = await this.planner.plan(specification);
            this.currentStatus.plan = plan;
            this.updateStatus(SpecificationState.IDLE, 100);
            return plan;
        }
        catch (error) {
            this.updateStatus(SpecificationState.FAILED, 0);
            throw error;
        }
    }
    /**
    * Get current status
    */
    getStatus() {
        return { ...this.currentStatus };
    }
    /**
    * Show specification summary
    */
    async showSpecificationSummary(specification) {
        const doc = await vscode.workspace.openTextDocument({
            content: this.formatSpecificationSummary(specification),
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    }
    /**
    * Show execution plan
    */
    async showExecutionPlan(plan) {
        const doc = await vscode.workspace.openTextDocument({
            content: this.formatExecutionPlan(plan),
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    }
    /**
    * Show execution result
    */
    async showExecutionResult(result) {
        const doc = await vscode.workspace.openTextDocument({
            content: this.formatExecutionResult(result),
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    }
    /**
    * Update status
    */
    updateStatus(state, progress) {
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
    getStateIcon(state) {
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
    formatSpecificationSummary(spec) {
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
    formatExecutionPlan(plan) {
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
    formatExecutionResult(result) {
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
    dispose() {
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }
}
exports.SpecificationManager = SpecificationManager;
//# sourceMappingURL=specificationManager.js.map