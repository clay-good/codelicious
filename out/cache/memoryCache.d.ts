/**
 * L1 Memory Cache - In-memory LRU cache for hot data
 *
 * Features:
 * - Instant access (< 1ms)
 * - LRU eviction policy
 * - Size-based limits
 * - TTL support
 * - Thread-safe operations
 */
export interface CacheEntry<T> {
    value: T;
    size: number;
    timestamp: number;
    ttl?: number;
    accessCount: number;
    lastAccess: number;
}
export interface MemoryCacheOptions {
    maxSize: number;
    maxEntries?: number;
    defaultTTL?: number;
}
export interface MemoryCacheStats {
    hits: number;
    misses: number;
    evictions: number;
    currentSize: number;
    entryCount: number;
    hitRate: number;
}
export declare class MemoryCache {
    private options;
    private cache;
    private accessOrder;
    private currentSize;
    private stats;
    constructor(options: MemoryCacheOptions);
    /**
    * Get a value from cache
    */
    get<T>(key: string): T | undefined;
    /**
    * Set a value in cache
    */
    set<T>(key: string, value: T, ttl?: number): void;
    /**
    * Check if key exists and is not expired
    */
    has(key: string): boolean;
    /**
    * Delete a key from cache
    */
    delete(key: string): boolean;
    /**
    * Clear all entries
    */
    clear(): void;
    /**
    * Get cache statistics
    */
    getStats(): MemoryCacheStats;
    /**
    * Get all keys
    */
    keys(): string[];
    /**
    * Get cache size in bytes
    */
    getSize(): number;
    /**
    * Get entry count
    */
    getCount(): number;
    /**
    * Evict expired entries
    */
    evictExpired(): number;
    /**
    * Check if entry is expired
    */
    private isExpired;
    /**
    * Evict least recently used entry
    */
    private evictLRU;
    /**
    * Update access order for LRU tracking
    */
    private updateAccessOrder;
    /**
    * Remove key from access order
    */
    private removeFromAccessOrder;
    /**
    * Estimate size of a value in bytes
    */
    private estimateSize;
}
//# sourceMappingURL=memoryCache.d.ts.map