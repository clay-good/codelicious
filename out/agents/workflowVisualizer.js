"use strict";
/**
 * Workflow Visualizer - Real-time visualization of multi-agent workflows
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
exports.WorkflowVisualizer = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Visualizes multi-agent workflow progress in real-time
 */
class WorkflowVisualizer {
    constructor(context, options = {}) {
        this.context = context;
        this.workflows = new Map();
        this.tasks = new Map();
        this.options = {
            showNotifications: options.showNotifications ?? true,
            autoOpen: options.autoOpen ?? true,
            updateInterval: options.updateInterval ?? 500
        };
        this.outputChannel = vscode.window.createOutputChannel('Codelicious Workflow');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'codelicious.showWorkflowVisualization';
        this.context.subscriptions.push(this.statusBarItem);
    }
    /**
    * Start tracking a new workflow
    */
    startWorkflow(workflow) {
        const progress = {
            workflowId: workflow.id,
            totalTasks: workflow.tasks?.length || 0,
            completedTasks: 0,
            failedTasks: 0,
            status: 'running',
            startTime: Date.now(),
            errorRecoveryAttempts: 0,
            errorRecoverySuccesses: 0
        };
        this.workflows.set(workflow.id, progress);
        // Initialize task progress
        if (workflow.tasks) {
            for (const task of workflow.tasks) {
                const t = task; // Workflow task structure
                this.tasks.set(t.id, {
                    taskId: t.id,
                    name: t.name,
                    status: t.status
                });
            }
        }
        // Update status bar
        this.updateStatusBar();
        // Show notification
        if (this.options.showNotifications) {
            vscode.window.showInformationMessage(` Started workflow: ${workflow.name || workflow.id}`);
        }
        // Auto-open visualization
        if (this.options.autoOpen) {
            this.show();
        }
        // Log to output channel
        this.outputChannel.appendLine(`\n${'='.repeat(80)}`);
        this.outputChannel.appendLine(` WORKFLOW STARTED: ${workflow.name || workflow.id}`);
        this.outputChannel.appendLine(`${'='.repeat(80)}`);
        this.outputChannel.appendLine(`Total Tasks: ${workflow.tasks?.length || 0}`);
        this.outputChannel.appendLine(`Started: ${new Date().toLocaleTimeString()}`);
        this.outputChannel.appendLine('');
    }
    /**
    * Update task status
    */
    updateTask(workflowId, taskId, status, details) {
        const workflow = this.workflows.get(workflowId);
        const task = this.tasks.get(taskId);
        if (!workflow || !task) {
            return;
        }
        const previousStatus = task.status;
        task.status = status;
        // Update timing
        if (status === 'running' && !task.startTime) {
            task.startTime = Date.now();
            workflow.currentTask = task.name;
        }
        else if ((status === 'completed' || status === 'failed') && task.startTime) {
            task.endTime = Date.now();
            task.duration = task.endTime - task.startTime;
        }
        // Update details
        if (details) {
            if (details.error)
                task.error = details.error;
            if (details.output)
                task.output = details.output;
            if (details.retries !== undefined)
                task.retries = details.retries;
        }
        // Update workflow progress
        if (status === 'completed' && previousStatus !== 'completed') {
            workflow.completedTasks++;
        }
        else if (status === 'failed' && previousStatus !== 'failed') {
            workflow.failedTasks++;
        }
        // Log to output channel
        const icon = this.getStatusIcon(status);
        const duration = task.duration ? ` (${task.duration}ms)` : '';
        const retries = task.retries ? ` [${task.retries} ${task.retries === 1 ? 'retry' : 'retries'}]` : '';
        this.outputChannel.appendLine(`${icon} ${task.name}${duration}${retries}`);
        if (details?.error) {
            this.outputChannel.appendLine(` Error: ${details.error}`);
        }
        // Update UI
        this.updateStatusBar();
        this.updateWebview();
    }
    /**
    * Record error recovery attempt
    */
    recordErrorRecovery(workflowId, success) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            return;
        }
        workflow.errorRecoveryAttempts++;
        if (success) {
            workflow.errorRecoverySuccesses++;
        }
        this.outputChannel.appendLine(` Error recovery ${success ? 'succeeded' : 'failed'} (${workflow.errorRecoverySuccesses}/${workflow.errorRecoveryAttempts})`);
        this.updateWebview();
    }
    /**
    * Complete workflow
    */
    completeWorkflow(workflowId, success) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow) {
            return;
        }
        workflow.status = success ? 'completed' : 'failed';
        workflow.endTime = Date.now();
        workflow.currentTask = undefined;
        const duration = workflow.endTime - workflow.startTime;
        const durationStr = this.formatDuration(duration);
        // Log to output channel
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`${'='.repeat(80)}`);
        if (success) {
            this.outputChannel.appendLine(` WORKFLOW COMPLETED SUCCESSFULLY`);
        }
        else {
            this.outputChannel.appendLine(` WORKFLOW FAILED`);
        }
        this.outputChannel.appendLine(`${'='.repeat(80)}`);
        this.outputChannel.appendLine(`Duration: ${durationStr}`);
        this.outputChannel.appendLine(`Completed: ${workflow.completedTasks}/${workflow.totalTasks} tasks`);
        if (workflow.failedTasks > 0) {
            this.outputChannel.appendLine(`Failed: ${workflow.failedTasks} tasks`);
        }
        if (workflow.errorRecoveryAttempts > 0) {
            this.outputChannel.appendLine(`Error Recovery: ${workflow.errorRecoverySuccesses}/${workflow.errorRecoveryAttempts} successful`);
        }
        this.outputChannel.appendLine('');
        // Show notification
        if (this.options.showNotifications) {
            if (success) {
                vscode.window.showInformationMessage(` Workflow completed in ${durationStr} (${workflow.completedTasks}/${workflow.totalTasks} tasks)`);
            }
            else {
                vscode.window.showErrorMessage(` Workflow failed after ${durationStr} (${workflow.completedTasks}/${workflow.totalTasks} tasks completed)`);
            }
        }
        // Update UI
        this.updateStatusBar();
        this.updateWebview();
    }
    /**
    * Show visualization panel
    */
    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }
        this.panel = vscode.window.createWebviewPanel('codeliciousWorkflow', 'Codelicious Workflow', vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true
        });
        this.panel.webview.html = this.getWebviewContent();
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
        this.updateWebview();
    }
    /**
    * Hide visualization panel
    */
    hide() {
        if (this.panel) {
            this.panel.dispose();
            this.panel = undefined;
        }
    }
    /**
    * Update status bar
    */
    updateStatusBar() {
        const activeWorkflows = Array.from(this.workflows.values()).filter(w => w.status === 'running');
        if (activeWorkflows.length === 0) {
            this.statusBarItem.hide();
            return;
        }
        const workflow = activeWorkflows[0];
        const progress = Math.round((workflow.completedTasks / workflow.totalTasks) * 100);
        this.statusBarItem.text = `$(sync~spin) Codelicious: ${progress}% (${workflow.completedTasks}/${workflow.totalTasks})`;
        this.statusBarItem.tooltip = workflow.currentTask || 'Running workflow...';
        this.statusBarItem.show();
    }
    /**
    * Update webview content
    */
    updateWebview() {
        if (!this.panel) {
            return;
        }
        const workflows = Array.from(this.workflows.values());
        const tasks = Array.from(this.tasks.values());
        this.panel.webview.postMessage({
            type: 'update',
            workflows,
            tasks
        });
    }
    /**
    * Get status icon
    */
    getStatusIcon(status) {
        switch (status) {
            case 'pending': return '⏳';
            case 'running': return '';
            case 'completed': return '';
            case 'failed': return '';
            case 'skipped': return '⏭';
            default: return '';
        }
    }
    /**
    * Format duration
    */
    formatDuration(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        }
        else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        }
        else {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        }
    }
    /**
    * Get webview HTML content
    */
    getWebviewContent() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Codelicious Workflow</title>
 <style>
 body {
 font-family: var(--vscode-font-family);
 color: var(--vscode-foreground);
 background-color: var(--vscode-editor-background);
 padding: 20px;
 margin: 0;
 }

 h1 {
 font-size: 24px;
 margin-bottom: 20px;
 border-bottom: 2px solid var(--vscode-panel-border);
 padding-bottom: 10px;
 }

 .workflow {
 margin-bottom: 30px;
 padding: 15px;
 border: 1px solid var(--vscode-panel-border);
 border-radius: 4px;
 background-color: var(--vscode-editor-background);
 }

 .workflow-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 15px;
 }

 .workflow-title {
 font-size: 18px;
 font-weight: bold;
 }

 .workflow-status {
 padding: 4px 12px;
 border-radius: 12px;
 font-size: 12px;
 font-weight: bold;
 }

 .status-running {
 background-color: #0078d4;
 color: white;
 }

 .status-completed {
 background-color: #107c10;
 color: white;
 }

 .status-failed {
 background-color: #d13438;
 color: white;
 }

 .progress-bar {
 width: 100%;
 height: 8px;
 background-color: var(--vscode-input-background);
 border-radius: 4px;
 overflow: hidden;
 margin-bottom: 15px;
 }

 .progress-fill {
 height: 100%;
 background-color: #0078d4;
 transition: width 0.3s ease;
 }

 .workflow-stats {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
 gap: 10px;
 margin-bottom: 15px;
 }

 .stat {
 padding: 10px;
 background-color: var(--vscode-input-background);
 border-radius: 4px;
 }

 .stat-label {
 font-size: 11px;
 opacity: 0.7;
 margin-bottom: 4px;
 }

 .stat-value {
 font-size: 18px;
 font-weight: bold;
 }

 .tasks {
 margin-top: 15px;
 }

 .task {
 display: flex;
 align-items: center;
 padding: 8px;
 margin-bottom: 4px;
 border-radius: 4px;
 background-color: var(--vscode-input-background);
 }

 .task-icon {
 font-size: 16px;
 margin-right: 10px;
 min-width: 20px;
 }

 .task-name {
 flex: 1;
 }

 .task-duration {
 font-size: 11px;
 opacity: 0.7;
 margin-left: 10px;
 }

 .task-retries {
 font-size: 11px;
 color: #ff8c00;
 margin-left: 10px;
 }

 .task-error {
 margin-top: 4px;
 padding: 8px;
 background-color: rgba(209, 52, 56, 0.1);
 border-left: 3px solid #d13438;
 font-size: 12px;
 font-family: monospace;
 }
 </style>
</head>
<body>
 <h1> Codelicious Workflow Visualization</h1>
 <div id="workflows"></div>

 <script>
 const vscode = acquireVsCodeApi();

 window.addEventListener('message', event => {
 const message = event.data;
 if (message.type === 'update') {
 renderWorkflows(message.workflows, message.tasks);
 }
 });

 function renderWorkflows(workflows, tasks) {
 const container = document.getElementById('workflows');

 if (workflows.length === 0) {
 container.innerHTML = '<p>No active workflows</p>';
 return;
 }

 container.innerHTML = workflows.map(workflow => {
 const progress = Math.round((workflow.completedTasks / workflow.totalTasks) * 100);
 const workflowTasks = tasks.filter(t => true); // All tasks for now

 return \`
 <div class="workflow">
 <div class="workflow-header">
 <div class="workflow-title">\${workflow.workflowId}</div>
 <div class="workflow-status status-\${workflow.status}">\${workflow.status.toUpperCase()}</div>
 </div>

 <div class="progress-bar">
 <div class="progress-fill" style="width: \${progress}%"></div>
 </div>

 <div class="workflow-stats">
 <div class="stat">
 <div class="stat-label">Progress</div>
 <div class="stat-value">\${progress}%</div>
 </div>
 <div class="stat">
 <div class="stat-label">Completed</div>
 <div class="stat-value">\${workflow.completedTasks}/\${workflow.totalTasks}</div>
 </div>
 <div class="stat">
 <div class="stat-label">Failed</div>
 <div class="stat-value">\${workflow.failedTasks}</div>
 </div>
 <div class="stat">
 <div class="stat-label">Error Recovery</div>
 <div class="stat-value">\${workflow.errorRecoverySuccesses}/\${workflow.errorRecoveryAttempts}</div>
 </div>
 </div>

 <div class="tasks">
 \${workflowTasks.map(task => renderTask(task)).join('')}
 </div>
 </div>
 \`;
 }).join('');
 }

 function renderTask(task) {
 const icon = getStatusIcon(task.status);
 const duration = task.duration ? formatDuration(task.duration) : '';
 const retries = task.retries ? \`\${task.retries} \${task.retries === 1 ? 'retry' : 'retries'}\` : '';
 const error = task.error ? \`<div class="task-error">\${task.error}</div>\` : '';

 return \`
 <div class="task">
 <div class="task-icon">\${icon}</div>
 <div class="task-name">\${task.name}</div>
 \${duration ? \`<div class="task-duration">\${duration}</div>\` : ''}
 \${retries ? \`<div class="task-retries">\${retries}</div>\` : ''}
 </div>
 \${error}
 \`;
 }

 function getStatusIcon(status) {
 switch (status) {
 case 'pending': return '⏳';
 case 'running': return '';
 case 'completed': return '';
 case 'failed': return '';
 case 'skipped': return '⏭';
 default: return '';
 }
 }

 function formatDuration(ms) {
 if (ms < 1000) {
 return \`\${ms}ms\`;
 } else if (ms < 60000) {
 return \`\${(ms / 1000).toFixed(1)}s\`;
 } else {
 const minutes = Math.floor(ms / 60000);
 const seconds = Math.floor((ms % 60000) / 1000);
 return \`\${minutes}m \${seconds}s\`;
 }
 }
 </script>
</body>
</html>`;
    }
    /**
    * Dispose resources
    */
    dispose() {
        this.hide();
        this.statusBarItem.dispose();
        this.outputChannel.dispose();
    }
}
exports.WorkflowVisualizer = WorkflowVisualizer;
//# sourceMappingURL=workflowVisualizer.js.map