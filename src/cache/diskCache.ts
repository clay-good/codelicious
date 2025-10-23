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

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('DiskCache');

export interface DiskCacheEntry {
 value: unknown;
 timestamp: number;
 ttl?: number;
 size: number;
}

export interface DiskCacheOptions {
 cacheDir: string;
 maxSize: number; // Maximum size in bytes
 defaultTTL?: number; // Default TTL in milliseconds
 cleanupInterval?: number; // Cleanup interval in milliseconds
}

export interface DiskCacheStats {
 hits: number;
 misses: number;
 writes: number;
 deletes: number;
 currentSize: number;
 fileCount: number;
}

export class DiskCache {
 private stats = {
 hits: 0,
 misses: 0,
 writes: 0,
 deletes: 0
 };
 private currentSize: number = 0;
 private cleanupTimer?: NodeJS.Timeout;
 private index: Map<string, { size: number; timestamp: number; ttl?: number }> = new Map();

 constructor(private options: DiskCacheOptions) {
 if (!options.cleanupInterval) {
 options.cleanupInterval = 3600000; // 1 hour default
 }
 }

 /**
 * Initialize disk cache
 */
 async initialize(): Promise<void> {
 // Create cache directory if it doesn't exist
 if (!fs.existsSync(this.options.cacheDir)) {
 fs.mkdirSync(this.options.cacheDir, { recursive: true });
 }

 // Build index from existing files
 await this.buildIndex();

 // Start cleanup timer
 this.startCleanup();

 logger.info(`DiskCache initialized: ${this.index.size} files, ${this.formatSize(this.currentSize)}`);
 }

 /**
 * Get a value from cache
 */
 async get<T>(key: string): Promise<T | undefined> {
 const filePath = this.getFilePath(key);

 // Check index first
 const indexEntry = this.index.get(key);
 if (!indexEntry) {
 this.stats.misses++;
 return undefined;
 }

 // Check if expired
 if (this.isExpired(indexEntry.timestamp, indexEntry.ttl)) {
 await this.delete(key);
 this.stats.misses++;
 return undefined;
 }

 try {
 // Read from disk
 const data = await fs.promises.readFile(filePath, 'utf-8');
 const entry: DiskCacheEntry = JSON.parse(data);

 // Double-check expiration
 if (this.isExpired(entry.timestamp, entry.ttl)) {
 await this.delete(key);
 this.stats.misses++;
 return undefined;
 }

 this.stats.hits++;
 return entry.value as T;

 } catch (error) {
 // File doesn't exist or is corrupted
 this.index.delete(key);
 this.stats.misses++;
 return undefined;
 }
 }

 /**
 * Set a value in cache
 */
 async set<T>(key: string, value: T, ttl?: number): Promise<void> {
 const filePath = this.getFilePath(key);

 const entry: DiskCacheEntry = {
 value,
 timestamp: Date.now(),
 ttl: ttl || this.options.defaultTTL,
 size: 0 // Will be calculated after serialization
 };

 try {
 // Serialize
 const data = JSON.stringify(entry);
 const size = Buffer.byteLength(data, 'utf-8');
 entry.size = size;

 // Check if we need to evict
 while (this.currentSize + size > this.options.maxSize && this.index.size > 0) {
 await this.evictOldest();
 }

 // Write to disk
 await fs.promises.writeFile(filePath, data, 'utf-8');

 // Update index
 const oldEntry = this.index.get(key);
 if (oldEntry) {
 this.currentSize -= oldEntry.size;
 }

 this.index.set(key, {
 size,
 timestamp: entry.timestamp,
 ttl: entry.ttl
 });

 this.currentSize += size;
 this.stats.writes++;

 } catch (error) {
 logger.error(`Failed to write cache file ${key}:`, error);
 throw error;
 }
 }

 /**
 * Check if key exists
 */
 has(key: string): boolean {
 const indexEntry = this.index.get(key);
 if (!indexEntry) return false;

 if (this.isExpired(indexEntry.timestamp, indexEntry.ttl)) {
 this.delete(key); // Fire and forget
 return false;
 }

 return true;
 }

 /**
 * Delete a key from cache
 */
 async delete(key: string): Promise<boolean> {
 const filePath = this.getFilePath(key);
 const indexEntry = this.index.get(key);

 if (!indexEntry) return false;

 try {
 // Delete file
 if (fs.existsSync(filePath)) {
 await fs.promises.unlink(filePath);
 }

 // Update index
 this.currentSize -= indexEntry.size;
 this.index.delete(key);
 this.stats.deletes++;

 return true;

 } catch (error) {
 logger.error(`Failed to delete cache file ${key}:`, error);
 return false;
 }
 }

 /**
 * Clear all cache
 */
 async clear(): Promise<void> {
 try {
 // Delete all files
 const files = await fs.promises.readdir(this.options.cacheDir);
 await Promise.all(
 files.map(file =>
 fs.promises.unlink(path.join(this.options.cacheDir, file)).catch(() => {})
 )
 );

 // Reset state
 this.index.clear();
 this.currentSize = 0;

 logger.info('DiskCache cleared');

 } catch (error) {
 logger.error('Failed to clear disk cache:', error);
 }
 }

 /**
 * Get cache statistics
 */
 getStats(): DiskCacheStats {
 return {
 hits: this.stats.hits,
 misses: this.stats.misses,
 writes: this.stats.writes,
 deletes: this.stats.deletes,
 currentSize: this.currentSize,
 fileCount: this.index.size
 };
 }

 /**
 * Cleanup expired entries
 */
 async cleanup(): Promise<number> {
 let cleaned = 0;
 const now = Date.now();

 for (const [key, entry] of this.index.entries()) {
 if (this.isExpired(entry.timestamp, entry.ttl)) {
 await this.delete(key);
 cleaned++;
 }
 }

 return cleaned;
 }

 /**
 * Dispose resources
 */
 dispose(): void {
 if (this.cleanupTimer) {
 clearInterval(this.cleanupTimer);
 }
 }

 /**
 * Build index from existing files
 */
 private async buildIndex(): Promise<void> {
 try {
 const files = await fs.promises.readdir(this.options.cacheDir);

 for (const file of files) {
 if (!file.endsWith('.json')) continue;

 const filePath = path.join(this.options.cacheDir, file);
 try {
 const stats = await fs.promises.stat(filePath);
 const data = await fs.promises.readFile(filePath, 'utf-8');
 const entry: DiskCacheEntry = JSON.parse(data);

 const key = file.replace('.json', '');
 this.index.set(key, {
 size: stats.size,
 timestamp: entry.timestamp,
 ttl: entry.ttl
 });

 this.currentSize += stats.size;

 } catch (error) {
 // Corrupted file, delete it
 await fs.promises.unlink(filePath).catch(() => {});
 }
 }

 } catch (error) {
 logger.error('Failed to build disk cache index:', error);
 }
 }

 /**
 * Start cleanup timer
 */
 private startCleanup(): void {
 this.cleanupTimer = setInterval(async () => {
 const cleaned = await this.cleanup();
 if (cleaned > 0) {
 logger.info(`DiskCache cleanup: removed ${cleaned} expired entries`);
 }
 }, this.options.cleanupInterval);

 // Allow Node.js to exit even if this timer is active
 this.cleanupTimer.unref();
 }

 /**
 * Evict oldest entry
 */
 private async evictOldest(): Promise<void> {
 let oldestKey: string | null = null;
 let oldestTime = Infinity;

 for (const [key, entry] of this.index.entries()) {
 if (entry.timestamp < oldestTime) {
 oldestTime = entry.timestamp;
 oldestKey = key;
 }
 }

 if (oldestKey) {
 await this.delete(oldestKey);
 }
 }

 /**
 * Check if entry is expired
 */
 private isExpired(timestamp: number, ttl?: number): boolean {
 if (!ttl) return false;
 return Date.now() - timestamp > ttl;
 }

 /**
 * Get file path for a key
 */
 private getFilePath(key: string): string {
 // Hash the key to create a safe filename
 const hash = crypto.createHash('sha256').update(key).digest('hex');
 return path.join(this.options.cacheDir, `${hash}.json`);
 }

 /**
 * Format size for display
 */
 private formatSize(bytes: number): string {
 if (bytes < 1024) return `${bytes} B`;
 if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
 return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
 }
}

