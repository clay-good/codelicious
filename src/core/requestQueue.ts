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

export enum RequestPriority {
 CRITICAL = 0, // User-facing, interactive
 HIGH = 1, // Important background tasks
 NORMAL = 2, // Regular requests
 LOW = 3, // Batch processing, analytics
 BACKGROUND = 4 // Lowest priority
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
 maxConcurrent: number; // Max concurrent requests
 maxQueueSize: number; // Max queued requests
 fairnessWindow: number; // Time window for fairness (ms)
 defaultTimeout: number; // Default timeout (ms)
 name?: string; // Queue name for logging
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

export class RequestQueueError extends Error {
 constructor(message: string) {
 super(message);
 this.name = 'RequestQueueError';
 }
}

export class RequestQueue {
 private queue: Array<QueuedRequest<any>> = [];
 private activeRequests = 0;
 private totalProcessed = 0;
 private totalFailed = 0;
 private totalTimeout = 0;
 private totalCancelled = 0;
 private totalWaitTime = 0;
 private totalProcessTime = 0;
 private lastProcessedByPriority: Map<RequestPriority, number> = new Map();

 private readonly options: Required<RequestQueueOptions>;

 constructor(options: Partial<RequestQueueOptions> = {}) {
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
 async enqueue<T>(
 operation: () => Promise<T>,
 priority: RequestPriority = RequestPriority.NORMAL,
 options?: { timeout?: number; cancellationToken?: CancellationToken }
 ): Promise<T> {
 // Check queue size
 if (this.queue.length >= this.options.maxQueueSize) {
 throw new RequestQueueError(
 `Queue is full (${this.options.maxQueueSize} requests). Please try again later.`
 );
 }

 return new Promise<T>((resolve, reject) => {
 const request: QueuedRequest<T> = {
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
 private async processNext(): Promise<void> {
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
 private async processRequest<T>(request: QueuedRequest<T>): Promise<void> {
 const startTime = Date.now();
 const waitTime = startTime - request.timestamp;
 this.totalWaitTime += waitTime;

 try {
 // Check cancellation
 if (request.cancellationToken?.isCancellationRequested) {
 throw new Error('Request cancelled');
 }

 // Set up timeout
 const timeoutPromise = new Promise<never>((_, reject) => {
 setTimeout(() => {
 reject(new Error(`Request timeout after ${request.timeout}ms`));
 }, request.timeout!);
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

 } catch (error: unknown) {
 // Handle errors
 const errorMessage = error instanceof Error ? error.message : String(error);
 if (errorMessage.includes('timeout')) {
 this.totalTimeout++;
 } else if (errorMessage.includes('cancelled')) {
 this.totalCancelled++;
 } else {
 this.totalFailed++;
 }

 request.reject(error instanceof Error ? error : new Error(String(error)));

 } finally {
 this.activeRequests--;

 // Process next request
 this.processNext();
 }
 }

 /**
 * Get next request with fairness
 */
 private getNextRequest(): QueuedRequest<any> | null {
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
 private sortQueue(): void {
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
 private generateId(): string {
 return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
 }

 /**
 * Get queue statistics
 */
 getStats(): RequestQueueStats {
 const queuedByPriority: Record<RequestPriority, number> = {
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
 clear(): void {
 // Reject all pending requests
 for (const request of this.queue) {
 request.reject(new Error('Queue cleared'));
 }
 this.queue = [];
 }

 /**
 * Get queue size
 */
 size(): number {
 return this.queue.length;
 }

 /**
 * Check if queue is empty
 */
 isEmpty(): boolean {
 return this.queue.length === 0 && this.activeRequests === 0;
 }

 /**
 * Wait for queue to be empty
 */
 async waitForEmpty(): Promise<void> {
 while (!this.isEmpty()) {
 await new Promise(resolve => setTimeout(resolve, 100));
 }
 }
}

/**
 * Request Queue Manager - Manages multiple request queues
 */
export class RequestQueueManager {
 private queues = new Map<string, RequestQueue>();

 /**
 * Get or create request queue
 */
 getQueue(name: string, options?: Partial<RequestQueueOptions>): RequestQueue {
 if (!this.queues.has(name)) {
 this.queues.set(name, new RequestQueue({ ...options, name }));
 }
 return this.queues.get(name)!;
 }

 /**
 * Enqueue request to named queue
 */
 async enqueue<T>(
 queueName: string,
 operation: () => Promise<T>,
 priority?: RequestPriority,
 options?: { timeout?: number; cancellationToken?: CancellationToken; queueOptions?: Partial<RequestQueueOptions> }
 ): Promise<T> {
 const queue = this.getQueue(queueName, options?.queueOptions);
 return queue.enqueue(operation, priority, options);
 }

 /**
 * Get all queue stats
 */
 getAllStats(): Map<string, RequestQueueStats> {
 const stats = new Map<string, RequestQueueStats>();
 for (const [name, queue] of this.queues.entries()) {
 stats.set(name, queue.getStats());
 }
 return stats;
 }

 /**
 * Clear all queues
 */
 clearAll(): void {
 for (const queue of this.queues.values()) {
 queue.clear();
 }
 }

 /**
 * Remove queue
 */
 remove(name: string): void {
 const queue = this.queues.get(name);
 if (queue) {
 queue.clear();
 this.queues.delete(name);
 }
 }

 /**
 * Clear all queues
 */
 clear(): void {
 this.clearAll();
 this.queues.clear();
 }
}

