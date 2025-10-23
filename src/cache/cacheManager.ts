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
import * as path from 'path';
import { ConfigurationManager } from '../core/configurationManager';
import { CacheStats } from '../types';
import { MemoryCache } from './memoryCache';
import { DiskCache } from './diskCache';
import { SemanticCache } from './semanticCache';
import { createLogger } from '../utils/logger';

const logger = createLogger('CacheManager');

export interface CacheOptions {
 ttl?: number; // Time to live in milliseconds
 layer?: 'memory' | 'disk' | 'semantic' | 'all'; // Which layer to use
 semanticQuery?: string; // Query text for semantic caching
 semanticEmbedding?: number[]; // Query embedding for semantic caching
}

export class CacheManager {
 private memoryCache?: MemoryCache;
 private diskCache?: DiskCache;
 private semanticCache?: SemanticCache;
 private isInitialized = false;

 constructor(
 private context: vscode.ExtensionContext,
 private configManager: ConfigurationManager
 ) {}

 /**
 * Initialize the cache system
 */
 async initialize(): Promise<void> {
 logger.info('Initializing Multi-Layer Cache System...');

 const config = this.configManager.getCacheConfig();

 if (!config.enabled) {
 logger.info('Cache disabled in configuration');
 return;
 }

 try {
 // Parse max size
 const maxSizeBytes = this.parseSize(config.maxSize);

 // L1: Memory Cache (20% of total)
 const memorySize = Math.floor(maxSizeBytes * 0.2);
 this.memoryCache = new MemoryCache({
 maxSize: memorySize,
 maxEntries: 1000,
 defaultTTL: config.ttl
 });
 logger.info(`L1 Memory Cache: ${this.formatSize(memorySize)}`);

 // L2: Disk Cache (80% of total)
 const diskSize = Math.floor(maxSizeBytes * 0.8);
 const cacheDir = path.join(this.context.globalStorageUri.fsPath, 'cache');
 this.diskCache = new DiskCache({
 cacheDir,
 maxSize: diskSize,
 defaultTTL: config.ttl,
 cleanupInterval: 3600000 // 1 hour
 });
 await this.diskCache.initialize();
 logger.info(`L2 Disk Cache: ${this.formatSize(diskSize)}`);

 // L3: Semantic Cache
 this.semanticCache = new SemanticCache({
 maxEntries: 500,
 similarityThreshold: 0.85, // 85% similarity required
 defaultTTL: config.ttl
 });
 logger.info(`L3 Semantic Cache: 500 entries`);

 this.isInitialized = true;
 logger.info('Cache system initialized successfully');

 } catch (error) {
 logger.error('Failed to initialize cache system', error);
 this.isInitialized = false;
 }
 }

 /**
 * Get a value from cache (checks all layers)
 */
 async get<T>(key: string, options: CacheOptions = {}): Promise<T | undefined> {
 if (!this.isInitialized) {
 return undefined;
 }

 const layer = options.layer || 'all';

 // Try semantic cache first if query provided
 if (layer === 'semantic' || layer === 'all') {
 if (options.semanticQuery && options.semanticEmbedding && this.semanticCache) {
 const match = this.semanticCache.findSimilar<T>(
 options.semanticQuery,
 options.semanticEmbedding
 );
 if (match) {
 // Promote to memory cache
 if (this.memoryCache) {
 this.memoryCache.set(key, match.entry.value, options.ttl);
 }
 return match.entry.value;
 }
 }
 }

 // Try L1: Memory Cache
 if ((layer === 'memory' || layer === 'all') && this.memoryCache) {
 const value = this.memoryCache.get<T>(key);
 if (value !== undefined) {
 return value;
 }
 }

 // Try L2: Disk Cache
 if ((layer === 'disk' || layer === 'all') && this.diskCache) {
 const value = await this.diskCache.get<T>(key);
 if (value !== undefined) {
 // Promote to memory cache
 if (this.memoryCache) {
 this.memoryCache.set(key, value, options.ttl);
 }
 return value;
 }
 }

 return undefined;
 }

 /**
 * Set a value in cache (writes to all appropriate layers)
 */
 async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
 if (!this.isInitialized) {
 return;
 }

 const layer = options.layer || 'all';
 const ttl = options.ttl;

 // Write to L1: Memory Cache
 if ((layer === 'memory' || layer === 'all') && this.memoryCache) {
 this.memoryCache.set(key, value, ttl);
 }

 // Write to L2: Disk Cache
 if ((layer === 'disk' || layer === 'all') && this.diskCache) {
 await this.diskCache.set(key, value, ttl);
 }

 // Write to L3: Semantic Cache (if query provided)
 if ((layer === 'semantic' || layer === 'all') && this.semanticCache) {
 if (options.semanticQuery && options.semanticEmbedding) {
 this.semanticCache.set(
 key,
 options.semanticQuery,
 options.semanticEmbedding,
 value,
 ttl
 );
 }
 }
 }

 /**
 * Check if key exists in cache
 */
 has(key: string): boolean {
 if (!this.isInitialized) {
 return false;
 }

 // Check memory cache first (fastest)
 if (this.memoryCache && this.memoryCache.has(key)) {
 return true;
 }

 // Check disk cache
 if (this.diskCache && this.diskCache.has(key)) {
 return true;
 }

 // Check semantic cache
 if (this.semanticCache && this.semanticCache.has(key)) {
 return true;
 }

 return false;
 }

 /**
 * Delete a key from all cache layers
 */
 async delete(key: string): Promise<void> {
 if (!this.isInitialized) {
 return;
 }

 if (this.memoryCache) {
 this.memoryCache.delete(key);
 }

 if (this.diskCache) {
 await this.diskCache.delete(key);
 }

 if (this.semanticCache) {
 this.semanticCache.delete(key);
 }
 }

 /**
 * Clear all caches
 */
 async clear(): Promise<void> {
 logger.info('Clearing all caches...');

 if (this.memoryCache) {
 this.memoryCache.clear();
 }

 if (this.diskCache) {
 await this.diskCache.clear();
 }

 if (this.semanticCache) {
 this.semanticCache.clear();
 }

 logger.info('All caches cleared');
 }

 /**
 * Get cache statistics
 */
 getStats(): CacheStats {
 if (!this.isInitialized) {
 return {
 hits: 0,
 misses: 0,
 hitRate: 0,
 totalSize: 0,
 entryCount: 0,
 evictions: 0
 };
 }

 const memStats = this.memoryCache?.getStats();
 const diskStats = this.diskCache?.getStats();
 const semStats = this.semanticCache?.getStats();

 const totalHits = (memStats?.hits || 0) + (diskStats?.hits || 0) + (semStats?.hits || 0);
 const totalMisses = (memStats?.misses || 0) + (diskStats?.misses || 0) + (semStats?.misses || 0);
 const total = totalHits + totalMisses;

 return {
 hits: totalHits,
 misses: totalMisses,
 hitRate: total > 0 ? totalHits / total : 0,
 totalSize: (memStats?.currentSize || 0) + (diskStats?.currentSize || 0),
 entryCount: (memStats?.entryCount || 0) + (diskStats?.fileCount || 0) + (semStats?.entries || 0),
 evictions: (memStats?.evictions || 0)
 };
 }

 /**
 * Get detailed statistics for all layers
 */
 getDetailedStats() {
 if (!this.isInitialized) {
 return null;
 }

 return {
 memory: this.memoryCache?.getStats(),
 disk: this.diskCache?.getStats(),
 semantic: this.semanticCache?.getStats(),
 combined: this.getStats()
 };
 }

 /**
 * Cleanup expired entries in all layers
 */
 async cleanup(): Promise<void> {
 if (!this.isInitialized) {
 return;
 }

 logger.info('Running cache cleanup...');

 let totalCleaned = 0;

 if (this.memoryCache) {
 const cleaned = this.memoryCache.evictExpired();
 totalCleaned += cleaned;
 }

 if (this.diskCache) {
 const cleaned = await this.diskCache.cleanup();
 totalCleaned += cleaned;
 }

 if (this.semanticCache) {
 const cleaned = this.semanticCache.cleanup();
 totalCleaned += cleaned;
 }

 if (totalCleaned > 0) {
 logger.info(`Cleaned ${totalCleaned} expired entries`);
 }
 }

 /**
 * Clean up resources
 */
 async dispose(): Promise<void> {
 logger.info('Disposing CacheManager...');

 if (this.diskCache) {
 this.diskCache.dispose();
 }

 this.isInitialized = false;
 logger.info('CacheManager disposed');
 }

 /**
 * Parse size string (e.g., "100MB", "1GB") to bytes
 */
 private parseSize(sizeStr: string): number {
 const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
 if (!match) {
 return 100 * 1024 * 1024; // Default 100MB
 }

 const value = parseFloat(match[1]);
 const unit = (match[2] || 'MB').toUpperCase();

 switch (unit) {
 case 'B': return value;
 case 'KB': return value * 1024;
 case 'MB': return value * 1024 * 1024;
 case 'GB': return value * 1024 * 1024 * 1024;
 default: return value * 1024 * 1024; // Default to MB
 }
 }

 /**
 * Format size for display
 */
 private formatSize(bytes: number): string {
 if (bytes < 1024) return `${bytes} B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
 if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
 return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
 }
}

