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
import { GeneratedCode } from './contextAwareCodeGenerator';
export interface PerformanceConfig {
    maxConcurrency: number;
    chunkSize: number;
    cacheEnabled: boolean;
    cacheTTL: number;
    memoryLimit: number;
    enableStreaming: boolean;
    streamThreshold: number;
    enableGC: boolean;
    gcInterval: number;
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
    throughput: number;
}
export interface FileChange {
    filePath: string;
    changeType: 'added' | 'modified' | 'deleted';
    hash: string;
    size: number;
    lastModified: Date;
}
export declare class PerformanceOptimizer {
    private config;
    private cache;
    private fileHashes;
    private metrics;
    private gcTimer;
    private processingQueue;
    private activeWorkers;
    constructor(config?: Partial<PerformanceConfig>);
    /**
    * Process files with optimization
    */
    processFiles<T>(files: GeneratedCode[], processor: (file: GeneratedCode) => Promise<T>, options?: {
        incremental?: boolean;
        parallel?: boolean;
        onProgress?: (progress: number, file: string) => void;
    }): Promise<ProcessingResult<T>[]>;
    /**
    * Detect changed files (incremental processing)
    */
    private detectChanges;
    /**
    * Prioritize files based on strategy
    */
    private prioritizeFiles;
    /**
    * Calculate file importance
    */
    private calculateImportance;
    /**
    * Process files in parallel with concurrency limit
    */
    private processParallel;
    /**
    * Process files sequentially
    */
    private processSequential;
    /**
    * Process single file with caching
    */
    private processFile;
    /**
    * Calculate file hash for change detection
    */
    private calculateHash;
    /**
    * Get cache key for file
    */
    private getCacheKey;
    /**
    * Get from cache
    */
    private getFromCache;
    /**
    * Add to cache
    */
    private addToCache;
    /**
    * Clear cache
    */
    clearCache(): void;
    /**
    * Chunk array into smaller arrays
    */
    private chunkArray;
    /**
    * Check memory usage and trigger GC if needed
    */
    private checkMemoryUsage;
    /**
    * Start periodic garbage collection
    */
    private startGarbageCollection;
    /**
    * Stop garbage collection
    */
    private stopGarbageCollection;
    /**
    * Batch process tasks with dependencies
    */
    processBatch<T>(tasks: ProcessingTask<T>[], options?: {
        onProgress?: (completed: number, total: number) => void;
    }): Promise<Map<string, ProcessingResult<T>>>;
    /**
    * Get current metrics
    */
    getMetrics(): PerformanceMetrics;
    /**
    * Reset metrics
    */
    resetMetrics(): void;
    /**
    * Cleanup resources
    */
    dispose(): void;
}
//# sourceMappingURL=performanceOptimizer.d.ts.map