"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestQueueManager = exports.RequestQueue = exports.RequestQueueError = exports.RequestPriority = void 0;
var RequestPriority;
(function (RequestPriority) {
    RequestPriority[RequestPriority["CRITICAL"] = 0] = "CRITICAL";
    RequestPriority[RequestPriority["HIGH"] = 1] = "HIGH";
    RequestPriority[RequestPriority["NORMAL"] = 2] = "NORMAL";
    RequestPriority[RequestPriority["LOW"] = 3] = "LOW";
    RequestPriority[RequestPriority["BACKGROUND"] = 4] = "BACKGROUND"; // Lowest priority
})(RequestPriority || (exports.RequestPriority = RequestPriority = {}));
class RequestQueueError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RequestQueueError';
    }
}
exports.RequestQueueError = RequestQueueError;
class RequestQueue {
    constructor(options = {}) {
        this.queue = [];
        this.activeRequests = 0;
        this.totalProcessed = 0;
        this.totalFailed = 0;
        this.totalTimeout = 0;
        this.totalCancelled = 0;
        this.totalWaitTime = 0;
        this.totalProcessTime = 0;
        this.lastProcessedByPriority = new Map();
        this.options = {
            maxConcurrent: options.maxConcurrent ?? 5,
            maxQueueSize: options.maxQueueSize ?? 100,
            fairnessWindow: options.fairnessWindow ?? 5000,
            defaultTimeout: options.defaultTimeout ?? 300000, // 5 minutes
            name: options.name ?? 'RequestQueue'
        };
    }
    /**
    * Enqueue a request
    */
    async enqueue(operation, priority = RequestPriority.NORMAL, options) {
        // Check queue size
        if (this.queue.length >= this.options.maxQueueSize) {
            throw new RequestQueueError(`Queue is full (${this.options.maxQueueSize} requests). Please try again later.`);
        }
        return new Promise((resolve, reject) => {
            const request = {
                id: this.generateId(),
                priority,
                operation,
                resolve,
                reject,
                timestamp: Date.now(),
                timeout: options?.timeout ?? this.options.defaultTimeout,
                cancellationToken: options?.cancellationToken
            };
            // Add to queue
            this.queue.push(request);
            this.sortQueue();
            // Try to process
            this.processNext();
        });
    }
    /**
    * Process next request in queue
    */
    async processNext() {
        // Check if we can process more requests
        if (this.activeRequests >= this.options.maxConcurrent) {
            return;
        }
        // Get next request with fairness
        const request = this.getNextRequest();
        if (!request) {
            return;
        }
        // Remove from queue
        const index = this.queue.indexOf(request);
        if (index !== -1) {
            this.queue.splice(index, 1);
        }
        // Process request
        this.activeRequests++;
        this.processRequest(request);
    }
    /**
    * Process a single request
    */
    async processRequest(request) {
        const startTime = Date.now();
        const waitTime = startTime - request.timestamp;
        this.totalWaitTime += waitTime;
        try {
            // Check cancellation
            if (request.cancellationToken?.isCancellationRequested) {
                throw new Error('Request cancelled');
            }
            // Set up timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Request timeout after ${request.timeout}ms`));
                }, request.timeout);
            });
            // Race between operation and timeout
            const result = await Promise.race([
                request.operation(),
                timeoutPromise
            ]);
            // Success
            const processTime = Date.now() - startTime;
            this.totalProcessTime += processTime;
            this.totalProcessed++;
            this.lastProcessedByPriority.set(request.priority, Date.now());
            request.resolve(result);
        }
        catch (error) {
            // Handle errors
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('timeout')) {
                this.totalTimeout++;
            }
            else if (errorMessage.includes('cancelled')) {
                this.totalCancelled++;
            }
            else {
                this.totalFailed++;
            }
            request.reject(error instanceof Error ? error : new Error(String(error)));
        }
        finally {
            this.activeRequests--;
            // Process next request
            this.processNext();
        }
    }
    /**
    * Get next request with fairness
    */
    getNextRequest() {
        if (this.queue.length === 0) {
            return null;
        }
        const now = Date.now();
        // Check if we should apply fairness
        for (let priority = RequestPriority.CRITICAL; priority <= RequestPriority.BACKGROUND; priority++) {
            const lastProcessed = this.lastProcessedByPriority.get(priority) ?? 0;
            const timeSinceLastProcessed = now - lastProcessed;
            // If this priority hasn't been processed recently, prioritize it
            if (timeSinceLastProcessed > this.options.fairnessWindow) {
                const request = this.queue.find(r => r.priority === priority);
                if (request) {
                    return request;
                }
            }
        }
        // Otherwise, return highest priority request
        return this.queue[0];
    }
    /**
    * Sort queue by priority
    */
    sortQueue() {
        this.queue.sort((a, b) => {
            // First by priority
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            // Then by timestamp (FIFO within same priority)
            return a.timestamp - b.timestamp;
        });
    }
    /**
    * Generate unique ID
    */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
    * Get queue statistics
    */
    getStats() {
        const queuedByPriority = {
            [RequestPriority.CRITICAL]: 0,
            [RequestPriority.HIGH]: 0,
            [RequestPriority.NORMAL]: 0,
            [RequestPriority.LOW]: 0,
            [RequestPriority.BACKGROUND]: 0
        };
        for (const request of this.queue) {
            queuedByPriority[request.priority]++;
        }
        return {
            queueSize: this.queue.length,
            activeRequests: this.activeRequests,
            totalProcessed: this.totalProcessed,
            totalFailed: this.totalFailed,
            totalTimeout: this.totalTimeout,
            totalCancelled: this.totalCancelled,
            averageWaitTime: this.totalProcessed > 0 ? this.totalWaitTime / this.totalProcessed : 0,
            averageProcessTime: this.totalProcessed > 0 ? this.totalProcessTime / this.totalProcessed : 0,
            queuedByPriority
        };
    }
    /**
    * Clear queue
    */
    clear() {
        // Reject all pending requests
        for (const request of this.queue) {
            request.reject(new Error('Queue cleared'));
        }
        this.queue = [];
    }
    /**
    * Get queue size
    */
    size() {
        return this.queue.length;
    }
    /**
    * Check if queue is empty
    */
    isEmpty() {
        return this.queue.length === 0 && this.activeRequests === 0;
    }
    /**
    * Wait for queue to be empty
    */
    async waitForEmpty() {
        while (!this.isEmpty()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}
exports.RequestQueue = RequestQueue;
/**
 * Request Queue Manager - Manages multiple request queues
 */
class RequestQueueManager {
    constructor() {
        this.queues = new Map();
    }
    /**
    * Get or create request queue
    */
    getQueue(name, options) {
        if (!this.queues.has(name)) {
            this.queues.set(name, new RequestQueue({ ...options, name }));
        }
        return this.queues.get(name);
    }
    /**
    * Enqueue request to named queue
    */
    async enqueue(queueName, operation, priority, options) {
        const queue = this.getQueue(queueName, options?.queueOptions);
        return queue.enqueue(operation, priority, options);
    }
    /**
    * Get all queue stats
    */
    getAllStats() {
        const stats = new Map();
        for (const [name, queue] of this.queues.entries()) {
            stats.set(name, queue.getStats());
        }
        return stats;
    }
    /**
    * Clear all queues
    */
    clearAll() {
        for (const queue of this.queues.values()) {
            queue.clear();
        }
    }
    /**
    * Remove queue
    */
    remove(name) {
        const queue = this.queues.get(name);
        if (queue) {
            queue.clear();
            this.queues.delete(name);
        }
    }
    /**
    * Clear all queues
    */
    clear() {
        this.clearAll();
        this.queues.clear();
    }
}
exports.RequestQueueManager = RequestQueueManager;
//# sourceMappingURL=requestQueue.js.map