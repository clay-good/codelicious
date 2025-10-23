/**
 * Code-Specific Embedding Adapter
 *
 * Provides specialized embedding generation for code using models like:
 * - CodeBERT (Microsoft)
 * - GraphCodeBERT (Microsoft)
 * - CodeT5 (Salesforce)
 * - UniXcoder (Microsoft)
 *
 * These models are trained specifically on code and understand:
 * - Programming language syntax
 * - Code semantics and structure
 * - Variable naming conventions
 * - Code relationships and dependencies
 */
export interface CodeEmbeddingModel {
    name: string;
    provider: 'huggingface' | 'openai' | 'local';
    modelId: string;
    dimensions: number;
    maxTokens: number;
    languages: string[];
    features: CodeEmbeddingFeature[];
}
export type CodeEmbeddingFeature = 'syntax_aware' | 'semantic_understanding' | 'cross_language' | 'code_search' | 'clone_detection' | 'bug_detection';
export interface CodeEmbeddingOptions {
    model?: string;
    includeComments?: boolean;
    includeDocstrings?: boolean;
    normalizeIdentifiers?: boolean;
    preserveStructure?: boolean;
    language?: string;
}
export interface CodeEmbeddingResult {
    embedding: number[];
    model: string;
    dimensions: number;
    metadata: {
        language: string;
        tokensUsed: number;
        processingTime: number;
        features: string[];
    };
}
export declare class CodeEmbeddingAdapter {
    private models;
    private defaultModel;
    private cache;
    constructor();
    /**
    * Generate embedding for code
    */
    generateEmbedding(code: string, options?: CodeEmbeddingOptions): Promise<CodeEmbeddingResult>;
    /**
    * Generate embeddings for multiple code snippets (batch)
    */
    generateBatchEmbeddings(codes: string[], options?: CodeEmbeddingOptions): Promise<CodeEmbeddingResult[]>;
    /**
    * Calculate similarity between two code embeddings
    */
    calculateSimilarity(embedding1: number[], embedding2: number[]): number;
    /**
    * Get available models
    */
    getAvailableModels(): CodeEmbeddingModel[];
    /**
    * Set default model
    */
    setDefaultModel(modelName: string): void;
    /**
    * Clear cache
    */
    clearCache(): void;
    /**
    * Preprocess code before embedding
    */
    private preprocessCode;
    /**
    * Generate embedding using HuggingFace API
    */
    private generateHuggingFaceEmbedding;
    /**
    * Generate embedding using OpenAI API
    */
    private generateOpenAIEmbedding;
    /**
    * Generate embedding using local model
    */
    private generateLocalEmbedding;
    /**
    * Get cache key
    */
    private getCacheKey;
    /**
    * Initialize available models
    */
    private initializeModels;
}
//# sourceMappingURL=codeEmbeddingAdapter.d.ts.map