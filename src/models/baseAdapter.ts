/**
 * Base Model Adapter - Abstract interface for AI providers
 *
 * This provides a unified interface that all AI provider adapters must implement.
 * It handles common functionality like rate limiting, retries, and error handling.
 */

import { ModelRequest, ModelResponse, TokenUsage, ModelProvider } from '../types';

export interface StreamChunk {
 content: string;
 done: boolean;
 usage?: TokenUsage;
}

export interface AdapterConfig {
 apiKey: string;
 baseURL?: string;
 timeout?: number;
 maxRetries?: number;
 retryDelay?: number;
}

export interface ModelCapabilities {
 maxTokens: number;
 contextWindow: number;
 supportsStreaming: boolean;
 supportsFunctionCalling: boolean;
 supportsVision: boolean;
 costPerInputToken: number; // in dollars
 costPerOutputToken: number; // in dollars
}

export abstract class BaseModelAdapter {
 protected config: AdapterConfig;
 protected requestCount: number = 0;
 protected totalCost: number = 0;
 protected totalTokens: number = 0;

 constructor(config: AdapterConfig) {
 this.config = {
 timeout: 60000,
 maxRetries: 3,
 retryDelay: 1000,
 ...config
 };
 }

 /**
 * Get the provider type
 */
 abstract getProvider(): ModelProvider;

 /**
 * Get model capabilities
 */
 abstract getCapabilities(model: string): ModelCapabilities;

 /**
 * Send a request to the AI model
 */
 abstract sendRequest(request: ModelRequest): Promise<ModelResponse>;

 /**
 * Send a streaming request to the AI model
 */
 abstract sendStreamingRequest(
 request: ModelRequest,
 onChunk: (chunk: StreamChunk) => void
 ): Promise<ModelResponse>;

 /**
 * Validate API key
 */
 abstract validateApiKey(): Promise<boolean>;

 /**
 * List available models
 */
 abstract listModels(): Promise<string[]>;

 /**
 * Calculate cost for a request
 */
 protected calculateCost(
 model: string,
 promptTokens: number,
 completionTokens: number
 ): number {
 const capabilities = this.getCapabilities(model);
 const inputCost = promptTokens * capabilities.costPerInputToken;
 const outputCost = completionTokens * capabilities.costPerOutputToken;
 return inputCost + outputCost;
 }

 /**
 * Update statistics
 */
 protected updateStats(response: ModelResponse): void {
 this.requestCount++;
 this.totalCost += response.cost;
 this.totalTokens += response.usage.totalTokens;
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
 totalCost: this.totalCost,
 totalTokens: this.totalTokens,
 averageCost: this.requestCount > 0 ? this.totalCost / this.requestCount : 0,
 averageTokens: this.requestCount > 0 ? this.totalTokens / this.requestCount : 0
 };
 }

 /**
 * Reset statistics
 */
 resetStats(): void {
 this.requestCount = 0;
 this.totalCost = 0;
 this.totalTokens = 0;
 }

 /**
 * Retry logic with exponential backoff
 */
 protected async retryWithBackoff<T>(
 fn: () => Promise<T>,
 retries: number = this.config.maxRetries || 3
 ): Promise<T> {
 let lastError: Error | undefined;

 for (let i = 0; i < retries; i++) {
 try {
 return await fn();
 } catch (error: unknown) {
 lastError = error instanceof Error ? error : new Error(String(error));

 // Don't retry on certain errors
 if (this.shouldNotRetry(error)) {
 throw error;
 }

 // Wait before retrying (exponential backoff)
 if (i < retries - 1) {
 const delay = (this.config.retryDelay || 1000) * Math.pow(2, i);
 await this.sleep(delay);
 }
 }
 }

 throw lastError || new Error('Max retries exceeded');
 }

 /**
 * Check if error should not be retried
 */
 protected shouldNotRetry(error: unknown): boolean {
 if (error && typeof error === 'object' && 'status' in error) {
 const statusError = error as { status: number };
 // Don't retry on authentication errors
 if (statusError.status === 401 || statusError.status === 403) {
 return true;
 }

 // Don't retry on invalid request errors
 if (statusError.status === 400 || statusError.status === 422) {
 return true;
 }
 }

 return false;
 }

 /**
 * Sleep utility
 */
 protected sleep(ms: number): Promise<void> {
 return new Promise(resolve => {
 const timer = setTimeout(resolve, ms);
 timer.unref(); // Allow Node.js to exit even if this timer is active
 });
 }

 /**
 * Estimate token count (rough approximation)
 */
 protected estimateTokens(text: string): number {
 // Rough estimate: 1 token ≈ 4 characters
 return Math.ceil(text.length / 4);
 }

 /**
 * Validate request
 */
 protected validateRequest(request: ModelRequest): void {
 if (!request.messages || request.messages.length === 0) {
 throw new Error('Request must contain at least one message');
 }

 for (const message of request.messages) {
 if (!message.role || !message.content) {
 throw new Error('Each message must have a role and content');
 }
 }
 }

 /**
 * Format error message
 */
 protected formatError(error: unknown): string {
 if (error && typeof error === 'object' && 'response' in error) {
 const axiosError = error as { response?: { data?: { error?: { message?: string } } } };
 if (axiosError.response?.data?.error?.message) {
 return axiosError.response.data.error.message;
 }
 }
 if (error && typeof error === 'object' && 'message' in error) {
 return (error as { message: string }).message;
 }
 return 'Unknown error occurred';
 }

 /**
 * Check if model is available
 */
 async isAvailable(): Promise<boolean> {
 try {
 return await this.validateApiKey();
 } catch {
 return false;
 }
 }

 /**
 * Get provider name
 */
 getProviderName(): string {
 return this.getProvider();
 }
}

