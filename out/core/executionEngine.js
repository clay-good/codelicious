"use strict";
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
exports.ExecutionEngine = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ExecutionEngine');
class ExecutionEngine {
    constructor(configManager) {
        this.configManager = configManager;
        this.runningProcesses = new Map();
        this.executionHistory = [];
        this.maxHistorySize = 100;
        // Destructive commands that require confirmation
        this.destructiveCommands = [
            'rm', 'rmdir', 'del', 'delete',
            'format', 'mkfs',
            'dd',
            'kill', 'killall',
            'shutdown', 'reboot',
            'chmod 777', 'chmod -R 777',
            'chown -R',
            '> /dev/', // Redirecting to devices
            'curl | sh', 'wget | sh', // Piping to shell
            'npm publish', 'yarn publish', // Publishing
            'git push --force', 'git push -f', // Force push
            'git reset --hard', // Hard reset
            'DROP DATABASE', 'DROP TABLE', // SQL
            'truncate', // Truncate files/tables
        ];
    }
    /**
    * Execute a command with safety features
    */
    async execute(command, options = {}) {
        const startTime = Date.now();
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Set defaults
        const workingDirectory = options.workingDirectory || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
        const timeout = options.timeout || 300000; // 5 minutes default
        const sandbox = options.sandbox !== false; // Default to sandboxed
        const requireConfirmation = options.requireConfirmation !== false; // Default to requiring confirmation
        const useShell = options.shell !== false; // Default to using shell
        logger.info(`Executing command: ${command}`);
        logger.info(` Working directory: ${workingDirectory}`);
        logger.info(` Timeout: ${timeout}ms`);
        logger.info(` Sandbox: ${sandbox}`);
        try {
            // Check if command is destructive
            if (requireConfirmation && this.isDestructive(command)) {
                const confirmed = await this.confirmDestructiveCommand(command);
                if (!confirmed) {
                    return {
                        success: false,
                        stdout: '',
                        stderr: 'Command cancelled by user',
                        exitCode: -1,
                        duration: Date.now() - startTime,
                        command
                    };
                }
            }
            // Validate working directory
            if (!this.isValidWorkingDirectory(workingDirectory)) {
                throw new Error(`Invalid working directory: ${workingDirectory}`);
            }
            // Prepare environment
            const environment = this.prepareEnvironment(options.environment, sandbox);
            // Execute the command
            const result = await this.executeCommand(command, workingDirectory, environment, timeout, useShell, executionId);
            // Add to history
            this.addToHistory(result);
            return result;
        }
        catch (error) {
            const result = {
                success: false,
                stdout: '',
                stderr: error instanceof Error ? error.message : 'Unknown error',
                exitCode: -1,
                duration: Date.now() - startTime,
                command
            };
            this.addToHistory(result);
            return result;
        }
    }
    /**
    * Execute command and capture output
    */
    executeCommand(command, workingDirectory, environment, timeout, useShell, executionId) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            // Parse command and arguments
            const { cmd, args } = this.parseCommand(command, useShell);
            // Spawn process
            const childProcess = (0, child_process_1.spawn)(cmd, args, {
                cwd: workingDirectory,
                env: environment,
                shell: useShell,
                windowsHide: true
            });
            // Store process for potential cancellation
            this.runningProcesses.set(executionId, childProcess);
            // Set timeout
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                childProcess.kill('SIGTERM');
                // Force kill after 5 seconds if still running
                setTimeout(() => {
                    if (!childProcess.killed) {
                        childProcess.kill('SIGKILL');
                    }
                }, 5000);
            }, timeout);
            // Allow Node.js to exit even if timer is active
            timeoutHandle.unref();
            // Capture stdout
            childProcess.stdout?.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                logger.debug(text);
            });
            // Capture stderr
            childProcess.stderr?.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                logger.debug(text);
            });
            // Handle process exit
            childProcess.on('close', (exitCode) => {
                clearTimeout(timeoutHandle);
                this.runningProcesses.delete(executionId);
                const duration = Date.now() - startTime;
                const result = {
                    success: !timedOut && (exitCode === 0 || exitCode === null),
                    stdout: stdout.trim(),
                    stderr: timedOut ? 'Command timed out' : stderr.trim(),
                    exitCode: timedOut ? -1 : (exitCode || 0),
                    duration,
                    command
                };
                logger.info(`Command completed in ${duration}ms with exit code ${result.exitCode}`);
                resolve(result);
            });
            // Handle process errors
            childProcess.on('error', (error) => {
                clearTimeout(timeoutHandle);
                this.runningProcesses.delete(executionId);
                const duration = Date.now() - startTime;
                const result = {
                    success: false,
                    stdout: stdout.trim(),
                    stderr: error.message,
                    exitCode: -1,
                    duration,
                    command
                };
                logger.error(`Command failed: ${error.message}`);
                resolve(result);
            });
        });
    }
    /**
    * Parse command into executable and arguments
    */
    parseCommand(command, useShell) {
        if (useShell) {
            // Use shell to execute the full command
            const isWindows = process.platform === 'win32';
            return {
                cmd: isWindows ? 'cmd.exe' : '/bin/sh',
                args: isWindows ? ['/c', command] : ['-c', command]
            };
        }
        else {
            // Parse command and arguments manually
            const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            const cmd = parts[0] || '';
            const args = parts.slice(1).map(arg => arg.replace(/^"|"$/g, ''));
            return { cmd, args };
        }
    }
    /**
    * Prepare environment variables
    */
    prepareEnvironment(customEnv, sandbox) {
        if (sandbox) {
            // Sandboxed: Only include safe environment variables
            const safeEnv = {
                PATH: process.env.PATH || '',
                HOME: process.env.HOME || '',
                USER: process.env.USER || '',
                SHELL: process.env.SHELL || '',
                LANG: process.env.LANG || '',
                LC_ALL: process.env.LC_ALL || '',
                NODE_ENV: 'development',
                ...customEnv
            };
            return safeEnv;
        }
        else {
            // Not sandboxed: Include all environment variables
            return {
                ...process.env,
                ...customEnv
            };
        }
    }
    /**
    * Check if command is destructive
    */
    isDestructive(command) {
        const lowerCommand = command.toLowerCase();
        return this.destructiveCommands.some(destructive => lowerCommand.includes(destructive.toLowerCase()));
    }
    /**
    * Confirm destructive command with user
    */
    async confirmDestructiveCommand(command) {
        const result = await vscode.window.showWarningMessage(` This command may be destructive:\n\n${command}\n\nAre you sure you want to execute it?`, { modal: true }, 'Execute', 'Cancel');
        return result === 'Execute';
    }
    /**
    * Validate working directory
    */
    isValidWorkingDirectory(dir) {
        try {
            const fs = require('fs');
            return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
        }
        catch {
            return false;
        }
    }
    /**
    * Add execution result to history
    */
    addToHistory(result) {
        this.executionHistory.push(result);
        // Keep history size manageable
        if (this.executionHistory.length > this.maxHistorySize) {
            this.executionHistory.shift();
        }
    }
    /**
    * Get execution history
    */
    getHistory() {
        return [...this.executionHistory];
    }
    /**
    * Cancel a running command
    */
    async cancelCommand(executionId) {
        const process = this.runningProcesses.get(executionId);
        if (!process) {
            return false;
        }
        try {
            process.kill('SIGTERM');
            // Force kill after 5 seconds if still running
            setTimeout(() => {
                if (!process.killed) {
                    process.kill('SIGKILL');
                }
            }, 5000);
            this.runningProcesses.delete(executionId);
            return true;
        }
        catch (error) {
            logger.error('Failed to cancel command', error);
            return false;
        }
    }
    /**
    * Cancel all running commands
    */
    async cancelAll() {
        const processes = Array.from(this.runningProcesses.entries());
        for (const [id, process] of processes) {
            try {
                process.kill('SIGTERM');
                this.runningProcesses.delete(id);
            }
            catch (error) {
                logger.error(`Failed to cancel command ${id}`, error);
            }
        }
        // Force kill any remaining processes after 5 seconds
        setTimeout(() => {
            for (const [id, process] of this.runningProcesses.entries()) {
                try {
                    if (!process.killed) {
                        process.kill('SIGKILL');
                    }
                    this.runningProcesses.delete(id);
                }
                catch (error) {
                    logger.error(`Failed to force kill command ${id}`, error);
                }
            }
        }, 5000);
    }
    /**
    * Get running commands count
    */
    getRunningCount() {
        return this.runningProcesses.size;
    }
    /**
    * Clear execution history
    */
    clearHistory() {
        this.executionHistory = [];
    }
    /**
    * Dispose and cleanup
    */
    async dispose() {
        await this.cancelAll();
        this.clearHistory();
    }
}
exports.ExecutionEngine = ExecutionEngine;
//# sourceMappingURL=executionEngine.js.map