/**
 * Project State Tracker
 *
 * Tracks the complete state of an autonomous build project including:
 * - Files created/modified/deleted
 * - Tasks completed/pending/failed
 * - Dependencies installed
 * - Build and test status
 * - Completion percentage
 * - Error history
 */
export interface ProjectState {
    projectId: string;
    projectName: string;
    workspaceRoot: string;
    specificationPath?: string;
    startTime: number;
    lastUpdateTime: number;
    endTime?: number;
    filesCreated: FileStateEntry[];
    filesModified: FileStateEntry[];
    filesDeleted: string[];
    tasksTotal: number;
    tasksCompleted: TaskStateEntry[];
    tasksPending: TaskStateEntry[];
    tasksFailed: TaskStateEntry[];
    dependencies: DependencyState;
    buildStatus: BuildStatus;
    testStatus: TestStatus;
    completionPercentage: number;
    currentPhase: string;
    currentTask?: string;
    errors: ErrorEntry[];
    warnings: WarningEntry[];
    iterationCount: number;
    maxIterations: number;
    completionCriteria: CompletionCriteria;
    isComplete: boolean;
    metadata: Record<string, any>;
}
export interface FileStateEntry {
    path: string;
    language?: string;
    size: number;
    timestamp: number;
    checksum?: string;
}
export interface TaskStateEntry {
    id: string;
    name: string;
    description: string;
    type: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    result?: unknown;
}
export interface DependencyState {
    packageJsonExists: boolean;
    dependenciesInstalled: boolean;
    dependencies: string[];
    devDependencies: string[];
    installAttempts: number;
    lastInstallTime?: number;
    installErrors: string[];
}
export interface BuildStatus {
    attempted: boolean;
    successful: boolean;
    lastAttemptTime?: number;
    attempts: number;
    errors: string[];
    warnings: string[];
    outputPath?: string;
}
export interface TestStatus {
    attempted: boolean;
    successful: boolean;
    lastAttemptTime?: number;
    attempts: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    errors: string[];
}
export interface ErrorEntry {
    timestamp: number;
    phase: string;
    task?: string;
    message: string;
    stack?: string;
    resolved: boolean;
    resolution?: string;
}
export interface WarningEntry {
    timestamp: number;
    phase: string;
    message: string;
    acknowledged: boolean;
}
export interface CompletionCriteria {
    requireAllTasksComplete: boolean;
    requireBuildSuccess: boolean;
    requireTestsPass: boolean;
    requireNoDependencyErrors: boolean;
    minimumFilesCreated: number;
    customCriteria: Record<string, boolean>;
}
export declare class ProjectStateTracker {
    private state;
    private stateFilePath;
    private autoSaveInterval;
    constructor(workspaceRoot: string, projectName: string, maxIterations?: number);
    /**
    * Load existing state from disk
    */
    loadState(): Promise<boolean>;
    /**
    * Save state to disk
    */
    saveState(): Promise<void>;
    /**
    * Enable auto-save every N seconds
    */
    enableAutoSave(intervalSeconds?: number): void;
    /**
    * Disable auto-save
    */
    disableAutoSave(): void;
    /**
    * Get current state (read-only copy)
    */
    getState(): Readonly<ProjectState>;
    /**
    * Update current phase
    */
    setPhase(phase: string): void;
    /**
    * Update current task
    */
    setCurrentTask(task: string): void;
    /**
    * Increment iteration count
    */
    incrementIteration(): number;
    /**
    * Check if max iterations reached
    */
    isMaxIterationsReached(): boolean;
    /**
    * Add file created
    */
    addFileCreated(filePath: string, language?: string): void;
    /**
    * Add file modified
    */
    addFileModified(filePath: string, language?: string): void;
    /**
    * Add file deleted
    */
    addFileDeleted(filePath: string): void;
    /**
    * Generate unique project ID
    */
    private generateProjectId;
    /**
    * Update completion percentage based on current state
    */
    private updateCompletionPercentage;
    /**
    * Set total tasks
    */
    setTotalTasks(total: number): void;
    /**
    * Add task to pending
    */
    addPendingTask(task: TaskStateEntry): void;
    /**
    * Mark task as started
    */
    startTask(taskId: string): void;
    /**
    * Mark task as completed
    */
    completeTask(taskId: string, result?: unknown): void;
    /**
    * Mark task as failed
    */
    failTask(taskId: string, error: string): void;
    /**
    * Add error
    */
    addError(error: ErrorEntry): void;
    /**
    * Add warning
    */
    addWarning(warning: WarningEntry): void;
    /**
    * Mark error as resolved
    */
    resolveError(errorIndex: number, resolution: string): void;
    /**
    * Update dependency state
    */
    updateDependencies(deps: Partial<DependencyState>): void;
    /**
    * Update build status
    */
    updateBuildStatus(status: Partial<BuildStatus>): void;
    /**
    * Update test status
    */
    updateTestStatus(status: Partial<TestStatus>): void;
    /**
    * Check if project is complete based on completion criteria
    */
    checkCompletion(): boolean;
    /**
    * Get summary of current state
    */
    getSummary(): string;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=projectState.d.ts.map