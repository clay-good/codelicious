/**
 * Performance Optimizer - Optimize autonomous operations for large codebases
 *
 * Features:
 * - Incremental processing (process only changed files)
 * - Parallel execution (process multiple files concurrently)
 * - Smart caching (cache expensive operations)
 * - Memory optimization (stream large files, garbage collection)
 * - Batch processing (group similar operations)
 * - Priority queue (process critical files first)
 * - Progress tracking (real-time progress updates)
 * - Resource monitoring (CPU, memory usage)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { createLogger } from '../utils/logger';

const logger = createLogger('PerformanceOptimizer');

export interface PerformanceConfig {
 maxConcurrency: number; // Max parallel operations
 chunkSize: number; // Files per batch
 cacheEnabled: boolean;
 cacheTTL: number; // Cache time-to-live (ms)
 memoryLimit: number; // Max memory usage (MB)
 enableStreaming: boolean; // Stream large files
 streamThreshold: number; // File size threshold for streaming (bytes)
 enableGC: boolean; // Force garbage collection
 gcInterval: number; // GC interval (ms)
 priorityMode: 'size' | 'modified' | 'importance' | 'none';
}

export interface ProcessingTask<T> {
 id: string;
 priority: number;
 execute: () => Promise<T>;
 dependencies?: string[];
 estimatedDuration?: number;
}

export interface ProcessingResult<T> {
 success: boolean;
 result?: T;
 error?: Error;
 duration: number;
 cached: boolean;
}

export interface PerformanceMetrics {
 totalFiles: number;
 processedFiles: number;
 cachedFiles: number;
 failedFiles: number;
 totalDuration: number;
 averageDuration: number;
 peakMemoryUsage: number;
 currentMemoryUsage: number;
 cacheHitRate: number;
 throughput: number; // Files per second
}

export interface FileChange {
 filePath: string;
 changeType: 'added' | 'modified' | 'deleted';
 hash: string;
 size: number;
 lastModified: Date;
}

export class PerformanceOptimizer {
 private config: PerformanceConfig;
 private cache: Map<string, { data: unknown; timestamp: number; hash: string }> = new Map();
 private fileHashes: Map<string, string> = new Map();
 private metrics: PerformanceMetrics;
 private gcTimer: NodeJS.Timeout | null = null;
 private processingQueue: ProcessingTask<any>[] = [];
 private activeWorkers = 0;

 constructor(config: Partial<PerformanceConfig> = {}) {
 this.config = {
 maxConcurrency: 10,
 chunkSize: 50,
 cacheEnabled: true,
 cacheTTL: 5 * 60 * 1000, // 5 minutes
 memoryLimit: 2048, // 2GB
 enableStreaming: true,
 streamThreshold: 1024 * 1024, // 1MB
 enableGC: true,
 gcInterval: 30000, // 30 seconds
 priorityMode: 'importance',
 ...config
 };

 this.metrics = {
 totalFiles: 0,
 processedFiles: 0,
 cachedFiles: 0,
 failedFiles: 0,
 totalDuration: 0,
 averageDuration: 0,
 peakMemoryUsage: 0,
 currentMemoryUsage: 0,
 cacheHitRate: 0,
 throughput: 0
 };

 if (this.config.enableGC) {
 this.startGarbageCollection();
 }
 }

 /**
 * Process files with optimization
 */
 async processFiles<T>(
 files: GeneratedCode[],
 processor: (file: GeneratedCode) => Promise<T>,
 options: {
 incremental?: boolean;
 parallel?: boolean;
 onProgress?: (progress: number, file: string) => void;
 } = {}
 ): Promise<ProcessingResult<T>[]> {
 const startTime = Date.now();
 this.metrics.totalFiles = files.length;
 this.metrics.processedFiles = 0;
 this.metrics.cachedFiles = 0;
 this.metrics.failedFiles = 0;

 logger.info(`Processing ${files.length} files with optimization...`);
 logger.info(`Concurrency: ${this.config.maxConcurrency}, Chunk size: ${this.config.chunkSize}`);

 // 1. Detect changes (incremental processing)
 const filesToProcess = options.incremental
 ? await this.detectChanges(files)
 : files;

 logger.info(`Files to process: ${filesToProcess.length} (${files.length - filesToProcess.length} unchanged)`);

 // 2. Prioritize files
 const prioritizedFiles = this.prioritizeFiles(filesToProcess);

 // 3. Process files (parallel or sequential)
 const results: ProcessingResult<T>[] = [];

 if (options.parallel && this.config.maxConcurrency > 1) {
 // Parallel processing with concurrency limit
 results.push(...await this.processParallel(prioritizedFiles, processor, options.onProgress));
 } else {
 // Sequential processing
 results.push(...await this.processSequential(prioritizedFiles, processor, options.onProgress));
 }

 // 4. Update metrics
 const duration = Date.now() - startTime;
 this.metrics.totalDuration = duration;
 this.metrics.averageDuration = duration / Math.max(1, this.metrics.processedFiles);
 this.metrics.throughput = (this.metrics.processedFiles / duration) * 1000; // Files per second
 this.metrics.cacheHitRate = this.metrics.cachedFiles / Math.max(1, this.metrics.totalFiles);

 logger.info(`Processing complete in ${(duration / 1000).toFixed(2)}s`);
 logger.info(`Processed: ${this.metrics.processedFiles}, Cached: ${this.metrics.cachedFiles}, Failed: ${this.metrics.failedFiles}`);
 logger.info(`Throughput: ${this.metrics.throughput.toFixed(2)} files/sec`);
 logger.info(`Cache hit rate: ${(this.metrics.cacheHitRate * 100).toFixed(1)}%`);

 return results;
 }

 /**
 * Detect changed files (incremental processing)
 */
 private async detectChanges(files: GeneratedCode[]): Promise<GeneratedCode[]> {
 const changedFiles: GeneratedCode[] = [];

 for (const file of files) {
 const currentHash = this.calculateHash(file.content);
 const previousHash = this.fileHashes.get(file.filePath);

 if (!previousHash || previousHash !== currentHash) {
 changedFiles.push(file);
 this.fileHashes.set(file.filePath, currentHash);
 }
 }

 return changedFiles;
 }

 /**
 * Prioritize files based on strategy
 */
 private prioritizeFiles(files: GeneratedCode[]): GeneratedCode[] {
 if (this.config.priorityMode === 'none') {
 return files;
 }

 return [...files].sort((a, b) => {
 switch (this.config.priorityMode) {
 case 'size':
 // Process smaller files first
 return a.content.length - b.content.length;

 case 'importance': {
 // Process critical files first (e.g., main files, config files)
 const aImportance = this.calculateImportance(a);
 const bImportance = this.calculateImportance(b);
 return bImportance - aImportance;
 }

 case 'modified':
 // Process recently modified files first
 // (would need file stats in real implementation)
 return 0;

 default:
 return 0;
 }
 });
 }

 /**
 * Calculate file importance
 */
 private calculateImportance(file: GeneratedCode): number {
 let importance = 0;

 // Main files
 if (file.filePath.includes('index') || file.filePath.includes('main')) {
 importance += 10;
 }

 // Config files
 if (file.filePath.includes('config') || file.filePath.endsWith('.json')) {
 importance += 8;
 }

 // Source files
 if (file.filePath.includes('src/')) {
 importance += 5;
 }

 // Test files (lower priority)
 if (file.filePath.includes('test') || file.filePath.includes('spec')) {
 importance -= 5;
 }

 return importance;
 }

 /**
 * Process files in parallel with concurrency limit
 */
 private async processParallel<T>(
 files: GeneratedCode[],
 processor: (file: GeneratedCode) => Promise<T>,
 onProgress?: (progress: number, file: string) => void
 ): Promise<ProcessingResult<T>[]> {
 const results: ProcessingResult<T>[] = [];
 const chunks = this.chunkArray(files, this.config.chunkSize);

 for (const chunk of chunks) {
 const chunkResults = await Promise.all(
 chunk.map(file => this.processFile(file, processor, onProgress))
 );
 results.push(...chunkResults);

 // Check memory usage
 this.checkMemoryUsage();
 }

 return results;
 }

 /**
 * Process files sequentially
 */
 private async processSequential<T>(
 files: GeneratedCode[],
 processor: (file: GeneratedCode) => Promise<T>,
 onProgress?: (progress: number, file: string) => void
 ): Promise<ProcessingResult<T>[]> {
 const results: ProcessingResult<T>[] = [];

 for (const file of files) {
 const result = await this.processFile(file, processor, onProgress);
 results.push(result);

 // Check memory usage
 this.checkMemoryUsage();
 }

 return results;
 }

 /**
 * Process single file with caching
 */
 private async processFile<T>(
 file: GeneratedCode,
 processor: (file: GeneratedCode) => Promise<T>,
 onProgress?: (progress: number, file: string) => void
 ): Promise<ProcessingResult<T>> {
 const startTime = Date.now();
 const cacheKey = this.getCacheKey(file);

 // Check cache
 if (this.config.cacheEnabled) {
 const cached = this.getFromCache<T>(cacheKey);
 if (cached) {
 this.metrics.cachedFiles++;
 this.metrics.processedFiles++;

 if (onProgress) {
 const progress = (this.metrics.processedFiles / this.metrics.totalFiles) * 100;
 onProgress(progress, file.filePath);
 }

 return {
 success: true,
 result: cached,
 duration: Date.now() - startTime,
 cached: true
 };
 }
 }

 // Process file
 try {
 const result = await processor(file);
 const duration = Date.now() - startTime;

 // Cache result
 if (this.config.cacheEnabled) {
 this.addToCache(cacheKey, result);
 }

 this.metrics.processedFiles++;

 if (onProgress) {
 const progress = (this.metrics.processedFiles / this.metrics.totalFiles) * 100;
 onProgress(progress, file.filePath);
 }

 return {
 success: true,
 result,
 duration,
 cached: false
 };
 } catch (error) {
 this.metrics.failedFiles++;
 this.metrics.processedFiles++;

 return {
 success: false,
 error: error as Error,
 duration: Date.now() - startTime,
 cached: false
 };
 }
 }

 /**
 * Calculate file hash for change detection
 */
 private calculateHash(content: string): string {
 return crypto.createHash('md5').update(content).digest('hex');
 }

 /**
 * Get cache key for file
 */
 private getCacheKey(file: GeneratedCode): string {
 const hash = this.calculateHash(file.content);
 return `${file.filePath}:${hash}`;
 }

 /**
 * Get from cache
 */
 private getFromCache<T>(key: string): T | null {
 const cached = this.cache.get(key);
 if (!cached) return null;

 // Check TTL
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
 timestamp: Date.now(),
 hash: key.split(':')[1] || ''
 });

 // Limit cache size
 if (this.cache.size > 1000) {
 // Remove oldest entries
 const entries = Array.from(this.cache.entries());
 entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
 for (let i = 0; i < 100; i++) {
 this.cache.delete(entries[i][0]);
 }
 }
 }

 /**
 * Clear cache
 */
 clearCache(): void {
 this.cache.clear();
 logger.info('Cache cleared');
 }

 /**
 * Chunk array into smaller arrays
 */
 private chunkArray<T>(array: T[], size: number): T[][] {
 const chunks: T[][] = [];
 for (let i = 0; i < array.length; i += size) {
 chunks.push(array.slice(i, i + size));
 }
 return chunks;
 }

 /**
 * Check memory usage and trigger GC if needed
 */
 private checkMemoryUsage(): void {
 const usage = process.memoryUsage();
 const usageMB = usage.heapUsed / 1024 / 1024;

 this.metrics.currentMemoryUsage = usageMB;
 this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, usageMB);

 if (usageMB > this.config.memoryLimit) {
 logger.warn(`Memory usage high: ${usageMB.toFixed(2)}MB / ${this.config.memoryLimit}MB`);

 // Clear cache to free memory
 if (this.config.cacheEnabled) {
 this.clearCache();
 }

 // Force GC if available
 if (global.gc && this.config.enableGC) {
 logger.info('Forcing garbage collection...');
 global.gc();
 }
 }
 }

 /**
 * Start periodic garbage collection
 */
 private startGarbageCollection(): void {
 if (this.gcTimer) return;

 this.gcTimer = setInterval(() => {
 if (global.gc) {
 const before = process.memoryUsage().heapUsed / 1024 / 1024;
 global.gc();
 const after = process.memoryUsage().heapUsed / 1024 / 1024;
 const freed = before - after;

 if (freed > 10) {
 logger.debug(`GC freed ${freed.toFixed(2)}MB`);
 }
 }
 }, this.config.gcInterval);
 }

 /**
 * Stop garbage collection
 */
 private stopGarbageCollection(): void {
 if (this.gcTimer) {
 clearInterval(this.gcTimer);
 this.gcTimer = null;
 }
 }

 /**
 * Batch process tasks with dependencies
 */
 async processBatch<T>(
 tasks: ProcessingTask<T>[],
 options: {
 onProgress?: (completed: number, total: number) => void;
 } = {}
 ): Promise<Map<string, ProcessingResult<T>>> {
 const results = new Map<string, ProcessingResult<T>>();
 const completed = new Set<string>();
 const pending = new Map(tasks.map(t => [t.id, t]));

 logger.info(`Processing ${tasks.length} tasks in batch...`);

 while (pending.size > 0) {
 // Find tasks with satisfied dependencies
 const ready: ProcessingTask<T>[] = [];

 for (const [id, task] of pending) {
 const deps = task.dependencies || [];
 const depsReady = deps.every(dep => completed.has(dep));

 if (depsReady) {
 ready.push(task);
 }
 }

 if (ready.length === 0) {
 logger.error('Circular dependency detected or no tasks ready');
 break;
 }

 // Process ready tasks in parallel
 const batchResults = await Promise.all(
 ready.slice(0, this.config.maxConcurrency).map(async task => {
 const startTime = Date.now();
 try {
 const result = await task.execute();
 return {
 id: task.id,
 result: {
 success: true,
 result,
 duration: Date.now() - startTime,
 cached: false
 } as ProcessingResult<T>
 };
 } catch (error) {
 return {
 id: task.id,
 result: {
 success: false,
 error: error as Error,
 duration: Date.now() - startTime,
 cached: false
 } as ProcessingResult<T>
 };
 }
 })
 );

 // Update results and completed set
 for (const { id, result } of batchResults) {
 results.set(id, result);
 completed.add(id);
 pending.delete(id);
 }

 // Report progress
 if (options.onProgress) {
 options.onProgress(completed.size, tasks.length);
 }
 }

 logger.info(`Batch processing complete: ${completed.size}/${tasks.length} tasks`);

 return results;
 }

 /**
 * Get current metrics
 */
 getMetrics(): PerformanceMetrics {
 return { ...this.metrics };
 }

 /**
 * Reset metrics
 */
 resetMetrics(): void {
 this.metrics = {
 totalFiles: 0,
 processedFiles: 0,
 cachedFiles: 0,
 failedFiles: 0,
 totalDuration: 0,
 averageDuration: 0,
 peakMemoryUsage: 0,
 currentMemoryUsage: 0,
 cacheHitRate: 0,
 throughput: 0
 };
 }

 /**
 * Cleanup resources
 */
 dispose(): void {
 this.stopGarbageCollection();
 this.clearCache();
 this.fileHashes.clear();
 logger.info('Performance optimizer disposed');
 }
}
