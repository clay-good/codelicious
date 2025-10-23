/**
 * ML-Based Fix Ranker - Machine learning-powered ranking for fix suggestions
 *
 * Features:
 * - Historical success rate analysis
 * - Code similarity scoring using embeddings
 * - Multi-factor ranking algorithm
 * - Learning from fix outcomes
 * - Confidence calibration
 * - Feature extraction from fixes and errors
 * - Adaptive weighting based on performance
 */
import { EmbeddingManager } from '../embedding/embeddingManager';
import { DetectedError, Language, SuggestedFix } from './errorDetector';
export interface FixHistory {
    errorType: string;
    language: Language;
    fix: SuggestedFix;
    success: boolean;
    timestamp: Date;
    context: string;
}
export interface RankingFeatures {
    historicalSuccessRate: number;
    historicalUsageCount: number;
    recentSuccessRate: number;
    codeSimilarity: number;
    errorSimilarity: number;
    contextSimilarity: number;
    fixComplexity: number;
    fixConfidence: number;
    fixType: 'add' | 'remove' | 'replace' | 'refactor';
    errorSeverity: 'critical' | 'error' | 'warning' | 'info';
    errorType: string;
    language: Language;
    recency: number;
    timeOfDay: number;
    fileSize: number;
    linesOfCode: number;
    hasTests: boolean;
    inProduction: boolean;
}
export interface RankedFix {
    fix: SuggestedFix;
    score: number;
    features: RankingFeatures;
    explanation: string[];
    confidence: number;
}
export interface RankingWeights {
    historicalSuccessRate: number;
    historicalUsageCount: number;
    recentSuccessRate: number;
    codeSimilarity: number;
    errorSimilarity: number;
    contextSimilarity: number;
    fixComplexity: number;
    fixConfidence: number;
    recency: number;
    errorSeverity: number;
}
export interface RankingMetrics {
    totalRankings: number;
    averageAccuracy: number;
    topKAccuracy: {
        k: number;
        accuracy: number;
    }[];
    calibrationError: number;
    featureImportance: Map<string, number>;
}
export declare class MLFixRanker {
    private embeddingManager;
    private fixHistory;
    private rankingHistory;
    private weights;
    private metrics;
    constructor(embeddingManager: EmbeddingManager);
    /**
    * Rank fixes using ML-based scoring
    */
    rankFixes(fixes: SuggestedFix[], error: DetectedError, context: {
        fileContent: string;
        fileSize: number;
        linesOfCode: number;
        hasTests: boolean;
        inProduction: boolean;
    }): Promise<RankedFix[]>;
    /**
    * Extract features for ML ranking
    */
    private extractFeatures;
    /**
    * Calculate ML-based score
    */
    private calculateScore;
    /**
    * Calibrate confidence based on historical performance
    */
    private calibrateConfidence;
    /**
    * Generate human-readable explanation
    */
    private generateExplanation;
    /**
    * Get historical fixes for similar errors
    */
    private getHistoricalFixes;
    /**
    * Calculate success rate from historical fixes
    */
    private calculateSuccessRate;
    /**
    * Calculate code similarity using embeddings
    */
    private calculateCodeSimilarity;
    /**
    * Calculate error similarity with historical errors
    */
    private calculateErrorSimilarity;
    /**
    * Calculate context similarity
    */
    private calculateContextSimilarity;
    /**
    * Calculate fix complexity (0-1, higher = more complex)
    */
    private calculateFixComplexity;
    /**
    * Calculate recency score (0-1, higher = more recent)
    */
    private calculateRecency;
    /**
    * Extract file context (imports, key identifiers)
    */
    private extractFileContext;
    /**
    * Cosine similarity between two embeddings
    */
    private cosineSimilarity;
    /**
    * Text similarity (Jaccard similarity)
    */
    private textSimilarity;
    /**
    * Record fix outcome for learning
    */
    recordFixOutcome(fix: SuggestedFix, error: DetectedError, features: RankingFeatures, predictedScore: number, actualSuccess: boolean): void;
    /**
    * Update ranking metrics
    */
    private updateMetrics;
    /**
    * Calculate feature importance
    */
    private calculateFeatureImportance;
    /**
    * Adapt weights based on performance
    */
    private adaptWeights;
    /**
    * Get current metrics
    */
    getMetrics(): RankingMetrics;
    /**
    * Get current weights
    */
    getWeights(): RankingWeights;
    /**
    * Load fix history (for persistence)
    */
    loadHistory(history: FixHistory[]): void;
    /**
    * Get fix history (for persistence)
    */
    getHistory(): FixHistory[];
}
//# sourceMappingURL=mlFixRanker.d.ts.map