/**
 * Enhanced Execution Engine
 *
 * Advanced command execution system with:
 * - Real-time streaming output
 * - Resource monitoring (CPU, memory)
 * - Execution queuing and concurrency control
 * - Intelligent retry logic with exponential backoff
 * - Command templates for common operations
 * - Execution profiles for different environments
 * - Performance analytics and metrics
 * - Interactive command execution with stdin support
 */
import { ExecutionEngine, ExecutionOptions } from './executionEngine';
import { ConfigurationManager } from './configurationManager';
import { ExecutionResult } from '../types';
export interface StreamingOptions extends ExecutionOptions {
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
    onProgress?: (progress: ExecutionProgress) => void;
    onResourceUpdate?: (resources: ResourceUsage) => void;
}
export interface ExecutionProgress {
    phase: 'starting' | 'running' | 'completing' | 'complete';
    percentage: number;
    message?: string;
    elapsedTime: number;
    estimatedTimeRemaining?: number;
}
export interface ResourceUsage {
    cpu: number;
    memory: number;
    memoryPercentage: number;
    pid: number;
    timestamp: number;
}
export interface RetryOptions {
    maxRetries?: number;
    initialBackoffMs?: number;
    maxBackoffMs?: number;
    backoffMultiplier?: number;
    retryableErrors?: string[];
    onRetry?: (attempt: number, error: string) => void;
}
export interface QueuedExecution {
    id: string;
    command: string;
    options: StreamingOptions;
    priority: number;
    addedAt: number;
    startedAt?: number;
    completedAt?: number;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    result?: ExecutionResult;
    error?: string;
}
export interface ExecutionProfile {
    name: string;
    description: string;
    environment: Record<string, string>;
    timeout: number;
    sandbox: boolean;
    requireConfirmation: boolean;
    maxConcurrent: number;
    retryOptions?: RetryOptions;
}
export interface CommandTemplate {
    name: string;
    description: string;
    command: string;
    variables: string[];
    defaultValues?: Record<string, string>;
    profile?: string;
}
export interface ExecutionMetrics {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageDuration: number;
    totalDuration: number;
    commandStats: Map<string, CommandStats>;
    resourceStats: ResourceStats;
}
export interface CommandStats {
    command: string;
    executions: number;
    successes: number;
    failures: number;
    averageDuration: number;
    totalDuration: number;
    lastExecuted: number;
}
export interface ResourceStats {
    averageCpu: number;
    peakCpu: number;
    averageMemory: number;
    peakMemory: number;
    samples: number;
}
export declare class EnhancedExecutionEngine extends ExecutionEngine {
    private executionQueue;
    private runningExecutions;
    private maxConcurrent;
    private profiles;
    private templates;
    private metrics;
    private resourceMonitorInterval?;
    constructor(configManager: ConfigurationManager);
    /**
    * Execute command with streaming output
    */
    executeStreaming(command: string, options?: StreamingOptions): Promise<ExecutionResult>;
    /**
    * Execute with streaming and resource monitoring
    */
    private executeWithStreaming;
    /**
    * Parse command using base class method (protected access)
    */
    protected parseCommandInternal(command: string, useShell: boolean): {
        cmd: string;
        args: string[];
    };
    /**
    * Prepare environment for execution
    */
    protected prepareEnvironmentInternal(customEnv: Record<string, string> | undefined, sandbox: boolean): Record<string, string>;
    /**
    * Start monitoring process resources
    */
    private startResourceMonitoring;
    /**
    * Stop resource monitoring
    */
    private stopResourceMonitoring;
    /**
    * Get process resource usage
    */
    private getProcessResources;
    /**
    * Update resource statistics
    */
    private updateResourceStats;
    /**
    * Execute with retry logic
    */
    executeWithRetry(command: string, options?: StreamingOptions, retryOptions?: RetryOptions): Promise<ExecutionResult>;
    /**
    * Check if error is retryable
    */
    private isRetryableError;
    /**
    * Sleep utility
    */
    private sleep;
    /**
    * Add execution to queue
    */
    queueExecution(command: string, options?: StreamingOptions, priority?: number): Promise<string>;
    /**
    * Process execution queue
    */
    private processQueue;
    /**
    * Execute queued command
    */
    private executeQueued;
    /**
    * Get queue status
    */
    getQueueStatus(): {
        queued: number;
        running: number;
        maxConcurrent: number;
    };
    /**
    * Set max concurrent executions
    */
    setMaxConcurrent(max: number): void;
    /**
    * Cancel queued execution
    */
    cancelQueuedExecution(id: string): boolean;
    /**
    * Clear queue
    */
    clearQueue(): void;
    /**
    * Initialize default profiles
    */
    private initializeDefaultProfiles;
    /**
    * Add custom profile
    */
    addProfile(profile: ExecutionProfile): void;
    /**
    * Get profile
    */
    getProfile(name: string): ExecutionProfile | undefined;
    /**
    * List all profiles
    */
    listProfiles(): ExecutionProfile[];
    /**
    * Execute with profile
    */
    executeWithProfile(command: string, profileName: string, additionalOptions?: StreamingOptions): Promise<ExecutionResult>;
    /**
    * Initialize default templates
    */
    private initializeDefaultTemplates;
    /**
    * Add custom template
    */
    addTemplate(template: CommandTemplate): void;
    /**
    * Get template
    */
    getTemplate(name: string): CommandTemplate | undefined;
    /**
    * List all templates
    */
    listTemplates(): CommandTemplate[];
    /**
    * Execute template
    */
    executeTemplate(templateName: string, variables?: Record<string, string>, options?: StreamingOptions): Promise<ExecutionResult>;
    /**
    * Update execution metrics
    */
    private updateMetrics;
    /**
    * Normalize command for stats (remove arguments)
    */
    private normalizeCommand;
    /**
    * Get execution metrics
    */
    getMetrics(): ExecutionMetrics;
    /**
    * Get command statistics
    */
    getCommandStats(command: string): CommandStats | undefined;
    /**
    * Get top commands by execution count
    */
    getTopCommands(limit?: number): CommandStats[];
    /**
    * Get slowest commands
    */
    getSlowestCommands(limit?: number): CommandStats[];
    /**
    * Get commands with highest failure rate
    */
    getHighestFailureRateCommands(limit?: number): CommandStats[];
    /**
    * Reset metrics
    */
    resetMetrics(): void;
    /**
    * Export metrics to JSON
    */
    exportMetrics(): string;
    /**
    * Generate metrics summary
    */
    generateMetricsSummary(): string;
    /**
    * Dispose and cleanup
    */
    dispose(): Promise<void>;
}
//# sourceMappingURL=enhancedExecutionEngine.d.ts.map