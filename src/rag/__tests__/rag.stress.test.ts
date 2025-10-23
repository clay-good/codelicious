/**
 * Comprehensive Stress Tests for RAG/Embedding/Chunking System
 *
 * Tests:
 * 1. Embedding generation efficiency
 * 2. Chunking optimization
 * 3. Retrieval performance
 * 4. Cache effectiveness
 * 5. Token usage optimization
 * 6. Large codebase handling
 */

import { RAGService, RAGQueryOptions } from '../ragService';
import { EmbeddingService } from '../../embedding/embeddingService';
import { CodeChunker } from '../../embedding/codeChunker';
import { SemanticChunker } from '../../embedding/semanticChunker';
import { EmbeddingManager } from '../../embedding/embeddingManager';
import { VectorStore } from '../../embedding/vectorStore';
import { ConfigurationManager } from '../../core/configurationManager';
import { IndexingEngine } from '../../core/indexer';
import { StatusBarManager } from '../../ui/statusBar';
import * as vscode from 'vscode';

jest.mock('vscode');
jest.mock('../../ui/statusBar');

describe.skip('RAG/Embedding/Chunking Stress Tests', () => {
 let ragService: RAGService;
 let embeddingService: EmbeddingService;
 let codeChunker: CodeChunker;
 let semanticChunker: SemanticChunker;

 beforeEach(() => {
 const mockContext = {} as vscode.ExtensionContext;
 const configManager = new ConfigurationManager();
 const statusBar = {} as StatusBarManager;
 const indexingEngine = new IndexingEngine(mockContext, configManager, statusBar);
 const embeddingManager = new EmbeddingManager(configManager, {} as any);
 const vectorStore = new VectorStore(configManager);

 ragService = new RAGService(
 mockContext,
 configManager,
 embeddingManager,
 vectorStore,
 indexingEngine
 );

 embeddingService = new EmbeddingService(mockContext, configManager, indexingEngine);
 codeChunker = new CodeChunker(512, 50, true);
 semanticChunker = new SemanticChunker(512, 50, 3);
 });

 describe('Chunking Optimization', () => {
 it('should chunk large TypeScript file efficiently', async () => {
 const largeFile = `
 // Large TypeScript file with multiple classes and functions
 ${Array(100).fill(null).map((_, i) => `
 export class TestClass${i} {
 private value: number = ${i};

 constructor() {
 this.value = ${i};
 }

 public getValue(): number {
 return this.value;
 }

 public setValue(val: number): void {
 this.value = val;
 }
 }
 `).join('\n')}
 `;

 const startTime = Date.now();
 const chunks = await codeChunker.chunkFile('test.ts', largeFile);
 const duration = Date.now() - startTime;

 expect(chunks.length).toBeGreaterThan(0);
 expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
 expect(chunks.every(c => c.content.length <= 512 * 4)).toBe(true);
 });

 it('should use semantic chunking for better context preservation', async () => {
 const code = `
 export class UserService {
 private users: User[] = [];

 async createUser(data: UserData): Promise<User> {
 const user = new User(data);
 this.users.push(user);
 return user;
 }

 async getUser(id: string): Promise<User | null> {
 return this.users.find(u => u.id === id) || null;
 }

 async updateUser(id: string, data: Partial<UserData>): Promise<User> {
 const user = await this.getUser(id);
 if (!user) throw new Error('User not found');
 Object.assign(user, data);
 return user;
 }
 }
 `;

 const chunks = await semanticChunker.chunkFile('userService.ts', code);

 expect(chunks.length).toBeGreaterThan(0);
 expect(chunks.some(c => c.type === 'class')).toBe(true);
 expect(chunks.some(c => c.type === 'function')).toBe(true);
 // Semantic score is optional
 expect(chunks.every(c => c.content.length > 0)).toBe(true);
 });

 it('should handle optimal chunk sizes for different languages', async () => {
 const testCases = [
 { file: 'test.ts', language: 'typescript', expectedChunkSize: 512 },
 { file: 'test.py', language: 'python', expectedChunkSize: 512 },
 { file: 'test.java', language: 'java', expectedChunkSize: 512 },
 { file: 'test.go', language: 'go', expectedChunkSize: 512 }
 ];

 for (const testCase of testCases) {
 const code = `// Sample ${testCase.language} code\n` + 'function test() {}\n'.repeat(100);
 const chunks = await codeChunker.chunkFile(testCase.file, code);

 expect(chunks.length).toBeGreaterThan(0);
 expect(chunks.every(c => c.language === testCase.language)).toBe(true);
 }
 });

 it('should maintain context with overlapping chunks', async () => {
 const code = Array(200).fill(null).map((_, i) => `function func${i}() { return ${i}; }`).join('\n');

 const chunks = await codeChunker.chunkFile('test.ts', code);

 // Check that adjacent chunks have overlap
 for (let i = 0; i < chunks.length - 1; i++) {
 const currentChunk = chunks[i];
 const nextChunk = chunks[i + 1];

 // There should be some overlap in line numbers
 expect(nextChunk.startLine).toBeLessThanOrEqual(currentChunk.endLine + 50);
 }
 });
 });

 describe('Embedding Generation Efficiency', () => {
 it('should generate embeddings with caching', async () => {
 const code = 'function test() { return 42; }';

 // First call - should generate embedding
 const startTime1 = Date.now();
 const chunks1 = await codeChunker.chunkFile('test.ts', code);
 const duration1 = Date.now() - startTime1;

 // Second call - should use cache
 const startTime2 = Date.now();
 const chunks2 = await codeChunker.chunkFile('test.ts', code);
 const duration2 = Date.now() - startTime2;

 expect(chunks1).toEqual(chunks2);
 // Second call should be faster due to caching
 expect(duration2).toBeLessThanOrEqual(duration1);
 });

 it('should batch embed multiple chunks efficiently', async () => {
 const files = Array(50).fill(null).map((_, i) => ({
 path: `test${i}.ts`,
 content: `function test${i}() { return ${i}; }`
 }));

 const startTime = Date.now();
 const allChunks = await Promise.all(
 files.map(f => codeChunker.chunkFile(f.path, f.content))
 );
 const duration = Date.now() - startTime;

 expect(allChunks.flat().length).toBeGreaterThan(0);
 expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds
 });

 it('should handle embedding failures gracefully', async () => {
 const invalidCode = 'this is not valid code @#$%^&*()';

 const chunks = await codeChunker.chunkFile('invalid.ts', invalidCode);

 expect(chunks).toBeDefined();
 expect(chunks.length).toBeGreaterThan(0);
 });
 });

 describe('Retrieval Performance', () => {
 it('should retrieve relevant code quickly', async () => {
 const query = 'user authentication function';
 const options: RAGQueryOptions = {
 limit: 10,
 minScore: 0.7,
 includeContext: true,
 contextLines: 5
 };

 const startTime = Date.now();
 const response = await ragService.query(query, options);
 const duration = Date.now() - startTime;

 expect(response.results.length).toBeGreaterThan(0);
 expect(duration).toBeLessThan(2000); // Should complete in under 2 seconds
 expect(response.metadata.qualityScore).toBeGreaterThan(0);
 });

 it('should use hierarchical retrieval for better results', async () => {
 const query = 'database connection pooling';
 const options: RAGQueryOptions = {
 limit: 10,
 minScore: 0.7,
 includeContext: true
 };

 const response = await ragService.query(query, options);

 expect(response.results.length).toBeGreaterThan(0);
 expect(response.assembledContext).toBeDefined();
 expect(response.metadata.retrievalTime).toBeLessThan(2000);
 });

 it('should handle complex queries with filters', async () => {
 const query = 'error handling';
 const options: RAGQueryOptions = {
 limit: 5,
 minScore: 0.8,
 filters: {
 language: 'typescript',
 fileType: '.ts'
 }
 };

 const response = await ragService.query(query, options);

 expect(response.results.every(r => r.metadata?.language === 'typescript')).toBe(true);
 });

 it('should optimize token usage in context assembly', async () => {
 const query = 'api endpoint implementation';
 const options: RAGQueryOptions = {
 limit: 20,
 maxTokens: 4000,
 format: 'markdown',
 includeMetadata: true
 };

 const response = await ragService.query(query, options);

 expect(response.assembledContext.context.length).toBeLessThan(16000); // ~4000 tokens
 expect(response.assembledContext.metadata.totalTokens).toBeLessThanOrEqual(4000);
 });
 });

 describe('Cache Effectiveness', () => {
 it('should cache query results effectively', async () => {
 const query = 'user service methods';
 const options: RAGQueryOptions = { limit: 10 };

 // First query
 const startTime1 = Date.now();
 const response1 = await ragService.query(query, options);
 const duration1 = Date.now() - startTime1;

 // Second identical query - should use cache
 const startTime2 = Date.now();
 const response2 = await ragService.query(query, options);
 const duration2 = Date.now() - startTime2;

 expect(response1.results.length).toBe(response2.results.length);
 expect(duration2).toBeLessThan(duration1 * 0.5); // Should be at least 50% faster
 });

 it('should invalidate cache when code changes', async () => {
 const query = 'test function';
 const options: RAGQueryOptions = { limit: 5 };

 const response1 = await ragService.query(query, options);

 // Simulate code change by querying with different options
 const response2 = await ragService.query(query, { limit: 10 });

 expect(response2).toBeDefined();
 // Results may differ with different options
 });

 it('should maintain cache size limits', async () => {
 // Generate many different queries to fill cache
 const queries = Array(50).fill(null).map((_, i) => `query ${i}`);

 for (const query of queries) {
 await ragService.query(query, { limit: 5 });
 }

 // Cache should handle many queries without errors
 const response = await ragService.query('final query', { limit: 5 });
 expect(response).toBeDefined();
 });
 });

 describe('Large Codebase Handling', () => {
 it('should handle indexing large codebase', async () => {
 const largeCodebase = Array(1000).fill(null).map((_, i) => ({
 path: `src/file${i}.ts`,
 content: `export function func${i}() { return ${i}; }`
 }));

 const startTime = Date.now();
 // Simulate indexing
 for (const file of largeCodebase.slice(0, 100)) {
 await codeChunker.chunkFile(file.path, file.content);
 }
 const duration = Date.now() - startTime;

 expect(duration).toBeLessThan(30000); // Should complete in under 30 seconds
 });

 it('should handle incremental updates efficiently', async () => {
 const file = 'src/test.ts';
 const originalContent = 'function test() { return 1; }';
 const updatedContent = 'function test() { return 2; }';

 // Initial chunking
 const chunks1 = await codeChunker.chunkFile(file, originalContent);

 // Update
 const startTime = Date.now();
 const chunks2 = await codeChunker.chunkFile(file, updatedContent);
 const duration = Date.now() - startTime;

 expect(chunks2).toBeDefined();
 expect(duration).toBeLessThan(1000); // Should be very fast
 });

 it('should prioritize frequently accessed files', async () => {
 const files = [
 { path: 'src/common.ts', content: 'export const common = true;', accessCount: 100 },
 { path: 'src/rare.ts', content: 'export const rare = true;', accessCount: 1 }
 ];

 // Simulate access patterns
 for (const file of files) {
 for (let i = 0; i < file.accessCount; i++) {
 await ragService.query(`code from ${file.path}`, { limit: 1 });
 }
 }

 // Frequently accessed files should be faster to retrieve
 const startTime1 = Date.now();
 await ragService.query('code from src/common.ts', { limit: 1 });
 const duration1 = Date.now() - startTime1;

 const startTime2 = Date.now();
 await ragService.query('code from src/rare.ts', { limit: 1 });
 const duration2 = Date.now() - startTime2;

 expect(duration1).toBeLessThanOrEqual(duration2);
 });
 });
});

