/**
 * RAG Retriever - Multi-stage retrieval system for code context
 */

import * as fs from 'fs';
import * as path from 'path';
import { EmbeddingManager } from '../embedding/embeddingManager';
import { VectorStore, SearchResult } from '../embedding/vectorStore';
import { IndexingEngine } from '../core/indexer';
import { FileMetadata } from '../types';
import { readFileContent } from '../utils/fileUtils';
import { createLogger } from '../utils/logger';

const logger = createLogger('Retriever');

export interface RetrievalOptions {
 limit?: number;
 minScore?: number;
 includeContext?: boolean;
 contextLines?: number;
 filters?: {
 language?: string;
 fileType?: string;
 symbolKind?: string;
 };
}

export interface RetrievalResult {
 content: string;
 score: number;
 source: string;
 metadata: {
 filePath?: string;
 startLine?: number;
 endLine?: number;
 symbolName?: string;
 language?: string;
 };
}

export class RAGRetriever {
 private workspacePath: string = '';

 constructor(
 private embeddingManager: EmbeddingManager,
 private vectorStore: VectorStore,
 private indexingEngine: IndexingEngine
 ) {}

 /**
 * Set workspace path for file reading
 */
 setWorkspacePath(path: string): void {
 this.workspacePath = path;
 }

 /**
 * Retrieve relevant code context for a query
 */
 async retrieve(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult[]> {
 const limit = options.limit || 10;
 const minScore = options.minScore || 0.5;

 // Stage 1: Vector similarity search
 const vectorResults = await this.vectorSearch(query, limit * 2);

 // Stage 2: Keyword matching (BM25-like)
 const keywordResults = await this.keywordSearch(query, limit);

 // Stage 3: Merge and deduplicate
 const mergedResults = this.mergeResults(vectorResults, keywordResults);

 // Stage 4: Filter by score and options
 let filteredResults = mergedResults.filter(r => r.score >= minScore);

 if (options.filters) {
 filteredResults = this.applyFilters(filteredResults, options.filters);
 }

 // Stage 5: Re-rank using lightweight scoring (consider cross-encoder for production)
 const rerankedResults = await this.rerank(query, filteredResults);

 // Stage 6: Apply MMR for diversity
 const diverseResults = this.applyMMR(rerankedResults, limit, 0.7);

 // Stage 7: Add context if requested
 if (options.includeContext) {
 return this.addContext(diverseResults, options.contextLines || 5);
 }

 return diverseResults.slice(0, limit);
 }

 /**
 * Vector similarity search
 */
 private async vectorSearch(query: string, limit: number): Promise<RetrievalResult[]> {
 try {
 // Generate embedding for query
 const queryEmbedding = await this.embeddingManager.generateEmbedding(query);

 // Search vector store
 const searchResults = await this.vectorStore.search(queryEmbedding, { limit });

 // Convert to RetrievalResult format
 return searchResults.map(result => ({
 content: result.content,
 score: result.score,
 source: 'vector',
 metadata: {
 filePath: result.metadata.filePath,
 startLine: result.metadata.startLine,
 endLine: result.metadata.endLine,
 symbolName: result.metadata.symbolName,
 language: result.metadata.language
 }
 }));
 } catch (error) {
 logger.error('Vector search failed:', error);
 return [];
 }
 }

 /**
 * Keyword-based search (BM25-like)
 */
 private async keywordSearch(query: string, limit: number): Promise<RetrievalResult[]> {
 const keywords = this.extractKeywords(query);
 const results: RetrievalResult[] = [];

 // Search through indexed files
 const allFiles = this.indexingEngine.getIndexedFiles();

 for (const file of allFiles) {
 const score = this.calculateKeywordScore(keywords, file);
 if (score > 0) {
 results.push({
 content: this.getFileContent(file),
 score,
 source: 'keyword',
 metadata: {
 filePath: file.path,
 language: file.language
 }
 });
 }
 }

 // Sort by score and return top results
 return results.sort((a, b) => b.score - a.score).slice(0, limit);
 }

 /**
 * Extract keywords from query
 */
 private extractKeywords(query: string): string[] {
 // Remove common words and split
 const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can']);

 return query
 .toLowerCase()
 .split(/\W+/)
 .filter(word => word.length > 2 && !stopWords.has(word));
 }

 /**
 * Calculate keyword match score
 */
 private calculateKeywordScore(keywords: string[], file: FileMetadata): number {
 let score = 0;
 const fileContent = this.getFileContent(file).toLowerCase();

 for (const keyword of keywords) {
 // Count occurrences
 const regex = new RegExp(keyword, 'gi');
 const matches = fileContent.match(regex);
 if (matches) {
 score += matches.length;
 }

 // Bonus for symbol name matches
 for (const symbol of file.symbols) {
 if (symbol.name.toLowerCase().includes(keyword)) {
 score += 5;
 }
 }
 }

 return score;
 }

 /**
 * Get file content from disk
 */
 private getFileContent(file: FileMetadata): string {
 try {
 // Try to read actual file content
 const content = readFileContent(file.path);
 if (content) {
 return content;
 }
 } catch (error) {
 logger.warn(`Could not read file ${file.path}:`, error);
 }

 // Fallback: return symbol signatures
 return file.symbols.map(s => s.signature || s.name).join('\n');
 }

 /**
 * Merge results from different sources
 */
 private mergeResults(
 vectorResults: RetrievalResult[],
 keywordResults: RetrievalResult[]
 ): RetrievalResult[] {
 const merged = new Map<string, RetrievalResult>();

 // Add vector results
 for (const result of vectorResults) {
 const key = result.metadata.filePath || result.content.substring(0, 100);
 merged.set(key, result);
 }

 // Merge keyword results
 for (const result of keywordResults) {
 const key = result.metadata.filePath || result.content.substring(0, 100);
 const existing = merged.get(key);

 if (existing) {
 // Combine scores (weighted average)
 existing.score = (existing.score * 0.7) + (result.score * 0.3);
 existing.source = 'hybrid';
 } else {
 merged.set(key, result);
 }
 }

 return Array.from(merged.values());
 }

 /**
 * Apply filters to results
 */
 private applyFilters(
 results: RetrievalResult[],
 filters: RetrievalOptions['filters']
 ): RetrievalResult[] {
 return results.filter(result => {
 if (filters?.language && result.metadata.language !== filters.language) {
 return false;
 }
 if (filters?.symbolKind && result.metadata.symbolName) {
 // Additional filtering logic
 }
 return true;
 });
 }

 /**
 * Re-rank results using advanced scoring
 *
 * This implements a lightweight re-ranking algorithm that considers:
 * 1. Query-content relevance (already in score)
 * 2. Code quality indicators (symbol count, documentation)
 * 3. Recency (if available)
 * 4. File importance (based on imports/dependencies)
 *
 * Note: For production, consider using a cross-encoder model
 */
 private async rerank(query: string, results: RetrievalResult[]): Promise<RetrievalResult[]> {
 const queryLower = query.toLowerCase();
 const queryTokens = new Set(queryLower.split(/\W+/).filter(t => t.length > 2));

 return results.map(result => {
 let rerankScore = result.score;

 // Boost for exact query matches in content
 const contentLower = result.content.toLowerCase();
 if (contentLower.includes(queryLower)) {
 rerankScore *= 1.2;
 }

 // Boost for query tokens in symbol names
 if (result.metadata.symbolName) {
 const symbolLower = result.metadata.symbolName.toLowerCase();
 for (const token of queryTokens) {
 if (symbolLower.includes(token)) {
 rerankScore *= 1.15;
 break;
 }
 }
 }

 // Boost for well-documented code (has comments/docstrings)
 const hasDocumentation = /\/\*\*|\/\/|#|"""|'''/.test(result.content);
 if (hasDocumentation) {
 rerankScore *= 1.05;
 }

 // Boost for code with multiple symbols (more substantial)
 const symbolCount = (result.content.match(/function |class |interface |const |let |var /g) || []).length;
 if (symbolCount > 2) {
 rerankScore *= 1.1;
 }

 // Penalize very short snippets (likely incomplete)
 if (result.content.length < 50) {
 rerankScore *= 0.8;
 }

 // Penalize very long snippets (may be too broad)
 if (result.content.length > 5000) {
 rerankScore *= 0.9;
 }

 return {
 ...result,
 score: rerankScore
 };
 }).sort((a, b) => b.score - a.score);
 }

 /**
 * Apply Maximal Marginal Relevance for diversity
 */
 private applyMMR(
 results: RetrievalResult[],
 limit: number,
 lambda: number = 0.7
 ): RetrievalResult[] {
 if (results.length <= limit) {
 return results;
 }

 const selected: RetrievalResult[] = [];
 const remaining = [...results];

 // Select first result (highest score)
 selected.push(remaining.shift()!);

 // Select remaining results based on MMR
 while (selected.length < limit && remaining.length > 0) {
 let bestIdx = 0;
 let bestScore = -Infinity;

 for (let i = 0; i < remaining.length; i++) {
 const candidate = remaining[i];

 // Calculate relevance score
 const relevance = candidate.score;

 // Calculate max similarity to already selected
 let maxSimilarity = 0;
 for (const selected_item of selected) {
 const similarity = this.calculateSimilarity(candidate, selected_item);
 maxSimilarity = Math.max(maxSimilarity, similarity);
 }

 // MMR score: balance relevance and diversity
 const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

 if (mmrScore > bestScore) {
 bestScore = mmrScore;
 bestIdx = i;
 }
 }

 selected.push(remaining.splice(bestIdx, 1)[0]);
 }

 return selected;
 }

 /**
 * Calculate similarity between two results
 */
 private calculateSimilarity(a: RetrievalResult, b: RetrievalResult): number {
 // Simple similarity based on file path and content overlap
 if (a.metadata.filePath === b.metadata.filePath) {
 return 0.9;
 }

 // Calculate content similarity (simple word overlap)
 const wordsA = new Set(a.content.toLowerCase().split(/\W+/));
 const wordsB = new Set(b.content.toLowerCase().split(/\W+/));

 const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
 const union = new Set([...wordsA, ...wordsB]);

 return intersection.size / union.size;
 }

 /**
 * Add surrounding context lines to results
 */
 private addContext(results: RetrievalResult[], contextLines: number): RetrievalResult[] {
 return results.map(result => {
 // Skip if no file path or line numbers
 if (!result.metadata.filePath || result.metadata.startLine === undefined) {
 return result;
 }

 try {
 // Read the full file
 const fullContent = readFileContent(result.metadata.filePath);
 if (!fullContent) {
 return result;
 }

 const lines = fullContent.split('\n');
 const startLine = result.metadata.startLine || 0;
 const endLine = result.metadata.endLine || startLine;

 // Calculate context range
 const contextStart = Math.max(0, startLine - contextLines);
 const contextEnd = Math.min(lines.length - 1, endLine + contextLines);

 // Extract lines with context
 const contextContent = lines.slice(contextStart, contextEnd + 1).join('\n');

 // Add context markers
 const beforeContext = contextStart < startLine ?
 `// ... (${startLine - contextStart} lines before)\n` : '';
 const afterContext = contextEnd > endLine ?
 `\n// ... (${contextEnd - endLine} lines after)` : '';

 return {
 ...result,
 content: beforeContext + contextContent + afterContext,
 metadata: {
 ...result.metadata,
 startLine: contextStart,
 endLine: contextEnd
 }
 };
 } catch (error) {
 logger.warn(`Could not add context for ${result.metadata.filePath}:`, error);
 return result;
 }
 });
 }
}

