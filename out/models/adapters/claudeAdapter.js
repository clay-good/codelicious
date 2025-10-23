"use strict";
/**
 * Claude Adapter - Anthropic Claude API integration
 *
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, and Claude 3 Haiku
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeAdapter = void 0;
const axios_1 = __importDefault(require("axios"));
const baseAdapter_1 = require("../baseAdapter");
const types_1 = require("../../types");
const logger_1 = require("../../utils/logger");
const logger = (0, logger_1.createLogger)('ClaudeAdapter');
class ClaudeAdapter extends baseAdapter_1.BaseModelAdapter {
    constructor(config) {
        super(config);
        this.API_VERSION = '2023-06-01';
        // Model configurations
        this.MODELS = {
            'claude-3-5-sonnet-20241022': {
                maxTokens: 8192,
                contextWindow: 200000,
                supportsStreaming: true,
                supportsFunctionCalling: true,
                supportsVision: true,
                costPerInputToken: 0.000003, // $3 per million tokens
                costPerOutputToken: 0.000015 // $15 per million tokens
            },
            'claude-3-opus-20240229': {
                maxTokens: 4096,
                contextWindow: 200000,
                supportsStreaming: true,
                supportsFunctionCalling: true,
                supportsVision: true,
                costPerInputToken: 0.000015, // $15 per million tokens
                costPerOutputToken: 0.000075 // $75 per million tokens
            },
            'claude-3-sonnet-20240229': {
                maxTokens: 4096,
                contextWindow: 200000,
                supportsStreaming: true,
                supportsFunctionCalling: true,
                supportsVision: true,
                costPerInputToken: 0.000003, // $3 per million tokens
                costPerOutputToken: 0.000015 // $15 per million tokens
            },
            'claude-3-haiku-20240307': {
                maxTokens: 4096,
                contextWindow: 200000,
                supportsStreaming: true,
                supportsFunctionCalling: false,
                supportsVision: true,
                costPerInputToken: 0.00000025, // $0.25 per million tokens
                costPerOutputToken: 0.00000125 // $1.25 per million tokens
            }
        };
        this.client = axios_1.default.create({
            baseURL: config.baseURL || 'https://api.anthropic.com/v1',
            timeout: config.timeout || 60000,
            headers: {
                'x-api-key': config.apiKey,
                'anthropic-version': this.API_VERSION,
                'content-type': 'application/json'
            }
        });
    }
    getProvider() {
        return types_1.ModelProvider.CLAUDE;
    }
    getCapabilities(model) {
        // Default to Sonnet if model not found
        return this.MODELS[model] || this.MODELS['claude-3-5-sonnet-20241022'];
    }
    async validateApiKey() {
        try {
            // Try a minimal request to validate the API key
            await this.client.post('/messages', {
                model: 'claude-3-haiku-20240307',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'Hi' }]
            });
            return true;
        }
        catch (error) {
            if (error && typeof error === 'object' && 'response' in error) {
                const axiosError = error;
                if (axiosError.response?.status === 401) {
                    return false;
                }
            }
            // Other errors might be rate limits or service issues, not auth
            return true;
        }
    }
    async listModels() {
        return Object.keys(this.MODELS);
    }
    async sendRequest(request) {
        this.validateRequest(request);
        const startTime = Date.now();
        const model = request.model || 'claude-3-5-sonnet-20241022';
        return await this.retryWithBackoff(async () => {
            try {
                // Convert messages to Claude format
                const { messages, system } = this.convertMessages(request.messages);
                const claudeRequest = {
                    model,
                    messages,
                    max_tokens: request.maxTokens || 4096,
                    temperature: request.temperature ?? 0.7,
                    stream: false
                };
                if (system) {
                    claudeRequest.system = system;
                }
                const response = await this.client.post('/messages', claudeRequest);
                const data = response.data;
                // Extract text content
                const content = data.content
                    .filter(c => c.type === 'text')
                    .map(c => c.text)
                    .join('\n');
                const usage = {
                    promptTokens: data.usage.input_tokens,
                    completionTokens: data.usage.output_tokens,
                    totalTokens: data.usage.input_tokens + data.usage.output_tokens
                };
                const cost = this.calculateCost(model, usage.promptTokens, usage.completionTokens);
                const latency = Date.now() - startTime;
                const modelResponse = {
                    content,
                    model: data.model,
                    usage,
                    cost,
                    latency
                };
                this.updateStats(modelResponse);
                return modelResponse;
            }
            catch (error) {
                logger.error('Claude API error:', this.formatError(error));
                throw new Error(`Claude API error: ${this.formatError(error)}`);
            }
        });
    }
    async sendStreamingRequest(request, onChunk) {
        this.validateRequest(request);
        const startTime = Date.now();
        const model = request.model || 'claude-3-5-sonnet-20241022';
        return await this.retryWithBackoff(async () => {
            try {
                const { messages, system } = this.convertMessages(request.messages);
                const claudeRequest = {
                    model,
                    messages,
                    max_tokens: request.maxTokens || 4096,
                    temperature: request.temperature ?? 0.7,
                    stream: true
                };
                if (system) {
                    claudeRequest.system = system;
                }
                let fullContent = '';
                let inputTokens = 0;
                let outputTokens = 0;
                const response = await this.client.post('/messages', claudeRequest, {
                    responseType: 'stream'
                });
                // Process streaming response
                for await (const chunk of this.parseSSE(response.data)) {
                    const typedChunk = chunk; // Claude SSE response structure
                    if (typedChunk.type === 'content_block_delta') {
                        const text = typedChunk.delta?.text || '';
                        fullContent += text;
                        onChunk({
                            content: text,
                            done: false
                        });
                    }
                    else if (typedChunk.type === 'message_start') {
                        inputTokens = typedChunk.message?.usage?.input_tokens || 0;
                    }
                    else if (typedChunk.type === 'message_delta') {
                        outputTokens = typedChunk.usage?.output_tokens || 0;
                    }
                }
                // Send final chunk
                const usage = {
                    promptTokens: inputTokens,
                    completionTokens: outputTokens,
                    totalTokens: inputTokens + outputTokens
                };
                onChunk({
                    content: '',
                    done: true,
                    usage
                });
                const cost = this.calculateCost(model, usage.promptTokens, usage.completionTokens);
                const latency = Date.now() - startTime;
                const modelResponse = {
                    content: fullContent,
                    model,
                    usage,
                    cost,
                    latency
                };
                this.updateStats(modelResponse);
                return modelResponse;
            }
            catch (error) {
                logger.error('Claude streaming error:', this.formatError(error));
                throw new Error(`Claude streaming error: ${this.formatError(error)}`);
            }
        });
    }
    /**
    * Convert standard messages to Claude format
    * Claude requires system messages to be separate
    */
    convertMessages(messages) {
        let system;
        const claudeMessages = [];
        for (const message of messages) {
            if (message.role === 'system') {
                // Combine all system messages
                system = system ? `${system}\n\n${message.content}` : message.content;
            }
            else {
                claudeMessages.push({
                    role: message.role,
                    content: message.content
                });
            }
        }
        return { messages: claudeMessages, system };
    }
    /**
    * Parse Server-Sent Events stream
    */
    async *parseSSE(stream) {
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
                    }
                    catch (e) {
                        logger.warn('Failed to parse SSE data:', data);
                    }
                }
            }
        }
    }
}
exports.ClaudeAdapter = ClaudeAdapter;
//# sourceMappingURL=claudeAdapter.js.map