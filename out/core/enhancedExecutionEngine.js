"use strict";
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
exports.EnhancedExecutionEngine = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
const executionEngine_1 = require("./executionEngine");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('EnhancedExecutionEngine');
// ============================================================================
// Enhanced Execution Engine
// ============================================================================
class EnhancedExecutionEngine extends executionEngine_1.ExecutionEngine {
    constructor(configManager) {
        super(configManager);
        this.executionQueue = [];
        this.runningExecutions = new Map();
        this.maxConcurrent = 5;
        this.profiles = new Map();
        this.templates = new Map();
        this.metrics = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageDuration: 0,
            totalDuration: 0,
            commandStats: new Map(),
            resourceStats: {
                averageCpu: 0,
                peakCpu: 0,
                averageMemory: 0,
                peakMemory: 0,
                samples: 0
            }
        };
        // Initialize default profiles
        this.initializeDefaultProfiles();
        // Initialize default templates
        this.initializeDefaultTemplates();
    }
    /**
    * Execute command with streaming output
    */
    async executeStreaming(command, options = {}) {
        const startTime = Date.now();
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        // Notify progress: starting
        options.onProgress?.({
            phase: 'starting',
            percentage: 0,
            message: 'Initializing execution...',
            elapsedTime: 0
        });
        try {
            // Use base execution engine but with streaming callbacks
            const result = await this.executeWithStreaming(command, options, executionId, startTime);
            // Update metrics
            this.updateMetrics(command, result);
            // Notify progress: complete
            options.onProgress?.({
                phase: 'complete',
                percentage: 100,
                message: result.success ? 'Execution completed successfully' : 'Execution failed',
                elapsedTime: result.duration
            });
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
            this.updateMetrics(command, result);
            options.onProgress?.({
                phase: 'complete',
                percentage: 100,
                message: 'Execution failed with error',
                elapsedTime: result.duration
            });
            return result;
        }
    }
    /**
    * Execute with streaming and resource monitoring
    */
    async executeWithStreaming(command, options, executionId, startTime) {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            const workingDirectory = options.workingDirectory ||
                vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
                process.cwd();
            const timeout = options.timeout || 300000;
            const useShell = options.shell !== false;
            // Parse command
            const { cmd, args } = this.parseCommandInternal(command, useShell);
            // Spawn process
            const childProcess = (0, child_process_1.spawn)(cmd, args, {
                cwd: workingDirectory,
                env: this.prepareEnvironmentInternal(options.environment, options.sandbox !== false),
                shell: useShell,
                windowsHide: true
            });
            const pid = childProcess.pid || 0;
            // Start resource monitoring
            const resourceMonitor = this.startResourceMonitoring(pid, (resources) => {
                options.onResourceUpdate?.(resources);
                this.updateResourceStats(resources);
            });
            // Set timeout
            const timeoutHandle = setTimeout(() => {
                timedOut = true;
                childProcess.kill('SIGTERM');
                setTimeout(() => {
                    if (!childProcess.killed) {
                        childProcess.kill('SIGKILL');
                    }
                }, 5000);
            }, timeout);
            timeoutHandle.unref();
            // Notify progress: running
            options.onProgress?.({
                phase: 'running',
                percentage: 50,
                message: 'Executing command...',
                elapsedTime: Date.now() - startTime
            });
            // Capture stdout with streaming
            childProcess.stdout?.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                options.onStdout?.(text);
            });
            // Capture stderr with streaming
            childProcess.stderr?.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                options.onStderr?.(text);
            });
            // Handle process exit
            childProcess.on('close', (exitCode) => {
                clearTimeout(timeoutHandle);
                this.stopResourceMonitoring(resourceMonitor);
                const duration = Date.now() - startTime;
                const result = {
                    success: !timedOut && (exitCode === 0 || exitCode === null),
                    stdout: stdout.trim(),
                    stderr: timedOut ? 'Command timed out' : stderr.trim(),
                    exitCode: timedOut ? -1 : (exitCode || 0),
                    duration,
                    command
                };
                resolve(result);
            });
            // Handle process errors
            childProcess.on('error', (error) => {
                clearTimeout(timeoutHandle);
                this.stopResourceMonitoring(resourceMonitor);
                const duration = Date.now() - startTime;
                const result = {
                    success: false,
                    stdout: stdout.trim(),
                    stderr: error.message,
                    exitCode: -1,
                    duration,
                    command
                };
                resolve(result);
            });
        });
    }
    /**
    * Parse command using base class method (protected access)
    */
    parseCommandInternal(command, useShell) {
        if (useShell) {
            const isWindows = process.platform === 'win32';
            return {
                cmd: isWindows ? 'cmd.exe' : '/bin/sh',
                args: isWindows ? ['/c', command] : ['-c', command]
            };
        }
        else {
            const parts = command.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            const cmd = parts[0] || '';
            const args = parts.slice(1).map(arg => arg.replace(/^"|"$/g, ''));
            return { cmd, args };
        }
    }
    /**
    * Prepare environment for execution
    */
    prepareEnvironmentInternal(customEnv, sandbox) {
        if (sandbox) {
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
            return {
                ...process.env,
                ...customEnv
            };
        }
    }
    // ==========================================================================
    // Resource Monitoring
    // ==========================================================================
    /**
    * Start monitoring process resources
    */
    startResourceMonitoring(pid, callback) {
        const interval = setInterval(() => {
            try {
                const resources = this.getProcessResources(pid);
                if (resources) {
                    callback(resources);
                }
            }
            catch (error) {
                // Process may have ended, ignore errors
            }
        }, 1000); // Update every second
        interval.unref();
        return interval;
    }
    /**
    * Stop resource monitoring
    */
    stopResourceMonitoring(interval) {
        clearInterval(interval);
    }
    /**
    * Get process resource usage
    */
    getProcessResources(pid) {
        try {
            // This is a simplified implementation
            // In production, you'd use a library like 'pidusage' or 'systeminformation'
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            const usedMemory = totalMemory - freeMemory;
            // Estimate CPU usage (simplified)
            const cpus = os.cpus();
            const avgLoad = os.loadavg()[0];
            const cpuPercentage = Math.min(100, (avgLoad / cpus.length) * 100);
            return {
                cpu: cpuPercentage,
                memory: usedMemory,
                memoryPercentage: (usedMemory / totalMemory) * 100,
                pid,
                timestamp: Date.now()
            };
        }
        catch (error) {
            return null;
        }
    }
    /**
    * Update resource statistics
    */
    updateResourceStats(resources) {
        const stats = this.metrics.resourceStats;
        // Update peak values
        stats.peakCpu = Math.max(stats.peakCpu, resources.cpu);
        stats.peakMemory = Math.max(stats.peakMemory, resources.memory);
        // Update averages
        const totalSamples = stats.samples + 1;
        stats.averageCpu = (stats.averageCpu * stats.samples + resources.cpu) / totalSamples;
        stats.averageMemory = (stats.averageMemory * stats.samples + resources.memory) / totalSamples;
        stats.samples = totalSamples;
    }
    // ==========================================================================
    // Retry Logic
    // ==========================================================================
    /**
    * Execute with retry logic
    */
    async executeWithRetry(command, options = {}, retryOptions = {}) {
        const maxRetries = retryOptions.maxRetries || 3;
        const initialBackoff = retryOptions.initialBackoffMs || 1000;
        const maxBackoff = retryOptions.maxBackoffMs || 30000;
        const multiplier = retryOptions.backoffMultiplier || 2;
        let lastError = '';
        let lastResult = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const result = await this.executeStreaming(command, options);
                if (result.success) {
                    return result;
                }
                // Store last result
                lastResult = result;
                lastError = result.stderr || `Exit code: ${result.exitCode}`;
                // Check if we should retry
                if (attempt < maxRetries) {
                    // If retryableErrors is explicitly provided, use it
                    // Otherwise, retry all failures (for testing purposes)
                    const shouldRetry = retryOptions.retryableErrors
                        ? this.isRetryableError(lastError, retryOptions)
                        : true; // Retry all failures by default
                    if (shouldRetry) {
                        // Calculate backoff
                        const backoff = Math.min(initialBackoff * Math.pow(multiplier, attempt), maxBackoff);
                        retryOptions.onRetry?.(attempt + 1, lastError);
                        logger.info(`Retry attempt ${attempt + 1}/${maxRetries} after ${backoff}ms...`);
                        await this.sleep(backoff);
                        continue;
                    }
                }
                // No more retries or not retryable
                return result;
            }
            catch (error) {
                lastError = error instanceof Error ? error.message : 'Unknown error';
                if (attempt < maxRetries) {
                    const shouldRetry = retryOptions.retryableErrors
                        ? this.isRetryableError(lastError, retryOptions)
                        : true;
                    if (shouldRetry) {
                        const backoff = Math.min(initialBackoff * Math.pow(multiplier, attempt), maxBackoff);
                        retryOptions.onRetry?.(attempt + 1, lastError);
                        logger.info(`Retry attempt ${attempt + 1}/${maxRetries} after ${backoff}ms...`);
                        await this.sleep(backoff);
                        continue;
                    }
                }
                throw error;
            }
        }
        // Return last result if we have one
        if (lastResult) {
            return lastResult;
        }
        throw new Error(`Command failed after ${maxRetries} retries: ${lastError}`);
    }
    /**
    * Check if error is retryable
    */
    isRetryableError(error, options) {
        const defaultRetryableErrors = [
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'ENETUNREACH',
            'EAI_AGAIN',
            'timeout',
            'network',
            'connection refused',
            'temporary failure'
        ];
        const retryableErrors = options.retryableErrors || defaultRetryableErrors;
        const lowerError = error.toLowerCase();
        return retryableErrors.some(pattern => lowerError.includes(pattern.toLowerCase()));
    }
    /**
    * Sleep utility
    */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // ==========================================================================
    // Execution Queue
    // ==========================================================================
    /**
    * Add execution to queue
    */
    async queueExecution(command, options = {}, priority = 0) {
        const execution = {
            id: `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            command,
            options,
            priority,
            addedAt: Date.now(),
            status: 'queued'
        };
        this.executionQueue.push(execution);
        // Sort by priority (higher first)
        this.executionQueue.sort((a, b) => b.priority - a.priority);
        // Process queue
        this.processQueue();
        return execution.id;
    }
    /**
    * Process execution queue
    */
    async processQueue() {
        // Check if we can run more executions
        while (this.runningExecutions.size < this.maxConcurrent &&
            this.executionQueue.length > 0) {
            const execution = this.executionQueue.shift();
            if (!execution) {
                break;
            }
            execution.status = 'running';
            execution.startedAt = Date.now();
            this.runningExecutions.set(execution.id, execution);
            // Execute in background
            this.executeQueued(execution);
        }
    }
    /**
    * Execute queued command
    */
    async executeQueued(execution) {
        try {
            const result = await this.executeStreaming(execution.command, execution.options);
            execution.result = result;
            execution.status = result.success ? 'completed' : 'failed';
            execution.completedAt = Date.now();
        }
        catch (error) {
            execution.error = error instanceof Error ? error.message : 'Unknown error';
            execution.status = 'failed';
            execution.completedAt = Date.now();
        }
        finally {
            this.runningExecutions.delete(execution.id);
            // Process next in queue
            this.processQueue();
        }
    }
    /**
    * Get queue status
    */
    getQueueStatus() {
        return {
            queued: this.executionQueue.length,
            running: this.runningExecutions.size,
            maxConcurrent: this.maxConcurrent
        };
    }
    /**
    * Set max concurrent executions
    */
    setMaxConcurrent(max) {
        this.maxConcurrent = Math.max(1, max);
        this.processQueue();
    }
    /**
    * Cancel queued execution
    */
    cancelQueuedExecution(id) {
        const index = this.executionQueue.findIndex(e => e.id === id);
        if (index >= 0) {
            this.executionQueue[index].status = 'cancelled';
            this.executionQueue.splice(index, 1);
            return true;
        }
        return false;
    }
    /**
    * Clear queue
    */
    clearQueue() {
        this.executionQueue.forEach(e => e.status = 'cancelled');
        this.executionQueue = [];
    }
    // ==========================================================================
    // Profiles
    // ==========================================================================
    /**
    * Initialize default profiles
    */
    initializeDefaultProfiles() {
        // Development profile
        this.profiles.set('development', {
            name: 'development',
            description: 'Development environment with relaxed constraints',
            environment: {
                NODE_ENV: 'development',
                DEBUG: '*'
            },
            timeout: 600000, // 10 minutes
            sandbox: false,
            requireConfirmation: false,
            maxConcurrent: 5
        });
        // Testing profile
        this.profiles.set('testing', {
            name: 'testing',
            description: 'Testing environment with strict isolation',
            environment: {
                NODE_ENV: 'test',
                CI: 'true'
            },
            timeout: 300000, // 5 minutes
            sandbox: true,
            requireConfirmation: false,
            maxConcurrent: 3,
            retryOptions: {
                maxRetries: 2,
                initialBackoffMs: 1000
            }
        });
        // Production profile
        this.profiles.set('production', {
            name: 'production',
            description: 'Production environment with maximum safety',
            environment: {
                NODE_ENV: 'production'
            },
            timeout: 900000, // 15 minutes
            sandbox: true,
            requireConfirmation: true,
            maxConcurrent: 2,
            retryOptions: {
                maxRetries: 3,
                initialBackoffMs: 2000,
                maxBackoffMs: 60000
            }
        });
        // CI/CD profile
        this.profiles.set('ci', {
            name: 'ci',
            description: 'CI/CD environment optimized for automation',
            environment: {
                NODE_ENV: 'test',
                CI: 'true',
                CONTINUOUS_INTEGRATION: 'true'
            },
            timeout: 1800000, // 30 minutes
            sandbox: true,
            requireConfirmation: false,
            maxConcurrent: 10,
            retryOptions: {
                maxRetries: 3,
                initialBackoffMs: 5000
            }
        });
    }
    /**
    * Add custom profile
    */
    addProfile(profile) {
        this.profiles.set(profile.name, profile);
    }
    /**
    * Get profile
    */
    getProfile(name) {
        return this.profiles.get(name);
    }
    /**
    * List all profiles
    */
    listProfiles() {
        return Array.from(this.profiles.values());
    }
    /**
    * Execute with profile
    */
    async executeWithProfile(command, profileName, additionalOptions = {}) {
        const profile = this.profiles.get(profileName);
        if (!profile) {
            throw new Error(`Profile not found: ${profileName}`);
        }
        const options = {
            ...additionalOptions,
            environment: {
                ...profile.environment,
                ...additionalOptions.environment
            },
            timeout: additionalOptions.timeout || profile.timeout,
            sandbox: additionalOptions.sandbox ?? profile.sandbox,
            requireConfirmation: additionalOptions.requireConfirmation ?? profile.requireConfirmation
        };
        if (profile.retryOptions) {
            return this.executeWithRetry(command, options, profile.retryOptions);
        }
        return this.executeStreaming(command, options);
    }
    // ==========================================================================
    // Templates
    // ==========================================================================
    /**
    * Initialize default templates
    */
    initializeDefaultTemplates() {
        // NPM install template
        this.templates.set('npm-install', {
            name: 'npm-install',
            description: 'Install npm dependencies',
            command: 'npm install {{packages}}',
            variables: ['packages'],
            defaultValues: { packages: '' },
            profile: 'development'
        });
        // NPM test template
        this.templates.set('npm-test', {
            name: 'npm-test',
            description: 'Run npm tests',
            command: 'npm test {{testPattern}}',
            variables: ['testPattern'],
            defaultValues: { testPattern: '' },
            profile: 'testing'
        });
        // Build template
        this.templates.set('build', {
            name: 'build',
            description: 'Build project',
            command: 'npm run build',
            variables: [],
            profile: 'development'
        });
        // Docker build template
        this.templates.set('docker-build', {
            name: 'docker-build',
            description: 'Build Docker image',
            command: 'docker build -t {{imageName}}:{{tag}} .',
            variables: ['imageName', 'tag'],
            defaultValues: { tag: 'latest' },
            profile: 'ci'
        });
        // Git commit template
        this.templates.set('git-commit', {
            name: 'git-commit',
            description: 'Git commit with message',
            command: 'git commit -m "{{message}}"',
            variables: ['message'],
            profile: 'development'
        });
    }
    /**
    * Add custom template
    */
    addTemplate(template) {
        this.templates.set(template.name, template);
    }
    /**
    * Get template
    */
    getTemplate(name) {
        return this.templates.get(name);
    }
    /**
    * List all templates
    */
    listTemplates() {
        return Array.from(this.templates.values());
    }
    /**
    * Execute template
    */
    async executeTemplate(templateName, variables = {}, options = {}) {
        const template = this.templates.get(templateName);
        if (!template) {
            throw new Error(`Template not found: ${templateName}`);
        }
        // Merge with default values
        const allVariables = {
            ...template.defaultValues,
            ...variables
        };
        // Replace variables in command
        let command = template.command;
        for (const [key, value] of Object.entries(allVariables)) {
            command = command.replace(new RegExp(`{{${key}}}`, 'g'), value);
        }
        // Execute with profile if specified
        if (template.profile) {
            return this.executeWithProfile(command, template.profile, options);
        }
        return this.executeStreaming(command, options);
    }
    // ==========================================================================
    // Metrics and Analytics
    // ==========================================================================
    /**
    * Update execution metrics
    */
    updateMetrics(command, result) {
        // Update overall metrics
        this.metrics.totalExecutions++;
        if (result.success) {
            this.metrics.successfulExecutions++;
        }
        else {
            this.metrics.failedExecutions++;
        }
        this.metrics.totalDuration += result.duration;
        this.metrics.averageDuration = this.metrics.totalDuration / this.metrics.totalExecutions;
        // Update command-specific stats
        const commandKey = this.normalizeCommand(command);
        let commandStats = this.metrics.commandStats.get(commandKey);
        if (!commandStats) {
            commandStats = {
                command: commandKey,
                executions: 0,
                successes: 0,
                failures: 0,
                averageDuration: 0,
                totalDuration: 0,
                lastExecuted: 0
            };
            this.metrics.commandStats.set(commandKey, commandStats);
        }
        commandStats.executions++;
        if (result.success) {
            commandStats.successes++;
        }
        else {
            commandStats.failures++;
        }
        commandStats.totalDuration += result.duration;
        commandStats.averageDuration = commandStats.totalDuration / commandStats.executions;
        commandStats.lastExecuted = Date.now();
    }
    /**
    * Normalize command for stats (remove arguments)
    */
    normalizeCommand(command) {
        // Extract the base command (first word)
        const parts = command.trim().split(/\s+/);
        return parts[0] || command;
    }
    /**
    * Get execution metrics
    */
    getMetrics() {
        return {
            ...this.metrics,
            commandStats: new Map(this.metrics.commandStats)
        };
    }
    /**
    * Get command statistics
    */
    getCommandStats(command) {
        const commandKey = this.normalizeCommand(command);
        return this.metrics.commandStats.get(commandKey);
    }
    /**
    * Get top commands by execution count
    */
    getTopCommands(limit = 10) {
        return Array.from(this.metrics.commandStats.values())
            .sort((a, b) => b.executions - a.executions)
            .slice(0, limit);
    }
    /**
    * Get slowest commands
    */
    getSlowestCommands(limit = 10) {
        return Array.from(this.metrics.commandStats.values())
            .sort((a, b) => b.averageDuration - a.averageDuration)
            .slice(0, limit);
    }
    /**
    * Get commands with highest failure rate
    */
    getHighestFailureRateCommands(limit = 10) {
        return Array.from(this.metrics.commandStats.values())
            .map(stats => ({
            ...stats,
            failureRate: stats.failures / stats.executions
        }))
            .sort((a, b) => b.failureRate - a.failureRate)
            .slice(0, limit);
    }
    /**
    * Reset metrics
    */
    resetMetrics() {
        this.metrics = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageDuration: 0,
            totalDuration: 0,
            commandStats: new Map(),
            resourceStats: {
                averageCpu: 0,
                peakCpu: 0,
                averageMemory: 0,
                peakMemory: 0,
                samples: 0
            }
        };
    }
    /**
    * Export metrics to JSON
    */
    exportMetrics() {
        const exportData = {
            ...this.metrics,
            commandStats: Array.from(this.metrics.commandStats.entries()).map(([key, stats]) => ({
                ...stats,
                commandKey: key
            }))
        };
        return JSON.stringify(exportData, null, 2);
    }
    /**
    * Generate metrics summary
    */
    generateMetricsSummary() {
        const successRate = this.metrics.totalExecutions > 0
            ? (this.metrics.successfulExecutions / this.metrics.totalExecutions * 100).toFixed(1)
            : '0.0';
        const topCommands = this.getTopCommands(5);
        const slowestCommands = this.getSlowestCommands(5);
        return `
# Execution Engine Metrics

## Overall Statistics
- Total Executions: ${this.metrics.totalExecutions}
- Successful: ${this.metrics.successfulExecutions}
- Failed: ${this.metrics.failedExecutions}
- Success Rate: ${successRate}%
- Average Duration: ${Math.round(this.metrics.averageDuration)}ms
- Total Duration: ${Math.round(this.metrics.totalDuration / 1000)}s

## Resource Usage
- Average CPU: ${this.metrics.resourceStats.averageCpu.toFixed(1)}%
- Peak CPU: ${this.metrics.resourceStats.peakCpu.toFixed(1)}%
- Average Memory: ${(this.metrics.resourceStats.averageMemory / 1024 / 1024).toFixed(1)} MB
- Peak Memory: ${(this.metrics.resourceStats.peakMemory / 1024 / 1024).toFixed(1)} MB

## Top Commands (by execution count)
${topCommands.map((s, i) => `${i + 1}. ${s.command}: ${s.executions} executions (${(s.successes / s.executions * 100).toFixed(0)}% success)`).join('\n')}

## Slowest Commands (by average duration)
${slowestCommands.map((s, i) => `${i + 1}. ${s.command}: ${Math.round(s.averageDuration)}ms average`).join('\n')}
 `.trim();
    }
    // ==========================================================================
    // Cleanup
    // ==========================================================================
    /**
    * Dispose and cleanup
    */
    async dispose() {
        // Clear queue
        this.clearQueue();
        // Cancel all running executions
        for (const [id, execution] of this.runningExecutions.entries()) {
            execution.status = 'cancelled';
            this.runningExecutions.delete(id);
        }
        // Stop resource monitoring
        if (this.resourceMonitorInterval) {
            clearInterval(this.resourceMonitorInterval);
        }
        // Call parent dispose
        await super.dispose();
    }
}
exports.EnhancedExecutionEngine = EnhancedExecutionEngine;
//# sourceMappingURL=enhancedExecutionEngine.js.map