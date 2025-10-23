"use strict";
/**
 * Embedding Generation Optimization
 *
 * Optimizes:
 * - Batch processing
 * - Embedding compression
 * - Incremental updates
 * - Parallel generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParallelEmbeddingGenerator = exports.EmbeddingOptimizer = void 0;
class EmbeddingOptimizer {
    constructor(config) {
        this.config = {
            batchSize: 100,
            parallelBatches: 4,
            compressionEnabled: true,
            compressionRatio: 0.5,
            incrementalUpdates: true,
            cacheEnabled: true,
            ...config
        };
        this.embeddingCache = new Map();
    }
    /**
    * Optimize batch embedding generation
    */
    async optimizeBatchGeneration(texts, generateFn) {
        // Check cache first
        const { cached, uncached } = this.partitionCached(texts);
        if (uncached.length === 0) {
            return cached.map(t => this.embeddingCache.get(t));
        }
        // Process in optimized batches
        const batches = this.createOptimalBatches(uncached);
        const results = [];
        // Process batches in parallel
        for (let i = 0; i < batches.length; i += this.config.parallelBatches) {
            const parallelBatches = batches.slice(i, i + this.config.parallelBatches);
            const batchResults = await Promise.all(parallelBatches.map(batch => generateFn(batch)));
            // Flatten results
            for (const batchResult of batchResults) {
                results.push(...batchResult);
            }
        }
        // Cache new embeddings
        if (this.config.cacheEnabled) {
            uncached.forEach((text, i) => {
                this.embeddingCache.set(text, results[i]);
            });
        }
        // Merge cached and new results
        return this.mergeResults(texts, cached, uncached, results);
    }
    /**
    * Compress embeddings
    */
    compressEmbedding(embedding) {
        if (!this.config.compressionEnabled) {
            return {
                original: embedding,
                compressed: embedding,
                compressionRatio: 1.0,
                reconstructionError: 0
            };
        }
        // Use PCA-like dimensionality reduction
        const targetDim = Math.floor(embedding.length * this.config.compressionRatio);
        const compressed = this.reduceDimensions(embedding, targetDim);
        // Calculate reconstruction error
        const reconstructed = this.reconstructEmbedding(compressed, embedding.length);
        const error = this.calculateReconstructionError(embedding, reconstructed);
        return {
            original: embedding,
            compressed,
            compressionRatio: compressed.length / embedding.length,
            reconstructionError: error
        };
    }
    /**
    * Batch compress embeddings
    */
    batchCompress(embeddings) {
        // Build compression matrix if not exists
        if (!this.compressionMatrix && embeddings.length > 0) {
            this.buildCompressionMatrix(embeddings);
        }
        return embeddings.map(emb => this.compressEmbedding(emb));
    }
    /**
    * Incremental update
    */
    async incrementalUpdate(changedTexts, generateFn) {
        if (!this.config.incrementalUpdates) {
            // Full regeneration
            const texts = Array.from(changedTexts.values());
            const embeddings = await this.optimizeBatchGeneration(texts, generateFn);
            const result = new Map();
            Array.from(changedTexts.keys()).forEach((key, i) => {
                result.set(key, embeddings[i]);
            });
            return result;
        }
        // Only update changed texts
        const texts = Array.from(changedTexts.values());
        const embeddings = await this.optimizeBatchGeneration(texts, generateFn);
        const result = new Map();
        Array.from(changedTexts.keys()).forEach((key, i) => {
            result.set(key, embeddings[i]);
            // Update cache
            if (this.config.cacheEnabled) {
                this.embeddingCache.set(changedTexts.get(key), embeddings[i]);
            }
        });
        return result;
    }
    /**
    * Partition cached and uncached texts
    */
    partitionCached(texts) {
        const cached = [];
        const uncached = [];
        for (const text of texts) {
            if (this.embeddingCache.has(text)) {
                cached.push(text);
            }
            else {
                uncached.push(text);
            }
        }
        return { cached, uncached };
    }
    /**
    * Create optimal batches
    */
    createOptimalBatches(texts) {
        const batches = [];
        for (let i = 0; i < texts.length; i += this.config.batchSize) {
            batches.push(texts.slice(i, i + this.config.batchSize));
        }
        return batches;
    }
    /**
    * Merge cached and new results
    */
    mergeResults(originalTexts, cached, uncached, newResults) {
        const cachedSet = new Set(cached);
        const uncachedMap = new Map();
        uncached.forEach((text, i) => {
            uncachedMap.set(text, newResults[i]);
        });
        return originalTexts.map(text => {
            if (cachedSet.has(text)) {
                return this.embeddingCache.get(text);
            }
            else {
                return uncachedMap.get(text);
            }
        });
    }
    /**
    * Reduce dimensions using PCA-like approach
    */
    reduceDimensions(embedding, targetDim) {
        // Simple truncation for now
        // In production, would use actual PCA or random projection
        return embedding.slice(0, targetDim);
    }
    /**
    * Reconstruct embedding from compressed version
    */
    reconstructEmbedding(compressed, originalDim) {
        // Pad with zeros
        const reconstructed = [...compressed];
        while (reconstructed.length < originalDim) {
            reconstructed.push(0);
        }
        return reconstructed;
    }
    /**
    * Calculate reconstruction error
    */
    calculateReconstructionError(original, reconstructed) {
        let sumSquaredError = 0;
        for (let i = 0; i < original.length; i++) {
            const diff = original[i] - reconstructed[i];
            sumSquaredError += diff * diff;
        }
        return Math.sqrt(sumSquaredError / original.length);
    }
    /**
    * Build compression matrix
    */
    buildCompressionMatrix(embeddings) {
        // This would compute PCA components
        // For now, just initialize
        const dim = embeddings[0].length;
        const targetDim = Math.floor(dim * this.config.compressionRatio);
        this.compressionMatrix = Array(targetDim).fill(0).map(() => Array(dim).fill(0).map(() => Math.random()));
    }
    /**
    * Get cache statistics
    */
    getCacheStats() {
        return {
            size: this.embeddingCache.size,
            hitRate: 0 // Would track actual hit rate
        };
    }
    /**
    * Clear cache
    */
    clearCache() {
        this.embeddingCache.clear();
    }
    /**
    * Prune cache
    */
    pruneCache(maxSize) {
        if (this.embeddingCache.size <= maxSize)
            return;
        // Remove oldest entries (simple LRU)
        const entries = Array.from(this.embeddingCache.entries());
        const toKeep = entries.slice(-maxSize);
        this.embeddingCache.clear();
        for (const [key, value] of toKeep) {
            this.embeddingCache.set(key, value);
        }
    }
}
exports.EmbeddingOptimizer = EmbeddingOptimizer;
/**
 * Parallel Embedding Generator
 */
class ParallelEmbeddingGenerator {
    constructor(workers = 4) {
        this.workers = workers;
    }
    /**
    * Generate embeddings in parallel
    */
    async generateParallel(texts, generateFn) {
        const results = new Array(texts.length);
        // Process in parallel with worker limit
        const promises = [];
        for (let i = 0; i < texts.length; i++) {
            const index = i;
            const promise = generateFn(texts[i]).then(embedding => {
                results[index] = embedding;
            });
            promises.push(promise);
            // Wait if we've reached worker limit
            if (promises.length >= this.workers) {
                await Promise.race(promises);
                // Remove completed promises
                const completed = promises.filter(p => Promise.race([p, Promise.resolve('pending')]).then(r => r !== 'pending'));
                promises.splice(0, completed.length);
            }
        }
        // Wait for remaining
        await Promise.all(promises);
        return results;
    }
}
exports.ParallelEmbeddingGenerator = ParallelEmbeddingGenerator;
//# sourceMappingURL=embeddingOptimizer.js.map