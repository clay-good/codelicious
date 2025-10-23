/**
 * Specification Manager
 *
 * Coordinates parsing, planning, and execution of specifications.
 * Provides progress tracking, status updates, and VS Code integration.
 */
import { ParsedSpecification } from './specificationParser';
import { ExecutionPlan } from './taskPlanner';
import { ExecutionResult, ExecutionOptions } from './specificationExecutor';
export interface SpecificationStatus {
    state: SpecificationState;
    specification?: ParsedSpecification;
    plan?: ExecutionPlan;
    result?: ExecutionResult;
    progress: number;
    currentPhase?: string;
    currentTask?: string;
    startTime?: number;
    endTime?: number;
}
export declare enum SpecificationState {
    IDLE = "idle",
    PARSING = "parsing",
    PLANNING = "planning",
    EXECUTING = "executing",
    COMPLETED = "completed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}
export declare class SpecificationManager {
    private workspaceRoot;
    private outputChannel;
    private statusBarItem;
    private parser;
    private planner;
    private executor;
    private currentStatus;
    private progressReporter?;
    constructor(workspaceRoot: string);
    /**
    * Process a specification from text
    */
    processSpecification(text: string, options?: ExecutionOptions): Promise<ExecutionResult>;
    /**
    * Process a specification from a file
    */
    processSpecificationFile(filePath: string, options?: ExecutionOptions): Promise<ExecutionResult>;
    /**
    * Parse a specification without executing
    */
    parseSpecification(text: string): Promise<ParsedSpecification>;
    /**
    * Create an execution plan without executing
    */
    planSpecification(specification: ParsedSpecification): Promise<ExecutionPlan>;
    /**
    * Get current status
    */
    getStatus(): SpecificationStatus;
    /**
    * Show specification summary
    */
    showSpecificationSummary(specification: ParsedSpecification): Promise<void>;
    /**
    * Show execution plan
    */
    showExecutionPlan(plan: ExecutionPlan): Promise<void>;
    /**
    * Show execution result
    */
    showExecutionResult(result: ExecutionResult): Promise<void>;
    /**
    * Update status
    */
    private updateStatus;
    /**
    * Get icon for state
    */
    private getStateIcon;
    /**
    * Format specification summary
    */
    private formatSpecificationSummary;
    /**
    * Format execution plan
    */
    private formatExecutionPlan;
    /**
    * Format execution result
    */
    private formatExecutionResult;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=specificationManager.d.ts.map