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
    costPerInputToken: number;
    costPerOutputToken: number;
}
export declare abstract class BaseModelAdapter {
    protected config: AdapterConfig;
    protected requestCount: number;
    protected totalCost: number;
    protected totalTokens: number;
    constructor(config: AdapterConfig);
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
    abstract sendStreamingRequest(request: ModelRequest, onChunk: (chunk: StreamChunk) => void): Promise<ModelResponse>;
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
    protected calculateCost(model: string, promptTokens: number, completionTokens: number): number;
    /**
    * Update statistics
    */
    protected updateStats(response: ModelResponse): void;
    /**
    * Get statistics
    */
    getStats(): {
        requestCount: number;
        totalCost: number;
        totalTokens: number;
        averageCost: number;
        averageTokens: number;
    };
    /**
    * Reset statistics
    */
    resetStats(): void;
    /**
    * Retry logic with exponential backoff
    */
    protected retryWithBackoff<T>(fn: () => Promise<T>, retries?: number): Promise<T>;
    /**
    * Check if error should not be retried
    */
    protected shouldNotRetry(error: unknown): boolean;
    /**
    * Sleep utility
    */
    protected sleep(ms: number): Promise<void>;
    /**
    * Estimate token count (rough approximation)
    */
    protected estimateTokens(text: string): number;
    /**
    * Validate request
    */
    protected validateRequest(request: ModelRequest): void;
    /**
    * Format error message
    */
    protected formatError(error: unknown): string;
    /**
    * Check if model is available
    */
    isAvailable(): Promise<boolean>;
    /**
    * Get provider name
    */
    getProviderName(): string;
}
//# sourceMappingURL=baseAdapter.d.ts.map