/**
 * AI-Powered Fix Generator
 *
 * Features:
 * - Context-aware fix generation
 * - Multi-step fix planning
 * - Learning from past fixes
 * - Multi-language support
 * - Confidence scoring
 * - Fix validation
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { DetectedError, SuggestedFix, Language } from './errorDetector';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { EmbeddingManager } from '../embedding/embeddingManager';
export interface FixGenerationOptions {
    maxFixes?: number;
    minConfidence?: number;
    includeExplanation?: boolean;
    considerHistory?: boolean;
    multiStep?: boolean;
    validateFixes?: boolean;
    useMLRanking?: boolean;
}
export interface GeneratedFix {
    error: DetectedError;
    fixes: SuggestedFix[];
    reasoning: string;
    confidence: number;
    estimatedImpact: 'low' | 'medium' | 'high';
    requiresManualReview: boolean;
}
export interface FixHistory {
    errorType: string;
    language: Language;
    fix: SuggestedFix;
    success: boolean;
    timestamp: Date;
    context: string;
}
export declare class AIFixGenerator {
    private orchestrator;
    private fixHistory;
    private fixPatterns;
    private mlRanker;
    constructor(orchestrator: ModelOrchestrator, embeddingManager?: EmbeddingManager);
    /**
    * Generate fixes for errors using AI
    */
    generateFixes(errors: DetectedError[], files: GeneratedCode[], options?: FixGenerationOptions): Promise<GeneratedFix[]>;
    /**
    * Generate AI-powered fixes
    */
    private generateAIFixes;
    /**
    * Build context-aware prompt for fix generation
    */
    private buildFixPrompt;
    /**
    * Get system prompt for specific language
    */
    private getSystemPrompt;
    /**
    * Parse AI response into structured fixes
    */
    private parseAIResponse;
    /**
    * Get pattern-based fixes
    */
    private getPatternFixes;
    /**
    * Get historical fixes for similar errors
    */
    private getHistoricalFixes;
    /**
    * Rank fixes by confidence and relevance
    */
    private rankFixes;
    /**
    * Validate fixes
    */
    private validateFixes;
    /**
    * Generate reasoning for fixes
    */
    private generateReasoning;
    /**
    * Calculate overall confidence
    */
    private calculateOverallConfidence;
    /**
    * Estimate impact of fixes
    */
    private estimateImpact;
    /**
    * Determine if manual review is required
    */
    private requiresManualReview;
    /**
    * Extract context lines around error
    */
    private extractContextLines;
    /**
    * Initialize common fix patterns
    */
    private initializeFixPatterns;
    /**
    * Get file context for ML ranking
    */
    private getFileContext;
    /**
    * Record fix success/failure for learning
    */
    recordFixResult(error: DetectedError, fix: SuggestedFix, success: boolean, context: string): void;
    /**
    * Get ML ranking metrics
    */
    getMLMetrics(): import("./mlFixRanker").RankingMetrics | undefined;
    /**
    * Get ML ranking weights
    */
    getMLWeights(): import("./mlFixRanker").RankingWeights | undefined;
}
//# sourceMappingURL=aiFixGenerator.d.ts.map