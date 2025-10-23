/**
 * Cache Key Generator Utility
 * Consolidates duplicated cache key generation logic from multiple files
 *
 * Provides consistent, collision-resistant cache keys for:
 * - Code generation requests
 * - RAG queries
 * - Pattern matching
 * - File processing
 * - Embeddings
 */
export interface CacheKeyOptions {
    includeTimestamp?: boolean;
    includeVersion?: boolean;
    maxLength?: number;
    prefix?: string;
    suffix?: string;
}
/**
 * Generate a deterministic hash from input
 */
export declare function generateHash(input: string, algorithm?: 'md5' | 'sha256'): string;
/**
 * Generate cache key for code generation
 */
export declare function generateCodeCacheKey(prompt: string, language: string, context?: string, options?: CacheKeyOptions): string;
/**
 * Generate cache key for RAG query
 */
export declare function generateRAGCacheKey(query: string, maxResults?: number, filters?: Record<string, any>, options?: CacheKeyOptions): string;
/**
 * Generate cache key for pattern matching
 */
export declare function generatePatternCacheKey(patternType: string, code: string, language?: string, options?: CacheKeyOptions): string;
/**
 * Generate cache key for file processing
 */
export declare function generateFileCacheKey(filePath: string, operation: string, contentHash?: string, options?: CacheKeyOptions): string;
/**
 * Generate cache key for embeddings
 */
export declare function generateEmbeddingCacheKey(text: string, model: string, options?: CacheKeyOptions): string;
/**
 * Generate generic cache key from object
 */
export declare function generateGenericCacheKey(type: string, data: Record<string, any>, options?: CacheKeyOptions): string;
/**
 * Parse cache key into components
 */
export declare function parseCacheKey(key: string): {
    prefix?: string;
    type: string;
    components: string[];
    suffix?: string;
};
/**
 * Validate cache key format
 */
export declare function isValidCacheKey(key: string): boolean;
/**
 * Generate content hash for cache invalidation
 */
export declare function generateContentHash(content: string): string;
/**
 * Generate cache key with automatic collision detection
 */
export declare function generateSafeCacheKey(type: string, data: unknown, existingKeys: Set<string>, options?: CacheKeyOptions): string;
//# sourceMappingURL=cacheKeyGenerator.d.ts.map