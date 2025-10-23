/**
 * Pattern Learner
 *
 * Extracts, stores, and retrieves successful code patterns from user feedback.
 * Uses these patterns to improve future code generation through RAG integration.
 */
import * as vscode from 'vscode';
import { FeedbackManager } from './feedbackManager';
import { EmbeddingManager } from '../embedding/embeddingManager';
import { VectorStore } from '../embedding/vectorStore';
export interface CodePattern {
    id: string;
    name: string;
    description: string;
    language: string;
    taskType: string;
    code: string;
    codeHash: string;
    embedding: number[];
    successRate: number;
    usageCount: number;
    averageQualityScore: number;
    lastUsed: number;
    tags: string[];
    relatedPrompts: string[];
    examples: PatternExample[];
    confidence: number;
    impact: 'high' | 'medium' | 'low';
    createdAt: number;
    updatedAt: number;
}
export interface PatternExample {
    prompt: string;
    code: string;
    qualityScore: number;
    timestamp: number;
}
export interface PatternMatch {
    pattern: CodePattern;
    similarity: number;
    relevance: number;
}
export interface PatternRecommendation {
    patterns: PatternMatch[];
    confidence: number;
    reasoning: string;
}
export declare class PatternLearner {
    private context;
    private feedbackManager;
    private embeddingManager?;
    private vectorStore?;
    private patterns;
    private readonly STORAGE_KEY;
    private readonly MIN_SUCCESS_RATE;
    private readonly MIN_USAGE_COUNT;
    private readonly SIMILARITY_THRESHOLD;
    constructor(context: vscode.ExtensionContext, feedbackManager: FeedbackManager, embeddingManager?: EmbeddingManager | undefined, vectorStore?: VectorStore | undefined);
    /**
    * Learn patterns from recent feedback
    */
    learnFromFeedback(options?: {
        language?: string;
        taskType?: string;
        days?: number;
    }): Promise<number>;
    /**
    * Find patterns similar to a prompt
    */
    findSimilarPatterns(prompt: string, language: string, taskType: string, limit?: number): Promise<PatternMatch[]>;
    /**
    * Get pattern recommendations for a prompt
    */
    getRecommendations(prompt: string, language: string, taskType: string): Promise<PatternRecommendation>;
    /**
    * Update pattern metrics after usage
    */
    updatePatternMetrics(patternId: string, success: boolean, qualityScore: number): Promise<void>;
    /**
    * Get all patterns
    */
    getPatterns(filter?: {
        language?: string;
        taskType?: string;
        minSuccessRate?: number;
    }): CodePattern[];
    /**
    * Get pattern statistics
    */
    getStatistics(): {
        totalPatterns: number;
        byLanguage: Record<string, number>;
        byTaskType: Record<string, number>;
        averageSuccessRate: number;
        highImpactPatterns: number;
    };
    /**
    * Export patterns for RAG integration
    */
    exportForRAG(): Promise<Array<{
        id: string;
        content: string;
        metadata: unknown;
    }>>;
    private createPatternFromInsight;
    private addPattern;
    private calculateRelevance;
    private generateRecommendationReasoning;
    private findPatternsByKeywords;
    private cosineSimilarity;
    private generateId;
    private hashContent;
    private loadPatterns;
    private savePatterns;
}
//# sourceMappingURL=patternLearner.d.ts.map