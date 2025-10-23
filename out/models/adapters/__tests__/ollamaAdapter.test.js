"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ollamaAdapter_1 = require("../ollamaAdapter");
const types_1 = require("../../../types");
const axios_1 = __importDefault(require("axios"));
// Mock axios
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('OllamaAdapter', () => {
    let adapter;
    let mockAxiosInstance;
    beforeEach(() => {
        // Create mock axios instance
        mockAxiosInstance = {
            get: jest.fn(),
            post: jest.fn(),
            delete: jest.fn()
        };
        mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
        adapter = new ollamaAdapter_1.OllamaAdapter();
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('initialization', () => {
        it('should create adapter with default config', () => {
            expect(adapter).toBeDefined();
            expect(adapter.getProvider()).toBe(types_1.ModelProvider.LOCAL);
        });
        it('should create adapter with custom base URL', () => {
            const customAdapter = new ollamaAdapter_1.OllamaAdapter({ baseURL: 'http://custom:11434' });
            expect(customAdapter).toBeDefined();
        });
        it('should not require API key', () => {
            // Should not throw
            expect(() => new ollamaAdapter_1.OllamaAdapter()).not.toThrow();
        });
    });
    describe('getProvider', () => {
        it('should return LOCAL provider', () => {
            expect(adapter.getProvider()).toBe(types_1.ModelProvider.LOCAL);
        });
    });
    describe('getCapabilities', () => {
        it('should return capabilities for llama3:8b', () => {
            const caps = adapter.getCapabilities('llama3:8b');
            expect(caps.maxTokens).toBe(4096);
            expect(caps.contextWindow).toBe(8192);
            expect(caps.supportsStreaming).toBe(true);
            expect(caps.costPerInputToken).toBe(0);
            expect(caps.costPerOutputToken).toBe(0);
        });
        it('should return capabilities for codellama:7b', () => {
            const caps = adapter.getCapabilities('codellama:7b');
            expect(caps.contextWindow).toBe(16384);
            expect(caps.costPerInputToken).toBe(0);
            expect(caps.costPerOutputToken).toBe(0);
        });
        it('should return default capabilities for unknown model', () => {
            const caps = adapter.getCapabilities('unknown-model');
            expect(caps.maxTokens).toBe(4096);
            expect(caps.contextWindow).toBe(8192);
            expect(caps.costPerInputToken).toBe(0);
            expect(caps.costPerOutputToken).toBe(0);
        });
        it('should match model family for partial names', () => {
            const caps = adapter.getCapabilities('llama3');
            expect(caps.contextWindow).toBe(8192);
        });
        it('should always return zero cost', () => {
            const models = ['llama3:8b', 'mistral:7b', 'codellama:13b'];
            models.forEach(model => {
                const caps = adapter.getCapabilities(model);
                expect(caps.costPerInputToken).toBe(0);
                expect(caps.costPerOutputToken).toBe(0);
            });
        });
    });
    describe('sendRequest', () => {
        it('should send request and return response', async () => {
            const mockResponse = {
                data: {
                    model: 'llama3:8b',
                    created_at: '2024-01-01T00:00:00Z',
                    message: {
                        role: 'assistant',
                        content: 'Hello! How can I help you?'
                    },
                    done: true,
                    prompt_eval_count: 10,
                    eval_count: 20
                }
            };
            mockAxiosInstance.post.mockResolvedValue(mockResponse);
            const response = await adapter.sendRequest({
                messages: [
                    { role: 'user', content: 'Hello' }
                ],
                model: 'llama3:8b'
            });
            expect(response.content).toBe('Hello! How can I help you?');
            expect(response.model).toBe('llama3:8b');
            expect(response.cost).toBe(0);
            expect(response.usage.promptTokens).toBe(10);
            expect(response.usage.completionTokens).toBe(20);
            expect(response.usage.totalTokens).toBe(30);
        });
        it('should handle request with temperature', async () => {
            const mockResponse = {
                data: {
                    model: 'llama3:8b',
                    created_at: '2024-01-01T00:00:00Z',
                    message: {
                        role: 'assistant',
                        content: 'Response'
                    },
                    done: true,
                    prompt_eval_count: 5,
                    eval_count: 10
                }
            };
            mockAxiosInstance.post.mockResolvedValue(mockResponse);
            await adapter.sendRequest({
                messages: [{ role: 'user', content: 'Test' }],
                model: 'llama3:8b',
                temperature: 0.7
            });
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
                options: expect.objectContaining({
                    temperature: 0.7
                })
            }));
        });
        it('should handle request errors', async () => {
            mockAxiosInstance.post.mockRejectedValue(new Error('Connection failed'));
            await expect(adapter.sendRequest({
                messages: [{ role: 'user', content: 'Test' }],
                model: 'llama3:8b'
            })).rejects.toThrow('Ollama request failed');
        });
        it('should use default model if not specified', async () => {
            const mockResponse = {
                data: {
                    model: 'llama3:8b',
                    created_at: '2024-01-01T00:00:00Z',
                    message: {
                        role: 'assistant',
                        content: 'Response'
                    },
                    done: true
                }
            };
            mockAxiosInstance.post.mockResolvedValue(mockResponse);
            await adapter.sendRequest({
                messages: [{ role: 'user', content: 'Test' }]
            });
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
                model: 'llama3:8b'
            }));
        });
    });
    describe('isAvailable', () => {
        it('should return true when Ollama is running', async () => {
            mockAxiosInstance.get.mockResolvedValue({ status: 200 });
            const available = await adapter.isAvailable();
            expect(available).toBe(true);
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/tags', { timeout: 5000 });
        });
        it('should return false when Ollama is not running', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));
            const available = await adapter.isAvailable();
            expect(available).toBe(false);
        });
    });
    describe('validateApiKey', () => {
        it('should validate by checking availability', async () => {
            mockAxiosInstance.get.mockResolvedValue({ status: 200 });
            const valid = await adapter.validateApiKey();
            expect(valid).toBe(true);
        });
    });
    describe('listModels', () => {
        it('should list available models', async () => {
            const mockResponse = {
                data: {
                    models: [
                        { name: 'llama3:8b', modified_at: '2024-01-01', size: 4000000000, digest: 'abc123' },
                        { name: 'mistral:7b', modified_at: '2024-01-01', size: 3500000000, digest: 'def456' }
                    ]
                }
            };
            mockAxiosInstance.get.mockResolvedValue(mockResponse);
            const models = await adapter.listModels();
            expect(models).toEqual(['llama3:8b', 'mistral:7b']);
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/tags');
        });
        it('should return empty array on error', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('Failed'));
            const models = await adapter.listModels();
            expect(models).toEqual([]);
        });
    });
    describe('pullModel', () => {
        it('should pull a model successfully', async () => {
            mockAxiosInstance.post.mockResolvedValue({ status: 200 });
            const result = await adapter.pullModel('llama3:8b');
            expect(result).toBe(true);
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/pull', { name: 'llama3:8b' });
        });
        it('should return false on error', async () => {
            mockAxiosInstance.post.mockRejectedValue(new Error('Failed'));
            const result = await adapter.pullModel('llama3:8b');
            expect(result).toBe(false);
        });
    });
    describe('deleteModel', () => {
        it('should delete a model successfully', async () => {
            mockAxiosInstance.delete.mockResolvedValue({ status: 200 });
            const result = await adapter.deleteModel('llama3:8b');
            expect(result).toBe(true);
            expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/api/delete', {
                data: { name: 'llama3:8b' }
            });
        });
        it('should return false on error', async () => {
            mockAxiosInstance.delete.mockRejectedValue(new Error('Failed'));
            const result = await adapter.deleteModel('llama3:8b');
            expect(result).toBe(false);
        });
    });
    describe('getStats', () => {
        it('should return statistics with zero cost', () => {
            const stats = adapter.getStats();
            expect(stats.requestCount).toBe(0);
            expect(stats.totalCost).toBe(0);
            expect(stats.totalTokens).toBe(0);
        });
    });
});
//# sourceMappingURL=ollamaAdapter.test.js.map