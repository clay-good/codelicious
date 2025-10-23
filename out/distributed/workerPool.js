"use strict";
/**
 * Worker Pool Manager - Manage worker threads for distributed processing
 *
 * Features:
 * - Dynamic worker scaling (scale up/down based on load)
 * - Health monitoring (detect and replace unhealthy workers)
 * - Task distribution (intelligent load balancing)
 * - Resource management (CPU, memory limits)
 * - Worker lifecycle management (spawn, terminate, restart)
 * - Performance metrics (throughput, latency, utilization)
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
exports.WorkerPool = void 0;
const worker_threads_1 = require("worker_threads");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('WorkerPool');
class WorkerPool {
    constructor(config = {}) {
        this.workers = new Map();
        this.taskQueue = [];
        this.healthCheckTimer = null;
        this.scaleTimer = null;
        this.nextWorkerId = 0;
        const cpuCount = os.cpus().length;
        this.config = {
            minWorkers: 2,
            maxWorkers: Math.max(4, cpuCount),
            workerScript: path.join(__dirname, 'worker.js'),
            maxTasksPerWorker: 10,
            workerTimeout: 300000, // 5 minutes
            healthCheckInterval: 30000, // 30 seconds
            scaleUpThreshold: 0.8, // 80% utilization
            scaleDownThreshold: 0.3, // 30% utilization
            memoryLimit: 512, // 512MB per worker
            ...config
        };
        this.metrics = {
            totalWorkers: 0,
            idleWorkers: 0,
            busyWorkers: 0,
            unhealthyWorkers: 0,
            totalTasksCompleted: 0,
            totalTasksFailed: 0,
            averageTaskDuration: 0,
            throughput: 0,
            utilization: 0,
            queueSize: 0
        };
    }
    /**
    * Initialize worker pool
    */
    async initialize() {
        logger.info(`Initializing worker pool with ${this.config.minWorkers}-${this.config.maxWorkers} workers...`);
        // Spawn minimum workers
        for (let i = 0; i < this.config.minWorkers; i++) {
            await this.spawnWorker();
        }
        // Start health checks
        this.startHealthChecks();
        // Start auto-scaling
        this.startAutoScaling();
        logger.info(`Worker pool initialized with ${this.workers.size} workers`);
    }
    /**
    * Execute task on worker pool
    */
    async execute(type, data, options = {}) {
        return new Promise((resolve, reject) => {
            const task = {
                id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                type,
                data,
                priority: options.priority || 0,
                timeout: options.timeout || this.config.workerTimeout,
                resolve,
                reject
            };
            // Add to queue
            this.taskQueue.push(task);
            this.taskQueue.sort((a, b) => b.priority - a.priority); // Higher priority first
            // Try to assign immediately
            this.assignTasks();
        });
    }
    /**
    * Spawn new worker
    */
    async spawnWorker() {
        const workerId = `worker-${this.nextWorkerId++}`;
        const worker = new worker_threads_1.Worker(this.config.workerScript, {
            workerData: {
                workerId,
                memoryLimit: this.config.memoryLimit
            }
        });
        const workerInfo = {
            id: workerId,
            worker,
            status: 'idle',
            activeTasks: 0,
            totalTasksCompleted: 0,
            totalTasksFailed: 0,
            averageTaskDuration: 0,
            memoryUsage: 0,
            cpuUsage: 0,
            lastHealthCheck: new Date(),
            createdAt: new Date()
        };
        // Handle worker messages
        worker.on('message', (message) => {
            this.handleWorkerMessage(workerId, message);
        });
        // Handle worker errors
        worker.on('error', (error) => {
            logger.error(`Worker ${workerId} error`, error);
            workerInfo.status = 'unhealthy';
        });
        // Handle worker exit
        worker.on('exit', (code) => {
            logger.info(`Worker ${workerId} exited with code ${code}`);
            this.workers.delete(workerId);
            this.updateMetrics();
            // Respawn if below minimum
            if (this.workers.size < this.config.minWorkers) {
                this.spawnWorker();
            }
        });
        this.workers.set(workerId, workerInfo);
        this.updateMetrics();
        logger.info(`Spawned worker ${workerId}`);
        return workerInfo;
    }
    /**
    * Terminate worker
    */
    async terminateWorker(workerId) {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo)
            return;
        logger.info(`Terminating worker ${workerId}...`);
        workerInfo.status = 'terminated';
        // Add timeout to prevent hanging
        const terminatePromise = workerInfo.worker.terminate();
        const timeoutPromise = new Promise((resolve) => setTimeout(() => {
            logger.warn(`Worker ${workerId} termination timed out, forcing cleanup`);
            resolve();
        }, 2000));
        await Promise.race([terminatePromise, timeoutPromise]);
        this.workers.delete(workerId);
        this.updateMetrics();
    }
    /**
    * Assign tasks to available workers
    */
    assignTasks() {
        while (this.taskQueue.length > 0) {
            // Find available worker
            const availableWorker = this.findAvailableWorker();
            if (!availableWorker)
                break;
            // Get next task
            const task = this.taskQueue.shift();
            // Assign task to worker
            this.assignTaskToWorker(availableWorker, task);
        }
        this.updateMetrics();
    }
    /**
    * Find available worker
    */
    findAvailableWorker() {
        for (const workerInfo of this.workers.values()) {
            if (workerInfo.status === 'idle' ||
                (workerInfo.status === 'busy' && workerInfo.activeTasks < this.config.maxTasksPerWorker)) {
                return workerInfo;
            }
        }
        return null;
    }
    /**
    * Assign task to worker
    */
    assignTaskToWorker(workerInfo, task) {
        workerInfo.activeTasks++;
        workerInfo.status = 'busy';
        task.startTime = Date.now();
        // Send task to worker
        workerInfo.worker.postMessage({
            type: 'task',
            taskId: task.id,
            taskType: task.type,
            data: task.data
        });
        // Set timeout
        const timeout = setTimeout(() => {
            task.reject(new Error(`Task ${task.id} timed out after ${task.timeout}ms`));
            workerInfo.activeTasks--;
            workerInfo.totalTasksFailed++;
            if (workerInfo.activeTasks === 0) {
                workerInfo.status = 'idle';
            }
            this.assignTasks();
        }, task.timeout);
        // Store task info for later
        workerInfo[`task-${task.id}`] = { task, timeout };
    }
    /**
    * Handle worker message
    */
    handleWorkerMessage(workerId, message) {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo)
            return;
        if (message.type === 'task-complete') {
            const taskInfo = workerInfo[`task-${message.taskId}`];
            if (!taskInfo)
                return;
            const { task, timeout } = taskInfo;
            clearTimeout(timeout);
            // Update worker stats
            workerInfo.activeTasks--;
            workerInfo.totalTasksCompleted++;
            const duration = Date.now() - task.startTime;
            workerInfo.averageTaskDuration =
                (workerInfo.averageTaskDuration * (workerInfo.totalTasksCompleted - 1) + duration) /
                    workerInfo.totalTasksCompleted;
            if (workerInfo.activeTasks === 0) {
                workerInfo.status = 'idle';
            }
            // Resolve task
            task.resolve(message.result);
            // Clean up
            delete workerInfo[`task-${message.taskId}`];
            // Assign next task
            this.assignTasks();
        }
        else if (message.type === 'task-error') {
            const taskInfo = workerInfo[`task-${message.taskId}`];
            if (!taskInfo)
                return;
            const { task, timeout } = taskInfo;
            clearTimeout(timeout);
            // Update worker stats
            workerInfo.activeTasks--;
            workerInfo.totalTasksFailed++;
            if (workerInfo.activeTasks === 0) {
                workerInfo.status = 'idle';
            }
            // Reject task
            task.reject(new Error(message.error));
            // Clean up
            delete workerInfo[`task-${message.taskId}`];
            // Assign next task
            this.assignTasks();
        }
        else if (message.type === 'health') {
            workerInfo.memoryUsage = message.memoryUsage;
            workerInfo.cpuUsage = message.cpuUsage;
            workerInfo.lastHealthCheck = new Date();
            if (workerInfo.status === 'unhealthy' && message.healthy) {
                workerInfo.status = 'idle';
            }
        }
    }
    /**
    * Start health checks
    */
    startHealthChecks() {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckInterval);
    }
    /**
    * Perform health checks on all workers
    */
    async performHealthChecks() {
        for (const [workerId, workerInfo] of this.workers) {
            // Check if worker is responsive
            const timeSinceLastCheck = Date.now() - workerInfo.lastHealthCheck.getTime();
            if (timeSinceLastCheck > this.config.healthCheckInterval * 2) {
                logger.warn(`Worker ${workerId} unresponsive, marking as unhealthy`);
                workerInfo.status = 'unhealthy';
            }
            // Check memory usage
            if (workerInfo.memoryUsage > this.config.memoryLimit) {
                logger.warn(`Worker ${workerId} exceeds memory limit (${workerInfo.memoryUsage}MB > ${this.config.memoryLimit}MB)`);
                workerInfo.status = 'unhealthy';
            }
            // Request health status
            workerInfo.worker.postMessage({ type: 'health-check' });
        }
        // Replace unhealthy workers
        for (const [workerId, workerInfo] of this.workers) {
            if (workerInfo.status === 'unhealthy' && workerInfo.activeTasks === 0) {
                logger.info(`Replacing unhealthy worker ${workerId}...`);
                await this.terminateWorker(workerId);
                await this.spawnWorker();
            }
        }
        this.updateMetrics();
    }
    /**
    * Start auto-scaling
    */
    startAutoScaling() {
        this.scaleTimer = setInterval(() => {
            this.performAutoScaling();
        }, 10000); // Check every 10 seconds
    }
    /**
    * Perform auto-scaling based on utilization
    */
    async performAutoScaling() {
        const utilization = this.calculateUtilization();
        // Scale up if utilization is high
        if (utilization > this.config.scaleUpThreshold && this.workers.size < this.config.maxWorkers) {
            const workersToAdd = Math.min(Math.ceil((this.config.maxWorkers - this.workers.size) / 2), this.config.maxWorkers - this.workers.size);
            logger.info(`Scaling up: adding ${workersToAdd} workers (utilization: ${(utilization * 100).toFixed(1)}%)`);
            for (let i = 0; i < workersToAdd; i++) {
                await this.spawnWorker();
            }
        }
        // Scale down if utilization is low
        if (utilization < this.config.scaleDownThreshold && this.workers.size > this.config.minWorkers) {
            const workersToRemove = Math.min(Math.ceil((this.workers.size - this.config.minWorkers) / 2), this.workers.size - this.config.minWorkers);
            logger.info(`Scaling down: removing ${workersToRemove} workers (utilization: ${(utilization * 100).toFixed(1)}%)`);
            // Remove idle workers first
            let removed = 0;
            for (const [workerId, workerInfo] of this.workers) {
                if (removed >= workersToRemove)
                    break;
                if (workerInfo.status === 'idle') {
                    await this.terminateWorker(workerId);
                    removed++;
                }
            }
        }
        this.updateMetrics();
    }
    /**
    * Calculate current utilization
    */
    calculateUtilization() {
        if (this.workers.size === 0)
            return 0;
        const totalCapacity = this.workers.size * this.config.maxTasksPerWorker;
        const activeTasks = Array.from(this.workers.values())
            .reduce((sum, w) => sum + w.activeTasks, 0);
        return activeTasks / totalCapacity;
    }
    /**
    * Update metrics
    */
    updateMetrics() {
        this.metrics.totalWorkers = this.workers.size;
        this.metrics.idleWorkers = Array.from(this.workers.values())
            .filter(w => w.status === 'idle').length;
        this.metrics.busyWorkers = Array.from(this.workers.values())
            .filter(w => w.status === 'busy').length;
        this.metrics.unhealthyWorkers = Array.from(this.workers.values())
            .filter(w => w.status === 'unhealthy').length;
        this.metrics.totalTasksCompleted = Array.from(this.workers.values())
            .reduce((sum, w) => sum + w.totalTasksCompleted, 0);
        this.metrics.totalTasksFailed = Array.from(this.workers.values())
            .reduce((sum, w) => sum + w.totalTasksFailed, 0);
        const avgDurations = Array.from(this.workers.values())
            .map(w => w.averageTaskDuration)
            .filter(d => d > 0);
        this.metrics.averageTaskDuration = avgDurations.length > 0
            ? avgDurations.reduce((sum, d) => sum + d, 0) / avgDurations.length
            : 0;
        this.metrics.utilization = this.calculateUtilization();
        this.metrics.queueSize = this.taskQueue.length;
        // Calculate throughput (tasks per second)
        const totalTasks = this.metrics.totalTasksCompleted + this.metrics.totalTasksFailed;
        if (totalTasks > 0 && this.metrics.averageTaskDuration > 0) {
            this.metrics.throughput = 1000 / this.metrics.averageTaskDuration;
        }
    }
    /**
    * Get current metrics
    */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
    * Get worker info
    */
    getWorkerInfo() {
        return Array.from(this.workers.values());
    }
    /**
    * Shutdown worker pool
    */
    async shutdown() {
        logger.info('Shutting down worker pool...');
        // Stop timers
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        if (this.scaleTimer) {
            clearInterval(this.scaleTimer);
            this.scaleTimer = null;
        }
        // Terminate all workers
        const terminatePromises = Array.from(this.workers.keys()).map(workerId => this.terminateWorker(workerId));
        await Promise.all(terminatePromises);
        logger.info('Worker pool shut down');
    }
}
exports.WorkerPool = WorkerPool;
//# sourceMappingURL=workerPool.js.map