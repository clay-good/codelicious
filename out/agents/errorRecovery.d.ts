/**
 * Error Recovery System for Multi-Agent Workflows
 *
 * Provides intelligent error recovery with:
 * - Automatic retry logic with exponential backoff
 * - Partial success handling
 * - Error classification and recovery strategies
 * - Rollback mechanisms
 * - Recovery metrics and reporting
 */
/**
 * Error severity levels
 */
export declare enum ErrorSeverity {
    LOW = "low",// Recoverable, can retry
    MEDIUM = "medium",// Recoverable with user intervention
    HIGH = "high",// Requires manual fix
    CRITICAL = "critical"
}
/**
 * Error categories for classification
 */
export declare enum ErrorCategory {
    NETWORK = "network",// API/network failures
    FILE_SYSTEM = "file_system",// File I/O errors
    PERMISSION = "permission",// Permission denied
    VALIDATION = "validation",// Input validation errors
    EXECUTION = "execution",// Command execution errors
    TIMEOUT = "timeout",// Operation timeout
    RESOURCE = "resource",// Resource exhaustion
    UNKNOWN = "unknown"
}
/**
 * Recovery strategy types
 */
export declare enum RecoveryStrategy {
    RETRY = "retry",// Retry with backoff
    RETRY_WITH_FALLBACK = "retry_fallback",// Retry with alternative approach
    SKIP = "skip",// Skip and continue
    ROLLBACK = "rollback",// Rollback changes
    USER_INTERVENTION = "user_intervention",// Ask user for help
    ABORT = "abort"
}
/**
 * Classified error with recovery information
 */
export interface ClassifiedError {
    originalError: Error;
    category: ErrorCategory;
    severity: ErrorSeverity;
    recoveryStrategy: RecoveryStrategy;
    retryable: boolean;
    maxRetries: number;
    backoffMs: number;
    message: string;
    context?: unknown;
}
/**
 * Recovery attempt result
 */
export interface RecoveryResult {
    success: boolean;
    attemptNumber: number;
    strategy: RecoveryStrategy;
    error?: Error;
    recoveredData?: unknown;
    message: string;
}
/**
 * Recovery options
 */
export interface RecoveryOptions {
    maxRetries?: number;
    initialBackoffMs?: number;
    maxBackoffMs?: number;
    backoffMultiplier?: number;
    enableUserIntervention?: boolean;
    enableRollback?: boolean;
    context?: unknown;
}
/**
 * Recovery statistics
 */
export interface RecoveryStats {
    totalErrors: number;
    recoveredErrors: number;
    failedRecoveries: number;
    retriesAttempted: number;
    averageRecoveryTime: number;
    errorsByCategory: Map<ErrorCategory, number>;
    errorsBySeverity: Map<ErrorSeverity, number>;
}
/**
 * Error Recovery Manager
 */
export declare class ErrorRecoveryManager {
    private stats;
    private outputChannel;
    constructor();
    /**
    * Classify an error and determine recovery strategy
    */
    classifyError(error: Error, context?: unknown): ClassifiedError;
    /**
    * Attempt to recover from an error
    */
    recover<T>(operation: () => Promise<T>, options?: RecoveryOptions): Promise<T>;
    /**
    * Sleep for specified milliseconds
    */
    private sleep;
    /**
    * Ask user for intervention
    */
    private askUserForIntervention;
    /**
    * Update error statistics
    */
    private updateErrorStats;
    /**
    * Update average recovery time
    */
    private updateAverageRecoveryTime;
    /**
    * Get recovery statistics
    */
    getStats(): RecoveryStats;
    /**
    * Reset statistics
    */
    resetStats(): void;
    /**
    * Show recovery report
    */
    showReport(): void;
}
//# sourceMappingURL=errorRecovery.d.ts.map