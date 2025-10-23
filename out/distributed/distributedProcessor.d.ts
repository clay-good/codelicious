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
import { WorkerPoolConfig } from './workerPool';
import { GeneratedCode } from '../autonomous/contextAwareCodeGenerator';
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
    throughput: number;
    estimatedTimeRemaining: number;
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
export declare class DistributedProcessor {
    private workerPool;
    private config;
    private cache;
    private isInitialized;
    constructor(config?: Partial<DistributedProcessingConfig>);
    /**
    * Initialize distributed processor
    */
    initialize(): Promise<void>;
    /**
    * Process files in distributed manner
    */
    processFiles<T>(files: GeneratedCode[], taskType: string, processor: (file: GeneratedCode) => any, options?: {
        onProgress?: (progress: ProcessingProgress) => void;
        priority?: number;
    }): Promise<DistributedProcessingResult<T>>;
    /**
    * Process with retry logic
    */
    private processWithRetry;
    /**
    * Create batches from files
    */
    private createBatches;
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
    * Get worker pool metrics
    */
    getMetrics(): import("./workerPool").WorkerPoolMetrics;
    /**
    * Get worker info
    */
    getWorkerInfo(): import("./workerPool").WorkerInfo[];
    /**
    * Shutdown distributed processor
    */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=distributedProcessor.d.ts.map