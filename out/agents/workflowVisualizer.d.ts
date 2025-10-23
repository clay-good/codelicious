/**
 * Workflow Visualizer - Real-time visualization of multi-agent workflows
 */
import * as vscode from 'vscode';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
import { AgentWorkflow } from './types';
export interface WorkflowVisualizerOptions {
    showNotifications?: boolean;
    autoOpen?: boolean;
    updateInterval?: number;
}
export interface WorkflowProgress {
    workflowId: string;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    currentTask?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    startTime: number;
    endTime?: number;
    errorRecoveryAttempts: number;
    errorRecoverySuccesses: number;
}
export interface TaskProgress {
    taskId: string;
    name: string;
    status: TaskStatus;
    startTime?: number;
    endTime?: number;
    duration?: number;
    retries?: number;
    error?: string;
    output?: string;
}
/**
 * Visualizes multi-agent workflow progress in real-time
 */
export declare class WorkflowVisualizer {
    private readonly context;
    private panel;
    private workflows;
    private tasks;
    private options;
    private outputChannel;
    private statusBarItem;
    constructor(context: vscode.ExtensionContext, options?: WorkflowVisualizerOptions);
    /**
    * Start tracking a new workflow
    */
    startWorkflow(workflow: AgentWorkflow): void;
    /**
    * Update task status
    */
    updateTask(workflowId: string, taskId: string, status: TaskStatus, details?: {
        error?: string;
        output?: string;
        retries?: number;
    }): void;
    /**
    * Record error recovery attempt
    */
    recordErrorRecovery(workflowId: string, success: boolean): void;
    /**
    * Complete workflow
    */
    completeWorkflow(workflowId: string, success: boolean): void;
    /**
    * Show visualization panel
    */
    show(): void;
    /**
    * Hide visualization panel
    */
    hide(): void;
    /**
    * Update status bar
    */
    private updateStatusBar;
    /**
    * Update webview content
    */
    private updateWebview;
    /**
    * Get status icon
    */
    private getStatusIcon;
    /**
    * Format duration
    */
    private formatDuration;
    /**
    * Get webview HTML content
    */
    private getWebviewContent;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=workflowVisualizer.d.ts.map