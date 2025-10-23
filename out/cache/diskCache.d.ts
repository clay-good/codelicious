/**
 * L2 Disk Cache - File-based cache for warm data
 *
 * Features:
 * - Persistent storage
 * - Fast file I/O
 * - Automatic cleanup
 * - Size limits
 * - TTL support
 */
export interface DiskCacheEntry {
    value: unknown;
    timestamp: number;
    ttl?: number;
    size: number;
}
export interface DiskCacheOptions {
    cacheDir: string;
    maxSize: number;
    defaultTTL?: number;
    cleanupInterval?: number;
}
export interface DiskCacheStats {
    hits: number;
    misses: number;
    writes: number;
    deletes: number;
    currentSize: number;
    fileCount: number;
}
export declare class DiskCache {
    private options;
    private stats;
    private currentSize;
    private cleanupTimer?;
    private index;
    constructor(options: DiskCacheOptions);
    /**
    * Initialize disk cache
    */
    initialize(): Promise<void>;
    /**
    * Get a value from cache
    */
    get<T>(key: string): Promise<T | undefined>;
    /**
    * Set a value in cache
    */
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    /**
    * Check if key exists
    */
    has(key: string): boolean;
    /**
    * Delete a key from cache
    */
    delete(key: string): Promise<boolean>;
    /**
    * Clear all cache
    */
    clear(): Promise<void>;
    /**
    * Get cache statistics
    */
    getStats(): DiskCacheStats;
    /**
    * Cleanup expired entries
    */
    cleanup(): Promise<number>;
    /**
    * Dispose resources
    */
    dispose(): void;
    /**
    * Build index from existing files
    */
    private buildIndex;
    /**
    * Start cleanup timer
    */
    private startCleanup;
    /**
    * Evict oldest entry
    */
    private evictOldest;
    /**
    * Check if entry is expired
    */
    private isExpired;
    /**
    * Get file path for a key
    */
    private getFilePath;
    /**
    * Format size for display
    */
    private formatSize;
}
//# sourceMappingURL=diskCache.d.ts.map