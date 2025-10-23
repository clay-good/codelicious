/**
 * Ollama Adapter - Local AI model integration via Ollama
 *
 * Supports running models locally including:
 * - Llama 3 (8B, 70B)
 * - Mistral (7B)
 * - CodeLlama (7B, 13B, 34B)
 * - Phi-3 (3.8B)
 * - Gemma (2B, 7B)
 *
 * Benefits:
 * - 100% free (no API costs)
 * - Complete privacy (runs locally)
 * - No internet required
 * - Fast responses (local inference)
 */

import axios, { AxiosInstance } from 'axios';
import { BaseModelAdapter, AdapterConfig, ModelCapabilities, StreamChunk } from '../baseAdapter';
import { ModelRequest, ModelResponse, ModelProvider, Message } from '../../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('OllamaAdapter');

interface OllamaMessage {
 role: 'system' | 'user' | 'assistant';
 content: string;
}

interface OllamaRequest {
 model: string;
 messages: OllamaMessage[];
 stream?: boolean;
 options?: {
 temperature?: number;
 num_predict?: number;
 top_p?: number;
 top_k?: number;
 };
}

interface OllamaResponse {
 model: string;
 created_at: string;
 message: {
 role: string;
 content: string;
 };
 done: boolean;
 total_duration?: number;
 load_duration?: number;
 prompt_eval_count?: number;
 eval_count?: number;
}

interface OllamaModel {
 name: string;
 modified_at: string;
 size: number;
 digest: string;
}

export class OllamaAdapter extends BaseModelAdapter {
 private client: AxiosInstance;
 private readonly DEFAULT_BASE_URL = 'http://localhost:11434';

 // Model configurations
 private readonly MODELS: Record<string, ModelCapabilities> = {
 'llama3:8b': {
 maxTokens: 4096,
 contextWindow: 8192,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0, // Free!
 costPerOutputToken: 0 // Free!
 },
 'llama3:70b': {
 maxTokens: 4096,
 contextWindow: 8192,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 },
 'mistral:7b': {
 maxTokens: 4096,
 contextWindow: 8192,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 },
 'codellama:7b': {
 maxTokens: 4096,
 contextWindow: 16384,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 },
 'codellama:13b': {
 maxTokens: 4096,
 contextWindow: 16384,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 },
 'codellama:34b': {
 maxTokens: 4096,
 contextWindow: 16384,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 },
 'phi3:3.8b': {
 maxTokens: 4096,
 contextWindow: 4096,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 },
 'gemma:2b': {
 maxTokens: 2048,
 contextWindow: 8192,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 },
 'gemma:7b': {
 maxTokens: 4096,
 contextWindow: 8192,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 }
 };

 constructor(config: Partial<AdapterConfig> = {}) {
 // Ollama doesn't require an API key
 super({
 apiKey: 'local',
 baseURL: config.baseURL || 'http://localhost:11434',
 timeout: config.timeout || 120000, // 2 minutes for local inference
 maxRetries: config.maxRetries || 2,
 retryDelay: config.retryDelay || 500
 });

 this.client = axios.create({
 baseURL: this.config.baseURL,
 timeout: this.config.timeout,
 headers: {
 'Content-Type': 'application/json'
 }
 });
 }

 getProvider(): ModelProvider {
 return ModelProvider.LOCAL;
 }

 getCapabilities(model: string): ModelCapabilities {
 // Try exact match first
 if (this.MODELS[model]) {
 return this.MODELS[model];
 }

 // Try to match by model family (e.g., "llama3" matches "llama3:8b")
 const modelFamily = model.split(':')[0];
 const familyMatch = Object.keys(this.MODELS).find(key => key.startsWith(modelFamily));

 if (familyMatch) {
 return this.MODELS[familyMatch];
 }

 // Default capabilities for unknown models
 return {
 maxTokens: 4096,
 contextWindow: 8192,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0,
 costPerOutputToken: 0
 };
 }

 async sendRequest(request: ModelRequest): Promise<ModelResponse> {
 const startTime = Date.now();

 try {
 const ollamaRequest: OllamaRequest = {
 model: request.model || 'llama3:8b',
 messages: this.convertMessages(request.messages),
 stream: false,
 options: {
 temperature: request.temperature,
 num_predict: request.maxTokens
 }
 };

 const response = await this.client.post<OllamaResponse>('/api/chat', ollamaRequest);
 const data = response.data;

 const modelResponse: ModelResponse = {
 content: data.message.content,
 model: data.model,
 usage: {
 promptTokens: data.prompt_eval_count || 0,
 completionTokens: data.eval_count || 0,
 totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
 },
 cost: 0, // Always free!
 latency: Date.now() - startTime
 };

 this.updateStats(modelResponse);
 return modelResponse;

 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 logger.error('Ollama request failed', error);
 throw new Error(`Ollama request failed: ${errorMessage}`);
 }
 }

 async sendStreamingRequest(
 request: ModelRequest,
 onChunk: (chunk: StreamChunk) => void
 ): Promise<ModelResponse> {
 const startTime = Date.now();
 let fullContent = '';
 let promptTokens = 0;
 let completionTokens = 0;

 try {
 const ollamaRequest: OllamaRequest = {
 model: request.model || 'llama3:8b',
 messages: this.convertMessages(request.messages),
 stream: true,
 options: {
 temperature: request.temperature,
 num_predict: request.maxTokens
 }
 };

 const response = await this.client.post('/api/chat', ollamaRequest, {
 responseType: 'stream'
 });

 return new Promise((resolve, reject) => {
 response.data.on('data', (chunk: Buffer) => {
 const lines = chunk.toString().split('\n').filter(line => line.trim());

 for (const line of lines) {
 try {
 const data: OllamaResponse = JSON.parse(line);

 if (data.message?.content) {
 fullContent += data.message.content;
 onChunk({
 content: data.message.content,
 done: data.done
 });
 }

 if (data.done) {
 promptTokens = data.prompt_eval_count || 0;
 completionTokens = data.eval_count || 0;

 const modelResponse: ModelResponse = {
 content: fullContent,
 model: data.model,
 usage: {
 promptTokens,
 completionTokens,
 totalTokens: promptTokens + completionTokens
 },
 cost: 0,
 latency: Date.now() - startTime
 };

 this.updateStats(modelResponse);
 resolve(modelResponse);
 }
 } catch (parseError) {
 // Skip invalid JSON lines
 continue;
 }
 }
 });

 response.data.on('error', (error: Error) => {
 reject(new Error(`Ollama streaming failed: ${error.message}`));
 });
 });

 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 logger.error('Ollama streaming request failed', error);
 throw new Error(`Ollama streaming failed: ${errorMessage}`);
 }
 }

 async validateApiKey(): Promise<boolean> {
 // Ollama doesn't use API keys, just check if server is running
 return this.isAvailable();
 }

 async isAvailable(): Promise<boolean> {
 try {
 const response = await this.client.get('/api/tags', {
 timeout: 5000
 });
 return response.status === 200;
 } catch (error) {
 return false;
 }
 }

 async listModels(): Promise<string[]> {
 try {
 const response = await this.client.get<{ models: OllamaModel[] }>('/api/tags');
 return response.data.models.map(model => model.name);
 } catch (error: unknown) {
 logger.error('Failed to list Ollama models', error);
 return [];
 }
 }

 /**
 * Pull a model from Ollama registry
 */
 async pullModel(modelName: string): Promise<boolean> {
 try {
 logger.info(`Pulling Ollama model: ${modelName}...`);
 await this.client.post('/api/pull', { name: modelName });
 logger.info(`Model ${modelName} pulled successfully`);
 return true;
 } catch (error: unknown) {
 logger.error(`Failed to pull model ${modelName}`, error);
 return false;
 }
 }

 /**
 * Delete a model from local storage
 */
 async deleteModel(modelName: string): Promise<boolean> {
 try {
 await this.client.delete('/api/delete', { data: { name: modelName } });
 logger.info(`Model ${modelName} deleted successfully`);
 return true;
 } catch (error: unknown) {
 logger.error(`Failed to delete model ${modelName}`, error);
 return false;
 }
 }

 /**
 * Get model information
 */
 async getModelInfo(modelName: string): Promise<unknown> {
 try {
 const response = await this.client.post('/api/show', { name: modelName });
 return response.data;
 } catch (error: unknown) {
 logger.error(`Failed to get model info for ${modelName}`, error);
 return null;
 }
 }

 /**
 * Convert messages to Ollama format
 */
 private convertMessages(messages: Message[]): OllamaMessage[] {
 return messages.map(msg => ({
 role: msg.role as 'system' | 'user' | 'assistant',
 content: msg.content
 }));
 }

 /**
 * Get statistics
 */
 getStats(): {
 requestCount: number;
 totalCost: number;
 totalTokens: number;
 averageCost: number;
 averageTokens: number;
 } {
 return {
 requestCount: this.requestCount,
 totalCost: this.totalCost, // Always 0 for Ollama
 totalTokens: this.totalTokens,
 averageCost: 0, // Always 0 for Ollama
 averageTokens: this.requestCount > 0 ? this.totalTokens / this.requestCount : 0
 };
 }
}

