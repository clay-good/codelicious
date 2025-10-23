/**
 * L3 Semantic Cache - Similarity-based cache using embeddings
 *
 * Features:
 * - Finds similar queries using cosine similarity
 * - Returns cached results for semantically similar queries
 * - Configurable similarity threshold
 * - Efficient vector search
 */
export interface SemanticCacheEntry<T> {
    key: string;
    query: string;
    embedding: number[];
    value: T;
    timestamp: number;
    ttl?: number;
    hitCount: number;
}
export interface SemanticCacheOptions {
    maxEntries: number;
    similarityThreshold: number;
    defaultTTL?: number;
}
export interface SemanticCacheStats {
    hits: number;
    misses: number;
    entries: number;
    averageSimilarity: number;
}
export interface SemanticMatch<T> {
    entry: SemanticCacheEntry<T>;
    similarity: number;
}
export declare class SemanticCache {
    private options;
    private entries;
    private stats;
    constructor(options: SemanticCacheOptions);
    /**
    * Find similar query in cache
    */
    findSimilar<T>(query: string, embedding: number[], minSimilarity?: number): SemanticMatch<T> | undefined;
    /**
    * Add entry to semantic cache
    */
    set<T>(key: string, query: string, embedding: number[], value: T, ttl?: number): void;
    /**
    * Get entry by exact key
    */
    get<T>(key: string): T | undefined;
    /**
    * Check if key exists
    */
    has(key: string): boolean;
    /**
    * Delete entry
    */
    delete(key: string): boolean;
    /**
    * Clear all entries
    */
    clear(): void;
    /**
    * Get statistics
    */
    getStats(): SemanticCacheStats;
    /**
    * Cleanup expired entries
    */
    cleanup(): number;
    /**
    * Get all entries sorted by hit count
    */
    getTopEntries(limit?: number): SemanticCacheEntry<any>[];
    /**
    * Calculate cosine similarity between two vectors
    */
    private cosineSimilarity;
    /**
    * Evict least used entry
    */
    private evictLeastUsed;
    /**
    * Find multiple similar entries
    */
    findTopMatches<T>(embedding: number[], limit?: number, minSimilarity?: number): SemanticMatch<T>[];
    /**
    * Get cache size
    */
    getSize(): number;
    /**
    * Estimate memory usage in bytes
    */
    estimateMemoryUsage(): number;
}
//# sourceMappingURL=semanticCache.d.ts.map