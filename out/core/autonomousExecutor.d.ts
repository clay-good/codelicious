/**
 * Autonomous Executor - Automatically executes code generation and file operations
 *
 * Features:
 * - Parse AI responses for file operations
 * - Generate multiple files automatically
 * - Show diff previews before applying
 * - Handle complex multi-file changes
 * - Provide undo/redo support
 * - Safety checks and validation
 */
import * as vscode from 'vscode';
export interface FileOperation {
    type: 'create' | 'modify' | 'delete';
    filePath: string;
    content?: string;
    originalContent?: string;
    language?: string;
}
export interface ExecutionPlan {
    operations: FileOperation[];
    description: string;
    estimatedImpact: 'low' | 'medium' | 'high';
}
export interface ExecutionResult {
    success: boolean;
    appliedOperations: FileOperation[];
    failedOperations: FileOperation[];
    errors: string[];
}
export interface UndoSnapshot {
    timestamp: number;
    operations: FileOperation[];
    description: string;
}
export declare class AutonomousExecutor {
    private readonly workspaceRoot;
    private readonly context?;
    private undoStack;
    private readonly maxUndoStackSize;
    private diffViewer;
    constructor(workspaceRoot: string, context?: vscode.ExtensionContext | undefined);
    /**
    * Parse AI response to extract file operations
    */
    parseFileOperations(aiResponse: string): ExecutionPlan | null;
    /**
    * Show execution plan to user for approval
    */
    showExecutionPlan(plan: ExecutionPlan): Promise<boolean>;
    /**
    * Execute the plan
    */
    executePlan(plan: ExecutionPlan): Promise<ExecutionResult>;
    /**
    * Execute a single operation
    */
    private executeOperation;
    /**
    * Create a new file
    */
    private createFile;
    /**
    * Modify an existing file
    */
    private modifyFile;
    /**
    * Delete a file
    */
    private deleteFile;
    /**
    * Show diff previews for all operations
    */
    private showDiffPreviews;
    /**
    * Undo last execution
    */
    undo(): Promise<boolean>;
    /**
    * Reverse a single operation
    */
    private reverseOperation;
    /**
    * Add snapshot to undo stack
    */
    private addToUndoStack;
    /**
    * Estimate impact of operations
    */
    private estimateImpact;
    /**
    * Generate description of operations
    */
    private generateDescription;
    /**
    * Get undo stack size
    */
    getUndoStackSize(): number;
    /**
    * Clear undo stack
    */
    clearUndoStack(): void;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=autonomousExecutor.d.ts.map