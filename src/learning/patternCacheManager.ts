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
import { createLogger } from '../utils/logger';

const logger = createLogger('PatternCacheManager');

export interface CachedPattern {
 pattern: CodePattern | StructuralPattern;
 embedding?: number[];
 version: number;
 lastAccessed: number;
 accessCount: number;
 size: number; // bytes
}

export interface PatternCacheOptions {
 maxMemorySize: number; // bytes
 maxDiskSize: number; // bytes
 ttl: number; // milliseconds
 semanticThreshold: number; // 0-1
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

export class PatternCacheManager {
 // L1: Memory cache (hot patterns)
 private memoryCache: Map<string, CachedPattern> = new Map();
 private accessOrder: string[] = []; // LRU tracking

 // L2: Disk cache (warm patterns)
 private diskCacheKeys: Set<string> = new Set();

 // L3: Semantic cache (similar patterns)
 private semanticIndex: Map<string, number[]> = new Map();

 private stats: PatternCacheStats = {
 memoryHits: 0,
 diskHits: 0,
 semanticHits: 0,
 misses: 0,
 evictions: 0,
 totalPatterns: 0,
 memorySize: 0,
 diskSize: 0,
 hitRate: 0
 };

 private currentMemorySize = 0;
 private currentDiskSize = 0;

 constructor(
 private context: vscode.ExtensionContext,
 private embeddingManager?: EmbeddingManager,
 private options: PatternCacheOptions = {
 maxMemorySize: 50 * 1024 * 1024, // 50 MB
 maxDiskSize: 500 * 1024 * 1024, // 500 MB
 ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
 semanticThreshold: 0.85,
 enableDiskCache: true,
 enableSemanticCache: true
 }
 ) {
 this.loadDiskCacheIndex();
 }

 /**
 * Get pattern from cache (L1 → L2 → L3)
 */
 async get(patternId: string): Promise<(CodePattern | StructuralPattern) | undefined> {
 // L1: Check memory cache
 const memoryResult = this.getFromMemory(patternId);
 if (memoryResult) {
 this.stats.memoryHits++;
 this.updateHitRate();
 return memoryResult;
 }

 // L2: Check disk cache
 if (this.options.enableDiskCache) {
 const diskResult = await this.getFromDisk(patternId);
 if (diskResult) {
 this.stats.diskHits++;
 // Promote to memory cache
 await this.set(patternId, diskResult);
 this.updateHitRate();
 return diskResult;
 }
 }

 // Cache miss
 this.stats.misses++;
 this.updateHitRate();
 return undefined;
 }

 /**
 * Find semantically similar patterns
 */
 async findSimilar(
 query: string,
 embedding: number[],
 limit: number = 5
 ): Promise<SemanticSearchResult[]> {
 if (!this.options.enableSemanticCache || !this.embeddingManager) {
 return [];
 }

 const results: SemanticSearchResult[] = [];

 // Search in memory cache
 for (const [id, cached] of this.memoryCache.entries()) {
 if (!cached.embedding) continue;

 const similarity = this.cosineSimilarity(embedding, cached.embedding);
 if (similarity >= this.options.semanticThreshold) {
 results.push({
 pattern: cached.pattern,
 similarity,
 source: 'memory'
 });
 this.stats.semanticHits++;
 }
 }

 // Search in semantic index
 for (const [id, cachedEmbedding] of this.semanticIndex.entries()) {
 if (this.memoryCache.has(id)) continue; // Already checked

 const similarity = this.cosineSimilarity(embedding, cachedEmbedding);
 if (similarity >= this.options.semanticThreshold) {
 // Load pattern from disk
 const pattern = await this.getFromDisk(id);
 if (pattern) {
 results.push({
 pattern,
 similarity,
 source: 'semantic'
 });
 this.stats.semanticHits++;
 }
 }
 }

 // Sort by similarity and limit
 return results
 .sort((a, b) => b.similarity - a.similarity)
 .slice(0, limit);
 }

 /**
 * Set pattern in cache
 */
 async set(
 patternId: string,
 pattern: CodePattern | StructuralPattern,
 embedding?: number[]
 ): Promise<void> {
 const size = this.estimateSize(pattern);

 // Check if we need to evict
 while (this.currentMemorySize + size > this.options.maxMemorySize && this.memoryCache.size > 0) {
 await this.evictLRU();
 }

 // Create cached entry
 const cached: CachedPattern = {
 pattern,
 embedding,
 version: 1,
 lastAccessed: Date.now(),
 accessCount: 1,
 size
 };

 // Add to memory cache
 this.memoryCache.set(patternId, cached);
 this.currentMemorySize += size;
 this.updateAccessOrder(patternId);

 // Add to semantic index
 if (embedding && this.options.enableSemanticCache) {
 this.semanticIndex.set(patternId, embedding);
 }

 // Persist to disk if enabled
 if (this.options.enableDiskCache) {
 await this.saveToDisk(patternId, cached);
 }

 this.stats.totalPatterns = this.memoryCache.size + this.diskCacheKeys.size;
 }

 /**
 * Invalidate pattern (remove from all caches)
 */
 async invalidate(patternId: string): Promise<void> {
 // Remove from memory
 const cached = this.memoryCache.get(patternId);
 if (cached) {
 this.currentMemorySize -= cached.size;
 this.memoryCache.delete(patternId);
 this.accessOrder = this.accessOrder.filter(id => id !== patternId);
 }

 // Remove from semantic index
 this.semanticIndex.delete(patternId);

 // Remove from disk
 if (this.options.enableDiskCache) {
 await this.removeFromDisk(patternId);
 }

 this.stats.totalPatterns = this.memoryCache.size + this.diskCacheKeys.size;
 }

 /**
 * Warm cache with frequently used patterns
 */
 async warmCache(patternIds: string[]): Promise<void> {
 for (const id of patternIds) {
 const pattern = await this.getFromDisk(id);
 if (pattern) {
 await this.set(id, pattern);
 }
 }
 }

 /**
 * Clear all caches
 */
 async clear(): Promise<void> {
 this.memoryCache.clear();
 this.accessOrder = [];
 this.semanticIndex.clear();
 this.currentMemorySize = 0;

 if (this.options.enableDiskCache) {
 await this.clearDiskCache();
 }

 this.stats = {
 memoryHits: 0,
 diskHits: 0,
 semanticHits: 0,
 misses: 0,
 evictions: 0,
 totalPatterns: 0,
 memorySize: 0,
 diskSize: 0,
 hitRate: 0
 };
 }

 /**
 * Get cache statistics
 */
 getStats(): PatternCacheStats {
 return {
 ...this.stats,
 memorySize: this.currentMemorySize,
 diskSize: this.currentDiskSize
 };
 }

 /**
 * Optimize cache (remove expired, consolidate)
 */
 async optimize(): Promise<void> {
 const now = Date.now();

 // Remove expired entries
 for (const [id, cached] of this.memoryCache.entries()) {
 if (now - cached.lastAccessed > this.options.ttl) {
 await this.invalidate(id);
 }
 }

 // Consolidate disk cache
 if (this.options.enableDiskCache) {
 await this.consolidateDiskCache();
 }
 }

 // ========== Private Methods ==========

 private getFromMemory(patternId: string): (CodePattern | StructuralPattern) | undefined {
 const cached = this.memoryCache.get(patternId);
 if (!cached) return undefined;

 // Update access tracking
 cached.lastAccessed = Date.now();
 cached.accessCount++;
 this.updateAccessOrder(patternId);

 return cached.pattern;
 }

 private async getFromDisk(patternId: string): Promise<(CodePattern | StructuralPattern) | undefined> {
 if (!this.diskCacheKeys.has(patternId)) return undefined;

 try {
 const key = `pattern_cache_${patternId}`;
 const data = this.context.globalState.get<CachedPattern>(key);
 return data?.pattern;
 } catch (error) {
 logger.error(`Failed to load pattern from disk: ${patternId}`, error);
 return undefined;
 }
 }

 private async saveToDisk(patternId: string, cached: CachedPattern): Promise<void> {
 try {
 const key = `pattern_cache_${patternId}`;
 await this.context.globalState.update(key, cached);
 this.diskCacheKeys.add(patternId);
 this.currentDiskSize += cached.size;
 } catch (error) {
 logger.error(`Failed to save pattern to disk: ${patternId}`, error);
 }
 }

 private async removeFromDisk(patternId: string): Promise<void> {
 try {
 const key = `pattern_cache_${patternId}`;
 await this.context.globalState.update(key, undefined);
 this.diskCacheKeys.delete(patternId);
 } catch (error) {
 logger.error(`Failed to remove pattern from disk: ${patternId}`, error);
 }
 }

 private async evictLRU(): Promise<void> {
 if (this.accessOrder.length === 0) return;

 // Get least recently used pattern
 const lruId = this.accessOrder[0];
 const cached = this.memoryCache.get(lruId);

 if (cached) {
 // Move to disk if enabled
 if (this.options.enableDiskCache && !this.diskCacheKeys.has(lruId)) {
 await this.saveToDisk(lruId, cached);
 }

 // Remove from memory
 this.currentMemorySize -= cached.size;
 this.memoryCache.delete(lruId);
 this.accessOrder.shift();
 this.stats.evictions++;
 }
 }

 private updateAccessOrder(patternId: string): void {
 // Remove from current position
 this.accessOrder = this.accessOrder.filter(id => id !== patternId);
 // Add to end (most recently used)
 this.accessOrder.push(patternId);
 }

 private estimateSize(pattern: CodePattern | StructuralPattern): number {
 // Rough estimate of pattern size in bytes
 const jsonStr = JSON.stringify(pattern);
 return jsonStr.length * 2; // UTF-16 encoding
 }

 private cosineSimilarity(a: number[], b: number[]): number {
 if (a.length !== b.length) return 0;

 let dotProduct = 0;
 let normA = 0;
 let normB = 0;

 for (let i = 0; i < a.length; i++) {
 dotProduct += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 }

 const denominator = Math.sqrt(normA) * Math.sqrt(normB);
 return denominator === 0 ? 0 : dotProduct / denominator;
 }

 private updateHitRate(): void {
 const totalRequests = this.stats.memoryHits + this.stats.diskHits +
 this.stats.semanticHits + this.stats.misses;
 const totalHits = this.stats.memoryHits + this.stats.diskHits + this.stats.semanticHits;
 this.stats.hitRate = totalRequests > 0 ? totalHits / totalRequests : 0;
 }

 private loadDiskCacheIndex(): void {
 try {
 const keys = this.context.globalState.keys();
 for (const key of keys) {
 if (key.startsWith('pattern_cache_')) {
 const patternId = key.replace('pattern_cache_', '');
 this.diskCacheKeys.add(patternId);
 }
 }
 this.stats.totalPatterns = this.diskCacheKeys.size;
 } catch (error) {
 logger.error('Failed to load disk cache index:', error);
 }
 }

 private async clearDiskCache(): Promise<void> {
 try {
 for (const patternId of this.diskCacheKeys) {
 await this.removeFromDisk(patternId);
 }
 this.diskCacheKeys.clear();
 this.currentDiskSize = 0;
 } catch (error) {
 logger.error('Failed to clear disk cache:', error);
 }
 }

 private async consolidateDiskCache(): Promise<void> {
 // Remove expired entries from disk
 const now = Date.now();
 const toRemove: string[] = [];

 for (const patternId of this.diskCacheKeys) {
 const key = `pattern_cache_${patternId}`;
 const cached = this.context.globalState.get<CachedPattern>(key);

 if (cached && now - cached.lastAccessed > this.options.ttl) {
 toRemove.push(patternId);
 }
 }

 for (const patternId of toRemove) {
 await this.removeFromDisk(patternId);
 }
 }
}

