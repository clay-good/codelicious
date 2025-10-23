/**
 * Chunking Optimization
 *
 * Optimizes:
 * - Chunk quality scoring
 * - Deduplication strategies
 * - Optimal overlap calculation
 * - Performance profiling
 */
import { CodeChunk } from './codeChunker';
export interface ChunkQualityMetrics {
    coherence: number;
    completeness: number;
    size: number;
    overlap: number;
    uniqueness: number;
    overall: number;
}
export interface ChunkingOptimizationConfig {
    minChunkSize: number;
    maxChunkSize: number;
    targetChunkSize: number;
    overlapSize: number;
    deduplicationEnabled: boolean;
    qualityThreshold: number;
}
export declare class ChunkingOptimizer {
    private config;
    private chunkHashes;
    private qualityStats;
    constructor(config?: Partial<ChunkingOptimizationConfig>);
    /**
    * Optimize chunks
    */
    optimizeChunks(chunks: CodeChunk[]): CodeChunk[];
    /**
    * Score chunk quality
    */
    private scoreChunkQuality;
    /**
    * Calculate quality metrics
    */
    calculateQualityMetrics(chunk: CodeChunk): ChunkQualityMetrics;
    /**
    * Calculate coherence
    */
    private calculateCoherence;
    /**
    * Check for abrupt transition
    */
    private isAbruptTransition;
    /**
    * Calculate completeness
    */
    private calculateCompleteness;
    /**
    * Calculate size score
    */
    private calculateSizeScore;
    /**
    * Calculate overlap score
    */
    private calculateOverlapScore;
    /**
    * Calculate uniqueness
    */
    private calculateUniqueness;
    /**
    * Deduplicate chunks
    */
    private deduplicateChunks;
    /**
    * Hash chunk for deduplication
    */
    private hashChunk;
    /**
    * Simple hash function
    */
    private simpleHash;
    /**
    * Optimize overlap
    */
    private optimizeOverlap;
    /**
    * Filter low quality chunks
    */
    private filterLowQuality;
    /**
    * Merge small chunks
    */
    private mergeSmallChunks;
    /**
    * Get chunk ID
    */
    private getChunkId;
    /**
    * Get quality statistics
    */
    getQualityStatistics(): {
        averageQuality: number;
        lowQualityCount: number;
        duplicateCount: number;
    };
    /**
    * Profile chunking performance
    */
    profileChunking(chunks: CodeChunk[]): {
        totalChunks: number;
        averageSize: number;
        sizeDistribution: Record<string, number>;
        qualityDistribution: Record<string, number>;
    };
}
//# sourceMappingURL=chunkingOptimizer.d.ts.map