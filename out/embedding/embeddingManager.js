"use strict";
/**
 * Embedding Manager - Full implementation with Python server integration
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingManager = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('EmbeddingManager');
class EmbeddingManager {
    constructor(configManager, cacheManager) {
        this.configManager = configManager;
        this.cacheManager = cacheManager;
        this.isServerAvailable = false;
        this.modelName = 'unknown';
        this.dimension = 384;
        const config = this.configManager.getEmbeddingServerConfig();
        this.serverUrl = config.url;
        this.client = axios_1.default.create({
            baseURL: this.serverUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
    /**
    * Initialize the embedding system
    */
    async initialize() {
        logger.info('Initializing EmbeddingManager');
        try {
            // Check if server is available
            const health = await this.checkHealth();
            if (health) {
                this.isServerAvailable = true;
                this.modelName = health.model;
                this.dimension = health.dimension;
                logger.info(`Embedding server connected: ${this.modelName} (dim: ${this.dimension})`);
            }
            else {
                logger.warn('Embedding server not available - embeddings will be disabled');
            }
        }
        catch (error) {
            logger.error('Failed to initialize embedding server', error);
            this.isServerAvailable = false;
        }
    }
    /**
    * Check server health
    */
    async checkHealth() {
        try {
            const response = await this.client.get('/health');
            return response.data;
        }
        catch (error) {
            logger.error('Health check failed', error);
            return null;
        }
    }
    /**
    * Generate embedding for a single text
    */
    async generateEmbedding(text) {
        if (!this.isServerAvailable) {
            logger.warn('Embedding server not available, returning zero vector');
            return new Array(this.dimension).fill(0);
        }
        // Check cache first
        const cacheKey = `embedding:${this.hashText(text)}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) {
            return cached;
        }
        try {
            const embeddings = await this.generateEmbeddings([text]);
            const embedding = embeddings[0];
            // Cache the result
            await this.cacheManager.set(cacheKey, embedding);
            return embedding;
        }
        catch (error) {
            logger.error('Failed to generate embedding', error);
            return new Array(this.dimension).fill(0);
        }
    }
    /**
    * Generate embeddings for multiple texts (batch)
    */
    async generateEmbeddings(texts, batchSize = 32) {
        if (!this.isServerAvailable) {
            logger.warn('Embedding server not available, returning zero vectors');
            return texts.map(() => new Array(this.dimension).fill(0));
        }
        try {
            const request = {
                texts,
                batch_size: batchSize
            };
            const response = await this.client.post('/embed', request);
            return response.data.embeddings;
        }
        catch (error) {
            logger.error('Failed to generate embeddings', error);
            return texts.map(() => new Array(this.dimension).fill(0));
        }
    }
    /**
    * Generate embedding with metadata
    */
    async generateEmbeddingWithMetadata(text, metadata) {
        const vector = await this.generateEmbedding(text);
        return {
            id: this.generateId(),
            vector,
            metadata: {
                text,
                source: metadata.source || 'unknown',
                language: metadata.language || 'unknown',
                type: metadata.type || 'code',
                timestamp: Date.now(),
                ...metadata
            }
        };
    }
    /**
    * Check if server is available
    */
    isAvailable() {
        return this.isServerAvailable;
    }
    /**
    * Get model information
    */
    getModelInfo() {
        return {
            name: this.modelName,
            dimension: this.dimension
        };
    }
    /**
    * Generate a simple hash for text (for caching)
    */
    hashText(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }
    /**
    * Generate unique ID for embedding
    */
    generateId() {
        return `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
    * Clean up resources
    */
    async dispose() {
        logger.info('Disposing EmbeddingManager');
        this.isServerAvailable = false;
    }
}
exports.EmbeddingManager = EmbeddingManager;
//# sourceMappingURL=embeddingManager.js.map