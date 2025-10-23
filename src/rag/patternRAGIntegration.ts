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
import { RetrievalResult } from './retriever';
import { PatternLearner, CodePattern, PatternRecommendation } from '../learning/patternLearner';
import { AdvancedPatternRecognizer, StructuralPattern } from '../learning/advancedPatternRecognizer';
import { PatternEmbeddingService, SimilarityResult } from '../learning/patternEmbeddingService';
import { PatternCacheManager } from '../learning/patternCacheManager';
import { VectorStore } from '../embedding/vectorStore';
import { EmbeddingManager } from '../embedding/embeddingManager';
import { createLogger } from '../utils/logger';

const logger = createLogger('PatternRAGIntegration');

export interface PatternRAGOptions extends RAGQueryOptions {
 // Pattern-specific options
 includePatterns?: boolean;
 patternWeight?: number; // 0-1, how much to weight patterns vs code
 minPatternQuality?: number; // 0-100
 minPatternSuccessRate?: number; // 0-100
 maxPatterns?: number;

 // Pattern filtering
 patternTypes?: string[];
 patternLanguages?: string[];

 // Pattern ranking
 rankBySuccessRate?: boolean;
 rankByUsage?: boolean;
 rankByRecency?: boolean;
}

export interface PatternRAGResponse extends RAGResponse {
 // Pattern-specific results
 patterns: (CodePattern | StructuralPattern)[];
 patternRecommendations: PatternRecommendation;

 // Enhanced metadata
 metadata: RAGResponse['metadata'] & {
 patternsUsed: number;
 patternQuality: number;
 patternRelevance: number;
 };
}

export class PatternRAGIntegration {
 constructor(
 private ragService: RAGService,
 private patternLearner: PatternLearner,
 private patternRecognizer: AdvancedPatternRecognizer,
 private patternEmbedding: PatternEmbeddingService,
 private patternCache: PatternCacheManager,
 private vectorStore: VectorStore,
 private embeddingManager: EmbeddingManager
 ) {}

 /**
 * Query RAG system with pattern integration
 */
 async queryWithPatterns(
 query: string,
 options: PatternRAGOptions = {}
 ): Promise<PatternRAGResponse> {
 const startTime = Date.now();

 // Step 1: Get base RAG results
 const baseResults = await this.ragService.query(query, options);

 // Step 2: Find relevant patterns
 const patterns = options.includePatterns !== false
 ? await this.findRelevantPatterns(query, options)
 : [];

 // Step 3: Get pattern recommendations
 const language = (options.filters?.language as string) || 'typescript';
 const taskType = options.queryType || 'general';
 const patternRecommendations = await this.getPatternRecommendations(
 query,
 language,
 taskType
 );

 // Step 4: Enhance results with patterns
 const enhancedResults = await this.enhanceResultsWithPatterns(
 baseResults.results,
 patterns,
 options
 );

 // Step 5: Re-assemble context with patterns
 const enhancedContext = this.assembleContextWithPatterns(
 query,
 enhancedResults,
 patterns,
 patternRecommendations,
 options
 );

 // Step 6: Calculate pattern metrics
 const patternQuality = this.calculatePatternQuality(patterns);
 const patternRelevance = this.calculatePatternRelevance(patterns, query);

 const totalTime = Date.now() - startTime;

 return {
 results: enhancedResults,
 assembledContext: enhancedContext,
 patterns,
 patternRecommendations,
 metadata: {
 ...baseResults.metadata,
 patternsUsed: patterns.length,
 patternQuality,
 patternRelevance,
 retrievalTime: baseResults.metadata.retrievalTime,
 assemblyTime: totalTime - baseResults.metadata.retrievalTime
 }
 };
 }

 /**
 * Add learned patterns to vector store
 */
 async indexPatterns(
 patterns: (CodePattern | StructuralPattern)[]
 ): Promise<void> {
 // Generate embeddings for patterns
 const embeddings = await this.patternEmbedding.generateBatchEmbeddings(patterns, {
 includeStructure: true,
 includeSemantic: true,
 cacheResults: true
 });

 // Add to vector store with special metadata
 const vectorStoreEntries = patterns.map(pattern => {
 const embedding = embeddings.get(pattern.id);
 if (!embedding) return null;

 return {
 id: `pattern_${pattern.id}`,
 vector: embedding.combinedEmbedding,
 metadata: {
 type: 'learned_pattern',
 patternId: pattern.id,
 patternName: pattern.name,
 patternType: 'type' in pattern ? pattern.type : 'code_pattern',
 language: pattern.language,
 quality: 'quality' in pattern ? pattern.quality : 0,
 successRate: 'successRate' in pattern ? pattern.successRate : 0,
 usageCount: 'usageCount' in pattern ? pattern.usageCount : 0,
 text: pattern.code
 }
 };
 }).filter((e): e is NonNullable<typeof e> => e !== null);

 // Add to vector store
 await this.vectorStore.addEmbeddings(vectorStoreEntries as any);

 logger.info(`Indexed ${vectorStoreEntries.length} patterns in vector store`);
 }

 /**
 * Update pattern in vector store
 */
 async updatePattern(pattern: CodePattern | StructuralPattern): Promise<void> {
 // Remove old version
 await this.removePattern(pattern.id);

 // Add new version
 await this.indexPatterns([pattern]);
 }

 /**
 * Remove pattern from vector store
 */
 async removePattern(patternId: string): Promise<void> {
 // Remove from cache
 await this.patternCache.invalidate(patternId);

 // Note: ChromaDB doesn't have a direct delete by ID method in the current API
 // In production, you'd implement this based on your vector store capabilities
 logger.info(`Pattern ${patternId} marked for removal`);
 }

 /**
 * Optimize pattern retrieval
 */
 async optimizePatternRetrieval(): Promise<void> {
 // Get all patterns
 const allPatterns = this.patternLearner.getPatterns();

 // Optimize embeddings
 await this.patternEmbedding.optimizeEmbeddings(allPatterns);

 // Optimize cache
 await this.patternCache.optimize();

 logger.info(`Optimized pattern retrieval for ${allPatterns.length} patterns`);
 }

 // ========== Private Methods ==========

 /**
 * Find relevant patterns for query
 */
 private async findRelevantPatterns(
 query: string,
 options: PatternRAGOptions
 ): Promise<(CodePattern | StructuralPattern)[]> {
 const maxPatterns = options.maxPatterns || 5;
 const minQuality = options.minPatternQuality || 70;
 const minSuccessRate = options.minPatternSuccessRate || 70;

 // Try cache first
 const queryEmbedding = await this.embeddingManager.generateEmbedding(query);
 const cachedResults = await this.patternCache.findSimilar(query, queryEmbedding, maxPatterns);

 if (cachedResults.length > 0) {
 return cachedResults.map(r => r.pattern);
 }

 // Search in pattern learner
 const allPatterns = this.patternLearner.getPatterns();

 // Filter by quality and success rate
 const qualifiedPatterns = allPatterns.filter((p: CodePattern | StructuralPattern) => {
 if ('quality' in p && p.quality < minQuality) return false;
 if ('successRate' in p && p.successRate < minSuccessRate) return false;
 if (options.patternLanguages && !options.patternLanguages.includes(p.language)) return false;
 return true;
 });

 // Find similar patterns using embeddings
 const similarPatterns = await this.patternEmbedding.findSimilarPatterns(
 query,
 qualifiedPatterns,
 {
 limit: maxPatterns,
 minSimilarity: 0.7,
 embeddingType: 'combined'
 }
 );

 // Rank patterns
 const rankedPatterns = this.rankPatterns(similarPatterns, options);

 return rankedPatterns.slice(0, maxPatterns).map(r => r.pattern);
 }

 /**
 * Get pattern recommendations
 */
 private async getPatternRecommendations(
 query: string,
 language: string,
 taskType: string
 ): Promise<PatternRecommendation> {
 return await this.patternLearner.getRecommendations(query, language, taskType);
 }

 /**
 * Enhance retrieval results with patterns
 */
 private async enhanceResultsWithPatterns(
 results: RetrievalResult[],
 patterns: (CodePattern | StructuralPattern)[],
 options: PatternRAGOptions
 ): Promise<RetrievalResult[]> {
 const patternWeight = options.patternWeight || 0.3;

 // Convert patterns to retrieval results
 const patternResults: RetrievalResult[] = patterns.map(pattern => ({
 content: pattern.code,
 score: this.calculatePatternScore(pattern) * patternWeight,
 source: 'learned_pattern',
 metadata: {
 filePath: `pattern:${pattern.id}`,
 symbolName: pattern.name,
 language: pattern.language
 }
 }));

 // Merge with code results
 const merged = [...results, ...patternResults];

 // Re-rank combined results
 return merged.sort((a, b) => b.score - a.score);
 }

 /**
 * Assemble context with patterns
 */
 private assembleContextWithPatterns(
 query: string,
 results: RetrievalResult[],
 patterns: (CodePattern | StructuralPattern)[],
 recommendations: PatternRecommendation,
 options: PatternRAGOptions
 ): any { // Returns AssembledContext structure
 // Start with base context
 let context = `# Code Context for: ${query}\n\n`;

 // Add pattern recommendations
 if (recommendations.patterns.length > 0) {
 context += `## Recommended Patterns (${recommendations.confidence.toFixed(0)}% confidence)\n\n`;
 context += recommendations.reasoning + '\n\n';

 recommendations.patterns.slice(0, 3).forEach((match, i) => {
 context += `### Pattern ${i + 1}: ${match.pattern.name}\n`;
 context += `**Success Rate**: ${match.pattern.successRate.toFixed(0)}%\n`;
 context += `**Relevance**: ${match.relevance.toFixed(2)}\n`;
 context += `**Description**: ${match.pattern.description}\n\n`;
 context += `\`\`\`${match.pattern.language}\n${match.pattern.code.substring(0, 300)}...\n\`\`\`\n\n`;
 });
 }

 // Add retrieved code
 context += `## Retrieved Code\n\n`;
 results.slice(0, 5).forEach((result, i) => {
 context += `### Result ${i + 1} (score: ${result.score.toFixed(2)})\n`;
 if (result.source === 'learned_pattern') {
 context += `**Source**: Learned Pattern - ${result.metadata.symbolName}\n`;
 } else {
 context += `**Source**: ${result.source || 'codebase'}\n`;
 }
 context += `\n\`\`\`\n${result.content.substring(0, 500)}...\n\`\`\`\n\n`;
 });

 return {
 text: context,
 tokens: Math.ceil(context.length / 4), // Rough estimate
 sources: results.map(r => r.source || 'unknown'),
 patterns: patterns.map(p => p.id)
 };
 }

 /**
 * Rank patterns by various criteria
 */
 private rankPatterns(
 patterns: SimilarityResult[],
 options: PatternRAGOptions
 ): SimilarityResult[] {
 return patterns.sort((a, b) => {
 let scoreA = a.similarity;
 let scoreB = b.similarity;

 // Boost by success rate
 if (options.rankBySuccessRate && 'successRate' in a.pattern && 'successRate' in b.pattern) {
 scoreA *= (1 + a.pattern.successRate / 200); // 0-50% boost
 scoreB *= (1 + b.pattern.successRate / 200);
 }

 // Boost by usage
 if (options.rankByUsage && 'usageCount' in a.pattern && 'usageCount' in b.pattern) {
 scoreA *= (1 + Math.min(a.pattern.usageCount, 20) / 40); // 0-50% boost
 scoreB *= (1 + Math.min(b.pattern.usageCount, 20) / 40);
 }

 return scoreB - scoreA;
 });
 }

 /**
 * Calculate pattern score for ranking
 */
 private calculatePatternScore(pattern: CodePattern | StructuralPattern): number {
 let score = 0.8; // Base score

 // Boost by success rate
 if ('successRate' in pattern) {
 score += (pattern.successRate / 100) * 0.2;
 }

 // Boost by usage
 if ('usageCount' in pattern) {
 score += Math.min(pattern.usageCount / 50, 0.2);
 }

 // Boost by quality
 if ('quality' in pattern) {
 score += (pattern.quality / 100) * 0.1;
 }

 return Math.min(1, score);
 }

 /**
 * Calculate overall pattern quality
 */
 private calculatePatternQuality(patterns: (CodePattern | StructuralPattern)[]): number {
 if (patterns.length === 0) return 0;

 const totalQuality = patterns.reduce((sum, p) => {
 return sum + ('quality' in p ? p.quality : 70);
 }, 0);

 return totalQuality / patterns.length;
 }

 /**
 * Calculate pattern relevance to query
 */
 private calculatePatternRelevance(
 patterns: (CodePattern | StructuralPattern)[],
 query: string
 ): number {
 if (patterns.length === 0) return 0;

 // Simple keyword-based relevance (would use embeddings in production)
 const queryTokens = new Set(query.toLowerCase().split(/\W+/));

 const totalRelevance = patterns.reduce((sum, p) => {
 const patternTokens = new Set([
 ...p.name.toLowerCase().split(/\W+/),
 ...p.description.toLowerCase().split(/\W+/)
 ]);

 const intersection = new Set([...queryTokens].filter(t => patternTokens.has(t)));
 const relevance = intersection.size / queryTokens.size;

 return sum + relevance;
 }, 0);

 return totalRelevance / patterns.length;
 }
}

