"use strict";
/**
 * Tests for L3 Semantic Cache
 */
Object.defineProperty(exports, "__esModule", { value: true });
const semanticCache_1 = require("../semanticCache");
describe('SemanticCache', () => {
    let cache;
    beforeEach(() => {
        cache = new semanticCache_1.SemanticCache({
            maxEntries: 100,
            similarityThreshold: 0.85,
            defaultTTL: 60000
        });
    });
    describe('Basic Operations', () => {
        it('should store and retrieve by exact key', () => {
            const embedding = [0.1, 0.2, 0.3];
            cache.set('key1', 'query1', embedding, 'value1');
            expect(cache.get('key1')).toBe('value1');
        });
        it('should return undefined for non-existent keys', () => {
            expect(cache.get('nonexistent')).toBeUndefined();
        });
        it('should check if key exists', () => {
            const embedding = [0.1, 0.2, 0.3];
            cache.set('key1', 'query1', embedding, 'value1');
            expect(cache.has('key1')).toBe(true);
            expect(cache.has('key2')).toBe(false);
        });
        it('should delete entries', () => {
            const embedding = [0.1, 0.2, 0.3];
            cache.set('key1', 'query1', embedding, 'value1');
            expect(cache.has('key1')).toBe(true);
            cache.delete('key1');
            expect(cache.has('key1')).toBe(false);
        });
        it('should clear all entries', () => {
            const embedding1 = [0.1, 0.2, 0.3];
            const embedding2 = [0.4, 0.5, 0.6];
            cache.set('key1', 'query1', embedding1, 'value1');
            cache.set('key2', 'query2', embedding2, 'value2');
            expect(cache.getSize()).toBe(2);
            cache.clear();
            expect(cache.getSize()).toBe(0);
        });
    });
    describe('Semantic Similarity', () => {
        it('should find similar queries', () => {
            // Add a query
            const embedding1 = [1.0, 0.0, 0.0];
            cache.set('key1', 'how to authenticate users', embedding1, 'auth response');
            // Search with very similar embedding
            const embedding2 = [0.99, 0.01, 0.0];
            const match = cache.findSimilar('how to authenticate', embedding2);
            expect(match).toBeDefined();
            expect(match?.entry.value).toBe('auth response');
            expect(match?.similarity).toBeGreaterThan(0.85);
        });
        it('should not match dissimilar queries', () => {
            // Add a query
            const embedding1 = [1.0, 0.0, 0.0];
            cache.set('key1', 'authentication', embedding1, 'auth response');
            // Search with very different embedding
            const embedding2 = [0.0, 0.0, 1.0];
            const match = cache.findSimilar('database query', embedding2);
            expect(match).toBeUndefined();
        });
        it('should respect similarity threshold', () => {
            const embedding1 = [1.0, 0.0, 0.0];
            cache.set('key1', 'query1', embedding1, 'value1');
            // Very different embedding (below 85% threshold)
            const embedding2 = [0.3, 0.7, 0.0];
            const match = cache.findSimilar('query2', embedding2);
            expect(match).toBeUndefined();
        });
        it('should find best match among multiple entries', () => {
            // Add multiple entries with clear similarity differences
            cache.set('key1', 'query1', [1.0, 0.0, 0.0], 'value1');
            cache.set('key2', 'query2', [0.0, 1.0, 0.0], 'value2');
            cache.set('key3', 'query3', [0.0, 0.0, 1.0], 'value3');
            // Search with embedding closest to key2
            const searchEmbedding = [0.0, 0.99, 0.01];
            const match = cache.findSimilar('search', searchEmbedding);
            expect(match).toBeDefined();
            expect(match?.entry.key).toBe('key2');
        });
        it('should find top N matches', () => {
            // Add entries with varying similarity
            cache.set('key1', 'query1', [1.0, 0.0, 0.0], 'value1');
            cache.set('key2', 'query2', [0.95, 0.05, 0.0], 'value2');
            cache.set('key3', 'query3', [0.9, 0.1, 0.0], 'value3');
            cache.set('key4', 'query4', [0.5, 0.5, 0.0], 'value4');
            const searchEmbedding = [1.0, 0.0, 0.0];
            const matches = cache.findTopMatches(searchEmbedding, 3, 0.8);
            expect(matches.length).toBeLessThanOrEqual(3);
            expect(matches[0].similarity).toBeGreaterThanOrEqual(matches[1].similarity);
        });
    });
    describe('TTL Support', () => {
        it('should expire entries after TTL', async () => {
            const embedding = [0.1, 0.2, 0.3];
            cache.set('key1', 'query1', embedding, 'value1', 100); // 100ms TTL
            expect(cache.get('key1')).toBe('value1');
            await new Promise(resolve => setTimeout(resolve, 150));
            expect(cache.get('key1')).toBeUndefined();
        });
        it('should not return expired entries in similarity search', async () => {
            const embedding = [1.0, 0.0, 0.0];
            cache.set('key1', 'query1', embedding, 'value1', 100);
            await new Promise(resolve => setTimeout(resolve, 150));
            const match = cache.findSimilar('query', embedding);
            expect(match).toBeUndefined();
        });
        it('should cleanup expired entries', async () => {
            const embedding1 = [0.1, 0.2, 0.3];
            const embedding2 = [0.4, 0.5, 0.6];
            cache.set('key1', 'query1', embedding1, 'value1', 50);
            cache.set('key2', 'query2', embedding2, 'value2'); // No TTL
            await new Promise(resolve => setTimeout(resolve, 100));
            const cleaned = cache.cleanup();
            expect(cleaned).toBe(1);
            expect(cache.getSize()).toBe(1);
            expect(cache.get('key2')).toBe('value2');
        });
    });
    describe('Eviction Policy', () => {
        it('should evict least used entries when full', () => {
            const smallCache = new semanticCache_1.SemanticCache({
                maxEntries: 3,
                similarityThreshold: 0.85
            });
            // Add 3 entries
            smallCache.set('key1', 'query1', [0.1, 0.2, 0.3], 'value1');
            smallCache.set('key2', 'query2', [0.4, 0.5, 0.6], 'value2');
            smallCache.set('key3', 'query3', [0.7, 0.8, 0.9], 'value3');
            // Access key1 and key3 to increase hit count
            smallCache.get('key1');
            smallCache.get('key3');
            // Add key4, should evict key2 (least used)
            smallCache.set('key4', 'query4', [0.2, 0.3, 0.4], 'value4');
            expect(smallCache.has('key1')).toBe(true);
            expect(smallCache.has('key2')).toBe(false);
            expect(smallCache.has('key3')).toBe(true);
            expect(smallCache.has('key4')).toBe(true);
        });
    });
    describe('Statistics', () => {
        it('should track hits and misses', () => {
            const embedding = [1.0, 0.0, 0.0];
            cache.set('key1', 'query1', embedding, 'value1');
            cache.findSimilar('query', embedding); // Hit
            cache.findSimilar('query', [0.0, 1.0, 0.0]); // Miss
            const stats = cache.getStats();
            expect(stats.hits).toBe(1);
            expect(stats.misses).toBe(1);
        });
        it('should track entry count', () => {
            cache.set('key1', 'query1', [0.1, 0.2, 0.3], 'value1');
            cache.set('key2', 'query2', [0.4, 0.5, 0.6], 'value2');
            const stats = cache.getStats();
            expect(stats.entries).toBe(2);
        });
        it('should calculate average similarity', () => {
            cache.set('key1', 'query1', [1.0, 0.0, 0.0], 'value1');
            cache.findSimilar('query', [1.0, 0.0, 0.0]); // 1.0 similarity
            cache.findSimilar('query', [0.9, 0.1, 0.0]); // ~0.99 similarity
            const stats = cache.getStats();
            expect(stats.averageSimilarity).toBeGreaterThan(0.9);
        });
    });
    describe('Hit Count Tracking', () => {
        it('should track hit count per entry', () => {
            const embedding = [1.0, 0.0, 0.0];
            cache.set('key1', 'query1', embedding, 'value1');
            // Access multiple times
            cache.findSimilar('query', embedding);
            cache.findSimilar('query', embedding);
            cache.findSimilar('query', embedding);
            const topEntries = cache.getTopEntries(1);
            expect(topEntries[0].hitCount).toBe(3);
        });
        it('should return top entries by hit count', () => {
            cache.set('key1', 'query1', [0.1, 0.2, 0.3], 'value1');
            cache.set('key2', 'query2', [0.4, 0.5, 0.6], 'value2');
            cache.set('key3', 'query3', [0.7, 0.8, 0.9], 'value3');
            // Access key2 most
            cache.get('key2');
            cache.get('key2');
            cache.get('key2');
            // Access key1 once
            cache.get('key1');
            const topEntries = cache.getTopEntries(2);
            expect(topEntries[0].key).toBe('key2');
            expect(topEntries[1].key).toBe('key1');
        });
    });
    describe('Memory Usage', () => {
        it('should estimate memory usage', () => {
            cache.set('key1', 'query1', [0.1, 0.2, 0.3], 'value1');
            cache.set('key2', 'query2', [0.4, 0.5, 0.6], { large: 'object' });
            const usage = cache.estimateMemoryUsage();
            expect(usage).toBeGreaterThan(0);
        });
        it('should increase memory usage with more entries', () => {
            cache.set('key1', 'query1', [0.1, 0.2, 0.3], 'value1');
            const usage1 = cache.estimateMemoryUsage();
            cache.set('key2', 'query2', [0.4, 0.5, 0.6], 'value2');
            const usage2 = cache.estimateMemoryUsage();
            expect(usage2).toBeGreaterThan(usage1);
        });
    });
    describe('Edge Cases', () => {
        it('should handle zero vectors', () => {
            const zeroVector = [0, 0, 0];
            cache.set('key1', 'query1', zeroVector, 'value1');
            const match = cache.findSimilar('query', zeroVector);
            expect(match).toBeUndefined(); // Cosine similarity undefined for zero vectors
        });
        it('should handle single-dimension vectors', () => {
            cache.set('key1', 'query1', [1.0], 'value1');
            const match = cache.findSimilar('query', [0.9]);
            expect(match).toBeDefined();
        });
        it('should handle high-dimension vectors', () => {
            const highDimVector = new Array(1536).fill(0).map(() => Math.random());
            cache.set('key1', 'query1', highDimVector, 'value1');
            const match = cache.findSimilar('query', highDimVector);
            expect(match).toBeDefined();
            expect(match?.similarity).toBeCloseTo(1.0, 2);
        });
    });
});
//# sourceMappingURL=semanticCache.test.js.map