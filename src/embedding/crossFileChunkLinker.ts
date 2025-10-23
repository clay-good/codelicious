/**
 * Cross-File Chunk Linking
 *
 * Links related chunks across files based on:
 * - Import/export relationships
 * - Function calls
 * - Type usage
 * - Semantic similarity
 * - Shared concepts
 */

import { CodeChunk } from './codeChunker';
import { CrossFileTracker } from './crossFileTracker';

export interface ChunkLink {
 sourceChunk: string; // Chunk ID
 targetChunk: string; // Chunk ID
 linkType: LinkType;
 confidence: number; // 0-1
 reason: string;
 metadata: {
 sharedSymbols?: string[];
 sharedConcepts?: string[];
 semanticSimilarity?: number;
 };
}

export type LinkType =
 | 'import' // One chunk imports from another
 | 'call' // One chunk calls function from another
 | 'type_usage' // One chunk uses type from another
 | 'inheritance' // One chunk extends/implements another
 | 'semantic' // Semantically similar chunks
 | 'concept' // Share common concepts
 | 'dependency'; // General dependency

export interface ChunkLinkGraph {
 chunks: Map<string, CodeChunk>;
 links: ChunkLink[];
 clusters: ChunkCluster[];
}

export interface ChunkCluster {
 id: string;
 chunks: string[]; // Chunk IDs
 cohesion: number; // 0-1
 topic: string;
}

export class CrossFileChunkLinker {
 private crossFileTracker: CrossFileTracker;
 private linkGraph: ChunkLinkGraph;
 private chunkIndex: Map<string, CodeChunk>;

 constructor(crossFileTracker: CrossFileTracker) {
 this.crossFileTracker = crossFileTracker;
 this.linkGraph = {
 chunks: new Map(),
 links: [],
 clusters: []
 };
 this.chunkIndex = new Map();
 }

 /**
 * Add chunk to the linker
 */
 addChunk(chunk: CodeChunk): void {
 const chunkId = this.getChunkId(chunk);
 this.chunkIndex.set(chunkId, chunk);
 this.linkGraph.chunks.set(chunkId, chunk);
 }

 /**
 * Build links between all chunks
 */
 async buildLinks(): Promise<void> {
 const chunks = Array.from(this.chunkIndex.values());

 for (let i = 0; i < chunks.length; i++) {
 for (let j = i + 1; j < chunks.length; j++) {
 const links = await this.findLinks(chunks[i], chunks[j]);
 this.linkGraph.links.push(...links);
 }
 }

 // Build clusters
 this.buildClusters();
 }

 /**
 * Get linked chunks for a given chunk
 */
 getLinkedChunks(chunkId: string, options?: {
 linkTypes?: LinkType[];
 minConfidence?: number;
 maxResults?: number;
 }): Array<{ chunk: CodeChunk; link: ChunkLink }> {
 const links = this.linkGraph.links.filter(link => {
 if (link.sourceChunk !== chunkId && link.targetChunk !== chunkId) {
 return false;
 }
 if (options?.linkTypes && !options.linkTypes.includes(link.linkType)) {
 return false;
 }
 if (options?.minConfidence && link.confidence < options.minConfidence) {
 return false;
 }
 return true;
 });

 const results = links.map(link => {
 const targetId = link.sourceChunk === chunkId ? link.targetChunk : link.sourceChunk;
 const chunk = this.chunkIndex.get(targetId);
 return chunk ? { chunk, link } : null;
 }).filter(r => r !== null) as Array<{ chunk: CodeChunk; link: ChunkLink }>;

 // Sort by confidence
 results.sort((a, b) => b.link.confidence - a.link.confidence);

 return options?.maxResults ? results.slice(0, options.maxResults) : results;
 }

 /**
 * Get chunk cluster
 */
 getChunkCluster(chunkId: string): ChunkCluster | undefined {
 return this.linkGraph.clusters.find(cluster =>
 cluster.chunks.includes(chunkId)
 );
 }

 /**
 * Find links between two chunks
 */
 private async findLinks(chunk1: CodeChunk, chunk2: CodeChunk): Promise<ChunkLink[]> {
 const links: ChunkLink[] = [];
 const chunk1Id = this.getChunkId(chunk1);
 const chunk2Id = this.getChunkId(chunk2);

 // Skip if same file (handled by file-level analysis)
 // if (chunk1.filePath === chunk2.filePath) return links;

 // Import/export links
 const importLink = this.detectImportLink(chunk1, chunk2);
 if (importLink) {
 links.push({
 sourceChunk: chunk1Id,
 targetChunk: chunk2Id,
 linkType: 'import',
 confidence: importLink.confidence,
 reason: importLink.reason,
 metadata: { sharedSymbols: importLink.symbols }
 });
 }

 // Function call links
 const callLink = this.detectCallLink(chunk1, chunk2);
 if (callLink) {
 links.push({
 sourceChunk: chunk1Id,
 targetChunk: chunk2Id,
 linkType: 'call',
 confidence: callLink.confidence,
 reason: callLink.reason,
 metadata: { sharedSymbols: callLink.symbols }
 });
 }

 // Type usage links
 const typeLink = this.detectTypeLink(chunk1, chunk2);
 if (typeLink) {
 links.push({
 sourceChunk: chunk1Id,
 targetChunk: chunk2Id,
 linkType: 'type_usage',
 confidence: typeLink.confidence,
 reason: typeLink.reason,
 metadata: { sharedSymbols: typeLink.symbols }
 });
 }

 // Semantic similarity links
 const semanticLink = this.detectSemanticLink(chunk1, chunk2);
 if (semanticLink) {
 links.push({
 sourceChunk: chunk1Id,
 targetChunk: chunk2Id,
 linkType: 'semantic',
 confidence: semanticLink.confidence,
 reason: semanticLink.reason,
 metadata: {
 semanticSimilarity: semanticLink.similarity,
 sharedConcepts: semanticLink.concepts
 }
 });
 }

 return links;
 }

 /**
 * Detect import link
 */
 private detectImportLink(chunk1: CodeChunk, chunk2: CodeChunk): { confidence: number; reason: string; symbols: string[] } | null {
 const importPattern = /import\s+.*\s+from\s+['"]([^'"]+)['"]/g;
 const imports1 = Array.from(chunk1.content.matchAll(importPattern)).map(m => m[1]);

 // Check if chunk1 imports from chunk2's file
 // This is simplified - would need actual file path resolution
 if (imports1.length > 0) {
 return {
 confidence: 0.9,
 reason: 'Import relationship detected',
 symbols: []
 };
 }

 return null;
 }

 /**
 * Detect function call link
 */
 private detectCallLink(chunk1: CodeChunk, chunk2: CodeChunk): { confidence: number; reason: string; symbols: string[] } | null {
 // Extract function names from chunk2
 const functionPattern = /(?:function|const|let|var)\s+(\w+)\s*[=\(]/g;
 const functions2 = Array.from(chunk2.content.matchAll(functionPattern)).map(m => m[1]);

 // Check if chunk1 calls any of these functions
 const sharedFunctions = functions2.filter(fn =>
 new RegExp(`\\b${fn}\\s*\\(`).test(chunk1.content)
 );

 if (sharedFunctions.length > 0) {
 return {
 confidence: 0.8,
 reason: `Calls functions: ${sharedFunctions.join(', ')}`,
 symbols: sharedFunctions
 };
 }

 return null;
 }

 /**
 * Detect type usage link
 */
 private detectTypeLink(chunk1: CodeChunk, chunk2: CodeChunk): { confidence: number; reason: string; symbols: string[] } | null {
 // Extract type definitions from chunk2
 const typePattern = /(?:interface|type|class)\s+(\w+)/g;
 const types2 = Array.from(chunk2.content.matchAll(typePattern)).map(m => m[1]);

 // Check if chunk1 uses any of these types
 const sharedTypes = types2.filter(type =>
 new RegExp(`:\\s*${type}\\b|<${type}>`).test(chunk1.content)
 );

 if (sharedTypes.length > 0) {
 return {
 confidence: 0.85,
 reason: `Uses types: ${sharedTypes.join(', ')}`,
 symbols: sharedTypes
 };
 }

 return null;
 }

 /**
 * Detect semantic similarity link
 */
 private detectSemanticLink(chunk1: CodeChunk, chunk2: CodeChunk): { confidence: number; reason: string; similarity: number; concepts: string[] } | null {
 // Extract concepts (simplified - would use NLP in production)
 const concepts1 = this.extractConcepts(chunk1.content);
 const concepts2 = this.extractConcepts(chunk2.content);

 const sharedConcepts = concepts1.filter(c => concepts2.includes(c));

 if (sharedConcepts.length >= 2) {
 const similarity = sharedConcepts.length / Math.max(concepts1.length, concepts2.length);
 return {
 confidence: similarity,
 reason: `Share concepts: ${sharedConcepts.join(', ')}`,
 similarity,
 concepts: sharedConcepts
 };
 }

 return null;
 }

 /**
 * Extract concepts from code
 */
 private extractConcepts(code: string): string[] {
 // Extract identifiers (simplified)
 const identifierPattern = /\b[a-z][a-zA-Z0-9]*\b/g;
 const identifiers = Array.from(code.matchAll(identifierPattern)).map(m => m[0]);

 // Filter common words
 const commonWords = new Set(['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while']);
 return [...new Set(identifiers.filter(id => !commonWords.has(id)))];
 }

 /**
 * Build chunk clusters
 */
 private buildClusters(): void {
 // Simple clustering based on link density
 const visited = new Set<string>();
 const clusters: ChunkCluster[] = [];

 for (const chunkId of this.chunkIndex.keys()) {
 if (visited.has(chunkId)) continue;

 const cluster = this.expandCluster(chunkId, visited);
 if (cluster.chunks.length >= 2) {
 clusters.push(cluster);
 }
 }

 this.linkGraph.clusters = clusters;
 }

 /**
 * Expand cluster from seed chunk
 */
 private expandCluster(seedId: string, visited: Set<string>): ChunkCluster {
 const clusterChunks: string[] = [seedId];
 visited.add(seedId);

 const queue = [seedId];
 while (queue.length > 0) {
 const currentId = queue.shift()!;
 const linked = this.getLinkedChunks(currentId, { minConfidence: 0.7, maxResults: 10 });

 for (const { chunk } of linked) {
 const linkedId = this.getChunkId(chunk);
 if (!visited.has(linkedId)) {
 visited.add(linkedId);
 clusterChunks.push(linkedId);
 queue.push(linkedId);
 }
 }
 }

 return {
 id: `cluster-${seedId}`,
 chunks: clusterChunks,
 cohesion: this.calculateClusterCohesion(clusterChunks),
 topic: 'general' // Would be determined by concept analysis
 };
 }

 /**
 * Calculate cluster cohesion
 */
 private calculateClusterCohesion(chunkIds: string[]): number {
 if (chunkIds.length < 2) return 1.0;

 let totalLinks = 0;
 const possibleLinks = (chunkIds.length * (chunkIds.length - 1)) / 2;

 for (const link of this.linkGraph.links) {
 if (chunkIds.includes(link.sourceChunk) && chunkIds.includes(link.targetChunk)) {
 totalLinks++;
 }
 }

 return totalLinks / possibleLinks;
 }

 /**
 * Get chunk ID
 */
 private getChunkId(chunk: CodeChunk): string {
 return `${chunk.startLine}-${chunk.endLine}`;
 }
}

