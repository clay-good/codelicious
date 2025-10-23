/**
 * Agent Orchestrator
 *
 * Coordinates multiple AI agents to collaborate on code generation tasks.
 * Manages workflows, agent communication, and result aggregation.
 */
import * as vscode from 'vscode';
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionEngine } from '../core/executionEngine';
import { LearningManager } from '../learning/learningManager';
import { Message } from '../types';
import { AgentWorkflow, AgentCollaborationResult } from './types';
export interface WorkflowOptions {
    skipPreFilter?: boolean;
    skipSecurityReview?: boolean;
    skipTesting?: boolean;
    codebaseContext?: string;
    currentFile?: string;
    autoWriteFiles?: boolean;
    autoExecuteTests?: boolean;
    requireApproval?: boolean;
}
export declare class AgentOrchestrator {
    private readonly modelOrchestrator;
    private readonly executionEngine;
    private readonly workspaceRoot;
    private readonly context?;
    private preFilterAgent;
    private securityAgent;
    private testingAgent;
    private autonomousExecutor;
    private errorRecovery;
    private visualizer;
    private learningManager;
    private workflows;
    private taskQueue;
    constructor(modelOrchestrator: ModelOrchestrator, executionEngine: ExecutionEngine, workspaceRoot: string, context?: vscode.ExtensionContext | undefined, learningManager?: LearningManager);
    /**
    * Execute a complete code generation workflow with multiple agents
    */
    executeCodeGenerationWorkflow(userPrompt: string, conversationHistory?: Message[], options?: WorkflowOptions): Promise<AgentCollaborationResult>;
    /**
    * Execute pre-filter agent
    */
    private executePreFilter;
    /**
    * Execute code generation (main AI)
    */
    private executeCodeGeneration;
    /**
    * Execute security review
    */
    private executeSecurityReview;
    /**
    * Execute testing
    */
    private executeTesting;
    /**
    * Build workflow steps
    */
    private buildCodeGenerationSteps;
    /**
    * Build agent context
    */
    private buildContext;
    /**
    * Get open files in workspace
    */
    private getOpenFiles;
    /**
    * Write generated files to disk with error recovery
    */
    private writeFilesToDisk;
    /**
    * Make file executable (chmod +x)
    */
    private makeExecutable;
    /**
    * Execute tests in terminal with error recovery
    */
    private executeTestsInTerminal;
    /**
    * Get test command for language
    */
    private getTestCommand;
    /**
    * Build workflow summary with error recovery stats
    */
    private buildWorkflowSummary;
    /**
    * Show error recovery report
    */
    showErrorRecoveryReport(): void;
    /**
    * Reset error recovery statistics
    */
    resetErrorRecoveryStats(): void;
    /**
    * Calculate total cost from workflow
    */
    private calculateTotalCost;
    /**
    * Generate workflow ID
    */
    private generateWorkflowId;
    /**
    * Generate task ID
    */
    private generateTaskId;
    /**
    * Get workflow by ID
    */
    getWorkflow(workflowId: string): AgentWorkflow | undefined;
    /**
    * Get all agent metrics
    */
    getAllMetrics(): {
        preFilter: import("./types").AgentMetrics;
        security: import("./types").AgentMetrics;
        testing: import("./types").AgentMetrics;
    };
    /**
    * Build workflow tasks for visualization
    */
    private buildWorkflowTasks;
    /**
    * Update task status in visualizer
    */
    private updateTaskStatus;
    /**
    * Detect programming language from context
    */
    private detectLanguageFromContext;
    /**
    * Show workflow visualization
    */
    showWorkflowVisualization(): void;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=agentOrchestrator.d.ts.map