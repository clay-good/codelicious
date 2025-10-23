/**
 * Pattern Cache Manager - Intelligent caching for learned patterns
 *
 * Features:
 * - Multi-level caching (memory + disk + semantic)
 * - LRU eviction policy
 * - Pattern versioning
 * - Semantic similarity search
 * - Cache warming and preloading
 * - Pattern invalidation
 * - Cache statistics and monitoring
 */
import * as vscode from 'vscode';
import { CodePattern } from './patternLearner';
import { StructuralPattern } from './advancedPatternRecognizer';
import { EmbeddingManager } from '../embedding/embeddingManager';
export interface CachedPattern {
    pattern: CodePattern | StructuralPattern;
    embedding?: number[];
    version: number;
    lastAccessed: number;
    accessCount: number;
    size: number;
}
export interface PatternCacheOptions {
    maxMemorySize: number;
    maxDiskSize: number;
    ttl: number;
    semanticThreshold: number;
    enableDiskCache: boolean;
    enableSemanticCache: boolean;
}
export interface PatternCacheStats {
    memoryHits: number;
    diskHits: number;
    semanticHits: number;
    misses: number;
    evictions: number;
    totalPatterns: number;
    memorySize: number;
    diskSize: number;
    hitRate: number;
}
export interface SemanticSearchResult {
    pattern: CodePattern | StructuralPattern;
    similarity: number;
    source: 'memory' | 'disk' | 'semantic';
}
export declare class PatternCacheManager {
    private context;
    private embeddingManager?;
    private options;
    private memoryCache;
    private accessOrder;
    private diskCacheKeys;
    private semanticIndex;
    private stats;
    private currentMemorySize;
    private currentDiskSize;
    constructor(context: vscode.ExtensionContext, embeddingManager?: EmbeddingManager | undefined, options?: PatternCacheOptions);
    /**
    * Get pattern from cache (L1 → L2 → L3)
    */
    get(patternId: string): Promise<(CodePattern | StructuralPattern) | undefined>;
    /**
    * Find semantically similar patterns
    */
    findSimilar(query: string, embedding: number[], limit?: number): Promise<SemanticSearchResult[]>;
    /**
    * Set pattern in cache
    */
    set(patternId: string, pattern: CodePattern | StructuralPattern, embedding?: number[]): Promise<void>;
    /**
    * Invalidate pattern (remove from all caches)
    */
    invalidate(patternId: string): Promise<void>;
    /**
    * Warm cache with frequently used patterns
    */
    warmCache(patternIds: string[]): Promise<void>;
    /**
    * Clear all caches
    */
    clear(): Promise<void>;
    /**
    * Get cache statistics
    */
    getStats(): PatternCacheStats;
    /**
    * Optimize cache (remove expired, consolidate)
    */
    optimize(): Promise<void>;
    private getFromMemory;
    private getFromDisk;
    private saveToDisk;
    private removeFromDisk;
    private evictLRU;
    private updateAccessOrder;
    private estimateSize;
    private cosineSimilarity;
    private updateHitRate;
    private loadDiskCacheIndex;
    private clearDiskCache;
    private consolidateDiskCache;
}
//# sourceMappingURL=patternCacheManager.d.ts.map