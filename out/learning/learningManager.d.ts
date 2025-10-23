/**
 * Learning Manager
 *
 * Orchestrates the self-learning system by coordinating:
 * - Feedback collection
 * - Pattern learning
 * - Quality tracking
 * - Continuous improvement
 * - RAG integration
 */
import * as vscode from 'vscode';
import { TestResults } from './feedbackManager';
import { PatternRecommendation } from './patternLearner';
import { AdvancedPatternRecognizer } from './advancedPatternRecognizer';
import { PatternCacheManager } from './patternCacheManager';
import { PatternEmbeddingService } from './patternEmbeddingService';
import { AnalyticsManager } from '../analytics/analyticsManager';
import { EmbeddingManager } from '../embedding/embeddingManager';
import { VectorStore } from '../embedding/vectorStore';
export interface LearningConfig {
    enabled: boolean;
    autoLearn: boolean;
    learningInterval: number;
    minFeedbackForLearning: number;
    usePatterns: boolean;
    sharePatterns: boolean;
}
export interface LearningStats {
    totalFeedback: number;
    totalPatterns: number;
    approvalRate: number;
    averageQualityScore: number;
    improvementRate: number;
    lastLearningRun: number;
    patternsUsedToday: number;
}
export interface CodeGenerationContext {
    prompt: string;
    language: string;
    taskType: string;
    conversationHistory?: Array<{
        role: string;
        content: string;
    }>;
    codebaseContext?: string;
}
export interface EnhancedContext extends CodeGenerationContext {
    recommendedPatterns: PatternRecommendation;
    learningGuidance: string;
    qualityExpectations: string;
}
export declare class LearningManager {
    private context;
    private analyticsManager?;
    private embeddingManager?;
    private vectorStore?;
    private feedbackManager;
    private patternLearner;
    private advancedRecognizer?;
    private patternCache?;
    private patternEmbedding?;
    private learningTimer?;
    private config;
    private usedPatterns;
    constructor(context: vscode.ExtensionContext, analyticsManager?: AnalyticsManager | undefined, embeddingManager?: EmbeddingManager | undefined, vectorStore?: VectorStore | undefined);
    /**
    * Initialize advanced pattern recognition components
    */
    private initializeAdvancedComponents;
    /**
    * Optimize embeddings for existing patterns (background task)
    */
    private optimizeExistingPatterns;
    /**
    * Enhance code generation context with learned patterns
    */
    enhanceContext(context: CodeGenerationContext): Promise<EnhancedContext>;
    /**
    * Record approval of generated code
    */
    recordApproval(context: CodeGenerationContext, generatedCode: string, timeToApproval: number, iterationCount?: number, usedPatternIds?: string[]): Promise<void>;
    /**
    * Record rejection of generated code
    */
    recordRejection(context: CodeGenerationContext, generatedCode: string, reason?: string, usedPatternIds?: string[]): Promise<void>;
    /**
    * Record modification of generated code
    */
    recordModification(context: CodeGenerationContext, generatedCode: string, modifiedCode: string, usedPatternIds?: string[]): Promise<void>;
    /**
    * Record test results
    */
    recordTestResults(context: CodeGenerationContext, generatedCode: string, testResults: TestResults, usedPatternIds?: string[]): Promise<void>;
    /**
    * Get learning statistics
    */
    getStats(): LearningStats;
    /**
    * Manually trigger learning
    */
    learn(options?: {
        language?: string;
        taskType?: string;
    }): Promise<number>;
    /**
    * Export learned patterns for RAG
    */
    exportPatternsForRAG(): Promise<Array<{
        id: string;
        content: string;
        metadata: unknown;
    }>>;
    /**
    * Get configuration
    */
    getConfig(): LearningConfig;
    /**
    * Update configuration
    */
    updateConfig(config: Partial<LearningConfig>): Promise<void>;
    /**
    * Get advanced pattern recognizer
    */
    getAdvancedRecognizer(): AdvancedPatternRecognizer | undefined;
    /**
    * Get pattern cache manager
    */
    getPatternCache(): PatternCacheManager | undefined;
    /**
    * Get pattern embedding service
    */
    getPatternEmbedding(): PatternEmbeddingService | undefined;
    /**
    * Extract structural patterns from code using AST
    */
    extractStructuralPatterns(code: string, filePath: string, options?: {
        minComplexity?: number;
        maxComplexity?: number;
        detectDesignPatterns?: boolean;
    }): Promise<any[]>;
    /**
    * Find similar patterns using cache
    */
    findSimilarPatterns(query: string, limit?: number): Promise<any[]>;
    /**
    * Get cache statistics
    */
    getCacheStats(): unknown;
    /**
    * Optimize pattern cache
    */
    optimizeCache(): Promise<void>;
    /**
    * Dispose resources
    */
    dispose(): void;
    private generateLearningGuidance;
    private generateQualityExpectations;
    private detectModifications;
    private checkAndLearn;
    private startAutoLearning;
    private stopAutoLearning;
    private loadConfig;
    private saveConfig;
}
//# sourceMappingURL=learningManager.d.ts.map