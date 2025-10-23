/**
 * Embedding Manager - Full implementation with Python server integration
 */

import axios, { AxiosInstance } from 'axios';
import { ConfigurationManager } from '../core/configurationManager';
import { CacheManager } from '../cache/cacheManager';
import { Embedding, EmbeddingMetadata } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('EmbeddingManager');

interface EmbeddingRequest {
 texts: string[];
 batch_size?: number;
}

interface EmbeddingResponse {
 embeddings: number[][];
 model: string;
 dimension: number;
}

interface HealthResponse {
 status: string;
 model: string;
 dimension: number;
}

export class EmbeddingManager {
 private client: AxiosInstance;
 private serverUrl: string;
 private isServerAvailable = false;
 private modelName = 'unknown';
 private dimension = 384;

 constructor(
 private configManager: ConfigurationManager,
 private cacheManager: CacheManager
 ) {
 const config = this.configManager.getEmbeddingServerConfig();
 this.serverUrl = config.url;

 this.client = axios.create({
 baseURL: this.serverUrl,
 timeout: 30000,
 headers: {
 'Content-Type': 'application/json'
 }
 });
 }

 /**
 * Initialize the embedding system
 */
 async initialize(): Promise<void> {
 logger.info('Initializing EmbeddingManager');

 try {
 // Check if server is available
 const health = await this.checkHealth();
 if (health) {
 this.isServerAvailable = true;
 this.modelName = health.model;
 this.dimension = health.dimension;
 logger.info(`Embedding server connected: ${this.modelName} (dim: ${this.dimension})`);
 } else {
 logger.warn('Embedding server not available - embeddings will be disabled');
 }
 } catch (error) {
 logger.error('Failed to initialize embedding server', error);
 this.isServerAvailable = false;
 }
 }

 /**
 * Check server health
 */
 async checkHealth(): Promise<HealthResponse | null> {
 try {
 const response = await this.client.get<HealthResponse>('/health');
 return response.data;
 } catch (error) {
 logger.error('Health check failed', error);
 return null;
 }
 }

 /**
 * Generate embedding for a single text
 */
 async generateEmbedding(text: string): Promise<number[]> {
 if (!this.isServerAvailable) {
 logger.warn('Embedding server not available, returning zero vector');
 return new Array(this.dimension).fill(0);
 }

 // Check cache first
 const cacheKey = `embedding:${this.hashText(text)}`;
 const cached = await this.cacheManager.get(cacheKey);
 if (cached) {
 return cached as number[];
 }

 try {
 const embeddings = await this.generateEmbeddings([text]);
 const embedding = embeddings[0];

 // Cache the result
 await this.cacheManager.set(cacheKey, embedding);

 return embedding;
 } catch (error) {
 logger.error('Failed to generate embedding', error);
 return new Array(this.dimension).fill(0);
 }
 }

 /**
 * Generate embeddings for multiple texts (batch)
 */
 async generateEmbeddings(texts: string[], batchSize = 32): Promise<number[][]> {
 if (!this.isServerAvailable) {
 logger.warn('Embedding server not available, returning zero vectors');
 return texts.map(() => new Array(this.dimension).fill(0));
 }

 try {
 const request: EmbeddingRequest = {
 texts,
 batch_size: batchSize
 };

 const response = await this.client.post<EmbeddingResponse>('/embed', request);
 return response.data.embeddings;
 } catch (error) {
 logger.error('Failed to generate embeddings', error);
 return texts.map(() => new Array(this.dimension).fill(0));
 }
 }

 /**
 * Generate embedding with metadata
 */
 async generateEmbeddingWithMetadata(
 text: string,
 metadata: Partial<EmbeddingMetadata>
 ): Promise<Embedding> {
 const vector = await this.generateEmbedding(text);

 return {
 id: this.generateId(),
 vector,
 metadata: {
 text,
 source: metadata.source || 'unknown',
 language: metadata.language || 'unknown',
 type: metadata.type || 'code',
 timestamp: Date.now(),
 ...metadata
 }
 };
 }

 /**
 * Check if server is available
 */
 isAvailable(): boolean {
 return this.isServerAvailable;
 }

 /**
 * Get model information
 */
 getModelInfo(): { name: string; dimension: number } {
 return {
 name: this.modelName,
 dimension: this.dimension
 };
 }

 /**
 * Generate a simple hash for text (for caching)
 */
 private hashText(text: string): string {
 let hash = 0;
 for (let i = 0; i < text.length; i++) {
 const char = text.charCodeAt(i);
 hash = ((hash << 5) - hash) + char;
 hash = hash & hash; // Convert to 32bit integer
 }
 return hash.toString(36);
 }

 /**
 * Generate unique ID for embedding
 */
 private generateId(): string {
 return `emb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 }

 /**
 * Clean up resources
 */
 async dispose(): Promise<void> {
 logger.info('Disposing EmbeddingManager');
 this.isServerAvailable = false;
 }
}

