/**
 * L3 Semantic Cache - Similarity-based cache using embeddings
 *
 * Features:
 * - Finds similar queries using cosine similarity
 * - Returns cached results for semantically similar queries
 * - Configurable similarity threshold
 * - Efficient vector search
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('SemanticCache');

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
 similarityThreshold: number; // 0-1, higher = more strict
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

export class SemanticCache {
 private entries: Map<string, SemanticCacheEntry<any>> = new Map();
 private stats = {
 hits: 0,
 misses: 0,
 totalSimilarity: 0,
 similarityCount: 0
 };

 constructor(private options: SemanticCacheOptions) {}

 /**
 * Find similar query in cache
 */
 findSimilar<T>(
 query: string,
 embedding: number[],
 minSimilarity?: number
 ): SemanticMatch<T> | undefined {
 const threshold = minSimilarity || this.options.similarityThreshold;
 let bestMatch: SemanticMatch<T> | undefined;
 let bestSimilarity = threshold;

 const now = Date.now();

 for (const entry of this.entries.values()) {
 // Skip expired entries
 if (entry.ttl && now - entry.timestamp > entry.ttl) {
 this.entries.delete(entry.key);
 continue;
 }

 // Calculate cosine similarity
 const similarity = this.cosineSimilarity(embedding, entry.embedding);

 // Track for stats
 this.stats.totalSimilarity += similarity;
 this.stats.similarityCount++;

 // Check if this is the best match
 if (similarity > bestSimilarity) {
 bestSimilarity = similarity;
 bestMatch = {
 entry: entry as SemanticCacheEntry<T>,
 similarity
 };
 }
 }

 if (bestMatch) {
 // Update hit count
 bestMatch.entry.hitCount++;
 this.stats.hits++;

 logger.debug(`Semantic cache hit: "${query}" matched "${bestMatch.entry.query}" (similarity: ${bestSimilarity.toFixed(3)})`);

 return bestMatch;
 }

 this.stats.misses++;
 return undefined;
 }

 /**
 * Add entry to semantic cache
 */
 set<T>(
 key: string,
 query: string,
 embedding: number[],
 value: T,
 ttl?: number
 ): void {
 // Check if we need to evict
 if (this.entries.size >= this.options.maxEntries) {
 this.evictLeastUsed();
 }

 const entry: SemanticCacheEntry<T> = {
 key,
 query,
 embedding,
 value,
 timestamp: Date.now(),
 ttl: ttl || this.options.defaultTTL,
 hitCount: 0
 };

 this.entries.set(key, entry);
 }

 /**
 * Get entry by exact key
 */
 get<T>(key: string): T | undefined {
 const entry = this.entries.get(key);
 if (!entry) return undefined;

 // Check if expired
 if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
 this.entries.delete(key);
 return undefined;
 }

 entry.hitCount++;
 return entry.value as T;
 }

 /**
 * Check if key exists
 */
 has(key: string): boolean {
 const entry = this.entries.get(key);
 if (!entry) return false;

 // Check if expired
 if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
 this.entries.delete(key);
 return false;
 }

 return true;
 }

 /**
 * Delete entry
 */
 delete(key: string): boolean {
 return this.entries.delete(key);
 }

 /**
 * Clear all entries
 */
 clear(): void {
 this.entries.clear();
 }

 /**
 * Get statistics
 */
 getStats(): SemanticCacheStats {
 return {
 hits: this.stats.hits,
 misses: this.stats.misses,
 entries: this.entries.size,
 averageSimilarity: this.stats.similarityCount > 0
 ? this.stats.totalSimilarity / this.stats.similarityCount
 : 0
 };
 }

 /**
 * Cleanup expired entries
 */
 cleanup(): number {
 let cleaned = 0;
 const now = Date.now();

 for (const [key, entry] of this.entries.entries()) {
 if (entry.ttl && now - entry.timestamp > entry.ttl) {
 this.entries.delete(key);
 cleaned++;
 }
 }

 return cleaned;
 }

 /**
 * Get all entries sorted by hit count
 */
 getTopEntries(limit: number = 10): SemanticCacheEntry<any>[] {
 return Array.from(this.entries.values())
 .sort((a, b) => b.hitCount - a.hitCount)
 .slice(0, limit);
 }

 /**
 * Calculate cosine similarity between two vectors
 */
 private cosineSimilarity(a: number[], b: number[]): number {
 if (a.length !== b.length) {
 throw new Error('Vectors must have the same length');
 }

 let dotProduct = 0;
 let normA = 0;
 let normB = 0;

 for (let i = 0; i < a.length; i++) {
 dotProduct += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 }

 normA = Math.sqrt(normA);
 normB = Math.sqrt(normB);

 if (normA === 0 || normB === 0) {
 return 0;
 }

 return dotProduct / (normA * normB);
 }

 /**
 * Evict least used entry
 */
 private evictLeastUsed(): void {
 let leastUsedKey: string | null = null;
 let leastHits = Infinity;

 for (const [key, entry] of this.entries.entries()) {
 if (entry.hitCount < leastHits) {
 leastHits = entry.hitCount;
 leastUsedKey = key;
 }
 }

 if (leastUsedKey) {
 this.entries.delete(leastUsedKey);
 }
 }

 /**
 * Find multiple similar entries
 */
 findTopMatches<T>(
 embedding: number[],
 limit: number = 5,
 minSimilarity?: number
 ): SemanticMatch<T>[] {
 const threshold = minSimilarity || this.options.similarityThreshold;
 const matches: SemanticMatch<T>[] = [];
 const now = Date.now();

 for (const entry of this.entries.values()) {
 // Skip expired entries
 if (entry.ttl && now - entry.timestamp > entry.ttl) {
 this.entries.delete(entry.key);
 continue;
 }

 // Calculate similarity
 const similarity = this.cosineSimilarity(embedding, entry.embedding);

 if (similarity >= threshold) {
 matches.push({
 entry: entry as SemanticCacheEntry<T>,
 similarity
 });
 }
 }

 // Sort by similarity (descending) and return top matches
 return matches
 .sort((a, b) => b.similarity - a.similarity)
 .slice(0, limit);
 }

 /**
 * Get cache size
 */
 getSize(): number {
 return this.entries.size;
 }

 /**
 * Estimate memory usage in bytes
 */
 estimateMemoryUsage(): number {
 let total = 0;

 for (const entry of this.entries.values()) {
 // Embedding size (assuming float64)
 total += entry.embedding.length * 8;

 // String sizes
 total += entry.key.length * 2;
 total += entry.query.length * 2;

 // Value size (rough estimate)
 try {
 total += JSON.stringify(entry.value).length * 2;
 } catch {
 total += 1024; // Default estimate
 }

 // Metadata
 total += 64; // timestamp, ttl, hitCount, etc.
 }

 return total;
 }
}

