/**
 * Hierarchical Retrieval System
 *
 * Multi-level retrieval that progressively narrows down results:
 * Level 1: File-level retrieval (find relevant files)
 * Level 2: Chunk-level retrieval (find relevant chunks within files)
 * Level 3: Symbol-level retrieval (find specific symbols/functions)
 * Level 4: Line-level retrieval (find exact lines)
 *
 * This approach improves precision and reduces noise in retrieval results.
 */

import { CodeChunk } from '../embedding/codeChunker';
import { ASTAnalysisResult, ASTSymbol } from '../embedding/astAnalyzer';
import { CrossFileTracker } from '../embedding/crossFileTracker';

export interface HierarchicalQuery {
 query: string;
 maxResults?: number;
 levels?: RetrievalLevel[];
 filters?: RetrievalFilters;
 expansionStrategy?: 'none' | 'related' | 'dependencies' | 'full';
}

export type RetrievalLevel = 'file' | 'chunk' | 'symbol' | 'line';

export interface RetrievalFilters {
 filePatterns?: string[];
 excludePatterns?: string[];
 languages?: string[];
 minRelevance?: number;
 symbolTypes?: string[];
 dateRange?: { start: Date; end: Date };
}

export interface HierarchicalResult {
 level: RetrievalLevel;
 results: RetrievalItem[];
 metadata: {
 totalResults: number;
 processingTime: number;
 levelsProcessed: RetrievalLevel[];
 expansionApplied: boolean;
 };
}

export interface RetrievalItem {
 level: RetrievalLevel;
 path: string;
 content: string;
 relevance: number;
 context?: {
 parentFile?: string;
 parentChunk?: string;
 parentSymbol?: string;
 lineNumber?: number;
 relatedItems?: string[];
 };
 metadata: {
 language?: string;
 symbolType?: string;
 complexity?: number;
 lastModified?: number;
 };
}

export interface FileScore {
 path: string;
 score: number;
 reasons: string[];
}

export interface ChunkScore {
 chunk: CodeChunk;
 score: number;
 fileScore: number;
 reasons: string[];
}

export interface SymbolScore {
 symbol: ASTSymbol;
 score: number;
 chunkScore: number;
 reasons: string[];
}

export class HierarchicalRetrieval {
 private crossFileTracker: CrossFileTracker;
 private fileCache: Map<string, string>;
 private chunkCache: Map<string, CodeChunk[]>;
 private astCache: Map<string, ASTAnalysisResult>;

 constructor(crossFileTracker: CrossFileTracker) {
 this.crossFileTracker = crossFileTracker;
 this.fileCache = new Map();
 this.chunkCache = new Map();
 this.astCache = new Map();
 }

 /**
 * Perform hierarchical retrieval
 */
 async retrieve(query: HierarchicalQuery): Promise<HierarchicalResult> {
 const startTime = Date.now();
 const levels = query.levels || ['file', 'chunk', 'symbol'];
 const results: RetrievalItem[] = [];
 const levelsProcessed: RetrievalLevel[] = [];

 let currentCandidates: string[] = [];

 // Level 1: File-level retrieval
 if (levels.includes('file')) {
 const fileResults = await this.retrieveFiles(query);
 currentCandidates = fileResults.map(f => f.path);
 results.push(...fileResults.map(f => this.toRetrievalItem(f, 'file')));
 levelsProcessed.push('file');
 }

 // Level 2: Chunk-level retrieval
 if (levels.includes('chunk') && currentCandidates.length > 0) {
 const chunkResults = await this.retrieveChunks(query, currentCandidates);
 results.push(...chunkResults.map(c => this.toRetrievalItem(c, 'chunk')));
 levelsProcessed.push('chunk');
 }

 // Level 3: Symbol-level retrieval
 if (levels.includes('symbol') && currentCandidates.length > 0) {
 const symbolResults = await this.retrieveSymbols(query, currentCandidates);
 results.push(...symbolResults.map(s => this.toRetrievalItem(s, 'symbol')));
 levelsProcessed.push('symbol');
 }

 // Level 4: Line-level retrieval
 if (levels.includes('line') && currentCandidates.length > 0) {
 const lineResults = await this.retrieveLines(query, currentCandidates);
 results.push(...lineResults);
 levelsProcessed.push('line');
 }

 // Apply expansion if requested
 let expansionApplied = false;
 if (query.expansionStrategy && query.expansionStrategy !== 'none') {
 const expanded = await this.expandResults(results, query.expansionStrategy);
 results.push(...expanded);
 expansionApplied = true;
 }

 // Sort by relevance and limit
 results.sort((a, b) => b.relevance - a.relevance);
 const maxResults = query.maxResults || 50;
 const limitedResults = results.slice(0, maxResults);

 return {
 level: levels[levels.length - 1],
 results: limitedResults,
 metadata: {
 totalResults: results.length,
 processingTime: Date.now() - startTime,
 levelsProcessed,
 expansionApplied
 }
 };
 }

 /**
 * Level 1: Retrieve relevant files
 */
 private async retrieveFiles(query: HierarchicalQuery): Promise<FileScore[]> {
 const allFiles = this.crossFileTracker.getAllFiles();
 const scores: FileScore[] = [];

 for (const file of allFiles) {
 // Apply filters
 if (query.filters) {
 if (!this.matchesFilters(file, query.filters)) {
 continue;
 }
 }

 const score = this.scoreFile(file, query.query);
 if (score.score >= (query.filters?.minRelevance || 0.3)) {
 scores.push(score);
 }
 }

 // Sort by score
 scores.sort((a, b) => b.score - a.score);
 return scores.slice(0, 20); // Top 20 files
 }

 /**
 * Level 2: Retrieve relevant chunks from files
 */
 private async retrieveChunks(query: HierarchicalQuery, files: string[]): Promise<ChunkScore[]> {
 const scores: ChunkScore[] = [];

 for (const file of files) {
 const chunks = this.chunkCache.get(file) || [];
 const fileScore = this.scoreFile(file, query.query).score;

 for (const chunk of chunks) {
 const chunkScore = this.scoreChunk(chunk, query.query);
 const combinedScore = (chunkScore * 0.7) + (fileScore * 0.3);

 if (combinedScore >= (query.filters?.minRelevance || 0.3)) {
 scores.push({
 chunk,
 score: combinedScore,
 fileScore,
 reasons: [`Chunk relevance: ${chunkScore.toFixed(2)}`, `File relevance: ${fileScore.toFixed(2)}`]
 });
 }
 }
 }

 scores.sort((a, b) => b.score - a.score);
 return scores.slice(0, 30); // Top 30 chunks
 }

 /**
 * Level 3: Retrieve relevant symbols
 */
 private async retrieveSymbols(query: HierarchicalQuery, files: string[]): Promise<SymbolScore[]> {
 const scores: SymbolScore[] = [];

 for (const file of files) {
 const ast = this.astCache.get(file);
 if (!ast) continue;

 for (const symbol of ast.symbols) {
 // Apply symbol type filter
 if (query.filters?.symbolTypes && !query.filters.symbolTypes.includes(symbol.kind)) {
 continue;
 }

 const symbolScore = this.scoreSymbol(symbol, query.query);
 if (symbolScore >= (query.filters?.minRelevance || 0.3)) {
 scores.push({
 symbol,
 score: symbolScore,
 chunkScore: 0,
 reasons: [`Symbol name match`, `Symbol type: ${symbol.kind}`]
 });
 }
 }
 }

 scores.sort((a, b) => b.score - a.score);
 return scores.slice(0, 40); // Top 40 symbols
 }

 /**
 * Level 4: Retrieve relevant lines
 */
 private async retrieveLines(query: HierarchicalQuery, files: string[]): Promise<RetrievalItem[]> {
 const results: RetrievalItem[] = [];

 for (const file of files) {
 const content = this.fileCache.get(file);
 if (!content) continue;

 const lines = content.split('\n');
 const queryLower = query.query.toLowerCase();

 lines.forEach((line, index) => {
 const lineLower = line.toLowerCase();
 if (lineLower.includes(queryLower)) {
 const relevance = this.scoreLineMatch(line, query.query);
 if (relevance >= (query.filters?.minRelevance || 0.5)) {
 results.push({
 level: 'line',
 path: file,
 content: line,
 relevance,
 context: {
 parentFile: file,
 lineNumber: index + 1
 },
 metadata: {}
 });
 }
 }
 });
 }

 return results;
 }

 /**
 * Expand results based on strategy
 */
 private async expandResults(results: RetrievalItem[], strategy: string): Promise<RetrievalItem[]> {
 const expanded: RetrievalItem[] = [];

 for (const result of results) {
 if (strategy === 'related') {
 // Add related files
 const related = this.crossFileTracker.getRelatedFiles(result.path, { maxResults: 5 });
 for (const rel of related) {
 expanded.push({
 level: 'file',
 path: rel.path,
 content: '',
 relevance: result.relevance * rel.score * 0.5,
 context: { relatedItems: [result.path] },
 metadata: {}
 });
 }
 } else if (strategy === 'dependencies') {
 // Add dependencies
 const deps = this.crossFileTracker.getDependencies(result.path, { direct: false });
 for (const dep of deps) {
 expanded.push({
 level: 'file',
 path: dep,
 content: '',
 relevance: result.relevance * 0.6,
 context: { relatedItems: [result.path] },
 metadata: {}
 });
 }
 }
 }

 return expanded;
 }

 /**
 * Score a file for relevance
 */
 private scoreFile(file: string, query: string): FileScore {
 let score = 0;
 const reasons: string[] = [];
 const queryLower = query.toLowerCase();
 const fileLower = file.toLowerCase();

 // File name match
 if (fileLower.includes(queryLower)) {
 score += 0.5;
 reasons.push('File name match');
 }

 // Path component match
 const pathParts = file.split('/');
 if (pathParts.some(part => part.toLowerCase().includes(queryLower))) {
 score += 0.3;
 reasons.push('Path component match');
 }

 // Importance score from cross-file tracker (if available)
 // Note: getFileImportance would need to be added to CrossFileTracker
 // For now, use a simple heuristic
 const pathDepth = file.split('/').length;
 const importance = pathDepth < 3 ? 0.8 : 0.5;
 score += importance * 0.2;
 if (importance > 0.5) {
 reasons.push('High importance file');
 }

 return { path: file, score: Math.min(score, 1.0), reasons };
 }

 /**
 * Score a chunk for relevance
 */
 private scoreChunk(chunk: CodeChunk, query: string): number {
 const queryLower = query.toLowerCase();
 const contentLower = chunk.content.toLowerCase();

 let score = 0;

 // Content match
 if (contentLower.includes(queryLower)) {
 score += 0.6;
 }

 // Type bonus (function/class definitions are more relevant)
 if (chunk.type === 'function' || chunk.type === 'class') {
 score += 0.2;
 }

 return Math.min(score, 1.0);
 }

 /**
 * Score a symbol for relevance
 */
 private scoreSymbol(symbol: ASTSymbol, query: string): number {
 const queryLower = query.toLowerCase();
 const nameLower = symbol.name.toLowerCase();

 let score = 0;

 // Exact match
 if (nameLower === queryLower) {
 score = 1.0;
 }
 // Contains match
 else if (nameLower.includes(queryLower)) {
 score = 0.7;
 }
 // Fuzzy match
 else if (this.fuzzyMatch(nameLower, queryLower)) {
 score = 0.4;
 }

 return score;
 }

 /**
 * Score a line match
 */
 private scoreLineMatch(line: string, query: string): number {
 const queryLower = query.toLowerCase();
 const lineLower = line.toLowerCase();

 if (lineLower === queryLower) return 1.0;
 if (lineLower.includes(queryLower)) return 0.8;
 return 0.5;
 }

 /**
 * Check if file matches filters
 */
 private matchesFilters(file: string, filters: RetrievalFilters): boolean {
 // File pattern match
 if (filters.filePatterns && filters.filePatterns.length > 0) {
 if (!filters.filePatterns.some(pattern => file.includes(pattern))) {
 return false;
 }
 }

 // Exclude pattern match
 if (filters.excludePatterns && filters.excludePatterns.length > 0) {
 if (filters.excludePatterns.some(pattern => file.includes(pattern))) {
 return false;
 }
 }

 return true;
 }

 /**
 * Fuzzy match
 */
 private fuzzyMatch(str1: string, str2: string): boolean {
 let j = 0;
 for (let i = 0; i < str1.length && j < str2.length; i++) {
 if (str1[i] === str2[j]) j++;
 }
 return j === str2.length;
 }

 /**
 * Convert to retrieval item
 */
 private toRetrievalItem(item: any, level: RetrievalLevel): RetrievalItem { // Retrieval item structure
 if (level === 'file') {
 return {
 level,
 path: item.path,
 content: '',
 relevance: item.score,
 metadata: {}
 };
 } else if (level === 'chunk') {
 return {
 level,
 path: '', // Would need file path from chunk
 content: item.chunk.content,
 relevance: item.score,
 context: {
 parentFile: ''
 },
 metadata: {
 language: item.chunk.language
 }
 };
 } else if (level === 'symbol') {
 return {
 level,
 path: '', // Would need file path from symbol
 content: item.symbol.name,
 relevance: item.score,
 metadata: {
 symbolType: item.symbol.kind
 }
 };
 }
 return item;
 }
}

