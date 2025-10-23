/**
 * OpenAI Adapter - OpenAI API integration
 *
 * Supports GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, and o1 models
 */

import axios, { AxiosInstance } from 'axios';
import { BaseModelAdapter, AdapterConfig, ModelCapabilities, StreamChunk } from '../baseAdapter';
import { ModelRequest, ModelResponse, ModelProvider, Message } from '../../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('OpenAIAdapter');

interface OpenAIMessage {
 role: 'system' | 'user' | 'assistant';
 content: string;
}

interface OpenAIRequest {
 model: string;
 messages: OpenAIMessage[];
 temperature?: number;
 max_tokens?: number;
 stream?: boolean;
}

interface OpenAIResponse {
 id: string;
 object: string;
 created: number;
 model: string;
 choices: Array<{
 index: number;
 message: {
 role: string;
 content: string;
 };
 finish_reason: string;
 }>;
 usage: {
 prompt_tokens: number;
 completion_tokens: number;
 total_tokens: number;
 };
}

export class OpenAIAdapter extends BaseModelAdapter {
 private client: AxiosInstance;

 // Model configurations
 private readonly MODELS: Record<string, ModelCapabilities> = {
 'gpt-4-turbo-preview': {
 maxTokens: 4096,
 contextWindow: 128000,
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: true,
 costPerInputToken: 0.00001, // $10 per million tokens
 costPerOutputToken: 0.00003 // $30 per million tokens
 },
 'gpt-4-1106-preview': {
 maxTokens: 4096,
 contextWindow: 128000,
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: false,
 costPerInputToken: 0.00001,
 costPerOutputToken: 0.00003
 },
 'gpt-4': {
 maxTokens: 8192,
 contextWindow: 8192,
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: false,
 costPerInputToken: 0.00003, // $30 per million tokens
 costPerOutputToken: 0.00006 // $60 per million tokens
 },
 'gpt-4-32k': {
 maxTokens: 32768,
 contextWindow: 32768,
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: false,
 costPerInputToken: 0.00006,
 costPerOutputToken: 0.00012
 },
 'gpt-3.5-turbo': {
 maxTokens: 4096,
 contextWindow: 16385,
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: false,
 costPerInputToken: 0.0000005, // $0.50 per million tokens
 costPerOutputToken: 0.0000015 // $1.50 per million tokens
 },
 'gpt-3.5-turbo-16k': {
 maxTokens: 16384,
 contextWindow: 16384,
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: false,
 costPerInputToken: 0.000003,
 costPerOutputToken: 0.000004
 },
 'o1-preview': {
 maxTokens: 32768,
 contextWindow: 128000,
 supportsStreaming: false,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0.000015,
 costPerOutputToken: 0.00006
 },
 'o1-mini': {
 maxTokens: 65536,
 contextWindow: 128000,
 supportsStreaming: false,
 supportsFunctionCalling: false,
 supportsVision: false,
 costPerInputToken: 0.000003,
 costPerOutputToken: 0.000012
 }
 };

 constructor(config: AdapterConfig) {
 super(config);

 this.client = axios.create({
 baseURL: config.baseURL || 'https://api.openai.com/v1',
 timeout: config.timeout || 60000,
 headers: {
 'Authorization': `Bearer ${config.apiKey}`,
 'Content-Type': 'application/json'
 }
 });
 }

 getProvider(): ModelProvider {
 return ModelProvider.OPENAI;
 }

 getCapabilities(model: string): ModelCapabilities {
 // Default to GPT-4 Turbo if model not found
 return this.MODELS[model] || this.MODELS['gpt-4-turbo-preview'];
 }

 async validateApiKey(): Promise<boolean> {
 try {
 await this.client.get('/models');
 return true;
 } catch (error: unknown) {
 if (error && typeof error === 'object' && 'response' in error) {
 const axiosError = error as { response?: { status?: number } };
 if (axiosError.response?.status === 401) {
 return false;
 }
 }
 return true;
 }
 }

 async listModels(): Promise<string[]> {
 try {
 const response = await this.client.get('/models');
 return response.data.data
 .map((model: { id: string }) => model.id)
 .filter((id: string) => id.startsWith('gpt-'));
 } catch {
 return Object.keys(this.MODELS);
 }
 }

 async sendRequest(request: ModelRequest): Promise<ModelResponse> {
 this.validateRequest(request);

 const startTime = Date.now();
 const model = request.model || 'gpt-4-turbo-preview';

 return await this.retryWithBackoff(async () => {
 try {
 const openaiRequest: OpenAIRequest = {
 model,
 messages: request.messages as OpenAIMessage[],
 temperature: request.temperature ?? 0.7,
 max_tokens: request.maxTokens,
 stream: false
 };

 const response = await this.client.post<OpenAIResponse>('/chat/completions', openaiRequest);
 const data = response.data;

 const content = data.choices[0]?.message?.content || '';
 const usage = {
 promptTokens: data.usage.prompt_tokens,
 completionTokens: data.usage.completion_tokens,
 totalTokens: data.usage.total_tokens
 };

 const cost = this.calculateCost(model, usage.promptTokens, usage.completionTokens);
 const latency = Date.now() - startTime;

 const modelResponse: ModelResponse = {
 content,
 model: data.model,
 usage,
 cost,
 latency
 };

 this.updateStats(modelResponse);
 return modelResponse;

 } catch (error: unknown) {
 logger.error('OpenAI API error:', this.formatError(error));
 throw new Error(`OpenAI API error: ${this.formatError(error)}`);
 }
 });
 }

 async sendStreamingRequest(
 request: ModelRequest,
 onChunk: (chunk: StreamChunk) => void
 ): Promise<ModelResponse> {
 this.validateRequest(request);

 const startTime = Date.now();
 const model = request.model || 'gpt-4-turbo-preview';

 return await this.retryWithBackoff(async () => {
 try {
 const openaiRequest: OpenAIRequest = {
 model,
 messages: request.messages as OpenAIMessage[],
 temperature: request.temperature ?? 0.7,
 max_tokens: request.maxTokens,
 stream: true
 };

 let fullContent = '';
 let promptTokens = 0;
 let completionTokens = 0;

 const response = await this.client.post('/chat/completions', openaiRequest, {
 responseType: 'stream'
 });

 // Process streaming response
 for await (const chunk of this.parseSSE(response.data)) {
 const typedChunk = chunk as any; // OpenAI SSE response structure
 const delta = typedChunk.choices?.[0]?.delta;

 if (delta?.content) {
 fullContent += delta.content;
 onChunk({
 content: delta.content,
 done: false
 });
 }

 // OpenAI doesn't provide token counts in streaming mode
 // We'll estimate them
 if (typedChunk.choices?.[0]?.finish_reason === 'stop') {
 promptTokens = this.estimateTokens(request.messages.map(m => m.content).join('\n'));
 completionTokens = this.estimateTokens(fullContent);
 }
 }

 const usage = {
 promptTokens,
 completionTokens,
 totalTokens: promptTokens + completionTokens
 };

 onChunk({
 content: '',
 done: true,
 usage
 });

 const cost = this.calculateCost(model, usage.promptTokens, usage.completionTokens);
 const latency = Date.now() - startTime;

 const modelResponse: ModelResponse = {
 content: fullContent,
 model,
 usage,
 cost,
 latency
 };

 this.updateStats(modelResponse);
 return modelResponse;

 } catch (error: unknown) {
 logger.error('OpenAI streaming error:', this.formatError(error));
 throw new Error(`OpenAI streaming error: ${this.formatError(error)}`);
 }
 });
 }

 /**
 * Parse Server-Sent Events stream
 */
 private async *parseSSE(stream: AsyncIterable<Buffer>): AsyncGenerator<unknown> {
 let buffer = '';

 for await (const chunk of stream) {
 buffer += chunk.toString();
 const lines = buffer.split('\n');
 buffer = lines.pop() || '';

 for (const line of lines) {
 if (line.startsWith('data: ')) {
 const data = line.slice(6);
 if (data === '[DONE]') {
 return;
 }
 try {
 yield JSON.parse(data);
 } catch (e) {
 logger.warn('Failed to parse SSE data:', data);
 }
 }
 }
 }
 }
}

