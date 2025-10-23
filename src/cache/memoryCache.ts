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
 maxSize: number; // Maximum size in bytes
 maxEntries?: number; // Maximum number of entries
 defaultTTL?: number; // Default TTL in milliseconds
}

export interface MemoryCacheStats {
 hits: number;
 misses: number;
 evictions: number;
 currentSize: number;
 entryCount: number;
 hitRate: number;
}

export class MemoryCache {
 private cache: Map<string, CacheEntry<any>> = new Map();
 private accessOrder: string[] = []; // LRU tracking
 private currentSize: number = 0;
 private stats = {
 hits: 0,
 misses: 0,
 evictions: 0
 };

 constructor(private options: MemoryCacheOptions) {
 if (!options.maxEntries) {
 options.maxEntries = 10000; // Default max entries
 }
 }

 /**
 * Get a value from cache
 */
 get<T>(key: string): T | undefined {
 const entry = this.cache.get(key);

 if (!entry) {
 this.stats.misses++;
 return undefined;
 }

 // Check if expired
 if (this.isExpired(entry)) {
 this.delete(key);
 this.stats.misses++;
 return undefined;
 }

 // Update access tracking
 entry.accessCount++;
 entry.lastAccess = Date.now();
 this.updateAccessOrder(key);

 this.stats.hits++;
 return entry.value as T;
 }

 /**
 * Set a value in cache
 */
 set<T>(key: string, value: T, ttl?: number): void {
 const size = this.estimateSize(value);

 // Check if we need to evict
 while (
 (this.currentSize + size > this.options.maxSize ||
 this.cache.size >= this.options.maxEntries!) &&
 this.cache.size > 0
 ) {
 this.evictLRU();
 }

 // Remove old entry if exists
 if (this.cache.has(key)) {
 const oldEntry = this.cache.get(key)!;
 this.currentSize -= oldEntry.size;
 }

 // Add new entry
 const entry: CacheEntry<T> = {
 value,
 size,
 timestamp: Date.now(),
 ttl: ttl || this.options.defaultTTL,
 accessCount: 0,
 lastAccess: Date.now()
 };

 this.cache.set(key, entry);
 this.currentSize += size;
 this.updateAccessOrder(key);
 }

 /**
 * Check if key exists and is not expired
 */
 has(key: string): boolean {
 const entry = this.cache.get(key);
 if (!entry) return false;

 if (this.isExpired(entry)) {
 this.delete(key);
 return false;
 }

 return true;
 }

 /**
 * Delete a key from cache
 */
 delete(key: string): boolean {
 const entry = this.cache.get(key);
 if (!entry) return false;

 this.currentSize -= entry.size;
 this.cache.delete(key);
 this.removeFromAccessOrder(key);
 return true;
 }

 /**
 * Clear all entries
 */
 clear(): void {
 this.cache.clear();
 this.accessOrder = [];
 this.currentSize = 0;
 }

 /**
 * Get cache statistics
 */
 getStats(): MemoryCacheStats {
 const total = this.stats.hits + this.stats.misses;
 return {
 hits: this.stats.hits,
 misses: this.stats.misses,
 evictions: this.stats.evictions,
 currentSize: this.currentSize,
 entryCount: this.cache.size,
 hitRate: total > 0 ? this.stats.hits / total : 0
 };
 }

 /**
 * Get all keys
 */
 keys(): string[] {
 return Array.from(this.cache.keys());
 }

 /**
 * Get cache size in bytes
 */
 getSize(): number {
 return this.currentSize;
 }

 /**
 * Get entry count
 */
 getCount(): number {
 return this.cache.size;
 }

 /**
 * Evict expired entries
 */
 evictExpired(): number {
 let evicted = 0;
 const now = Date.now();

 for (const [key, entry] of this.cache.entries()) {
 if (this.isExpired(entry)) {
 this.delete(key);
 evicted++;
 }
 }

 return evicted;
 }

 /**
 * Check if entry is expired
 */
 private isExpired(entry: CacheEntry<any>): boolean {
 if (!entry.ttl) return false;
 return Date.now() - entry.timestamp > entry.ttl;
 }

 /**
 * Evict least recently used entry
 */
 private evictLRU(): void {
 if (this.accessOrder.length === 0) return;

 const lruKey = this.accessOrder[0];
 this.delete(lruKey);
 this.stats.evictions++;
 }

 /**
 * Update access order for LRU tracking
 */
 private updateAccessOrder(key: string): void {
 this.removeFromAccessOrder(key);
 this.accessOrder.push(key);
 }

 /**
 * Remove key from access order
 */
 private removeFromAccessOrder(key: string): void {
 const index = this.accessOrder.indexOf(key);
 if (index > -1) {
 this.accessOrder.splice(index, 1);
 }
 }

 /**
 * Estimate size of a value in bytes
 */
 private estimateSize(value: unknown): number {
 if (value === null || value === undefined) return 0;

 const type = typeof value;

 if (type === 'boolean') return 4;
 if (type === 'number') return 8;
 if (type === 'string') return (value as string).length * 2; // UTF-16

 if (type === 'object') {
 // Use JSON serialization size as estimate
 try {
 return JSON.stringify(value).length * 2;
 } catch {
 return 1024; // Default estimate for non-serializable objects
 }
 }

 return 0;
 }
}

