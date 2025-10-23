"use strict";
/**
 * Embedding Service - Orchestrates embedding generation for indexed code
 * Connects the indexing engine with the embedding system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const embeddingManager_1 = require("./embeddingManager");
const vectorStore_1 = require("./vectorStore");
const codeChunker_1 = require("./codeChunker");
const cacheManager_1 = require("../cache/cacheManager");
const fileUtils_1 = require("../utils/fileUtils");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('EmbeddingService');
class EmbeddingService {
    constructor(context, configManager, indexingEngine) {
        this.context = context;
        this.configManager = configManager;
        this.indexingEngine = indexingEngine;
        this.isInitialized = false;
        this.stats = {
            totalEmbeddings: 0,
            filesEmbedded: 0,
            chunksGenerated: 0,
            lastUpdate: Date.now(),
            averageChunksPerFile: 0
        };
        // Initialize cache manager
        this.cacheManager = new cacheManager_1.CacheManager(context, configManager);
        // Initialize embedding manager with cache
        this.embeddingManager = new embeddingManager_1.EmbeddingManager(configManager, this.cacheManager);
        this.vectorStore = new vectorStore_1.VectorStore(configManager);
        this.codeChunker = new codeChunker_1.CodeChunker(512, 50); // 512 lines per chunk, 50 lines overlap
    }
    /**
    * Initialize the embedding service
    */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        logger.info('Initializing EmbeddingService...');
        try {
            // Initialize cache manager
            await this.cacheManager.initialize();
            // Initialize embedding manager (connects to Python server)
            await this.embeddingManager.initialize();
            // Initialize vector store (connects to ChromaDB)
            await this.vectorStore.initialize();
            this.isInitialized = true;
            logger.info('EmbeddingService initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize EmbeddingService', error);
            this.isInitialized = false;
            throw error;
        }
    }
    /**
    * Generate embeddings for all indexed files
    */
    async embedAllFiles(workspacePath) {
        if (!this.isInitialized) {
            logger.warn('EmbeddingService not initialized');
            return;
        }
        logger.info('Starting embedding generation for all files...');
        const startTime = Date.now();
        const indexedFiles = this.indexingEngine.getIndexedFiles();
        const totalFiles = indexedFiles.length;
        let processedFiles = 0;
        for (const fileMetadata of indexedFiles) {
            try {
                await this.embedFile(fileMetadata, workspacePath);
                processedFiles++;
                if (processedFiles % 10 === 0) {
                    logger.info(`Embedded ${processedFiles}/${totalFiles} files`);
                }
            }
            catch (error) {
                logger.error(`Failed to embed file ${fileMetadata.path}`, error);
            }
        }
        const duration = Date.now() - startTime;
        logger.info(`Embedded ${processedFiles} files in ${duration}ms`);
        this.stats.lastUpdate = Date.now();
        this.stats.averageChunksPerFile = this.stats.chunksGenerated / this.stats.filesEmbedded;
    }
    /**
    * Generate embeddings for a single file
    */
    async embedFile(fileMetadata, workspacePath) {
        if (!this.isInitialized) {
            logger.warn('EmbeddingService not initialized');
            return;
        }
        try {
            // Read file content (readFileContent only takes one argument)
            const content = (0, fileUtils_1.readFileContent)(fileMetadata.path);
            if (!content) {
                logger.warn(`Could not read file: ${fileMetadata.path}`);
                return;
            }
            // Chunk the file
            const chunks = await this.codeChunker.chunkFile(fileMetadata.path, content);
            if (chunks.length === 0) {
                logger.warn(`No chunks generated for file: ${fileMetadata.path}`);
                return;
            }
            // Generate embeddings for all chunks
            const embeddings = await this.generateEmbeddingsForChunks(chunks, fileMetadata);
            // Store embeddings in vector store
            await this.vectorStore.addEmbeddings(embeddings);
            // Update stats
            this.stats.filesEmbedded++;
            this.stats.chunksGenerated += chunks.length;
            this.stats.totalEmbeddings += embeddings.length;
            logger.debug(`Embedded ${chunks.length} chunks from ${fileMetadata.path}`);
        }
        catch (error) {
            logger.error(`Error embedding file ${fileMetadata.path}`, error);
            throw error;
        }
    }
    /**
    * Generate embeddings for code chunks
    */
    async generateEmbeddingsForChunks(chunks, fileMetadata) {
        const embeddings = [];
        // Extract texts for batch processing
        const texts = chunks.map(chunk => chunk.content);
        // Generate embeddings in batch
        const vectors = await this.embeddingManager.generateEmbeddings(texts, 32);
        // Create embedding objects with metadata
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const vector = vectors[i];
            const embedding = {
                id: this.generateEmbeddingId(fileMetadata.path, chunk.startLine),
                vector,
                metadata: {
                    text: chunk.content,
                    source: fileMetadata.path,
                    language: fileMetadata.language,
                    type: chunk.type,
                    timestamp: Date.now(),
                    filePath: fileMetadata.path,
                    startLine: chunk.startLine,
                    endLine: chunk.endLine,
                    symbolName: chunk.symbolName,
                    symbolKind: chunk.symbolKind
                }
            };
            embeddings.push(embedding);
        }
        return embeddings;
    }
    /**
    * Update embeddings for a modified file
    */
    async updateFileEmbeddings(filePath, workspacePath) {
        if (!this.isInitialized) {
            return;
        }
        logger.info(`Updating embeddings for: ${filePath}`);
        try {
            // Delete old embeddings for this file
            await this.vectorStore.deleteByFilter({ filePath });
            // Get updated file metadata from indexing engine
            const fileMetadata = this.indexingEngine.getFileMetadata(filePath);
            if (!fileMetadata) {
                logger.warn(`File metadata not found: ${filePath}`);
                return;
            }
            // Generate new embeddings
            await this.embedFile(fileMetadata, workspacePath);
            logger.info(`Updated embeddings for ${filePath}`);
        }
        catch (error) {
            logger.error(`Failed to update embeddings for ${filePath}`, error);
        }
    }
    /**
    * Delete embeddings for a file
    */
    async deleteFileEmbeddings(filePath) {
        if (!this.isInitialized) {
            return;
        }
        try {
            await this.vectorStore.deleteByFilter({ filePath });
            logger.info(`Deleted embeddings for ${filePath}`);
        }
        catch (error) {
            logger.error(`Failed to delete embeddings for ${filePath}`, error);
        }
    }
    /**
    * Search for similar code using semantic search
    */
    async searchSimilarCode(query, limit = 10) {
        if (!this.isInitialized) {
            logger.warn('EmbeddingService not initialized');
            return [];
        }
        try {
            // Generate embedding for query
            const queryEmbedding = await this.embeddingManager.generateEmbedding(query);
            // Search in vector store
            const results = await this.vectorStore.search(queryEmbedding, { limit });
            return results;
        }
        catch (error) {
            logger.error('Search failed', error);
            return [];
        }
    }
    /**
    * Get embedding statistics
    */
    getStats() {
        return { ...this.stats };
    }
    /**
    * Check if service is ready
    */
    isReady() {
        return this.isInitialized &&
            this.embeddingManager.isAvailable() &&
            this.vectorStore.isReady();
    }
    /**
    * Generate unique ID for embedding
    */
    generateEmbeddingId(filePath, startLine) {
        return `${filePath}:${startLine}:${Date.now()}`;
    }
    /**
    * Clear all embeddings
    */
    async clearAllEmbeddings() {
        if (!this.isInitialized) {
            return;
        }
        try {
            await this.vectorStore.clear();
            this.stats = {
                totalEmbeddings: 0,
                filesEmbedded: 0,
                chunksGenerated: 0,
                lastUpdate: Date.now(),
                averageChunksPerFile: 0
            };
            logger.info('Cleared all embeddings');
        }
        catch (error) {
            logger.error('Failed to clear embeddings', error);
        }
    }
    /**
    * Clean up resources
    */
    async dispose() {
        logger.info('Disposing EmbeddingService');
        await this.vectorStore.dispose();
        this.isInitialized = false;
    }
}
exports.EmbeddingService = EmbeddingService;
//# sourceMappingURL=embeddingService.js.map