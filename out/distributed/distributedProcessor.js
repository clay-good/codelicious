"use strict";
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
exports.DistributedProcessor = void 0;
const workerPool_1 = require("./workerPool");
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('DistributedProcessor');
class DistributedProcessor {
    constructor(config = {}) {
        this.cache = new Map();
        this.isInitialized = false;
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
        this.workerPool = new workerPool_1.WorkerPool({
            ...this.config.workerPool,
            workerScript
        });
    }
    /**
    * Initialize distributed processor
    */
    async initialize() {
        if (this.isInitialized)
            return;
        logger.info('Initializing distributed processor...');
        await this.workerPool.initialize();
        this.isInitialized = true;
        logger.info('Distributed processor initialized');
    }
    /**
    * Process files in distributed manner
    */
    async processFiles(files, taskType, processor, options = {}) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        const startTime = Date.now();
        const results = new Map();
        const errors = new Map();
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
                            const cached = this.getFromCache(file.filePath);
                            if (cached) {
                                cachedCount++;
                                completed++;
                                results.set(file.filePath, cached);
                                return;
                            }
                        }
                        // Process with retry logic
                        const result = await this.processWithRetry(taskType, { filePath: file.filePath, content: file.content, processor: processor.toString() }, options.priority);
                        // Cache result
                        if (this.config.enableCaching) {
                            this.addToCache(file.filePath, result);
                        }
                        results.set(file.filePath, result);
                        completed++;
                    }
                    catch (error) {
                        errors.set(file.filePath, error);
                        failed++;
                    }
                });
                await Promise.all(batchPromises);
            }
        }
        finally {
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
    async processWithRetry(taskType, data, priority, attempt = 1) {
        try {
            return await this.workerPool.execute(taskType, data, { priority });
        }
        catch (error) {
            if (attempt >= this.config.maxRetries) {
                throw error;
            }
            logger.warn(`Task failed (attempt ${attempt}/${this.config.maxRetries}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt));
            return this.processWithRetry(taskType, data, priority, attempt + 1);
        }
    }
    /**
    * Create batches from files
    */
    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
    /**
    * Get from cache
    */
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached)
            return null;
        const age = Date.now() - cached.timestamp;
        if (age > this.config.cacheTTL) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    }
    /**
    * Add to cache
    */
    addToCache(key, data) {
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
    clearCache() {
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
    async shutdown() {
        logger.info('Shutting down distributed processor...');
        await this.workerPool.shutdown();
        this.clearCache();
        this.isInitialized = false;
        logger.info('Distributed processor shut down');
    }
}
exports.DistributedProcessor = DistributedProcessor;
//# sourceMappingURL=distributedProcessor.js.map