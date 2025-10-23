/**
 * Cache Manager - Multi-layer cache system
 *
 * Implements a 3-layer caching strategy:
 * - L1: In-memory cache (hot data, < 1ms access)
 * - L2: Disk cache (warm data, < 10ms access)
 * - L3: Semantic cache (similar queries, embedding-based)
 *
 * Features:
 * - Automatic promotion/demotion between layers
 * - TTL support per entry
 * - Size-based eviction
 * - Cache statistics and monitoring
 * - Semantic similarity matching
 */
import * as vscode from 'vscode';
import { ConfigurationManager } from '../core/configurationManager';
import { CacheStats } from '../types';
export interface CacheOptions {
    ttl?: number;
    layer?: 'memory' | 'disk' | 'semantic' | 'all';
    semanticQuery?: string;
    semanticEmbedding?: number[];
}
export declare class CacheManager {
    private context;
    private configManager;
    private memoryCache?;
    private diskCache?;
    private semanticCache?;
    private isInitialized;
    constructor(context: vscode.ExtensionContext, configManager: ConfigurationManager);
    /**
    * Initialize the cache system
    */
    initialize(): Promise<void>;
    /**
    * Get a value from cache (checks all layers)
    */
    get<T>(key: string, options?: CacheOptions): Promise<T | undefined>;
    /**
    * Set a value in cache (writes to all appropriate layers)
    */
    set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
    /**
    * Check if key exists in cache
    */
    has(key: string): boolean;
    /**
    * Delete a key from all cache layers
    */
    delete(key: string): Promise<void>;
    /**
    * Clear all caches
    */
    clear(): Promise<void>;
    /**
    * Get cache statistics
    */
    getStats(): CacheStats;
    /**
    * Get detailed statistics for all layers
    */
    getDetailedStats(): {
        memory: import("./memoryCache").MemoryCacheStats | undefined;
        disk: import("./diskCache").DiskCacheStats | undefined;
        semantic: import("./semanticCache").SemanticCacheStats | undefined;
        combined: CacheStats;
    } | null;
    /**
    * Cleanup expired entries in all layers
    */
    cleanup(): Promise<void>;
    /**
    * Clean up resources
    */
    dispose(): Promise<void>;
    /**
    * Parse size string (e.g., "100MB", "1GB") to bytes
    */
    private parseSize;
    /**
    * Format size for display
    */
    private formatSize;
}
//# sourceMappingURL=cacheManager.d.ts.map