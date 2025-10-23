/**
 * Distributed Processor - Coordinate distributed processing for large codebases
 *
 * Features:
 * - Worker pool management
 * - Task distribution and load balancing
 * - Distributed caching
 * - Progress tracking
 * - Error handling and retry logic
 * - Performance monitoring
 *
 * Designed for codebases with 100k+ files
 */

import { WorkerPool, WorkerPoolConfig } from './workerPool';
import { GeneratedCode } from '../autonomous/contextAwareCodeGenerator';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const logger = createLogger('DistributedProcessor');

export interface DistributedProcessingConfig {
 workerPool?: Partial<WorkerPoolConfig>;
 enableCaching: boolean;
 cacheTTL: number;
 maxRetries: number;
 retryDelay: number;
 batchSize: number;
 progressInterval: number;
}

export interface ProcessingProgress {
 total: number;
 completed: number;
 failed: number;
 cached: number;
 percentage: number;
 throughput: number; // Files per second
 estimatedTimeRemaining: number; // Seconds
}

export interface DistributedProcessingResult<T> {
 results: Map<string, T>;
 errors: Map<string, Error>;
 metrics: {
 totalFiles: number;
 successfulFiles: number;
 failedFiles: number;
 cachedFiles: number;
 totalDuration: number;
 averageDuration: number;
 throughput: number;
 workerUtilization: number;
 };
}

export class DistributedProcessor {
 private workerPool: WorkerPool;
 private config: DistributedProcessingConfig;
 private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
 private isInitialized = false;

 constructor(config: Partial<DistributedProcessingConfig> = {}) {
 this.config = {
 workerPool: {},
 enableCaching: true,
 cacheTTL: 5 * 60 * 1000, // 5 minutes
 maxRetries: 3,
 retryDelay: 1000,
 batchSize: 100,
 progressInterval: 1000,
 ...config
 };

 // Initialize worker pool with worker script path
 const workerScript = path.join(__dirname, 'worker.js');
 this.workerPool = new WorkerPool({
 ...this.config.workerPool,
 workerScript
 });
 }

 /**
 * Initialize distributed processor
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) return;

 logger.info('Initializing distributed processor...');
 await this.workerPool.initialize();
 this.isInitialized = true;
 logger.info('Distributed processor initialized');
 }

 /**
 * Process files in distributed manner
 */
 async processFiles<T>(
 files: GeneratedCode[],
 taskType: string,
 processor: (file: GeneratedCode) => any,
 options: {
 onProgress?: (progress: ProcessingProgress) => void;
 priority?: number;
 } = {}
 ): Promise<DistributedProcessingResult<T>> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 const startTime = Date.now();
 const results = new Map<string, T>();
 const errors = new Map<string, Error>();
 let cachedCount = 0;

 logger.info(`Processing ${files.length} files with distributed system...`);

 // Progress tracking
 let completed = 0;
 let failed = 0;
 const progressTimer = setInterval(() => {
 if (options.onProgress) {
 const elapsed = (Date.now() - startTime) / 1000;
 const throughput = completed / elapsed;
 const remaining = files.length - completed - failed;
 const estimatedTimeRemaining = remaining / Math.max(throughput, 0.1);

 options.onProgress({
 total: files.length,
 completed,
 failed,
 cached: cachedCount,
 percentage: ((completed + failed) / files.length) * 100,
 throughput,
 estimatedTimeRemaining
 });
 }
 }, this.config.progressInterval);

 try {
 // Process files in batches
 const batches = this.createBatches(files, this.config.batchSize);

 for (const batch of batches) {
 const batchPromises = batch.map(async (file) => {
 try {
 // Check cache
 if (this.config.enableCaching) {
 const cached = this.getFromCache<T>(file.filePath);
 if (cached) {
 cachedCount++;
 completed++;
 results.set(file.filePath, cached);
 return;
 }
 }

 // Process with retry logic
 const result = await this.processWithRetry<T>(
 taskType,
 { filePath: file.filePath, content: file.content, processor: processor.toString() },
 options.priority
 );

 // Cache result
 if (this.config.enableCaching) {
 this.addToCache(file.filePath, result);
 }

 results.set(file.filePath, result);
 completed++;
 } catch (error) {
 errors.set(file.filePath, error as Error);
 failed++;
 }
 });

 await Promise.all(batchPromises);
 }
 } finally {
 clearInterval(progressTimer);
 }

 const duration = Date.now() - startTime;
 const metrics = {
 totalFiles: files.length,
 successfulFiles: results.size,
 failedFiles: errors.size,
 cachedFiles: cachedCount,
 totalDuration: duration,
 averageDuration: duration / files.length,
 throughput: (results.size / duration) * 1000,
 workerUtilization: this.workerPool.getMetrics().utilization
 };

 logger.info(`Distributed processing complete in ${(duration / 1000).toFixed(2)}s`);
 logger.info(` Successful: ${results.size}, Failed: ${errors.size}, Cached: ${cachedCount}`);
 logger.info(` Throughput: ${metrics.throughput.toFixed(2)} files/sec`);
 logger.info(` Worker utilization: ${(metrics.workerUtilization * 100).toFixed(1)}%`);

 return { results, errors, metrics };
 }

 /**
 * Process with retry logic
 */
 private async processWithRetry<T>(
 taskType: string,
 data: unknown,
 priority?: number,
 attempt = 1
 ): Promise<T> {
 try {
 return await this.workerPool.execute<any, T>(taskType, data, { priority });
 } catch (error) {
 if (attempt >= this.config.maxRetries) {
 throw error;
 }

 logger.warn(`Task failed (attempt ${attempt}/${this.config.maxRetries}), retrying...`);
 await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
 return this.processWithRetry<T>(taskType, data, priority, attempt + 1);
 }
 }

 /**
 * Create batches from files
 */
 private createBatches<T>(items: T[], batchSize: number): T[][] {
 const batches: T[][] = [];
 for (let i = 0; i < items.length; i += batchSize) {
 batches.push(items.slice(i, i + batchSize));
 }
 return batches;
 }

 /**
 * Get from cache
 */
 private getFromCache<T>(key: string): T | null {
 const cached = this.cache.get(key);
 if (!cached) return null;

 const age = Date.now() - cached.timestamp;
 if (age > this.config.cacheTTL) {
 this.cache.delete(key);
 return null;
 }

 return cached.data as T;
 }

 /**
 * Add to cache
 */
 private addToCache<T>(key: string, data: T): void {
 this.cache.set(key, {
 data,
 timestamp: Date.now()
 });

 // Limit cache size
 if (this.cache.size > 10000) {
 const entries = Array.from(this.cache.entries());
 entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
 for (let i = 0; i < 1000; i++) {
 this.cache.delete(entries[i][0]);
 }
 }
 }

 /**
 * Clear cache
 */
 clearCache(): void {
 this.cache.clear();
 logger.info('Distributed cache cleared');
 }

 /**
 * Get worker pool metrics
 */
 getMetrics() {
 return this.workerPool.getMetrics();
 }

 /**
 * Get worker info
 */
 getWorkerInfo() {
 return this.workerPool.getWorkerInfo();
 }

 /**
 * Shutdown distributed processor
 */
 async shutdown(): Promise<void> {
 logger.info('Shutting down distributed processor...');
 await this.workerPool.shutdown();
 this.clearCache();
 this.isInitialized = false;
 logger.info('Distributed processor shut down');
 }
}

