/**
 * Adaptive Chunk Sizing
 *
 * Dynamically adjusts chunk sizes based on:
 * - Code complexity
 * - Semantic coherence
 * - Context requirements
 * - Language characteristics
 * - Historical performance
 */
import { CodeChunk } from './codeChunker';
import { ASTAnalysisResult } from './astAnalyzer';
export interface ChunkSizingStrategy {
    minSize: number;
    maxSize: number;
    targetSize: number;
    adaptToComplexity: boolean;
    adaptToLanguage: boolean;
    adaptToContext: boolean;
    preserveSemanticBoundaries: boolean;
}
export interface ChunkSizingMetrics {
    averageSize: number;
    minSize: number;
    maxSize: number;
    complexityDistribution: Map<string, number>;
    languageDistribution: Map<string, number>;
    performanceScore: number;
}
export interface AdaptiveChunkResult {
    chunks: CodeChunk[];
    metrics: ChunkSizingMetrics;
    adjustments: ChunkAdjustment[];
}
export interface ChunkAdjustment {
    reason: string;
    originalSize: number;
    adjustedSize: number;
    impact: 'increased' | 'decreased' | 'split' | 'merged';
}
export declare class AdaptiveChunkSizing {
    private strategy;
    private performanceHistory;
    private languageProfiles;
    constructor(strategy?: Partial<ChunkSizingStrategy>);
    /**
    * Adaptively chunk code
    */
    adaptiveChunk(code: string, filePath: string, language: string, astAnalysis?: ASTAnalysisResult): Promise<AdaptiveChunkResult>;
    /**
    * Create chunks with adaptive sizing
    */
    private createChunks;
    /**
    * Create a code chunk
    */
    private createChunk;
    /**
    * Check if line is a semantic boundary
    */
    private isSemanticBoundary;
    /**
    * Calculate code complexity
    */
    private calculateComplexity;
    /**
    * Calculate maximum nesting level
    */
    private calculateMaxNesting;
    /**
    * Adjust chunk size based on complexity
    */
    private adjustForComplexity;
    /**
    * Calculate metrics
    */
    private calculateMetrics;
    /**
    * Get default language profile
    */
    private getDefaultProfile;
    /**
    * Initialize language profiles
    */
    private initializeLanguageProfiles;
}
//# sourceMappingURL=adaptiveChunkSizing.d.ts.map