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
 // Code-level embedding (raw code)
 codeEmbedding: number[];

 // Structure-level embedding (AST structure)
 structureEmbedding?: number[];

 // Semantic-level embedding (meaning/intent)
 semanticEmbedding?: number[];

 // Combined embedding (weighted average)
 combinedEmbedding: number[];

 // Metadata
 quality: number; // 0-1
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

export class PatternEmbeddingService {
 private embeddingCache: Map<string, MultiLevelEmbedding> = new Map();

 constructor(
 private embeddingManager: EmbeddingManager,
 private cacheManager?: PatternCacheManager
 ) {}

 /**
 * Generate multi-level embeddings for a pattern
 */
 async generatePatternEmbedding(
 pattern: CodePattern | StructuralPattern,
 options: EmbeddingOptions = {}
 ): Promise<MultiLevelEmbedding> {
 const patternId = pattern.id;

 // Check cache first
 if (options.cacheResults && this.embeddingCache.has(patternId)) {
 return this.embeddingCache.get(patternId)!;
 }

 // Generate code-level embedding
 const codeEmbedding = await this.embeddingManager.generateEmbedding(pattern.code);

 // Generate structure-level embedding (if requested)
 let structureEmbedding: number[] | undefined;
 if (options.includeStructure && 'structure' in pattern) {
 const structureText = this.serializeStructure(pattern);
 structureEmbedding = await this.embeddingManager.generateEmbedding(structureText);
 }

 // Generate semantic-level embedding (if requested)
 let semanticEmbedding: number[] | undefined;
 if (options.includeSemantic) {
 const semanticText = this.extractSemanticMeaning(pattern);
 semanticEmbedding = await this.embeddingManager.generateEmbedding(semanticText);
 }

 // Combine embeddings (weighted average)
 const combinedEmbedding = this.combineEmbeddings(
 codeEmbedding,
 structureEmbedding,
 semanticEmbedding
 );

 // Assess quality
 const quality = this.assessEmbeddingQuality(pattern, codeEmbedding);

 const multiLevel: MultiLevelEmbedding = {
 codeEmbedding,
 structureEmbedding,
 semanticEmbedding,
 combinedEmbedding,
 quality,
 dimensions: codeEmbedding.length,
 model: 'default'
 };

 // Cache result
 if (options.cacheResults) {
 this.embeddingCache.set(patternId, multiLevel);

 // Also cache in pattern cache manager
 if (this.cacheManager) {
 await this.cacheManager.set(patternId, pattern, combinedEmbedding);
 }
 }

 return multiLevel;
 }

 /**
 * Generate embeddings for multiple patterns in batch
 */
 async generateBatchEmbeddings(
 patterns: (CodePattern | StructuralPattern)[],
 options: EmbeddingOptions = {}
 ): Promise<Map<string, MultiLevelEmbedding>> {
 const batchSize = options.batchSize || 32;
 const results = new Map<string, MultiLevelEmbedding>();

 // Process in batches
 for (let i = 0; i < patterns.length; i += batchSize) {
 const batch = patterns.slice(i, i + batchSize);

 // Generate embeddings for batch
 const batchPromises = batch.map(pattern =>
 this.generatePatternEmbedding(pattern, options)
 );

 const batchResults = await Promise.all(batchPromises);

 // Store results
 batch.forEach((pattern, idx) => {
 results.set(pattern.id, batchResults[idx]);
 });
 }

 return results;
 }

 /**
 * Find similar patterns using embeddings
 */
 async findSimilarPatterns(
 query: string | (CodePattern | StructuralPattern),
 patterns: (CodePattern | StructuralPattern)[],
 options: {
 limit?: number;
 minSimilarity?: number;
 embeddingType?: 'code' | 'structure' | 'semantic' | 'combined';
 } = {}
 ): Promise<SimilarityResult[]> {
 const limit = options.limit || 10;
 const minSimilarity = options.minSimilarity || 0.7;
 const embeddingType = options.embeddingType || 'combined';

 // Generate query embedding
 let queryEmbedding: number[];
 if (typeof query === 'string') {
 queryEmbedding = await this.embeddingManager.generateEmbedding(query);
 } else {
 const multiLevel = await this.generatePatternEmbedding(query, { cacheResults: true });
 queryEmbedding = this.selectEmbedding(multiLevel, embeddingType);
 }

 // Calculate similarities
 const similarities: SimilarityResult[] = [];

 for (const pattern of patterns) {
 const multiLevel = await this.generatePatternEmbedding(pattern, { cacheResults: true });
 const patternEmbedding = this.selectEmbedding(multiLevel, embeddingType);

 const similarity = this.cosineSimilarity(queryEmbedding, patternEmbedding);

 if (similarity >= minSimilarity) {
 similarities.push({
 pattern,
 similarity,
 embeddingType
 });
 }
 }

 // Sort by similarity and limit
 return similarities
 .sort((a, b) => b.similarity - a.similarity)
 .slice(0, limit);
 }

 /**
 * Optimize embeddings for pattern matching
 */
 async optimizeEmbeddings(
 patterns: (CodePattern | StructuralPattern)[]
 ): Promise<void> {
 // Pre-generate embeddings for all patterns
 await this.generateBatchEmbeddings(patterns, {
 includeStructure: true,
 includeSemantic: true,
 cacheResults: true,
 batchSize: 32
 });

 // Warm cache with frequently used patterns
 if (this.cacheManager) {
 const frequentPatterns = patterns
 .filter(p => 'usageCount' in p && p.usageCount > 5)
 .map(p => p.id);

 await this.cacheManager.warmCache(frequentPatterns);
 }
 }

 /**
 * Clear embedding cache
 */
 clearCache(): void {
 this.embeddingCache.clear();
 }

 /**
 * Get cache statistics
 */
 getCacheStats(): {
 size: number;
 hitRate: number;
 } {
 return {
 size: this.embeddingCache.size,
 hitRate: 0 // Would track hits/misses in production
 };
 }

 // ========== Private Methods ==========

 /**
 * Serialize structural information for embedding
 */
 private serializeStructure(pattern: StructuralPattern): string {
 if (!('structure' in pattern)) return '';

 const parts: string[] = [];

 if (pattern.structure.kind) {
 parts.push(`kind: ${pattern.structure.kind}`);
 }

 if (pattern.structure.signature) {
 parts.push(`signature: ${pattern.structure.signature}`);
 }

 if (pattern.structure.hierarchy) {
 parts.push(`hierarchy: ${pattern.structure.hierarchy.join(' -> ')}`);
 }

 if (pattern.structure.dependencies) {
 parts.push(`dependencies: ${pattern.structure.dependencies.join(', ')}`);
 }

 if (pattern.structure.complexity) {
 parts.push(`complexity: ${pattern.structure.complexity}`);
 }

 return parts.join('\n');
 }

 /**
 * Extract semantic meaning from pattern
 */
 private extractSemanticMeaning(pattern: CodePattern | StructuralPattern): string {
 const parts: string[] = [];

 // Add name and description
 parts.push(pattern.name);
 parts.push(pattern.description);

 // Add task type and language
 if ('taskType' in pattern) {
 parts.push(`task: ${pattern.taskType}`);
 }
 parts.push(`language: ${pattern.language}`);

 // Add quality indicators
 if ('successRate' in pattern) {
 parts.push(`success rate: ${pattern.successRate}%`);
 }
 if ('quality' in pattern) {
 parts.push(`quality: ${pattern.quality}`);
 }

 // Add structural information
 if ('structure' in pattern && pattern.structure.signature) {
 parts.push(`signature: ${pattern.structure.signature}`);
 }

 return parts.join('\n');
 }

 /**
 * Combine multiple embeddings into one
 */
 private combineEmbeddings(
 codeEmbedding: number[],
 structureEmbedding?: number[],
 semanticEmbedding?: number[]
 ): number[] {
 // Weights for different embedding types
 const weights = {
 code: 0.5,
 structure: 0.3,
 semantic: 0.2
 };

 // Start with code embedding
 const combined = codeEmbedding.map(v => v * weights.code);

 // Add structure embedding if available
 if (structureEmbedding) {
 for (let i = 0; i < combined.length; i++) {
 combined[i] += structureEmbedding[i] * weights.structure;
 }
 }

 // Add semantic embedding if available
 if (semanticEmbedding) {
 for (let i = 0; i < combined.length; i++) {
 combined[i] += semanticEmbedding[i] * weights.semantic;
 }
 }

 // Normalize
 const norm = Math.sqrt(combined.reduce((sum, v) => sum + v * v, 0));
 return combined.map(v => v / norm);
 }

 /**
 * Select appropriate embedding based on type
 */
 private selectEmbedding(multiLevel: MultiLevelEmbedding, type: string): number[] {
 switch (type) {
 case 'code':
 return multiLevel.codeEmbedding;
 case 'structure':
 return multiLevel.structureEmbedding || multiLevel.codeEmbedding;
 case 'semantic':
 return multiLevel.semanticEmbedding || multiLevel.codeEmbedding;
 case 'combined':
 default:
 return multiLevel.combinedEmbedding;
 }
 }

 /**
 * Calculate cosine similarity between two embeddings
 */
 private cosineSimilarity(a: number[], b: number[]): number {
 if (a.length !== b.length) return 0;

 let dotProduct = 0;
 let normA = 0;
 let normB = 0;

 for (let i = 0; i < a.length; i++) {
 dotProduct += a[i] * b[i];
 normA += a[i] * a[i];
 normB += b[i] * b[i];
 }

 const denominator = Math.sqrt(normA) * Math.sqrt(normB);
 return denominator === 0 ? 0 : dotProduct / denominator;
 }

 /**
 * Assess embedding quality
 */
 private assessEmbeddingQuality(
 pattern: CodePattern | StructuralPattern,
 embedding: number[]
 ): number {
 let quality = 0.8;

 // Check embedding dimensions
 if (embedding.length < 384) {
 quality -= 0.2;
 }

 // Check pattern quality
 if ('quality' in pattern && pattern.quality < 70) {
 quality -= 0.1;
 }

 // Check pattern usage
 if ('usageCount' in pattern && pattern.usageCount > 10) {
 quality += 0.1;
 }

 return Math.min(1, Math.max(0, quality));
 }
}

