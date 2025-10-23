/**
 * Tests for L1 Memory Cache
 */

import { MemoryCache } from '../memoryCache';

describe('MemoryCache', () => {
 let cache: MemoryCache;

 beforeEach(() => {
 cache = new MemoryCache({
 maxSize: 1024 * 1024, // 1MB
 maxEntries: 100,
 defaultTTL: 60000 // 1 minute
 });
 });

 describe('Basic Operations', () => {
 it('should store and retrieve values', () => {
 cache.set('key1', 'value1');
 expect(cache.get('key1')).toBe('value1');
 });

 it('should return undefined for non-existent keys', () => {
 expect(cache.get('nonexistent')).toBeUndefined();
 });

 it('should check if key exists', () => {
 cache.set('key1', 'value1');
 expect(cache.has('key1')).toBe(true);
 expect(cache.has('key2')).toBe(false);
 });

 it('should delete keys', () => {
 cache.set('key1', 'value1');
 expect(cache.has('key1')).toBe(true);

 cache.delete('key1');
 expect(cache.has('key1')).toBe(false);
 expect(cache.get('key1')).toBeUndefined();
 });

 it('should clear all entries', () => {
 cache.set('key1', 'value1');
 cache.set('key2', 'value2');
 cache.set('key3', 'value3');

 expect(cache.getCount()).toBe(3);

 cache.clear();
 expect(cache.getCount()).toBe(0);
 expect(cache.get('key1')).toBeUndefined();
 });
 });

 describe('TTL Support', () => {
 it('should expire entries after TTL', async () => {
 cache.set('key1', 'value1', 100); // 100ms TTL

 expect(cache.get('key1')).toBe('value1');

 // Wait for expiration
 await new Promise(resolve => setTimeout(resolve, 150));

 expect(cache.get('key1')).toBeUndefined();
 expect(cache.has('key1')).toBe(false);
 });

 it('should not expire entries without TTL', async () => {
 cache.set('key1', 'value1'); // No TTL

 await new Promise(resolve => setTimeout(resolve, 100));

 expect(cache.get('key1')).toBe('value1');
 });

 it('should evict expired entries', async () => {
 cache.set('key1', 'value1', 50);
 cache.set('key2', 'value2', 50);
 cache.set('key3', 'value3'); // No TTL

 await new Promise(resolve => setTimeout(resolve, 100));

 const evicted = cache.evictExpired();
 expect(evicted).toBe(2);
 expect(cache.getCount()).toBe(1);
 expect(cache.get('key3')).toBe('value3');
 });
 });

 describe('LRU Eviction', () => {
 it('should evict least recently used entries when full', () => {
 const smallCache = new MemoryCache({
 maxSize: 100, // Very small
 maxEntries: 3
 });

 smallCache.set('key1', 'value1');
 smallCache.set('key2', 'value2');
 smallCache.set('key3', 'value3');

 // Access key1 to make it recently used
 smallCache.get('key1');

 // Add key4, should evict key2 (least recently used)
 smallCache.set('key4', 'value4');

 expect(smallCache.has('key1')).toBe(true);
 expect(smallCache.has('key2')).toBe(false);
 expect(smallCache.has('key3')).toBe(true);
 expect(smallCache.has('key4')).toBe(true);
 });

 it('should respect max entries limit', () => {
 const smallCache = new MemoryCache({
 maxSize: 1024 * 1024,
 maxEntries: 5
 });

 for (let i = 0; i < 10; i++) {
 smallCache.set(`key${i}`, `value${i}`);
 }

 expect(smallCache.getCount()).toBeLessThanOrEqual(5);
 });
 });

 describe('Statistics', () => {
 it('should track hits and misses', () => {
 cache.set('key1', 'value1');

 cache.get('key1'); // Hit
 cache.get('key2'); // Miss
 cache.get('key1'); // Hit
 cache.get('key3'); // Miss

 const stats = cache.getStats();
 expect(stats.hits).toBe(2);
 expect(stats.misses).toBe(2);
 expect(stats.hitRate).toBe(0.5);
 });

 it('should track evictions', () => {
 const smallCache = new MemoryCache({
 maxSize: 100,
 maxEntries: 2
 });

 smallCache.set('key1', 'value1');
 smallCache.set('key2', 'value2');
 smallCache.set('key3', 'value3'); // Should evict key1

 const stats = smallCache.getStats();
 expect(stats.evictions).toBeGreaterThan(0);
 });

 it('should track current size and entry count', () => {
 cache.set('key1', 'value1');
 cache.set('key2', 'value2');

 const stats = cache.getStats();
 expect(stats.entryCount).toBe(2);
 expect(stats.currentSize).toBeGreaterThan(0);
 });
 });

 describe('Complex Data Types', () => {
 it('should handle objects', () => {
 const obj = { name: 'test', value: 123, nested: { data: true } };
 cache.set('obj', obj);

 const retrieved = cache.get<typeof obj>('obj');
 expect(retrieved).toEqual(obj);
 });

 it('should handle arrays', () => {
 const arr = [1, 2, 3, 'four', { five: 5 }];
 cache.set('arr', arr);

 const retrieved = cache.get<typeof arr>('arr');
 expect(retrieved).toEqual(arr);
 });

 it('should handle null and undefined', () => {
 cache.set('null', null);
 cache.set('undefined', undefined);

 expect(cache.get('null')).toBeNull();
 expect(cache.get('undefined')).toBeUndefined();
 });
 });

 describe('Access Tracking', () => {
 it('should track access count', () => {
 cache.set('key1', 'value1');

 cache.get('key1');
 cache.get('key1');
 cache.get('key1');

 const keys = cache.keys();
 expect(keys).toContain('key1');
 });

 it('should update last access time', async () => {
 cache.set('key1', 'value1');

 await new Promise(resolve => setTimeout(resolve, 10));

 cache.get('key1');

 // Access time should be updated
 expect(cache.has('key1')).toBe(true);
 });
 });

 describe('Size Management', () => {
 it('should estimate size correctly', () => {
 cache.set('small', 'x');
 const size1 = cache.getSize();

 cache.set('large', 'x'.repeat(1000));
 const size2 = cache.getSize();

 expect(size2).toBeGreaterThan(size1);
 });

 it('should respect max size limit', () => {
 const smallCache = new MemoryCache({
 maxSize: 1000, // 1KB
 maxEntries: 1000
 });

 // Try to add large values
 for (let i = 0; i < 100; i++) {
 smallCache.set(`key${i}`, 'x'.repeat(100));
 }

 expect(smallCache.getSize()).toBeLessThanOrEqual(1000);
 });
 });

 describe('Edge Cases', () => {
 it('should handle rapid updates to same key', () => {
 for (let i = 0; i < 100; i++) {
 cache.set('key1', `value${i}`);
 }

 expect(cache.get('key1')).toBe('value99');
 expect(cache.getCount()).toBe(1);
 });

 it('should handle empty strings', () => {
 cache.set('empty', '');
 expect(cache.get('empty')).toBe('');
 });

 it('should handle special characters in keys', () => {
 const specialKey = 'key:with:colons/and/slashes';
 cache.set(specialKey, 'value');
 expect(cache.get(specialKey)).toBe('value');
 });
 });
});

