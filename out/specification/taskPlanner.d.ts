/**
 * Task Planner
 *
 * Plans and schedules tasks from parsed specifications,
 * handling dependencies and optimizing execution order.
 */
import { ParsedSpecification, Priority, TaskType } from './specificationParser';
export interface ExecutionPlan {
    phases: ExecutionPhase[];
    totalTime: number;
    criticalPath: string[];
    parallelizable: string[][];
    warnings: string[];
}
export interface ExecutionPhase {
    id: string;
    name: string;
    tasks: PlannedTask[];
    estimatedTime: number;
    dependencies: string[];
}
export interface PlannedTask {
    id: string;
    name: string;
    description: string;
    type: TaskType;
    priority: Priority;
    estimatedTime: number;
    dependencies: string[];
    requirements: string[];
    files: string[];
    tests: string[];
    order: number;
    canParallelize: boolean;
}
export declare class TaskPlanner {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    /**
    * Create an execution plan from a parsed specification
    */
    plan(spec: ParsedSpecification): Promise<ExecutionPlan>;
    /**
    * Validate specification for planning
    */
    private validateSpecification;
    /**
    * Topological sort of tasks based on dependencies
    */
    private topologicalSort;
    /**
    * Group tasks into execution phases
    */
    private groupIntoPhases;
    /**
    * Calculate critical path (longest path through dependencies)
    */
    private calculateCriticalPath;
    /**
    * Find tasks that can be executed in parallel
    */
    private findParallelizableTasks;
    /**
    * Calculate total execution time
    */
    private calculateTotalTime;
    /**
    * Detect circular dependencies
    */
    private detectCircularDependencies;
    /**
    * Generate warnings about the plan
    */
    private generateWarnings;
    /**
    * Get phase name for task type
    */
    private getPhaseNameForType;
    /**
    * Get phase name based on dominant task types
    */
    private getPhaseNameForTasks;
}
//# sourceMappingURL=taskPlanner.d.ts.map