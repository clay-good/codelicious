"use strict";
/**
 * RAG System Optimization
 *
 * Optimizes:
 * - Vector search performance
 * - Caching strategies
 * - Query performance
 * - Result ranking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryOptimizer = exports.RAGOptimizer = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('RAGOptimizer');
class RAGOptimizer {
    constructor(config) {
        this.config = {
            enableQueryCache: true,
            enableResultCache: true,
            enablePrefetching: true,
            cacheSize: 1000,
            prefetchThreshold: 0.8,
            parallelQueries: 5,
            ...config
        };
        this.queryCache = new Map();
        this.resultCache = new Map();
        this.metrics = {
            queryLatency: 0,
            cacheHitRate: 0,
            retrievalQuality: 0,
            throughput: 0
        };
    }
    /**
    * Optimize vector search
    */
    async optimizeVectorSearch(query, vectorStore, k = 10) {
        const startTime = Date.now();
        // Check cache
        const cacheKey = this.getCacheKey(query, k);
        if (this.config.enableQueryCache && this.queryCache.has(cacheKey)) {
            this.updateMetrics('cache_hit', Date.now() - startTime);
            return this.queryCache.get(cacheKey);
        }
        // Perform search with optimizations
        const results = await this.performOptimizedSearch(query, vectorStore, k);
        // Cache results
        if (this.config.enableResultCache) {
            this.cacheResults(cacheKey, results);
        }
        // Prefetch related queries
        if (this.config.enablePrefetching) {
            this.prefetchRelatedQueries(query, vectorStore, k).catch(() => {
                // Ignore prefetch errors
            });
        }
        this.updateMetrics('query', Date.now() - startTime);
        return results;
    }
    /**
    * Perform optimized search
    */
    async performOptimizedSearch(query, vectorStore, k) {
        // Use approximate nearest neighbor search for speed
        // This would use HNSW, IVF, or similar algorithms
        // For now, use standard search
        const results = await vectorStore.search(query, { limit: k * 2 }); // Get more results for re-ranking
        // Re-rank results
        const reranked = this.rerankResults(results, query);
        // Return top k
        return reranked.slice(0, k);
    }
    /**
    * Re-rank results
    */
    rerankResults(results, query) {
        // Apply multiple ranking signals
        return results.map(result => {
            let score = result.score;
            // Boost recent results
            if (result.metadata?.timestamp) {
                const age = Date.now() - result.metadata.timestamp;
                const recencyBoost = Math.exp(-age / (1000 * 60 * 60 * 24 * 30)); // 30 day decay
                score *= (1 + recencyBoost * 0.2);
            }
            // Boost frequently accessed results
            if (result.metadata?.accessCount) {
                const popularityBoost = Math.log(1 + result.metadata.accessCount) / 10;
                score *= (1 + popularityBoost);
            }
            // Boost results with high quality indicators
            if (result.metadata?.quality) {
                score *= (1 + result.metadata.quality * 0.3);
            }
            return { ...result, score };
        }).sort((a, b) => b.score - a.score);
    }
    /**
    * Cache results
    */
    cacheResults(key, results) {
        // Implement LRU cache
        if (this.queryCache.size >= this.config.cacheSize) {
            // Remove oldest entry
            const firstKey = this.queryCache.keys().next().value;
            if (firstKey !== undefined) {
                this.queryCache.delete(firstKey);
            }
        }
        this.queryCache.set(key, results);
    }
    /**
    * Prefetch related queries
    */
    async prefetchRelatedQueries(query, vectorStore, k) {
        // Generate related queries by perturbing the original
        const relatedQueries = this.generateRelatedQueries(query);
        // Prefetch in background (don't await)
        for (const relatedQuery of relatedQueries) {
            const cacheKey = this.getCacheKey(relatedQuery, k);
            if (!this.queryCache.has(cacheKey)) {
                vectorStore.search(relatedQuery, { limit: k }).then(results => {
                    this.cacheResults(cacheKey, results);
                }).catch(() => {
                    // Ignore prefetch errors
                });
            }
        }
    }
    /**
    * Generate related queries
    */
    generateRelatedQueries(query) {
        const related = [];
        const perturbation = 0.1;
        // Generate 3 related queries
        for (let i = 0; i < 3; i++) {
            const perturbed = query.map(v => v + (Math.random() - 0.5) * perturbation);
            related.push(perturbed);
        }
        return related;
    }
    /**
    * Get cache key
    */
    getCacheKey(query, k) {
        // Use first few dimensions for cache key
        if (!query || query.length === 0) {
            return `empty:${k}`;
        }
        const keyDims = query.slice(0, Math.min(10, query.length)).map(v => v.toFixed(4)).join(',');
        return `${keyDims}:${k}`;
    }
    /**
    * Update metrics
    */
    updateMetrics(type, latency) {
        if (type === 'cache_hit') {
            this.metrics.cacheHitRate = (this.metrics.cacheHitRate * 0.9) + 0.1;
        }
        else {
            this.metrics.cacheHitRate = this.metrics.cacheHitRate * 0.9;
        }
        this.metrics.queryLatency = (this.metrics.queryLatency * 0.9) + (latency * 0.1);
    }
    /**
    * Get metrics
    */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
    * Clear cache
    */
    clearCache() {
        this.queryCache.clear();
        this.resultCache.clear();
    }
    /**
    * Optimize index
    */
    async optimizeIndex(vectorStore) {
        // This would rebuild index with optimized parameters
        // - Use HNSW for fast approximate search
        // - Optimize M and efConstruction parameters
        // - Build inverted file index for large datasets
        logger.info('Optimizing vector index...');
    }
    /**
    * Batch queries
    */
    async batchQueries(queries, vectorStore, k = 10) {
        // Process queries in parallel batches
        const results = []; // RAG result structure
        for (let i = 0; i < queries.length; i += this.config.parallelQueries) {
            const batch = queries.slice(i, i + this.config.parallelQueries);
            const batchResults = await Promise.all(batch.map(query => this.optimizeVectorSearch(query, vectorStore, k)));
            results.push(...batchResults);
        }
        return results;
    }
    /**
    * Warm cache
    */
    async warmCache(commonQueries, vectorStore, k = 10) {
        logger.info(`Warming cache with ${commonQueries.length} queries...`);
        await Promise.all(commonQueries.map(query => this.optimizeVectorSearch(query, vectorStore, k)));
        logger.info('Cache warmed successfully');
    }
}
exports.RAGOptimizer = RAGOptimizer;
/**
 * Query Optimizer
 */
class QueryOptimizer {
    /**
    * Optimize query embedding
    */
    optimizeQuery(query) {
        // Remove stop words
        const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at']);
        const words = query.toLowerCase().split(/\s+/);
        const filtered = words.filter(w => !stopWords.has(w));
        // Add programming context
        const enhanced = filtered.join(' ');
        return enhanced;
    }
    /**
    * Expand query with synonyms
    */
    expandQuery(query) {
        const synonyms = {
            'function': ['method', 'procedure', 'routine'],
            'class': ['type', 'object', 'interface'],
            'variable': ['field', 'property', 'attribute']
        };
        const expanded = [query];
        for (const [term, syns] of Object.entries(synonyms)) {
            if (query.includes(term)) {
                for (const syn of syns) {
                    expanded.push(query.replace(term, syn));
                }
            }
        }
        return expanded;
    }
}
exports.QueryOptimizer = QueryOptimizer;
//# sourceMappingURL=ragOptimizer.js.map