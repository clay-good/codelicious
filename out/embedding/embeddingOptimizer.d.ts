/**
 * Embedding Generation Optimization
 *
 * Optimizes:
 * - Batch processing
 * - Embedding compression
 * - Incremental updates
 * - Parallel generation
 */
export interface EmbeddingOptimizationConfig {
    batchSize: number;
    parallelBatches: number;
    compressionEnabled: boolean;
    compressionRatio: number;
    incrementalUpdates: boolean;
    cacheEnabled: boolean;
}
export interface EmbeddingCompressionResult {
    original: number[];
    compressed: number[];
    compressionRatio: number;
    reconstructionError: number;
}
export declare class EmbeddingOptimizer {
    private config;
    private embeddingCache;
    private compressionMatrix?;
    constructor(config?: Partial<EmbeddingOptimizationConfig>);
    /**
    * Optimize batch embedding generation
    */
    optimizeBatchGeneration(texts: string[], generateFn: (texts: string[]) => Promise<number[][]>): Promise<number[][]>;
    /**
    * Compress embeddings
    */
    compressEmbedding(embedding: number[]): EmbeddingCompressionResult;
    /**
    * Batch compress embeddings
    */
    batchCompress(embeddings: number[][]): EmbeddingCompressionResult[];
    /**
    * Incremental update
    */
    incrementalUpdate(changedTexts: Map<string, string>, generateFn: (texts: string[]) => Promise<number[][]>): Promise<Map<string, number[]>>;
    /**
    * Partition cached and uncached texts
    */
    private partitionCached;
    /**
    * Create optimal batches
    */
    private createOptimalBatches;
    /**
    * Merge cached and new results
    */
    private mergeResults;
    /**
    * Reduce dimensions using PCA-like approach
    */
    private reduceDimensions;
    /**
    * Reconstruct embedding from compressed version
    */
    private reconstructEmbedding;
    /**
    * Calculate reconstruction error
    */
    private calculateReconstructionError;
    /**
    * Build compression matrix
    */
    private buildCompressionMatrix;
    /**
    * Get cache statistics
    */
    getCacheStats(): {
        size: number;
        hitRate: number;
    };
    /**
    * Clear cache
    */
    clearCache(): void;
    /**
    * Prune cache
    */
    pruneCache(maxSize: number): void;
}
/**
 * Parallel Embedding Generator
 */
export declare class ParallelEmbeddingGenerator {
    private workers;
    constructor(workers?: number);
    /**
    * Generate embeddings in parallel
    */
    generateParallel(texts: string[], generateFn: (text: string) => Promise<number[]>): Promise<number[][]>;
}
//# sourceMappingURL=embeddingOptimizer.d.ts.map