/**
 * Gemini Adapter - Google Gemini API integration
 *
 * Supports Gemini Pro, Gemini Pro Vision, and Gemini Ultra
 */
import { BaseModelAdapter, AdapterConfig, ModelCapabilities, StreamChunk } from '../baseAdapter';
import { ModelRequest, ModelResponse, ModelProvider } from '../../types';
export declare class GeminiAdapter extends BaseModelAdapter {
    private client;
    private readonly MODELS;
    constructor(config: AdapterConfig);
    getProvider(): ModelProvider;
    getCapabilities(model: string): ModelCapabilities;
    validateApiKey(): Promise<boolean>;
    listModels(): Promise<string[]>;
    sendRequest(request: ModelRequest): Promise<ModelResponse>;
    sendStreamingRequest(request: ModelRequest, onChunk: (chunk: StreamChunk) => void): Promise<ModelResponse>;
    /**
    * Convert standard messages to Gemini format
    */
    private convertToGeminiFormat;
    /**
    * Parse streaming response
    */
    private parseStreamingResponse;
}
//# sourceMappingURL=geminiAdapter.d.ts.map