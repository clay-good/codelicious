"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaAdapter = void 0;
const axios_1 = __importDefault(require("axios"));
const baseAdapter_1 = require("../baseAdapter");
const types_1 = require("../../types");
const logger_1 = require("../../utils/logger");
const logger = (0, logger_1.createLogger)('OllamaAdapter');
class OllamaAdapter extends baseAdapter_1.BaseModelAdapter {
    constructor(config = {}) {
        // Ollama doesn't require an API key
        super({
            apiKey: 'local',
            baseURL: config.baseURL || 'http://localhost:11434',
            timeout: config.timeout || 120000, // 2 minutes for local inference
            maxRetries: config.maxRetries || 2,
            retryDelay: config.retryDelay || 500
        });
        this.DEFAULT_BASE_URL = 'http://localhost:11434';
        // Model configurations
        this.MODELS = {
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
        this.client = axios_1.default.create({
            baseURL: this.config.baseURL,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }
    getProvider() {
        return types_1.ModelProvider.LOCAL;
    }
    getCapabilities(model) {
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
    async sendRequest(request) {
        const startTime = Date.now();
        try {
            const ollamaRequest = {
                model: request.model || 'llama3:8b',
                messages: this.convertMessages(request.messages),
                stream: false,
                options: {
                    temperature: request.temperature,
                    num_predict: request.maxTokens
                }
            };
            const response = await this.client.post('/api/chat', ollamaRequest);
            const data = response.data;
            const modelResponse = {
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
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Ollama request failed', error);
            throw new Error(`Ollama request failed: ${errorMessage}`);
        }
    }
    async sendStreamingRequest(request, onChunk) {
        const startTime = Date.now();
        let fullContent = '';
        let promptTokens = 0;
        let completionTokens = 0;
        try {
            const ollamaRequest = {
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
                response.data.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n').filter(line => line.trim());
                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
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
                                const modelResponse = {
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
                        }
                        catch (parseError) {
                            // Skip invalid JSON lines
                            continue;
                        }
                    }
                });
                response.data.on('error', (error) => {
                    reject(new Error(`Ollama streaming failed: ${error.message}`));
                });
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Ollama streaming request failed', error);
            throw new Error(`Ollama streaming failed: ${errorMessage}`);
        }
    }
    async validateApiKey() {
        // Ollama doesn't use API keys, just check if server is running
        return this.isAvailable();
    }
    async isAvailable() {
        try {
            const response = await this.client.get('/api/tags', {
                timeout: 5000
            });
            return response.status === 200;
        }
        catch (error) {
            return false;
        }
    }
    async listModels() {
        try {
            const response = await this.client.get('/api/tags');
            return response.data.models.map(model => model.name);
        }
        catch (error) {
            logger.error('Failed to list Ollama models', error);
            return [];
        }
    }
    /**
    * Pull a model from Ollama registry
    */
    async pullModel(modelName) {
        try {
            logger.info(`Pulling Ollama model: ${modelName}...`);
            await this.client.post('/api/pull', { name: modelName });
            logger.info(`Model ${modelName} pulled successfully`);
            return true;
        }
        catch (error) {
            logger.error(`Failed to pull model ${modelName}`, error);
            return false;
        }
    }
    /**
    * Delete a model from local storage
    */
    async deleteModel(modelName) {
        try {
            await this.client.delete('/api/delete', { data: { name: modelName } });
            logger.info(`Model ${modelName} deleted successfully`);
            return true;
        }
        catch (error) {
            logger.error(`Failed to delete model ${modelName}`, error);
            return false;
        }
    }
    /**
    * Get model information
    */
    async getModelInfo(modelName) {
        try {
            const response = await this.client.post('/api/show', { name: modelName });
            return response.data;
        }
        catch (error) {
            logger.error(`Failed to get model info for ${modelName}`, error);
            return null;
        }
    }
    /**
    * Convert messages to Ollama format
    */
    convertMessages(messages) {
        return messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
    }
    /**
    * Get statistics
    */
    getStats() {
        return {
            requestCount: this.requestCount,
            totalCost: this.totalCost, // Always 0 for Ollama
            totalTokens: this.totalTokens,
            averageCost: 0, // Always 0 for Ollama
            averageTokens: this.requestCount > 0 ? this.totalTokens / this.requestCount : 0
        };
    }
}
exports.OllamaAdapter = OllamaAdapter;
//# sourceMappingURL=ollamaAdapter.js.map