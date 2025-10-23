"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorRecoveryManager = exports.RecoveryStrategy = exports.ErrorCategory = exports.ErrorSeverity = void 0;
const vscode = __importStar(require("vscode"));
/**
 * Error severity levels
 */
var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical"; // Unrecoverable, abort workflow
})(ErrorSeverity || (exports.ErrorSeverity = ErrorSeverity = {}));
/**
 * Error categories for classification
 */
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["FILE_SYSTEM"] = "file_system";
    ErrorCategory["PERMISSION"] = "permission";
    ErrorCategory["VALIDATION"] = "validation";
    ErrorCategory["EXECUTION"] = "execution";
    ErrorCategory["TIMEOUT"] = "timeout";
    ErrorCategory["RESOURCE"] = "resource";
    ErrorCategory["UNKNOWN"] = "unknown"; // Unclassified errors
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
/**
 * Recovery strategy types
 */
var RecoveryStrategy;
(function (RecoveryStrategy) {
    RecoveryStrategy["RETRY"] = "retry";
    RecoveryStrategy["RETRY_WITH_FALLBACK"] = "retry_fallback";
    RecoveryStrategy["SKIP"] = "skip";
    RecoveryStrategy["ROLLBACK"] = "rollback";
    RecoveryStrategy["USER_INTERVENTION"] = "user_intervention";
    RecoveryStrategy["ABORT"] = "abort"; // Abort workflow
})(RecoveryStrategy || (exports.RecoveryStrategy = RecoveryStrategy = {}));
/**
 * Error Recovery Manager
 */
class ErrorRecoveryManager {
    constructor() {
        this.stats = {
            totalErrors: 0,
            recoveredErrors: 0,
            failedRecoveries: 0,
            retriesAttempted: 0,
            averageRecoveryTime: 0,
            errorsByCategory: new Map(),
            errorsBySeverity: new Map()
        };
        this.outputChannel = vscode.window.createOutputChannel('Codelicious Error Recovery');
    }
    /**
    * Classify an error and determine recovery strategy
    */
    classifyError(error, context) {
        const message = error.message.toLowerCase();
        // Network errors
        if (message.includes('network') || message.includes('econnrefused') ||
            message.includes('enotfound') || message.includes('timeout')) {
            return {
                originalError: error,
                category: ErrorCategory.NETWORK,
                severity: ErrorSeverity.LOW,
                recoveryStrategy: RecoveryStrategy.RETRY,
                retryable: true,
                maxRetries: 3,
                backoffMs: 1000,
                message: 'Network error detected. Will retry with exponential backoff.',
                context
            };
        }
        // File system errors
        if (message.includes('enoent') || message.includes('file not found') ||
            message.includes('directory not found')) {
            return {
                originalError: error,
                category: ErrorCategory.FILE_SYSTEM,
                severity: ErrorSeverity.MEDIUM,
                recoveryStrategy: RecoveryStrategy.RETRY_WITH_FALLBACK,
                retryable: true,
                maxRetries: 2,
                backoffMs: 500,
                message: 'File system error. Will attempt to create missing directories.',
                context
            };
        }
        // Permission errors
        if (message.includes('eacces') || message.includes('permission denied') ||
            message.includes('eperm')) {
            return {
                originalError: error,
                category: ErrorCategory.PERMISSION,
                severity: ErrorSeverity.HIGH,
                recoveryStrategy: RecoveryStrategy.USER_INTERVENTION,
                retryable: false,
                maxRetries: 0,
                backoffMs: 0,
                message: 'Permission error. User intervention required.',
                context
            };
        }
        // Validation errors
        if (message.includes('invalid') || message.includes('validation') ||
            message.includes('malformed')) {
            return {
                originalError: error,
                category: ErrorCategory.VALIDATION,
                severity: ErrorSeverity.MEDIUM,
                recoveryStrategy: RecoveryStrategy.USER_INTERVENTION,
                retryable: false,
                maxRetries: 0,
                backoffMs: 0,
                message: 'Validation error. Please check input and try again.',
                context
            };
        }
        // Execution errors
        if (message.includes('command not found') || message.includes('exit code') ||
            message.includes('execution failed')) {
            return {
                originalError: error,
                category: ErrorCategory.EXECUTION,
                severity: ErrorSeverity.MEDIUM,
                recoveryStrategy: RecoveryStrategy.RETRY_WITH_FALLBACK,
                retryable: true,
                maxRetries: 2,
                backoffMs: 1000,
                message: 'Execution error. Will try alternative command.',
                context
            };
        }
        // Timeout errors
        if (message.includes('timeout') || message.includes('timed out')) {
            return {
                originalError: error,
                category: ErrorCategory.TIMEOUT,
                severity: ErrorSeverity.LOW,
                recoveryStrategy: RecoveryStrategy.RETRY,
                retryable: true,
                maxRetries: 2,
                backoffMs: 2000,
                message: 'Operation timed out. Will retry with longer timeout.',
                context
            };
        }
        // Resource errors
        if (message.includes('out of memory') || message.includes('resource') ||
            message.includes('quota exceeded')) {
            return {
                originalError: error,
                category: ErrorCategory.RESOURCE,
                severity: ErrorSeverity.HIGH,
                recoveryStrategy: RecoveryStrategy.ABORT,
                retryable: false,
                maxRetries: 0,
                backoffMs: 0,
                message: 'Resource exhaustion. Cannot continue.',
                context
            };
        }
        // Unknown errors - be conservative
        return {
            originalError: error,
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.MEDIUM,
            recoveryStrategy: RecoveryStrategy.RETRY,
            retryable: true,
            maxRetries: 1,
            backoffMs: 1000,
            message: 'Unknown error. Will attempt one retry.',
            context
        };
    }
    /**
    * Attempt to recover from an error
    */
    async recover(operation, options = {}) {
        const startTime = Date.now();
        const maxRetries = options.maxRetries ?? 3;
        const initialBackoff = options.initialBackoffMs ?? 1000;
        const maxBackoff = options.maxBackoffMs ?? 30000;
        const backoffMultiplier = options.backoffMultiplier ?? 2;
        let lastError = null;
        let currentBackoff = initialBackoff;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Attempt the operation
                const result = await operation();
                // Success!
                if (attempt > 0) {
                    this.stats.recoveredErrors++;
                    this.stats.retriesAttempted += attempt;
                    const recoveryTime = Date.now() - startTime;
                    this.updateAverageRecoveryTime(recoveryTime);
                    this.outputChannel.appendLine(` Recovered after ${attempt} ${attempt === 1 ? 'retry' : 'retries'} (${recoveryTime}ms)`);
                }
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                this.stats.totalErrors++;
                // Classify the error
                const classified = this.classifyError(lastError, options.context);
                this.updateErrorStats(classified);
                this.outputChannel.appendLine(` Attempt ${attempt + 1}/${maxRetries + 1} failed: ${classified.message}`);
                // Check if we should retry
                if (attempt < maxRetries && classified.retryable) {
                    // Wait with exponential backoff
                    await this.sleep(Math.min(currentBackoff, maxBackoff));
                    currentBackoff *= backoffMultiplier;
                    this.outputChannel.appendLine(` Retrying in ${currentBackoff}ms... (Strategy: ${classified.recoveryStrategy})`);
                }
                else {
                    // No more retries or not retryable
                    this.stats.failedRecoveries++;
                    if (classified.severity === ErrorSeverity.CRITICAL) {
                        this.outputChannel.appendLine(' Critical error - aborting workflow');
                        throw lastError;
                    }
                    if (options.enableUserIntervention &&
                        classified.recoveryStrategy === RecoveryStrategy.USER_INTERVENTION) {
                        const shouldContinue = await this.askUserForIntervention(classified);
                        if (!shouldContinue) {
                            throw lastError;
                        }
                    }
                    else {
                        throw lastError;
                    }
                }
            }
        }
        // Should never reach here, but TypeScript needs it
        throw lastError;
    }
    /**
    * Sleep for specified milliseconds
    */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
    * Ask user for intervention
    */
    async askUserForIntervention(error) {
        const result = await vscode.window.showErrorMessage(`${error.message}\n\nError: ${error.originalError.message}`, { modal: true }, 'Retry', 'Skip', 'Abort');
        return result === 'Retry' || result === 'Skip';
    }
    /**
    * Update error statistics
    */
    updateErrorStats(error) {
        // Update category stats
        const categoryCount = this.stats.errorsByCategory.get(error.category) || 0;
        this.stats.errorsByCategory.set(error.category, categoryCount + 1);
        // Update severity stats
        const severityCount = this.stats.errorsBySeverity.get(error.severity) || 0;
        this.stats.errorsBySeverity.set(error.severity, severityCount + 1);
    }
    /**
    * Update average recovery time
    */
    updateAverageRecoveryTime(newTime) {
        const total = this.stats.averageRecoveryTime * this.stats.recoveredErrors;
        this.stats.averageRecoveryTime = (total + newTime) / (this.stats.recoveredErrors + 1);
    }
    /**
    * Get recovery statistics
    */
    getStats() {
        return { ...this.stats };
    }
    /**
    * Reset statistics
    */
    resetStats() {
        this.stats = {
            totalErrors: 0,
            recoveredErrors: 0,
            failedRecoveries: 0,
            retriesAttempted: 0,
            averageRecoveryTime: 0,
            errorsByCategory: new Map(),
            errorsBySeverity: new Map()
        };
    }
    /**
    * Show recovery report
    */
    showReport() {
        const stats = this.getStats();
        const recoveryRate = stats.totalErrors > 0
            ? ((stats.recoveredErrors / stats.totalErrors) * 100).toFixed(1)
            : '0.0';
        this.outputChannel.clear();
        this.outputChannel.appendLine(''.repeat(80));
        this.outputChannel.appendLine(' ERROR RECOVERY REPORT');
        this.outputChannel.appendLine(''.repeat(80));
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine(`Total Errors: ${stats.totalErrors}`);
        this.outputChannel.appendLine(`Recovered: ${stats.recoveredErrors} (${recoveryRate}%)`);
        this.outputChannel.appendLine(`Failed: ${stats.failedRecoveries}`);
        this.outputChannel.appendLine(`Total Retries: ${stats.retriesAttempted}`);
        this.outputChannel.appendLine(`Avg Recovery Time: ${Math.round(stats.averageRecoveryTime)}ms`);
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('Errors by Category:');
        stats.errorsByCategory.forEach((count, category) => {
            this.outputChannel.appendLine(` ${category}: ${count}`);
        });
        this.outputChannel.appendLine('');
        this.outputChannel.appendLine('Errors by Severity:');
        stats.errorsBySeverity.forEach((count, severity) => {
            this.outputChannel.appendLine(` ${severity}: ${count}`);
        });
        this.outputChannel.appendLine(''.repeat(80));
        this.outputChannel.show();
    }
}
exports.ErrorRecoveryManager = ErrorRecoveryManager;
//# sourceMappingURL=errorRecovery.js.map