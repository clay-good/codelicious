/**
 * Code-Specific Embedding Adapter
 *
 * Provides specialized embedding generation for code using models like:
 * - CodeBERT (Microsoft)
 * - GraphCodeBERT (Microsoft)
 * - CodeT5 (Salesforce)
 * - UniXcoder (Microsoft)
 *
 * These models are trained specifically on code and understand:
 * - Programming language syntax
 * - Code semantics and structure
 * - Variable naming conventions
 * - Code relationships and dependencies
 */

export interface CodeEmbeddingModel {
 name: string;
 provider: 'huggingface' | 'openai' | 'local';
 modelId: string;
 dimensions: number;
 maxTokens: number;
 languages: string[]; // Supported programming languages
 features: CodeEmbeddingFeature[];
}

export type CodeEmbeddingFeature =
 | 'syntax_aware'
 | 'semantic_understanding'
 | 'cross_language'
 | 'code_search'
 | 'clone_detection'
 | 'bug_detection';

export interface CodeEmbeddingOptions {
 model?: string;
 includeComments?: boolean;
 includeDocstrings?: boolean;
 normalizeIdentifiers?: boolean; // Normalize variable names
 preserveStructure?: boolean; // Keep code structure in embedding
 language?: string;
}

export interface CodeEmbeddingResult {
 embedding: number[];
 model: string;
 dimensions: number;
 metadata: {
 language: string;
 tokensUsed: number;
 processingTime: number;
 features: string[];
 };
}

export class CodeEmbeddingAdapter {
 private models: Map<string, CodeEmbeddingModel>;
 private defaultModel: string;
 private cache: Map<string, CodeEmbeddingResult>;

 constructor() {
 this.models = new Map();
 this.cache = new Map();
 this.defaultModel = 'codebert-base';
 this.initializeModels();
 }

 /**
 * Generate embedding for code
 */
 async generateEmbedding(
 code: string,
 options: CodeEmbeddingOptions = {}
 ): Promise<CodeEmbeddingResult> {
 const startTime = Date.now();
 const modelName = options.model || this.defaultModel;
 const model = this.models.get(modelName);

 if (!model) {
 throw new Error(`Model ${modelName} not found`);
 }

 // Check cache
 const cacheKey = this.getCacheKey(code, options);
 const cached = this.cache.get(cacheKey);
 if (cached) {
 return cached;
 }

 // Preprocess code
 const preprocessed = this.preprocessCode(code, options);

 // Generate embedding based on provider
 let embedding: number[];
 let tokensUsed: number;

 switch (model.provider) {
 case 'huggingface':
 ({ embedding, tokensUsed } = await this.generateHuggingFaceEmbedding(preprocessed, model));
 break;
 case 'openai':
 ({ embedding, tokensUsed } = await this.generateOpenAIEmbedding(preprocessed, model));
 break;
 case 'local':
 ({ embedding, tokensUsed } = await this.generateLocalEmbedding(preprocessed, model));
 break;
 default:
 throw new Error(`Unsupported provider: ${model.provider}`);
 }

 const result: CodeEmbeddingResult = {
 embedding,
 model: modelName,
 dimensions: model.dimensions,
 metadata: {
 language: options.language || 'unknown',
 tokensUsed,
 processingTime: Date.now() - startTime,
 features: model.features
 }
 };

 // Cache result
 this.cache.set(cacheKey, result);

 return result;
 }

 /**
 * Generate embeddings for multiple code snippets (batch)
 */
 async generateBatchEmbeddings(
 codes: string[],
 options: CodeEmbeddingOptions = {}
 ): Promise<CodeEmbeddingResult[]> {
 // Process in parallel with concurrency limit
 const batchSize = 10;
 const results: CodeEmbeddingResult[] = [];

 for (let i = 0; i < codes.length; i += batchSize) {
 const batch = codes.slice(i, i + batchSize);
 const batchResults = await Promise.all(
 batch.map(code => this.generateEmbedding(code, options))
 );
 results.push(...batchResults);
 }

 return results;
 }

 /**
 * Calculate similarity between two code embeddings
 */
 calculateSimilarity(embedding1: number[], embedding2: number[]): number {
 if (embedding1.length !== embedding2.length) {
 throw new Error('Embeddings must have same dimensions');
 }

 // Cosine similarity
 let dotProduct = 0;
 let norm1 = 0;
 let norm2 = 0;

 for (let i = 0; i < embedding1.length; i++) {
 dotProduct += embedding1[i] * embedding2[i];
 norm1 += embedding1[i] * embedding1[i];
 norm2 += embedding2[i] * embedding2[i];
 }

 return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
 }

 /**
 * Get available models
 */
 getAvailableModels(): CodeEmbeddingModel[] {
 return Array.from(this.models.values());
 }

 /**
 * Set default model
 */
 setDefaultModel(modelName: string): void {
 if (!this.models.has(modelName)) {
 throw new Error(`Model ${modelName} not found`);
 }
 this.defaultModel = modelName;
 }

 /**
 * Clear cache
 */
 clearCache(): void {
 this.cache.clear();
 }

 /**
 * Preprocess code before embedding
 */
 private preprocessCode(code: string, options: CodeEmbeddingOptions): string {
 let processed = code;

 // Remove comments if requested
 if (!options.includeComments) {
 processed = processed.replace(/\/\/.*$/gm, '');
 processed = processed.replace(/\/\*[\s\S]*?\*\//g, '');
 }

 // Remove docstrings if requested (Python)
 if (!options.includeDocstrings) {
 processed = processed.replace(/"""[\s\S]*?"""/g, '');
 processed = processed.replace(/'''[\s\S]*?'''/g, '');
 }

 // Normalize identifiers if requested
 if (options.normalizeIdentifiers) {
 // Replace variable names with generic tokens
 processed = processed.replace(/\b[a-z_][a-zA-Z0-9_]*\b/g, (match) => {
 // Keep keywords
 const keywords = ['if', 'else', 'for', 'while', 'return', 'function', 'class', 'const', 'let', 'var'];
 return keywords.includes(match) ? match : 'VAR';
 });
 }

 // Normalize whitespace
 processed = processed.replace(/\s+/g, ' ').trim();

 return processed;
 }

 /**
 * Generate embedding using HuggingFace API
 */
 private async generateHuggingFaceEmbedding(
 code: string,
 model: CodeEmbeddingModel
 ): Promise<{ embedding: number[]; tokensUsed: number }> {
 // This would call HuggingFace API
 // For now, return a mock embedding
 const tokens = code.split(/\s+/).length;
 const embedding = new Array(model.dimensions).fill(0).map(() => Math.random());

 return {
 embedding,
 tokensUsed: tokens
 };
 }

 /**
 * Generate embedding using OpenAI API
 */
 private async generateOpenAIEmbedding(
 code: string,
 model: CodeEmbeddingModel
 ): Promise<{ embedding: number[]; tokensUsed: number }> {
 // This would call OpenAI API (text-embedding-ada-002 or similar)
 // For now, return a mock embedding
 const tokens = code.split(/\s+/).length;
 const embedding = new Array(model.dimensions).fill(0).map(() => Math.random());

 return {
 embedding,
 tokensUsed: tokens
 };
 }

 /**
 * Generate embedding using local model
 */
 private async generateLocalEmbedding(
 code: string,
 model: CodeEmbeddingModel
 ): Promise<{ embedding: number[]; tokensUsed: number }> {
 // This would use a local model (e.g., via ONNX or TensorFlow.js)
 // For now, return a mock embedding
 const tokens = code.split(/\s+/).length;
 const embedding = new Array(model.dimensions).fill(0).map(() => Math.random());

 return {
 embedding,
 tokensUsed: tokens
 };
 }

 /**
 * Get cache key
 */
 private getCacheKey(code: string, options: CodeEmbeddingOptions): string {
 const optionsStr = JSON.stringify(options);
 return `${code}-${optionsStr}`;
 }

 /**
 * Initialize available models
 */
 private initializeModels(): void {
 // CodeBERT (Microsoft)
 this.models.set('codebert-base', {
 name: 'CodeBERT Base',
 provider: 'huggingface',
 modelId: 'microsoft/codebert-base',
 dimensions: 768,
 maxTokens: 512,
 languages: ['python', 'java', 'javascript', 'php', 'ruby', 'go'],
 features: ['syntax_aware', 'semantic_understanding', 'code_search']
 });

 // GraphCodeBERT (Microsoft)
 this.models.set('graphcodebert-base', {
 name: 'GraphCodeBERT Base',
 provider: 'huggingface',
 modelId: 'microsoft/graphcodebert-base',
 dimensions: 768,
 maxTokens: 512,
 languages: ['python', 'java', 'javascript', 'php', 'ruby', 'go'],
 features: ['syntax_aware', 'semantic_understanding', 'code_search', 'clone_detection']
 });

 // UniXcoder (Microsoft)
 this.models.set('unixcoder-base', {
 name: 'UniXcoder Base',
 provider: 'huggingface',
 modelId: 'microsoft/unixcoder-base',
 dimensions: 768,
 maxTokens: 512,
 languages: ['python', 'java', 'javascript', 'php', 'ruby', 'go', 'c', 'c++', 'c#'],
 features: ['syntax_aware', 'semantic_understanding', 'cross_language', 'code_search']
 });

 // OpenAI text-embedding-ada-002 (general purpose, works well for code)
 this.models.set('openai-ada-002', {
 name: 'OpenAI Ada 002',
 provider: 'openai',
 modelId: 'text-embedding-ada-002',
 dimensions: 1536,
 maxTokens: 8191,
 languages: ['*'], // All languages
 features: ['semantic_understanding', 'code_search']
 });
 }
}

