/**
 * Execution Engine - Sandboxed command execution with safety features
 *
 * Features:
 * - Sandboxed command execution
 * - Timeout protection
 * - Error recovery
 * - Output capture (stdout/stderr)
 * - Confirmation for destructive operations
 * - Environment variable isolation
 * - Working directory management
 * - Process cleanup
 */
import { ConfigurationManager } from './configurationManager';
import { ExecutionResult } from '../types';
export interface ExecutionOptions {
    workingDirectory?: string;
    environment?: Record<string, string>;
    timeout?: number;
    sandbox?: boolean;
    requireConfirmation?: boolean;
    shell?: boolean;
}
export declare class ExecutionEngine {
    private configManager;
    private runningProcesses;
    private executionHistory;
    private readonly maxHistorySize;
    private readonly destructiveCommands;
    constructor(configManager: ConfigurationManager);
    /**
    * Execute a command with safety features
    */
    execute(command: string, options?: ExecutionOptions): Promise<ExecutionResult>;
    /**
    * Execute command and capture output
    */
    private executeCommand;
    /**
    * Parse command into executable and arguments
    */
    private parseCommand;
    /**
    * Prepare environment variables
    */
    private prepareEnvironment;
    /**
    * Check if command is destructive
    */
    private isDestructive;
    /**
    * Confirm destructive command with user
    */
    private confirmDestructiveCommand;
    /**
    * Validate working directory
    */
    private isValidWorkingDirectory;
    /**
    * Add execution result to history
    */
    private addToHistory;
    /**
    * Get execution history
    */
    getHistory(): ExecutionResult[];
    /**
    * Cancel a running command
    */
    cancelCommand(executionId: string): Promise<boolean>;
    /**
    * Cancel all running commands
    */
    cancelAll(): Promise<void>;
    /**
    * Get running commands count
    */
    getRunningCount(): number;
    /**
    * Clear execution history
    */
    clearHistory(): void;
    /**
    * Dispose and cleanup
    */
    dispose(): Promise<void>;
}
//# sourceMappingURL=executionEngine.d.ts.map