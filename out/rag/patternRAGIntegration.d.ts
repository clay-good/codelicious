/**
 * Pattern RAG Integration - Deep integration of learned patterns into RAG system
 *
 * Features:
 * - Pattern-aware retrieval (prioritize learned patterns)
 * - Pattern-enhanced ranking (boost patterns with high success rates)
 * - Pattern-based context assembly (include relevant patterns)
 * - Pattern quality filtering
 * - Pattern versioning and updates
 * - Pattern-code co-retrieval
 */
import { RAGService, RAGQueryOptions, RAGResponse } from './ragService';
import { PatternLearner, CodePattern, PatternRecommendation } from '../learning/patternLearner';
import { AdvancedPatternRecognizer, StructuralPattern } from '../learning/advancedPatternRecognizer';
import { PatternEmbeddingService } from '../learning/patternEmbeddingService';
import { PatternCacheManager } from '../learning/patternCacheManager';
import { VectorStore } from '../embedding/vectorStore';
import { EmbeddingManager } from '../embedding/embeddingManager';
export interface PatternRAGOptions extends RAGQueryOptions {
    includePatterns?: boolean;
    patternWeight?: number;
    minPatternQuality?: number;
    minPatternSuccessRate?: number;
    maxPatterns?: number;
    patternTypes?: string[];
    patternLanguages?: string[];
    rankBySuccessRate?: boolean;
    rankByUsage?: boolean;
    rankByRecency?: boolean;
}
export interface PatternRAGResponse extends RAGResponse {
    patterns: (CodePattern | StructuralPattern)[];
    patternRecommendations: PatternRecommendation;
    metadata: RAGResponse['metadata'] & {
        patternsUsed: number;
        patternQuality: number;
        patternRelevance: number;
    };
}
export declare class PatternRAGIntegration {
    private ragService;
    private patternLearner;
    private patternRecognizer;
    private patternEmbedding;
    private patternCache;
    private vectorStore;
    private embeddingManager;
    constructor(ragService: RAGService, patternLearner: PatternLearner, patternRecognizer: AdvancedPatternRecognizer, patternEmbedding: PatternEmbeddingService, patternCache: PatternCacheManager, vectorStore: VectorStore, embeddingManager: EmbeddingManager);
    /**
    * Query RAG system with pattern integration
    */
    queryWithPatterns(query: string, options?: PatternRAGOptions): Promise<PatternRAGResponse>;
    /**
    * Add learned patterns to vector store
    */
    indexPatterns(patterns: (CodePattern | StructuralPattern)[]): Promise<void>;
    /**
    * Update pattern in vector store
    */
    updatePattern(pattern: CodePattern | StructuralPattern): Promise<void>;
    /**
    * Remove pattern from vector store
    */
    removePattern(patternId: string): Promise<void>;
    /**
    * Optimize pattern retrieval
    */
    optimizePatternRetrieval(): Promise<void>;
    /**
    * Find relevant patterns for query
    */
    private findRelevantPatterns;
    /**
    * Get pattern recommendations
    */
    private getPatternRecommendations;
    /**
    * Enhance retrieval results with patterns
    */
    private enhanceResultsWithPatterns;
    /**
    * Assemble context with patterns
    */
    private assembleContextWithPatterns;
    /**
    * Rank patterns by various criteria
    */
    private rankPatterns;
    /**
    * Calculate pattern score for ranking
    */
    private calculatePatternScore;
    /**
    * Calculate overall pattern quality
    */
    private calculatePatternQuality;
    /**
    * Calculate pattern relevance to query
    */
    private calculatePatternRelevance;
}
//# sourceMappingURL=patternRAGIntegration.d.ts.map