/**
 * RAG Service - High-level service for Retrieval-Augmented Generation
 *
 * This service orchestrates the complete RAG pipeline:
 * 1. Retrieval: Multi-stage search (vector + keyword + hybrid)
 * 2. Re-ranking: Advanced scoring and relevance optimization
 * 3. Diversity: MMR algorithm for diverse results
 * 4. Assembly: Context formatting for AI models
 */
import * as vscode from 'vscode';
import { RetrievalResult } from './retriever';
import { AssembledContext } from './contextAssembler';
import { EmbeddingManager } from '../embedding/embeddingManager';
import { VectorStore } from '../embedding/vectorStore';
import { IndexingEngine } from '../core/indexer';
import { ConfigurationManager } from '../core/configurationManager';
import { LearningManager } from '../learning/learningManager';
import { PersistentContextEngine, ArchitecturalContext } from '../context/persistentContextEngine';
import { IncrementalIndexer } from '../context/incrementalIndexer';
import { ModelOrchestrator } from '../models/orchestrator';
export interface RAGQueryOptions {
    limit?: number;
    minScore?: number;
    includeContext?: boolean;
    contextLines?: number;
    filters?: {
        language?: string;
        fileType?: string;
        symbolKind?: string;
    };
    maxTokens?: number;
    format?: 'markdown' | 'xml' | 'plain';
    includeMetadata?: boolean;
    queryType?: 'error' | 'test' | 'documentation' | 'refactor' | 'general';
}
export interface RAGResponse {
    results: RetrievalResult[];
    assembledContext: AssembledContext;
    metadata: {
        retrievalTime: number;
        assemblyTime: number;
        totalResults: number;
        qualityScore: number;
    };
}
export declare class RAGService {
    private context;
    private configManager;
    private embeddingManager;
    private vectorStore;
    private indexingEngine;
    private learningManager?;
    private modelOrchestrator?;
    private retriever;
    private assembler;
    private patternIntegration?;
    private persistentContext?;
    private incrementalIndexer?;
    private contextCache;
    private isInitialized;
    private gitHistoryIndexer?;
    private gitService?;
    constructor(context: vscode.ExtensionContext, configManager: ConfigurationManager, embeddingManager: EmbeddingManager, vectorStore: VectorStore, indexingEngine: IndexingEngine, learningManager?: LearningManager | undefined, modelOrchestrator?: ModelOrchestrator | undefined);
    /**
    * Initialize the RAG service
    */
    initialize(workspacePath: string): Promise<void>;
    /**
    * Initialize pattern RAG integration
    */
    private initializePatternIntegration;
    /**
    * Index existing patterns in vector store (background task)
    */
    private indexExistingPatterns;
    /**
    * Query the RAG system with pattern integration
    *
    * This is the main entry point for RAG queries. It:
    * 1. Retrieves relevant code using multi-stage search
    * 2. Integrates learned patterns if available
    * 3. Assembles context optimized for AI models
    * 4. Returns both raw results and formatted context
    */
    query(query: string, options?: RAGQueryOptions): Promise<RAGResponse>;
    /**
    * Query with architectural context (Augment-style 200k+ tokens)
    * PERFORMANCE: Cached queries are 70% faster
    */
    queryWithArchitecture(query: string, options?: Partial<RAGQueryOptions>): Promise<ArchitecturalContext | null>;
    /**
    * Query with commit history context (Context Lineage)
    * AUGMENT PARITY: Combines code context with git commit history
    */
    queryWithHistory(query: string, options?: Partial<RAGQueryOptions>): Promise<ArchitecturalContext | null>;
    /**
    * Get persistent context engine
    */
    getPersistentContext(): PersistentContextEngine | undefined;
    /**
    * Get incremental indexer
    */
    getIncrementalIndexer(): IncrementalIndexer | undefined;
    /**
    * Query with automatic context optimization
    *
    * This method automatically adjusts retrieval parameters based on
    * the query and available context to maximize quality.
    */
    queryOptimized(query: string, options?: RAGQueryOptions): Promise<RAGResponse>;
    /**
    * Search for similar code snippets
    *
    * Simplified interface for finding similar code without full context assembly
    */
    searchSimilar(query: string, limit?: number, minScore?: number): Promise<RetrievalResult[]>;
    /**
    * Get context for specific files
    *
    * Useful for providing context about specific files the user is working with
    */
    getFileContext(filePaths: string[], maxTokens?: number): Promise<AssembledContext>;
    /**
    * Detect query type from query text
    */
    private detectQueryType;
    /**
    * Optimize options based on query characteristics
    */
    private optimizeOptions;
    /**
    * Get file content helper
    */
    private getFileContent;
    /**
    * Check if service is ready
    */
    isReady(): boolean;
    /**
    * Get statistics about the RAG system
    */
    getStats(): {
        isInitialized: boolean;
        indexedFiles: number;
    };
    /**
    * Query with pattern integration
    */
    private queryWithPatterns;
    /**
    * Query without pattern integration (original implementation)
    */
    private queryWithoutPatterns;
    /**
    * Optimize pattern retrieval
    */
    optimizePatternRetrieval(): Promise<void>;
    /**
    * Get pattern integration status
    */
    hasPatternIntegration(): boolean;
    /**
    * Set up cache invalidation on file changes
    * PERFORMANCE: Automatically invalidates cache when files change
    */
    private setupCacheInvalidation;
    /**
    * Get cache statistics
    */
    getCacheStats(): import("../context/contextCache").CacheStats;
    /**
    * Clear cache
    */
    clearCache(): void;
}
//# sourceMappingURL=ragService.d.ts.map