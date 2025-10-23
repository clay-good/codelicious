"use strict";
/**
 * Vector Store - ChromaDB integration for storing and retrieving embeddings
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStore = void 0;
const chromadb_1 = require("chromadb");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('VectorStore');
class VectorStore {
    constructor(configManager, collectionName = 'codelicious_embeddings') {
        this.configManager = configManager;
        this.client = null;
        this.collection = null;
        this.isInitialized = false;
        this.collectionName = collectionName;
    }
    /**
    * Initialize ChromaDB connection
    */
    async initialize() {
        try {
            logger.info('Initializing VectorStore with ChromaDB...');
            const config = this.configManager.getChromaDBConfig();
            this.client = new chromadb_1.ChromaClient({
                path: config.url
            });
            // Get or create collection
            try {
                this.collection = await this.client.getOrCreateCollection({
                    name: this.collectionName,
                    metadata: {
                        description: 'Codelicious code embeddings',
                        created_at: new Date().toISOString()
                    }
                });
                logger.info(`ChromaDB collection ready: ${this.collectionName}`);
                this.isInitialized = true;
            }
            catch (error) {
                logger.error('Failed to create/get collection', error);
                throw error;
            }
        }
        catch (error) {
            logger.error('Failed to initialize ChromaDB', error);
            this.isInitialized = false;
            throw error;
        }
    }
    /**
    * Add embeddings to the vector store
    */
    async addEmbeddings(embeddings) {
        if (!this.isInitialized || !this.collection) {
            throw new Error('VectorStore not initialized');
        }
        if (embeddings.length === 0) {
            return;
        }
        try {
            await this.collection.add({
                ids: embeddings.map(e => e.id),
                embeddings: embeddings.map(e => e.vector),
                metadatas: embeddings.map(e => this.serializeMetadata(e.metadata)),
                documents: embeddings.map(e => e.metadata.text || '')
            });
            logger.debug(`Added ${embeddings.length} embeddings to vector store`);
        }
        catch (error) {
            logger.error('Failed to add embeddings', error);
            throw error;
        }
    }
    /**
    * Add a single embedding
    */
    async addEmbedding(embedding) {
        await this.addEmbeddings([embedding]);
    }
    /**
    * Search for similar embeddings
    */
    async search(queryEmbedding, options = {}) {
        if (!this.isInitialized || !this.collection) {
            throw new Error('VectorStore not initialized');
        }
        const limit = options.limit || 10;
        try {
            const results = await this.collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: limit,
                where: options.filter
            });
            if (!results.ids || !results.ids[0]) {
                return [];
            }
            const searchResults = [];
            for (let i = 0; i < results.ids[0].length; i++) {
                const id = results.ids[0][i];
                const distance = results.distances?.[0]?.[i] || 0;
                const metadata = results.metadatas?.[0]?.[i] || {};
                const document = results.documents?.[0]?.[i] || '';
                // Convert distance to similarity score (0-1, higher is better)
                const score = 1 / (1 + distance);
                searchResults.push({
                    id,
                    score,
                    metadata: this.deserializeMetadata(metadata),
                    content: document
                });
            }
            return searchResults;
        }
        catch (error) {
            logger.error('Search failed', error);
            return [];
        }
    }
    /**
    * Search by text (requires embedding generation)
    */
    async searchByText(text, embeddingGenerator, options = {}) {
        const embedding = await embeddingGenerator(text);
        return this.search(embedding, options);
    }
    /**
    * Update an embedding
    */
    async updateEmbedding(embedding) {
        if (!this.isInitialized || !this.collection) {
            throw new Error('VectorStore not initialized');
        }
        try {
            await this.collection.update({
                ids: [embedding.id],
                embeddings: [embedding.vector],
                metadatas: [this.serializeMetadata(embedding.metadata)],
                documents: [embedding.metadata.text || '']
            });
        }
        catch (error) {
            logger.error('Failed to update embedding', error);
            throw error;
        }
    }
    /**
    * Delete embeddings by IDs
    */
    async deleteEmbeddings(ids) {
        if (!this.isInitialized || !this.collection) {
            throw new Error('VectorStore not initialized');
        }
        try {
            await this.collection.delete({
                ids
            });
            logger.debug(`Deleted ${ids.length} embeddings`);
        }
        catch (error) {
            logger.error('Failed to delete embeddings', error);
            throw error;
        }
    }
    /**
    * Delete embeddings by filter
    */
    async deleteByFilter(filter) {
        if (!this.isInitialized || !this.collection) {
            throw new Error('VectorStore not initialized');
        }
        try {
            await this.collection.delete({
                where: filter
            });
            logger.debug('Deleted embeddings by filter');
        }
        catch (error) {
            logger.error('Failed to delete by filter', error);
            throw error;
        }
    }
    /**
    * Get embedding by ID
    */
    async getEmbedding(id) {
        if (!this.isInitialized || !this.collection) {
            throw new Error('VectorStore not initialized');
        }
        try {
            const result = await this.collection.get({
                ids: [id]
            });
            if (!result.ids || result.ids.length === 0) {
                return null;
            }
            return {
                id: result.ids[0],
                vector: result.embeddings?.[0] || [],
                metadata: this.deserializeMetadata(result.metadatas?.[0] || {})
            };
        }
        catch (error) {
            logger.error('Failed to get embedding', error);
            return null;
        }
    }
    /**
    * Count embeddings in collection
    */
    async count() {
        if (!this.isInitialized || !this.collection) {
            return 0;
        }
        try {
            return await this.collection.count();
        }
        catch (error) {
            logger.error('Failed to count embeddings', error);
            return 0;
        }
    }
    /**
    * Clear all embeddings
    */
    async clear() {
        if (!this.isInitialized || !this.client) {
            throw new Error('VectorStore not initialized');
        }
        try {
            await this.client.deleteCollection({ name: this.collectionName });
            this.collection = await this.client.createCollection({
                name: this.collectionName
            });
            logger.info('Vector store cleared');
        }
        catch (error) {
            logger.error('Failed to clear vector store', error);
            throw error;
        }
    }
    /**
    * Serialize metadata for ChromaDB (only primitive types)
    */
    serializeMetadata(metadata) {
        return {
            text: metadata.text || '',
            source: metadata.source || '',
            language: metadata.language || '',
            type: metadata.type || '',
            timestamp: metadata.timestamp || Date.now(),
            filePath: metadata.filePath || '',
            startLine: metadata.startLine || 0,
            endLine: metadata.endLine || 0,
            symbolName: metadata.symbolName || '',
            symbolKind: metadata.symbolKind || ''
        };
    }
    /**
    * Deserialize metadata from ChromaDB
    */
    deserializeMetadata(data) {
        return {
            text: data.text || '',
            source: data.source || '',
            language: data.language || '',
            type: data.type || '',
            timestamp: data.timestamp || Date.now(),
            filePath: data.filePath,
            startLine: data.startLine,
            endLine: data.endLine,
            symbolName: data.symbolName,
            symbolKind: data.symbolKind
        };
    }
    /**
    * Check if initialized
    */
    isReady() {
        return this.isInitialized;
    }
    /**
    * Clean up resources
    */
    async dispose() {
        logger.info('Disposing VectorStore');
        this.isInitialized = false;
        this.collection = null;
        this.client = null;
    }
}
exports.VectorStore = VectorStore;
//# sourceMappingURL=vectorStore.js.map