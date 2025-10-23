/**
 * Request Queue - Priority queue for AI requests with fair scheduling
 * RELIABILITY: Manages concurrent requests, prevents overload, ensures fairness
 *
 * Features:
 * - Priority-based scheduling
 * - Concurrency control
 * - Fair scheduling (prevent starvation)
 * - Backpressure handling
 * - Queue metrics
 * - Timeout support
 */
import { CancellationToken } from '../utils/cancellationToken';
export declare enum RequestPriority {
    CRITICAL = 0,// User-facing, interactive
    HIGH = 1,// Important background tasks
    NORMAL = 2,// Regular requests
    LOW = 3,// Batch processing, analytics
    BACKGROUND = 4
}
export interface QueuedRequest<T> {
    id: string;
    priority: RequestPriority;
    operation: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
    timeout?: number;
    cancellationToken?: CancellationToken;
}
export interface RequestQueueOptions {
    maxConcurrent: number;
    maxQueueSize: number;
    fairnessWindow: number;
    defaultTimeout: number;
    name?: string;
}
export interface RequestQueueStats {
    queueSize: number;
    activeRequests: number;
    totalProcessed: number;
    totalFailed: number;
    totalTimeout: number;
    totalCancelled: number;
    averageWaitTime: number;
    averageProcessTime: number;
    queuedByPriority: Record<RequestPriority, number>;
}
export declare class RequestQueueError extends Error {
    constructor(message: string);
}
export declare class RequestQueue {
    private queue;
    private activeRequests;
    private totalProcessed;
    private totalFailed;
    private totalTimeout;
    private totalCancelled;
    private totalWaitTime;
    private totalProcessTime;
    private lastProcessedByPriority;
    private readonly options;
    constructor(options?: Partial<RequestQueueOptions>);
    /**
    * Enqueue a request
    */
    enqueue<T>(operation: () => Promise<T>, priority?: RequestPriority, options?: {
        timeout?: number;
        cancellationToken?: CancellationToken;
    }): Promise<T>;
    /**
    * Process next request in queue
    */
    private processNext;
    /**
    * Process a single request
    */
    private processRequest;
    /**
    * Get next request with fairness
    */
    private getNextRequest;
    /**
    * Sort queue by priority
    */
    private sortQueue;
    /**
    * Generate unique ID
    */
    private generateId;
    /**
    * Get queue statistics
    */
    getStats(): RequestQueueStats;
    /**
    * Clear queue
    */
    clear(): void;
    /**
    * Get queue size
    */
    size(): number;
    /**
    * Check if queue is empty
    */
    isEmpty(): boolean;
    /**
    * Wait for queue to be empty
    */
    waitForEmpty(): Promise<void>;
}
/**
 * Request Queue Manager - Manages multiple request queues
 */
export declare class RequestQueueManager {
    private queues;
    /**
    * Get or create request queue
    */
    getQueue(name: string, options?: Partial<RequestQueueOptions>): RequestQueue;
    /**
    * Enqueue request to named queue
    */
    enqueue<T>(queueName: string, operation: () => Promise<T>, priority?: RequestPriority, options?: {
        timeout?: number;
        cancellationToken?: CancellationToken;
        queueOptions?: Partial<RequestQueueOptions>;
    }): Promise<T>;
    /**
    * Get all queue stats
    */
    getAllStats(): Map<string, RequestQueueStats>;
    /**
    * Clear all queues
    */
    clearAll(): void;
    /**
    * Remove queue
    */
    remove(name: string): void;
    /**
    * Clear all queues
    */
    clear(): void;
}
//# sourceMappingURL=requestQueue.d.ts.map