/**
 * OpenAI Adapter - OpenAI API integration
 *
 * Supports GPT-4, GPT-4 Turbo, GPT-3.5 Turbo, and o1 models
 */
import { BaseModelAdapter, AdapterConfig, ModelCapabilities, StreamChunk } from '../baseAdapter';
import { ModelRequest, ModelResponse, ModelProvider } from '../../types';
export declare class OpenAIAdapter extends BaseModelAdapter {
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
    * Parse Server-Sent Events stream
    */
    private parseSSE;
}
//# sourceMappingURL=openaiAdapter.d.ts.map