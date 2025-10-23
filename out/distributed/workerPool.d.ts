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
import { Worker } from 'worker_threads';
export interface WorkerPoolConfig {
    minWorkers: number;
    maxWorkers: number;
    workerScript: string;
    maxTasksPerWorker: number;
    workerTimeout: number;
    healthCheckInterval: number;
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    memoryLimit: number;
}
export interface WorkerInfo {
    id: string;
    worker: Worker;
    status: 'idle' | 'busy' | 'unhealthy' | 'terminated';
    activeTasks: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
    averageTaskDuration: number;
    memoryUsage: number;
    cpuUsage: number;
    lastHealthCheck: Date;
    createdAt: Date;
}
export interface WorkerTask<T, R> {
    id: string;
    type: string;
    data: T;
    priority: number;
    timeout?: number;
    resolve: (result: R) => void;
    reject: (error: Error) => void;
    startTime?: number;
}
export interface WorkerPoolMetrics {
    totalWorkers: number;
    idleWorkers: number;
    busyWorkers: number;
    unhealthyWorkers: number;
    totalTasksCompleted: number;
    totalTasksFailed: number;
    averageTaskDuration: number;
    throughput: number;
    utilization: number;
    queueSize: number;
}
export declare class WorkerPool {
    private config;
    private workers;
    private taskQueue;
    private healthCheckTimer;
    private scaleTimer;
    private metrics;
    private nextWorkerId;
    constructor(config?: Partial<WorkerPoolConfig>);
    /**
    * Initialize worker pool
    */
    initialize(): Promise<void>;
    /**
    * Execute task on worker pool
    */
    execute<T, R>(type: string, data: T, options?: {
        priority?: number;
        timeout?: number;
    }): Promise<R>;
    /**
    * Spawn new worker
    */
    private spawnWorker;
    /**
    * Terminate worker
    */
    private terminateWorker;
    /**
    * Assign tasks to available workers
    */
    private assignTasks;
    /**
    * Find available worker
    */
    private findAvailableWorker;
    /**
    * Assign task to worker
    */
    private assignTaskToWorker;
    /**
    * Handle worker message
    */
    private handleWorkerMessage;
    /**
    * Start health checks
    */
    private startHealthChecks;
    /**
    * Perform health checks on all workers
    */
    private performHealthChecks;
    /**
    * Start auto-scaling
    */
    private startAutoScaling;
    /**
    * Perform auto-scaling based on utilization
    */
    private performAutoScaling;
    /**
    * Calculate current utilization
    */
    private calculateUtilization;
    /**
    * Update metrics
    */
    private updateMetrics;
    /**
    * Get current metrics
    */
    getMetrics(): WorkerPoolMetrics;
    /**
    * Get worker info
    */
    getWorkerInfo(): WorkerInfo[];
    /**
    * Shutdown worker pool
    */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=workerPool.d.ts.map