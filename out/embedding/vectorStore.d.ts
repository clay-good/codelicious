/**
 * Vector Store - ChromaDB integration for storing and retrieving embeddings
 */
import { Embedding, EmbeddingMetadata } from '../types';
import { ConfigurationManager } from '../core/configurationManager';
export interface SearchResult {
    id: string;
    score: number;
    metadata: EmbeddingMetadata;
    content: string;
}
export interface SearchOptions {
    limit?: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
}
export declare class VectorStore {
    private configManager;
    private client;
    private collection;
    private collectionName;
    private isInitialized;
    constructor(configManager: ConfigurationManager, collectionName?: string);
    /**
    * Initialize ChromaDB connection
    */
    initialize(): Promise<void>;
    /**
    * Add embeddings to the vector store
    */
    addEmbeddings(embeddings: Embedding[]): Promise<void>;
    /**
    * Add a single embedding
    */
    addEmbedding(embedding: Embedding): Promise<void>;
    /**
    * Search for similar embeddings
    */
    search(queryEmbedding: number[], options?: SearchOptions): Promise<SearchResult[]>;
    /**
    * Search by text (requires embedding generation)
    */
    searchByText(text: string, embeddingGenerator: (text: string) => Promise<number[]>, options?: SearchOptions): Promise<SearchResult[]>;
    /**
    * Update an embedding
    */
    updateEmbedding(embedding: Embedding): Promise<void>;
    /**
    * Delete embeddings by IDs
    */
    deleteEmbeddings(ids: string[]): Promise<void>;
    /**
    * Delete embeddings by filter
    */
    deleteByFilter(filter: Record<string, any>): Promise<void>;
    /**
    * Get embedding by ID
    */
    getEmbedding(id: string): Promise<Embedding | null>;
    /**
    * Count embeddings in collection
    */
    count(): Promise<number>;
    /**
    * Clear all embeddings
    */
    clear(): Promise<void>;
    /**
    * Serialize metadata for ChromaDB (only primitive types)
    */
    private serializeMetadata;
    /**
    * Deserialize metadata from ChromaDB
    */
    private deserializeMetadata;
    /**
    * Check if initialized
    */
    isReady(): boolean;
    /**
    * Clean up resources
    */
    dispose(): Promise<void>;
}
//# sourceMappingURL=vectorStore.d.ts.map