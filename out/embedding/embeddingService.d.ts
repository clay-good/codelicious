/**
 * Embedding Service - Orchestrates embedding generation for indexed code
 * Connects the indexing engine with the embedding system
 */
import * as vscode from 'vscode';
import { IndexingEngine } from '../core/indexer';
import { ConfigurationManager } from '../core/configurationManager';
import { FileMetadata } from '../types';
export interface EmbeddingStats {
    totalEmbeddings: number;
    filesEmbedded: number;
    chunksGenerated: number;
    lastUpdate: number;
    averageChunksPerFile: number;
}
export declare class EmbeddingService {
    private context;
    private configManager;
    private indexingEngine;
    private embeddingManager;
    private vectorStore;
    private codeChunker;
    private cacheManager;
    private isInitialized;
    private stats;
    constructor(context: vscode.ExtensionContext, configManager: ConfigurationManager, indexingEngine: IndexingEngine);
    /**
    * Initialize the embedding service
    */
    initialize(): Promise<void>;
    /**
    * Generate embeddings for all indexed files
    */
    embedAllFiles(workspacePath: string): Promise<void>;
    /**
    * Generate embeddings for a single file
    */
    embedFile(fileMetadata: FileMetadata, workspacePath: string): Promise<void>;
    /**
    * Generate embeddings for code chunks
    */
    private generateEmbeddingsForChunks;
    /**
    * Update embeddings for a modified file
    */
    updateFileEmbeddings(filePath: string, workspacePath: string): Promise<void>;
    /**
    * Delete embeddings for a file
    */
    deleteFileEmbeddings(filePath: string): Promise<void>;
    /**
    * Search for similar code using semantic search
    */
    searchSimilarCode(query: string, limit?: number): Promise<any[]>;
    /**
    * Get embedding statistics
    */
    getStats(): EmbeddingStats;
    /**
    * Check if service is ready
    */
    isReady(): boolean;
    /**
    * Generate unique ID for embedding
    */
    private generateEmbeddingId;
    /**
    * Clear all embeddings
    */
    clearAllEmbeddings(): Promise<void>;
    /**
    * Clean up resources
    */
    dispose(): Promise<void>;
}
//# sourceMappingURL=embeddingService.d.ts.map