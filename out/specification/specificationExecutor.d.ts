/**
 * Specification Executor
 *
 * Executes planned tasks in the correct order with error handling,
 * progress tracking, and rollback capabilities.
 */
import * as vscode from 'vscode';
import { ExecutionPlan } from './taskPlanner';
export interface ExecutionResult {
    success: boolean;
    completedTasks: string[];
    failedTasks: string[];
    skippedTasks: string[];
    errors: ExecutionError[];
    duration: number;
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
export declare enum ArtifactType {
    FILE = "file",
    DIRECTORY = "directory",
    TEST = "test",
    DOCUMENTATION = "documentation"
}
export interface ExecutionOptions {
    dryRun?: boolean;
    stopOnError?: boolean;
    parallel?: boolean;
    maxParallel?: number;
    rollbackOnError?: boolean;
}
export declare class SpecificationExecutor {
    private workspaceRoot;
    private outputChannel;
    private completedTasks;
    private artifacts;
    private backups;
    constructor(workspaceRoot: string, outputChannel: vscode.OutputChannel);
    /**
    * Execute an execution plan
    */
    execute(plan: ExecutionPlan, options?: ExecutionOptions): Promise<ExecutionResult>;
    /**
    * Execute a single phase
    */
    private executePhase;
    /**
    * Execute a single task
    */
    private executeTask;
    /**
    * Execute a create task
    */
    private executeCreateTask;
    /**
    * Execute a modify task
    */
    private executeModifyTask;
    /**
    * Execute a delete task
    */
    private executeDeleteTask;
    /**
    * Execute a refactor task
    */
    private executeRefactorTask;
    /**
    * Execute a test task
    */
    private executeTestTask;
    /**
    * Execute a document task
    */
    private executeDocumentTask;
    /**
    * Rollback all changes
    */
    private rollback;
    /**
    * Generate file content based on file type
    */
    private generateFileContent;
    /**
    * Generate TypeScript template
    */
    private generateTypeScriptTemplate;
    /**
    * Generate JavaScript template
    */
    private generateJavaScriptTemplate;
    /**
    * Generate Python template
    */
    private generatePythonTemplate;
    /**
    * Generate test template
    */
    private generateTestTemplate;
    /**
    * Generate Markdown template
    */
    private generateMarkdownTemplate;
    /**
    * Convert string to PascalCase
    */
    private toPascalCase;
}
//# sourceMappingURL=specificationExecutor.d.ts.map