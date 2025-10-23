/**
 * RAG Retriever - Multi-stage retrieval system for code context
 */
import { EmbeddingManager } from '../embedding/embeddingManager';
import { VectorStore } from '../embedding/vectorStore';
import { IndexingEngine } from '../core/indexer';
export interface RetrievalOptions {
    limit?: number;
    minScore?: number;
    includeContext?: boolean;
    contextLines?: number;
    filters?: {
        language?: string;
        fileType?: string;
        symbolKind?: string;
    };
}
export interface RetrievalResult {
    content: string;
    score: number;
    source: string;
    metadata: {
        filePath?: string;
        startLine?: number;
        endLine?: number;
        symbolName?: string;
        language?: string;
    };
}
export declare class RAGRetriever {
    private embeddingManager;
    private vectorStore;
    private indexingEngine;
    private workspacePath;
    constructor(embeddingManager: EmbeddingManager, vectorStore: VectorStore, indexingEngine: IndexingEngine);
    /**
    * Set workspace path for file reading
    */
    setWorkspacePath(path: string): void;
    /**
    * Retrieve relevant code context for a query
    */
    retrieve(query: string, options?: RetrievalOptions): Promise<RetrievalResult[]>;
    /**
    * Vector similarity search
    */
    private vectorSearch;
    /**
    * Keyword-based search (BM25-like)
    */
    private keywordSearch;
    /**
    * Extract keywords from query
    */
    private extractKeywords;
    /**
    * Calculate keyword match score
    */
    private calculateKeywordScore;
    /**
    * Get file content from disk
    */
    private getFileContent;
    /**
    * Merge results from different sources
    */
    private mergeResults;
    /**
    * Apply filters to results
    */
    private applyFilters;
    /**
    * Re-rank results using advanced scoring
    *
    * This implements a lightweight re-ranking algorithm that considers:
    * 1. Query-content relevance (already in score)
    * 2. Code quality indicators (symbol count, documentation)
    * 3. Recency (if available)
    * 4. File importance (based on imports/dependencies)
    *
    * Note: For production, consider using a cross-encoder model
    */
    private rerank;
    /**
    * Apply Maximal Marginal Relevance for diversity
    */
    private applyMMR;
    /**
    * Calculate similarity between two results
    */
    private calculateSimilarity;
    /**
    * Add surrounding context lines to results
    */
    private addContext;
}
//# sourceMappingURL=retriever.d.ts.map