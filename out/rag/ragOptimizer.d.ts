/**
 * RAG System Optimization
 *
 * Optimizes:
 * - Vector search performance
 * - Caching strategies
 * - Query performance
 * - Result ranking
 */
import { VectorStore } from '../embedding/vectorStore';
export interface OptimizationMetrics {
    queryLatency: number;
    cacheHitRate: number;
    retrievalQuality: number;
    throughput: number;
}
export interface OptimizationConfig {
    enableQueryCache: boolean;
    enableResultCache: boolean;
    enablePrefetching: boolean;
    cacheSize: number;
    prefetchThreshold: number;
    parallelQueries: number;
}
export declare class RAGOptimizer {
    private config;
    private queryCache;
    private resultCache;
    private metrics;
    constructor(config?: Partial<OptimizationConfig>);
    /**
    * Optimize vector search
    */
    optimizeVectorSearch(query: number[], vectorStore: VectorStore, k?: number): Promise<any[]>;
    /**
    * Perform optimized search
    */
    private performOptimizedSearch;
    /**
    * Re-rank results
    */
    private rerankResults;
    /**
    * Cache results
    */
    private cacheResults;
    /**
    * Prefetch related queries
    */
    private prefetchRelatedQueries;
    /**
    * Generate related queries
    */
    private generateRelatedQueries;
    /**
    * Get cache key
    */
    private getCacheKey;
    /**
    * Update metrics
    */
    private updateMetrics;
    /**
    * Get metrics
    */
    getMetrics(): OptimizationMetrics;
    /**
    * Clear cache
    */
    clearCache(): void;
    /**
    * Optimize index
    */
    optimizeIndex(vectorStore: VectorStore): Promise<void>;
    /**
    * Batch queries
    */
    batchQueries(queries: number[][], vectorStore: VectorStore, k?: number): Promise<any[][]>;
    /**
    * Warm cache
    */
    warmCache(commonQueries: number[][], vectorStore: VectorStore, k?: number): Promise<void>;
}
/**
 * Query Optimizer
 */
export declare class QueryOptimizer {
    /**
    * Optimize query embedding
    */
    optimizeQuery(query: string): string;
    /**
    * Expand query with synonyms
    */
    expandQuery(query: string): string[];
}
//# sourceMappingURL=ragOptimizer.d.ts.map