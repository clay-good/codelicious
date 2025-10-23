"use strict";
/**
 * Tests for Multi-Layer Cache Manager
 */
Object.defineProperty(exports, "__esModule", { value: true });
const cacheManager_1 = require("../cacheManager");
// Mock vscode
jest.mock('vscode');
describe('CacheManager', () => {
    let cacheManager;
    let mockContext;
    let mockConfigManager;
    beforeEach(async () => {
        // Mock extension context
        mockContext = {
            globalStorageUri: {
                fsPath: '/tmp/codelicious-test-cache'
            }
        };
        // Mock configuration manager
        mockConfigManager = {
            getCacheConfig: jest.fn().mockReturnValue({
                enabled: true,
                maxSize: '10MB',
                ttl: 60000
            })
        };
        cacheManager = new cacheManager_1.CacheManager(mockContext, mockConfigManager);
        await cacheManager.initialize();
    });
    afterEach(async () => {
        await cacheManager.dispose();
    });
    describe('Initialization', () => {
        it('should initialize all cache layers', async () => {
            const stats = cacheManager.getDetailedStats();
            expect(stats).toBeDefined();
            expect(stats?.memory).toBeDefined();
            expect(stats?.disk).toBeDefined();
            expect(stats?.semantic).toBeDefined();
        });
        it('should respect disabled configuration', async () => {
            const disabledConfigManager = {
                getCacheConfig: jest.fn().mockReturnValue({
                    enabled: false,
                    maxSize: '10MB',
                    ttl: 60000
                })
            };
            const disabledCache = new cacheManager_1.CacheManager(mockContext, disabledConfigManager);
            await disabledCache.initialize();
            const stats = disabledCache.getStats();
            expect(stats.entryCount).toBe(0);
            await disabledCache.dispose();
        });
    });
    describe('Basic Operations', () => {
        it('should store and retrieve values', async () => {
            await cacheManager.set('key1', 'value1');
            const value = await cacheManager.get('key1');
            expect(value).toBe('value1');
        });
        it('should return undefined for non-existent keys', async () => {
            const value = await cacheManager.get('nonexistent');
            expect(value).toBeUndefined();
        });
        it('should check if key exists', async () => {
            await cacheManager.set('key1', 'value1');
            expect(cacheManager.has('key1')).toBe(true);
            expect(cacheManager.has('key2')).toBe(false);
        });
        it('should delete keys from all layers', async () => {
            await cacheManager.set('key1', 'value1');
            expect(cacheManager.has('key1')).toBe(true);
            await cacheManager.delete('key1');
            expect(cacheManager.has('key1')).toBe(false);
        });
        it('should clear all caches', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.set('key2', 'value2');
            await cacheManager.set('key3', 'value3');
            await cacheManager.clear();
            const stats = cacheManager.getStats();
            expect(stats.entryCount).toBe(0);
        });
    });
    describe('Layer-Specific Operations', () => {
        it('should write to memory layer only', async () => {
            await cacheManager.set('key1', 'value1', { layer: 'memory' });
            const value = await cacheManager.get('key1', { layer: 'memory' });
            expect(value).toBe('value1');
        });
        it('should write to disk layer only', async () => {
            await cacheManager.set('key1', 'value1', { layer: 'disk' });
            const value = await cacheManager.get('key1', { layer: 'disk' });
            expect(value).toBe('value1');
        });
        it('should write to all layers by default', async () => {
            await cacheManager.set('key1', 'value1');
            const memValue = await cacheManager.get('key1', { layer: 'memory' });
            const diskValue = await cacheManager.get('key1', { layer: 'disk' });
            expect(memValue).toBe('value1');
            expect(diskValue).toBe('value1');
        });
    });
    describe('Cache Promotion', () => {
        it('should promote disk cache hits to memory', async () => {
            // Write to disk only
            await cacheManager.set('key1', 'value1', { layer: 'disk' });
            // Get from cache (should promote to memory)
            await cacheManager.get('key1');
            // Should now be in memory
            const memValue = await cacheManager.get('key1', { layer: 'memory' });
            expect(memValue).toBe('value1');
        });
    });
    describe('Semantic Caching', () => {
        it('should cache with semantic information', async () => {
            const embedding = [1.0, 0.0, 0.0];
            await cacheManager.set('key1', 'auth response', {
                semanticQuery: 'how to authenticate users',
                semanticEmbedding: embedding
            });
            const value = await cacheManager.get('key1');
            expect(value).toBe('auth response');
        });
        it('should find similar queries', async () => {
            const embedding1 = [1.0, 0.0, 0.0];
            await cacheManager.set('key1', 'auth response', {
                semanticQuery: 'how to authenticate users',
                semanticEmbedding: embedding1
            });
            // Search with similar embedding
            const embedding2 = [0.99, 0.01, 0.0];
            const value = await cacheManager.get('key2', {
                semanticQuery: 'user authentication',
                semanticEmbedding: embedding2
            });
            expect(value).toBe('auth response');
        });
    });
    describe('TTL Support', () => {
        it('should expire entries after TTL', async () => {
            await cacheManager.set('key1', 'value1', { ttl: 100 });
            expect(await cacheManager.get('key1')).toBe('value1');
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(await cacheManager.get('key1')).toBeUndefined();
        });
        it('should cleanup expired entries', async () => {
            await cacheManager.set('key1', 'value1', { ttl: 50 });
            await cacheManager.set('key2', 'value2'); // No TTL
            await new Promise(resolve => setTimeout(resolve, 100));
            await cacheManager.cleanup();
            expect(await cacheManager.get('key1')).toBeUndefined();
            expect(await cacheManager.get('key2')).toBe('value2');
        });
    });
    describe('Statistics', () => {
        it('should track hits and misses', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.get('key1'); // Hit
            await cacheManager.get('key2'); // Miss
            await cacheManager.get('key1'); // Hit
            const stats = cacheManager.getStats();
            expect(stats.hits).toBeGreaterThan(0);
            expect(stats.misses).toBeGreaterThan(0);
        });
        it('should calculate hit rate', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.get('key1'); // Hit
            await cacheManager.get('key2'); // Miss
            const stats = cacheManager.getStats();
            expect(stats.hitRate).toBeGreaterThan(0);
            expect(stats.hitRate).toBeLessThanOrEqual(1);
        });
        it('should track total size', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.set('key2', 'value2');
            const stats = cacheManager.getStats();
            expect(stats.totalSize).toBeGreaterThan(0);
        });
        it('should track entry count', async () => {
            await cacheManager.set('key1', 'value1');
            await cacheManager.set('key2', 'value2');
            await cacheManager.set('key3', 'value3');
            const stats = cacheManager.getStats();
            expect(stats.entryCount).toBeGreaterThan(0);
        });
        it('should provide detailed stats for all layers', async () => {
            await cacheManager.set('key1', 'value1');
            const detailedStats = cacheManager.getDetailedStats();
            expect(detailedStats).toBeDefined();
            expect(detailedStats?.memory).toBeDefined();
            expect(detailedStats?.disk).toBeDefined();
            expect(detailedStats?.semantic).toBeDefined();
            expect(detailedStats?.combined).toBeDefined();
        });
    });
    describe('Complex Data Types', () => {
        it('should handle objects', async () => {
            const obj = { name: 'test', value: 123, nested: { data: true } };
            await cacheManager.set('obj', obj);
            const retrieved = await cacheManager.get('obj');
            expect(retrieved).toEqual(obj);
        });
        it('should handle arrays', async () => {
            const arr = [1, 2, 3, 'four', { five: 5 }];
            await cacheManager.set('arr', arr);
            const retrieved = await cacheManager.get('arr');
            expect(retrieved).toEqual(arr);
        });
        it('should handle large objects', async () => {
            const largeObj = {
                data: new Array(1000).fill(0).map((_, i) => ({ id: i, value: `item${i}` }))
            };
            await cacheManager.set('large', largeObj);
            const retrieved = await cacheManager.get('large');
            expect(retrieved).toEqual(largeObj);
        });
    });
    describe('Concurrent Operations', () => {
        it('should handle concurrent reads', async () => {
            await cacheManager.set('key1', 'value1');
            const promises = Array(10).fill(0).map(() => cacheManager.get('key1'));
            const results = await Promise.all(promises);
            results.forEach(result => {
                expect(result).toBe('value1');
            });
        });
        it('should handle concurrent writes', async () => {
            const promises = Array(10).fill(0).map((_, i) => cacheManager.set(`key${i}`, `value${i}`));
            await Promise.all(promises);
            const stats = cacheManager.getStats();
            expect(stats.entryCount).toBeGreaterThan(0);
        });
    });
    describe('Edge Cases', () => {
        it('should handle empty strings', async () => {
            await cacheManager.set('empty', '');
            expect(await cacheManager.get('empty')).toBe('');
        });
        it('should handle null values', async () => {
            await cacheManager.set('null', null);
            expect(await cacheManager.get('null')).toBeNull();
        });
        it('should handle undefined values', async () => {
            await cacheManager.set('undefined', undefined);
            expect(await cacheManager.get('undefined')).toBeUndefined();
        });
        it('should handle special characters in keys', async () => {
            const specialKey = 'key:with:colons/and/slashes';
            await cacheManager.set(specialKey, 'value');
            expect(await cacheManager.get(specialKey)).toBe('value');
        });
        it('should handle rapid updates to same key', async () => {
            for (let i = 0; i < 10; i++) {
                await cacheManager.set('key1', `value${i}`);
            }
            const value = await cacheManager.get('key1');
            expect(value).toBe('value9');
        });
    });
});
//# sourceMappingURL=cacheManager.test.js.map