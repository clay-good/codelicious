/**
 * Intelligent Planning System - Create execution plans with dependency mapping
 *
 * Matches Augment's intelligent planning with cross-service dependency mapping
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { ParsedRequirements } from './requirementsParser';
import { ArchitecturalContext } from '../context/persistentContextEngine';
export interface FileOperation {
    type: 'create' | 'modify' | 'delete';
    path: string;
    reason: string;
    priority: number;
    dependencies: string[];
}
export interface DependencyInstallation {
    package: string;
    version?: string;
    type: 'production' | 'development';
    reason: string;
}
export interface IntegrationPoint {
    file: string;
    function: string;
    description: string;
    risk: 'low' | 'medium' | 'high';
}
export interface RollbackStrategy {
    checkpoints: string[];
    rollbackSteps: string[];
    validationTests: string[];
}
export interface ExecutionPlan {
    id: string;
    requirements: ParsedRequirements;
    fileOperations: FileOperation[];
    dependenciesToInstall: DependencyInstallation[];
    integrationPoints: IntegrationPoint[];
    executionOrder: string[];
    rollbackStrategy: RollbackStrategy;
    estimatedDuration: number;
    patterns: string[];
    risks: string[];
}
export declare class IntelligentPlanner {
    private orchestrator;
    constructor(orchestrator: ModelOrchestrator);
    /**
    * Create execution plan from requirements and architectural context
    */
    createPlan(requirements: ParsedRequirements, context: ArchitecturalContext): Promise<ExecutionPlan>;
    /**
    * Build prompt for planning
    */
    private buildPlanningPrompt;
    /**
    * Parse planning response
    */
    private parsePlanResponse;
    /**
    * Optimize execution order based on dependencies
    */
    optimizeExecutionOrder(plan: ExecutionPlan): ExecutionPlan;
    /**
    * Validate plan feasibility
    */
    validatePlan(plan: ExecutionPlan): {
        isValid: boolean;
        issues: string[];
        score: number;
    };
    /**
    * Detect circular dependencies
    */
    private detectCircularDependencies;
}
//# sourceMappingURL=intelligentPlanner.d.ts.map