/**
 * Gemini Adapter - Google Gemini API integration
 *
 * Supports Gemini Pro, Gemini Pro Vision, and Gemini Ultra
 */

import axios, { AxiosInstance } from 'axios';
import { BaseModelAdapter, AdapterConfig, ModelCapabilities, StreamChunk } from '../baseAdapter';
import { ModelRequest, ModelResponse, ModelProvider, Message } from '../../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger('GeminiAdapter');

interface GeminiContent {
 role: string;
 parts: Array<{ text: string }>;
}

interface GeminiRequest {
 contents: GeminiContent[];
 generationConfig?: {
 temperature?: number;
 maxOutputTokens?: number;
 };
}

interface GeminiResponse {
 candidates: Array<{
 content: {
 parts: Array<{ text: string }>;
 role: string;
 };
 finishReason: string;
 }>;
 usageMetadata?: {
 promptTokenCount: number;
 candidatesTokenCount: number;
 totalTokenCount: number;
 };
}

export class GeminiAdapter extends BaseModelAdapter {
 private client: AxiosInstance;

 // Model configurations
 private readonly MODELS: Record<string, ModelCapabilities> = {
 'gemini-1.5-pro': {
 maxTokens: 8192,
 contextWindow: 2000000, // 2M tokens!
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: true,
 costPerInputToken: 0.00000125, // $1.25 per million tokens (up to 128k)
 costPerOutputToken: 0.000005 // $5 per million tokens
 },
 'gemini-1.5-flash': {
 maxTokens: 8192,
 contextWindow: 1000000, // 1M tokens
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: true,
 costPerInputToken: 0.000000075, // $0.075 per million tokens (up to 128k)
 costPerOutputToken: 0.0000003 // $0.30 per million tokens
 },
 'gemini-pro': {
 maxTokens: 8192,
 contextWindow: 32760,
 supportsStreaming: true,
 supportsFunctionCalling: true,
 supportsVision: false,
 costPerInputToken: 0.0000005,
 costPerOutputToken: 0.0000015
 },
 'gemini-pro-vision': {
 maxTokens: 4096,
 contextWindow: 16384,
 supportsStreaming: true,
 supportsFunctionCalling: false,
 supportsVision: true,
 costPerInputToken: 0.00000025,
 costPerOutputToken: 0.00000125
 }
 };

 constructor(config: AdapterConfig) {
 super(config);

 this.client = axios.create({
 baseURL: config.baseURL || 'https://generativelanguage.googleapis.com/v1beta',
 timeout: config.timeout || 60000,
 headers: {
 'Content-Type': 'application/json'
 }
 });
 }

 getProvider(): ModelProvider {
 return ModelProvider.GEMINI;
 }

 getCapabilities(model: string): ModelCapabilities {
 // Default to Gemini 1.5 Pro if model not found
 return this.MODELS[model] || this.MODELS['gemini-1.5-pro'];
 }

 async validateApiKey(): Promise<boolean> {
 try {
 // Try a minimal request to validate the API key
 await this.client.post(
 `/models/gemini-pro:generateContent?key=${this.config.apiKey}`,
 {
 contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
 generationConfig: { maxOutputTokens: 1 }
 }
 );
 return true;
 } catch (error: unknown) {
 if (error && typeof error === 'object' && 'response' in error) {
 const axiosError = error as { response?: { status?: number } };
 if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
 return false;
 }
 }
 return true;
 }
 }

 async listModels(): Promise<string[]> {
 return Object.keys(this.MODELS);
 }

 async sendRequest(request: ModelRequest): Promise<ModelResponse> {
 this.validateRequest(request);

 const startTime = Date.now();
 const model = request.model || 'gemini-1.5-pro';

 return await this.retryWithBackoff(async () => {
 try {
 const geminiRequest = this.convertToGeminiFormat(request);

 const response = await this.client.post<GeminiResponse>(
 `/models/${model}:generateContent?key=${this.config.apiKey}`,
 geminiRequest
 );

 const data = response.data;

 if (!data.candidates || data.candidates.length === 0) {
 throw new Error('No response from Gemini');
 }

 const content = data.candidates[0].content.parts
 .map(part => part.text)
 .join('\n');

 // Gemini provides token counts in usageMetadata
 const usage = {
 promptTokens: data.usageMetadata?.promptTokenCount || this.estimateTokens(
 request.messages.map(m => m.content).join('\n')
 ),
 completionTokens: data.usageMetadata?.candidatesTokenCount || this.estimateTokens(content),
 totalTokens: data.usageMetadata?.totalTokenCount || 0
 };

 if (usage.totalTokens === 0) {
 usage.totalTokens = usage.promptTokens + usage.completionTokens;
 }

 const cost = this.calculateCost(model, usage.promptTokens, usage.completionTokens);
 const latency = Date.now() - startTime;

 const modelResponse: ModelResponse = {
 content,
 model,
 usage,
 cost,
 latency
 };

 this.updateStats(modelResponse);
 return modelResponse;

 } catch (error: unknown) {
 logger.error('Gemini API error:', this.formatError(error));
 throw new Error(`Gemini API error: ${this.formatError(error)}`);
 }
 });
 }

 async sendStreamingRequest(
 request: ModelRequest,
 onChunk: (chunk: StreamChunk) => void
 ): Promise<ModelResponse> {
 this.validateRequest(request);

 const startTime = Date.now();
 const model = request.model || 'gemini-1.5-pro';

 return await this.retryWithBackoff(async () => {
 try {
 const geminiRequest = this.convertToGeminiFormat(request);

 let fullContent = '';
 let promptTokens = 0;
 let completionTokens = 0;

 const response = await this.client.post(
 `/models/${model}:streamGenerateContent?key=${this.config.apiKey}`,
 geminiRequest,
 { responseType: 'stream' }
 );

 // Process streaming response
 for await (const chunk of this.parseStreamingResponse(response.data)) {
 const typedChunk = chunk as any; // Gemini streaming response structure
 if (typedChunk.candidates && typedChunk.candidates.length > 0) {
 const text = typedChunk.candidates[0].content.parts
 .map((part: { text?: string }) => part.text)
 .join('');

 if (text) {
 fullContent += text;
 onChunk({
 content: text,
 done: false
 });
 }

 // Update token counts if available
 if (typedChunk.usageMetadata) {
 promptTokens = typedChunk.usageMetadata.promptTokenCount;
 completionTokens = typedChunk.usageMetadata.candidatesTokenCount;
 }
 }
 }

 // Estimate tokens if not provided
 if (promptTokens === 0) {
 promptTokens = this.estimateTokens(request.messages.map(m => m.content).join('\n'));
 }
 if (completionTokens === 0) {
 completionTokens = this.estimateTokens(fullContent);
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
 logger.error('Gemini streaming error:', this.formatError(error));
 throw new Error(`Gemini streaming error: ${this.formatError(error)}`);
 }
 });
 }

 /**
 * Convert standard messages to Gemini format
 */
 private convertToGeminiFormat(request: ModelRequest): GeminiRequest {
 const contents: GeminiContent[] = [];

 for (const message of request.messages) {
 // Gemini uses 'user' and 'model' roles instead of 'assistant'
 const role = message.role === 'assistant' ? 'model' :
 message.role === 'system' ? 'user' : message.role;

 // If it's a system message, prepend it to the content
 const text = message.role === 'system'
 ? `[System Instructions]\n${message.content}`
 : message.content;

 contents.push({
 role,
 parts: [{ text }]
 });
 }

 const geminiRequest: GeminiRequest = {
 contents,
 generationConfig: {
 temperature: request.temperature ?? 0.7,
 maxOutputTokens: request.maxTokens
 }
 };

 return geminiRequest;
 }

 /**
 * Parse streaming response
 */
 private async *parseStreamingResponse(stream: AsyncIterable<Buffer>): AsyncGenerator<unknown> {
 let buffer = '';

 for await (const chunk of stream) {
 buffer += chunk.toString();

 // Gemini returns JSON objects separated by newlines
 const lines = buffer.split('\n');
 buffer = lines.pop() || '';

 for (const line of lines) {
 if (line.trim()) {
 try {
 yield JSON.parse(line);
 } catch (e) {
 logger.warn('Failed to parse Gemini streaming data:', line);
 }
 }
 }
 }

 // Process remaining buffer
 if (buffer.trim()) {
 try {
 yield JSON.parse(buffer);
 } catch (e) {
 logger.warn('Failed to parse final Gemini data:', buffer);
 }
 }
 }
}

