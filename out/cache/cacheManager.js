"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const path = __importStar(require("path"));
const memoryCache_1 = require("./memoryCache");
const diskCache_1 = require("./diskCache");
const semanticCache_1 = require("./semanticCache");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CacheManager');
class CacheManager {
    constructor(context, configManager) {
        this.context = context;
        this.configManager = configManager;
        this.isInitialized = false;
    }
    /**
    * Initialize the cache system
    */
    async initialize() {
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
            this.memoryCache = new memoryCache_1.MemoryCache({
                maxSize: memorySize,
                maxEntries: 1000,
                defaultTTL: config.ttl
            });
            logger.info(`L1 Memory Cache: ${this.formatSize(memorySize)}`);
            // L2: Disk Cache (80% of total)
            const diskSize = Math.floor(maxSizeBytes * 0.8);
            const cacheDir = path.join(this.context.globalStorageUri.fsPath, 'cache');
            this.diskCache = new diskCache_1.DiskCache({
                cacheDir,
                maxSize: diskSize,
                defaultTTL: config.ttl,
                cleanupInterval: 3600000 // 1 hour
            });
            await this.diskCache.initialize();
            logger.info(`L2 Disk Cache: ${this.formatSize(diskSize)}`);
            // L3: Semantic Cache
            this.semanticCache = new semanticCache_1.SemanticCache({
                maxEntries: 500,
                similarityThreshold: 0.85, // 85% similarity required
                defaultTTL: config.ttl
            });
            logger.info(`L3 Semantic Cache: 500 entries`);
            this.isInitialized = true;
            logger.info('Cache system initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize cache system', error);
            this.isInitialized = false;
        }
    }
    /**
    * Get a value from cache (checks all layers)
    */
    async get(key, options = {}) {
        if (!this.isInitialized) {
            return undefined;
        }
        const layer = options.layer || 'all';
        // Try semantic cache first if query provided
        if (layer === 'semantic' || layer === 'all') {
            if (options.semanticQuery && options.semanticEmbedding && this.semanticCache) {
                const match = this.semanticCache.findSimilar(options.semanticQuery, options.semanticEmbedding);
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
            const value = this.memoryCache.get(key);
            if (value !== undefined) {
                return value;
            }
        }
        // Try L2: Disk Cache
        if ((layer === 'disk' || layer === 'all') && this.diskCache) {
            const value = await this.diskCache.get(key);
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
    async set(key, value, options = {}) {
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
                this.semanticCache.set(key, options.semanticQuery, options.semanticEmbedding, value, ttl);
            }
        }
    }
    /**
    * Check if key exists in cache
    */
    has(key) {
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
    async delete(key) {
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
    async clear() {
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
    getStats() {
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
    async cleanup() {
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
    async dispose() {
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
    parseSize(sizeStr) {
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
    formatSize(bytes) {
        if (bytes < 1024)
            return `${bytes} B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(2)} KB`;
        if (bytes < 1024 * 1024 * 1024)
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cacheManager.js.map