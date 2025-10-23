/**
 * Embedding Manager - Full implementation with Python server integration
 */
import { ConfigurationManager } from '../core/configurationManager';
import { CacheManager } from '../cache/cacheManager';
import { Embedding, EmbeddingMetadata } from '../types';
interface HealthResponse {
    status: string;
    model: string;
    dimension: number;
}
export declare class EmbeddingManager {
    private configManager;
    private cacheManager;
    private client;
    private serverUrl;
    private isServerAvailable;
    private modelName;
    private dimension;
    constructor(configManager: ConfigurationManager, cacheManager: CacheManager);
    /**
    * Initialize the embedding system
    */
    initialize(): Promise<void>;
    /**
    * Check server health
    */
    checkHealth(): Promise<HealthResponse | null>;
    /**
    * Generate embedding for a single text
    */
    generateEmbedding(text: string): Promise<number[]>;
    /**
    * Generate embeddings for multiple texts (batch)
    */
    generateEmbeddings(texts: string[], batchSize?: number): Promise<number[][]>;
    /**
    * Generate embedding with metadata
    */
    generateEmbeddingWithMetadata(text: string, metadata: Partial<EmbeddingMetadata>): Promise<Embedding>;
    /**
    * Check if server is available
    */
    isAvailable(): boolean;
    /**
    * Get model information
    */
    getModelInfo(): {
        name: string;
        dimension: number;
    };
    /**
    * Generate a simple hash for text (for caching)
    */
    private hashText;
    /**
    * Generate unique ID for embedding
    */
    private generateId;
    /**
    * Clean up resources
    */
    dispose(): Promise<void>;
}
export {};
//# sourceMappingURL=embeddingManager.d.ts.map