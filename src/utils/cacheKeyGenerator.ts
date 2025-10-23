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

import * as crypto from 'crypto';

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
export function generateHash(input: string, algorithm: 'md5' | 'sha256' = 'md5'): string {
 return crypto.createHash(algorithm).update(input).digest('hex');
}

/**
 * Generate cache key for code generation
 */
export function generateCodeCacheKey(
 prompt: string,
 language: string,
 context?: string,
 options: CacheKeyOptions = {}
): string {
 const parts = [
 'code',
 language.toLowerCase(),
 generateHash(prompt),
 context ? generateHash(context) : ''
 ].filter(Boolean);

 if (options.includeVersion) {
 parts.push('v1');
 }

 if (options.includeTimestamp) {
 parts.push(Date.now().toString());
 }

 let key = parts.join(':');

 if (options.prefix) {
 key = `${options.prefix}:${key}`;
 }

 if (options.suffix) {
 key = `${key}:${options.suffix}`;
 }

 if (options.maxLength && key.length > options.maxLength) {
 // Truncate and add hash to ensure uniqueness
 const hash = generateHash(key).substring(0, 8);
 key = key.substring(0, options.maxLength - 9) + ':' + hash;
 }

 return key;
}

/**
 * Generate cache key for RAG query
 */
export function generateRAGCacheKey(
 query: string,
 maxResults?: number,
 filters?: Record<string, any>,
 options: CacheKeyOptions = {}
): string {
 const parts = [
 'rag',
 generateHash(query),
 maxResults?.toString() || '',
 filters ? generateHash(JSON.stringify(filters)) : ''
 ].filter(Boolean);

 if (options.includeVersion) {
 parts.push('v1');
 }

 let key = parts.join(':');

 if (options.prefix) {
 key = `${options.prefix}:${key}`;
 }

 if (options.suffix) {
 key = `${key}:${options.suffix}`;
 }

 if (options.maxLength && key.length > options.maxLength) {
 const hash = generateHash(key).substring(0, 8);
 key = key.substring(0, options.maxLength - 9) + ':' + hash;
 }

 return key;
}

/**
 * Generate cache key for pattern matching
 */
export function generatePatternCacheKey(
 patternType: string,
 code: string,
 language?: string,
 options: CacheKeyOptions = {}
): string {
 const parts = [
 'pattern',
 patternType.toLowerCase(),
 language?.toLowerCase() || '',
 generateHash(code)
 ].filter(Boolean);

 if (options.includeVersion) {
 parts.push('v1');
 }

 let key = parts.join(':');

 if (options.prefix) {
 key = `${options.prefix}:${key}`;
 }

 if (options.suffix) {
 key = `${key}:${options.suffix}`;
 }

 if (options.maxLength && key.length > options.maxLength) {
 const hash = generateHash(key).substring(0, 8);
 key = key.substring(0, options.maxLength - 9) + ':' + hash;
 }

 return key;
}

/**
 * Generate cache key for file processing
 */
export function generateFileCacheKey(
 filePath: string,
 operation: string,
 contentHash?: string,
 options: CacheKeyOptions = {}
): string {
 const parts = [
 'file',
 operation.toLowerCase(),
 generateHash(filePath),
 contentHash || ''
 ].filter(Boolean);

 if (options.includeVersion) {
 parts.push('v1');
 }

 let key = parts.join(':');

 if (options.prefix) {
 key = `${options.prefix}:${key}`;
 }

 if (options.suffix) {
 key = `${key}:${options.suffix}`;
 }

 if (options.maxLength && key.length > options.maxLength) {
 const hash = generateHash(key).substring(0, 8);
 key = key.substring(0, options.maxLength - 9) + ':' + hash;
 }

 return key;
}

/**
 * Generate cache key for embeddings
 */
export function generateEmbeddingCacheKey(
 text: string,
 model: string,
 options: CacheKeyOptions = {}
): string {
 const parts = [
 'embedding',
 model.toLowerCase(),
 generateHash(text)
 ];

 if (options.includeVersion) {
 parts.push('v1');
 }

 let key = parts.join(':');

 if (options.prefix) {
 key = `${options.prefix}:${key}`;
 }

 if (options.suffix) {
 key = `${key}:${options.suffix}`;
 }

 if (options.maxLength && key.length > options.maxLength) {
 const hash = generateHash(key).substring(0, 8);
 key = key.substring(0, options.maxLength - 9) + ':' + hash;
 }

 return key;
}

/**
 * Generate generic cache key from object
 */
export function generateGenericCacheKey(
 type: string,
 data: Record<string, any>,
 options: CacheKeyOptions = {}
): string {
 const dataHash = generateHash(JSON.stringify(data));

 const parts = [
 type.toLowerCase(),
 dataHash
 ];

 if (options.includeVersion) {
 parts.push('v1');
 }

 if (options.includeTimestamp) {
 parts.push(Date.now().toString());
 }

 let key = parts.join(':');

 if (options.prefix) {
 key = `${options.prefix}:${key}`;
 }

 if (options.suffix) {
 key = `${key}:${options.suffix}`;
 }

 if (options.maxLength && key.length > options.maxLength) {
 const hash = generateHash(key).substring(0, 8);
 key = key.substring(0, options.maxLength - 9) + ':' + hash;
 }

 return key;
}

/**
 * Parse cache key into components
 */
export function parseCacheKey(key: string): {
 prefix?: string;
 type: string;
 components: string[];
 suffix?: string;
} {
 const parts = key.split(':');

 return {
 type: parts[0],
 components: parts.slice(1)
 };
}

/**
 * Validate cache key format
 */
export function isValidCacheKey(key: string): boolean {
 // Cache key should:
 // - Not be empty
 // - Not contain whitespace
 // - Not contain special characters except : and -
 // - Be reasonable length (< 500 chars)

 if (!key || key.length === 0) return false;
 if (key.length > 500) return false;
 if (/\s/.test(key)) return false;
 if (!/^[a-zA-Z0-9:_-]+$/.test(key)) return false;

 return true;
}

/**
 * Generate content hash for cache invalidation
 */
export function generateContentHash(content: string): string {
 return generateHash(content, 'sha256').substring(0, 16);
}

/**
 * Generate cache key with automatic collision detection
 */
export function generateSafeCacheKey(
 type: string,
 data: unknown,
 existingKeys: Set<string>,
 options: CacheKeyOptions = {}
): string {
 const dataRecord = data as Record<string, any>; // Cache data structure
 let key = generateGenericCacheKey(type, dataRecord, options);
 let attempt = 0;

 // If collision detected, add suffix
 while (existingKeys.has(key) && attempt < 100) {
 attempt++;
 key = generateGenericCacheKey(type, dataRecord, {
 ...options,
 suffix: `${options.suffix || ''}_${attempt}`
 });
 }

 if (attempt >= 100) {
 throw new Error('Failed to generate unique cache key after 100 attempts');
 }

 return key;
}

