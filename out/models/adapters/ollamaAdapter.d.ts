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
import { BaseModelAdapter, AdapterConfig, ModelCapabilities, StreamChunk } from '../baseAdapter';
import { ModelRequest, ModelResponse, ModelProvider } from '../../types';
export declare class OllamaAdapter extends BaseModelAdapter {
    private client;
    private readonly DEFAULT_BASE_URL;
    private readonly MODELS;
    constructor(config?: Partial<AdapterConfig>);
    getProvider(): ModelProvider;
    getCapabilities(model: string): ModelCapabilities;
    sendRequest(request: ModelRequest): Promise<ModelResponse>;
    sendStreamingRequest(request: ModelRequest, onChunk: (chunk: StreamChunk) => void): Promise<ModelResponse>;
    validateApiKey(): Promise<boolean>;
    isAvailable(): Promise<boolean>;
    listModels(): Promise<string[]>;
    /**
    * Pull a model from Ollama registry
    */
    pullModel(modelName: string): Promise<boolean>;
    /**
    * Delete a model from local storage
    */
    deleteModel(modelName: string): Promise<boolean>;
    /**
    * Get model information
    */
    getModelInfo(modelName: string): Promise<unknown>;
    /**
    * Convert messages to Ollama format
    */
    private convertMessages;
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
}
//# sourceMappingURL=ollamaAdapter.d.ts.map