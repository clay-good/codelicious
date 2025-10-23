/**
 * Autonomous Workflow Orchestrator - End-to-end autonomous coding workflow
 *
 * Matches Augment's autonomous agent workflow with full spec-to-deployment automation
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { RAGService } from '../rag/ragService';
import { ExecutionEngine } from '../core/executionEngine';
import { ParsedRequirements } from './requirementsParser';
import { ExecutionPlan } from './intelligentPlanner';
import { GenerationResult } from './contextAwareCodeGenerator';
import { TestGenerationResult } from './automaticTestGenerator';
import { ValidationResult } from './productionValidator';
import { CancellationToken } from '../utils/cancellationToken';
import { MCPToolRegistry, ToolRecommendation } from '../integrations/mcpToolRegistry';
import { RefinementResult } from './iterativeRefinementEngine';
export interface WorkflowOptions {
    autoWriteFiles: boolean;
    autoRunTests: boolean;
    requireApproval: boolean;
    maxRetries: number;
    cancellationToken?: CancellationToken;
    timeoutMs?: number;
    onProgress?: (phase: string, progress: number) => void;
    useMCPTools?: boolean;
    enableIterativeRefinement?: boolean;
    enableRealtimeCompilation?: boolean;
    enableDependencyResolution?: boolean;
    targetQualityScore?: number;
    maxRefinementIterations?: number;
    generateReadme?: boolean;
}
export interface WorkflowResult {
    success: boolean;
    requirements: ParsedRequirements;
    plan: ExecutionPlan;
    generatedCode: GenerationResult;
    generatedTests: TestGenerationResult;
    validation: ValidationResult;
    filesWritten: string[];
    duration: number;
    errors: string[];
    mcpToolsUsed?: Array<{
        toolId: string;
        operation: string;
        success: boolean;
    }>;
    refinementResult?: RefinementResult;
    dependenciesInstalled?: number;
    compilationAttempts?: number;
    qualityScore?: number;
}
export declare class AutonomousWorkflow {
    private orchestrator;
    private ragService;
    private executionEngine;
    private workspaceRoot;
    private requirementsParser;
    private planner;
    private codeGenerator;
    private testGenerator;
    private validator;
    private readmeGenerator;
    private cancellationSource?;
    private cleanupCallbacks;
    private mcpRegistry?;
    private refinementEngine;
    private buildErrorFixer;
    private dependencyResolver;
    private realtimeCompiler;
    constructor(orchestrator: ModelOrchestrator, ragService: RAGService, executionEngine: ExecutionEngine, workspaceRoot: string, mcpRegistry?: MCPToolRegistry);
    /**
    * Execute full autonomous workflow from specification to deployment
    * ENHANCED: Cancellation support and progress tracking
    */
    execute(specification: string, options: WorkflowOptions): Promise<WorkflowResult>;
    /**
    * Cancel the workflow
    */
    cancel(): void;
    /**
    * Register cleanup callback
    */
    onCleanup(callback: () => void): void;
    /**
    * Run cleanup callbacks
    */
    private cleanup;
    /**
    * Request user approval for file operations
    */
    private requestApproval;
    /**
    * Show preview of generated files
    */
    private showPreview;
    /**
    * Get workflow status
    */
    getStatus(): string;
    /**
    * Recommend MCP tools for a task
    * NEW: MCP tool recommendation
    */
    recommendMCPTools(task: string): Promise<ToolRecommendation[]>;
    /**
    * Use MCP tool during workflow
    * NEW: MCP tool invocation
    */
    useMCPTool(toolId: string, operation: string, parameters: Record<string, unknown>): Promise<{
        success: boolean;
        data?: unknown;
        error?: string;
    }>;
    /**
    * Get MCP statistics
    * NEW: MCP statistics
    */
    getMCPStatistics(): unknown;
}
//# sourceMappingURL=autonomousWorkflow.d.ts.map