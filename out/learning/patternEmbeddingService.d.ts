/**
 * Pattern Embedding Service - Specialized embedding service for code patterns
 *
 * Features:
 * - Multi-level embeddings (code, structure, semantics)
 * - Pattern-specific embedding optimization
 * - Embedding caching and reuse
 * - Similarity search optimization
 * - Batch embedding generation
 * - Embedding quality assessment
 */
import { EmbeddingManager } from '../embedding/embeddingManager';
import { CodePattern } from './patternLearner';
import { StructuralPattern } from './advancedPatternRecognizer';
import { PatternCacheManager } from './patternCacheManager';
export interface MultiLevelEmbedding {
    codeEmbedding: number[];
    structureEmbedding?: number[];
    semanticEmbedding?: number[];
    combinedEmbedding: number[];
    quality: number;
    dimensions: number;
    model: string;
}
export interface EmbeddingOptions {
    includeStructure?: boolean;
    includeSemantic?: boolean;
    cacheResults?: boolean;
    batchSize?: number;
}
export interface SimilarityResult {
    pattern: CodePattern | StructuralPattern;
    similarity: number;
    embeddingType: 'code' | 'structure' | 'semantic' | 'combined';
}
export declare class PatternEmbeddingService {
    private embeddingManager;
    private cacheManager?;
    private embeddingCache;
    constructor(embeddingManager: EmbeddingManager, cacheManager?: PatternCacheManager | undefined);
    /**
    * Generate multi-level embeddings for a pattern
    */
    generatePatternEmbedding(pattern: CodePattern | StructuralPattern, options?: EmbeddingOptions): Promise<MultiLevelEmbedding>;
    /**
    * Generate embeddings for multiple patterns in batch
    */
    generateBatchEmbeddings(patterns: (CodePattern | StructuralPattern)[], options?: EmbeddingOptions): Promise<Map<string, MultiLevelEmbedding>>;
    /**
    * Find similar patterns using embeddings
    */
    findSimilarPatterns(query: string | (CodePattern | StructuralPattern), patterns: (CodePattern | StructuralPattern)[], options?: {
        limit?: number;
        minSimilarity?: number;
        embeddingType?: 'code' | 'structure' | 'semantic' | 'combined';
    }): Promise<SimilarityResult[]>;
    /**
    * Optimize embeddings for pattern matching
    */
    optimizeEmbeddings(patterns: (CodePattern | StructuralPattern)[]): Promise<void>;
    /**
    * Clear embedding cache
    */
    clearCache(): void;
    /**
    * Get cache statistics
    */
    getCacheStats(): {
        size: number;
        hitRate: number;
    };
    /**
    * Serialize structural information for embedding
    */
    private serializeStructure;
    /**
    * Extract semantic meaning from pattern
    */
    private extractSemanticMeaning;
    /**
    * Combine multiple embeddings into one
    */
    private combineEmbeddings;
    /**
    * Select appropriate embedding based on type
    */
    private selectEmbedding;
    /**
    * Calculate cosine similarity between two embeddings
    */
    private cosineSimilarity;
    /**
    * Assess embedding quality
    */
    private assessEmbeddingQuality;
}
//# sourceMappingURL=patternEmbeddingService.d.ts.map