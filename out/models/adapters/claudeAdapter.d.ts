/**
 * Claude Adapter - Anthropic Claude API integration
 *
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, and Claude 3 Haiku
 */
import { BaseModelAdapter, AdapterConfig, ModelCapabilities, StreamChunk } from '../baseAdapter';
import { ModelRequest, ModelResponse, ModelProvider } from '../../types';
export declare class ClaudeAdapter extends BaseModelAdapter {
    private client;
    private readonly API_VERSION;
    private readonly MODELS;
    constructor(config: AdapterConfig);
    getProvider(): ModelProvider;
    getCapabilities(model: string): ModelCapabilities;
    validateApiKey(): Promise<boolean>;
    listModels(): Promise<string[]>;
    sendRequest(request: ModelRequest): Promise<ModelResponse>;
    sendStreamingRequest(request: ModelRequest, onChunk: (chunk: StreamChunk) => void): Promise<ModelResponse>;
    /**
    * Convert standard messages to Claude format
    * Claude requires system messages to be separate
    */
    private convertMessages;
    /**
    * Parse Server-Sent Events stream
    */
    private parseSSE;
}
//# sourceMappingURL=claudeAdapter.d.ts.map