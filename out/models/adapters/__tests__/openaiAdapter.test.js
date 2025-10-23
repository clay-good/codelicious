"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const openaiAdapter_1 = require("../openaiAdapter");
const types_1 = require("../../../types");
const axios_1 = __importDefault(require("axios"));
// Mock axios
jest.mock('axios');
const mockedAxios = axios_1.default;
describe('OpenAIAdapter', () => {
    let adapter;
    let mockAxiosInstance;
    const mockApiKey = 'test-openai-key-123';
    beforeEach(() => {
        // Create mock axios instance
        mockAxiosInstance = {
            get: jest.fn(),
            post: jest.fn()
        };
        mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);
        adapter = new openaiAdapter_1.OpenAIAdapter({ apiKey: mockApiKey });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('initialization', () => {
        it('should create adapter with API key', () => {
            expect(adapter).toBeDefined();
            expect(adapter.getProvider()).toBe(types_1.ModelProvider.OPENAI);
        });
        it('should create adapter with custom base URL', () => {
            const customAdapter = new openaiAdapter_1.OpenAIAdapter({
                apiKey: mockApiKey,
                baseURL: 'https://custom-api.openai.com/v1'
            });
            expect(customAdapter).toBeDefined();
        });
        it('should create adapter with custom timeout', () => {
            const customAdapter = new openaiAdapter_1.OpenAIAdapter({
                apiKey: mockApiKey,
                timeout: 30000
            });
            expect(customAdapter).toBeDefined();
        });
    });
    describe('getProvider', () => {
        it('should return OPENAI provider', () => {
            expect(adapter.getProvider()).toBe(types_1.ModelProvider.OPENAI);
        });
    });
    describe('getCapabilities', () => {
        it('should return capabilities for gpt-4-turbo-preview', () => {
            const caps = adapter.getCapabilities('gpt-4-turbo-preview');
            expect(caps.maxTokens).toBe(4096);
            expect(caps.contextWindow).toBe(128000);
            expect(caps.supportsStreaming).toBe(true);
            expect(caps.supportsFunctionCalling).toBe(true);
            expect(caps.supportsVision).toBe(true);
            expect(caps.costPerInputToken).toBe(0.00001);
            expect(caps.costPerOutputToken).toBe(0.00003);
        });
        it('should return capabilities for gpt-4', () => {
            const caps = adapter.getCapabilities('gpt-4');
            expect(caps.maxTokens).toBe(8192);
            expect(caps.contextWindow).toBe(8192);
            expect(caps.costPerInputToken).toBe(0.00003);
            expect(caps.costPerOutputToken).toBe(0.00006);
        });
        it('should return capabilities for gpt-3.5-turbo', () => {
            const caps = adapter.getCapabilities('gpt-3.5-turbo');
            expect(caps.maxTokens).toBe(4096);
            expect(caps.contextWindow).toBe(16385);
            expect(caps.costPerInputToken).toBe(0.0000005);
            expect(caps.costPerOutputToken).toBe(0.0000015);
        });
        it('should return default capabilities for unknown model', () => {
            const caps = adapter.getCapabilities('unknown-model');
            expect(caps.maxTokens).toBe(4096);
            expect(caps.contextWindow).toBe(128000);
            expect(caps.supportsStreaming).toBe(true);
        });
        it('should have non-zero costs for all models', () => {
            const models = [
                'gpt-4-turbo-preview',
                'gpt-4',
                'gpt-3.5-turbo',
                'o1-preview'
            ];
            models.forEach(model => {
                const caps = adapter.getCapabilities(model);
                expect(caps.costPerInputToken).toBeGreaterThan(0);
                expect(caps.costPerOutputToken).toBeGreaterThan(0);
            });
        });
    });
    describe('sendRequest', () => {
        it('should send request and return response', async () => {
            const mockResponse = {
                data: {
                    id: 'chatcmpl-123',
                    object: 'chat.completion',
                    created: 1677652288,
                    model: 'gpt-4-turbo-preview',
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: 'Hello! How can I help you?'
                            },
                            finish_reason: 'stop'
                        }
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 20,
                        total_tokens: 30
                    }
                }
            };
            mockAxiosInstance.post.mockResolvedValue(mockResponse);
            const response = await adapter.sendRequest({
                messages: [
                    { role: 'user', content: 'Hello' }
                ],
                model: 'gpt-4-turbo-preview'
            });
            expect(response.content).toBe('Hello! How can I help you?');
            expect(response.model).toBe('gpt-4-turbo-preview');
            expect(response.usage.promptTokens).toBe(10);
            expect(response.usage.completionTokens).toBe(20);
            expect(response.usage.totalTokens).toBe(30);
            expect(response.cost).toBeGreaterThan(0);
        });
        it('should handle request with temperature', async () => {
            const mockResponse = {
                data: {
                    id: 'chatcmpl-456',
                    object: 'chat.completion',
                    created: 1677652288,
                    model: 'gpt-4-turbo-preview',
                    choices: [
                        {
                            index: 0,
                            message: { role: 'assistant', content: 'Response' },
                            finish_reason: 'stop'
                        }
                    ],
                    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
                }
            };
            mockAxiosInstance.post.mockResolvedValue(mockResponse);
            await adapter.sendRequest({
                messages: [{ role: 'user', content: 'Test' }],
                model: 'gpt-4-turbo-preview',
                temperature: 0.7
            });
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
                temperature: 0.7
            }));
        });
        it('should handle request with max tokens', async () => {
            const mockResponse = {
                data: {
                    id: 'chatcmpl-789',
                    object: 'chat.completion',
                    created: 1677652288,
                    model: 'gpt-4-turbo-preview',
                    choices: [
                        {
                            index: 0,
                            message: { role: 'assistant', content: 'Response' },
                            finish_reason: 'stop'
                        }
                    ],
                    usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
                }
            };
            mockAxiosInstance.post.mockResolvedValue(mockResponse);
            await adapter.sendRequest({
                messages: [{ role: 'user', content: 'Test' }],
                model: 'gpt-4-turbo-preview',
                maxTokens: 1000
            });
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
                max_tokens: 1000
            }));
        });
        it('should handle system message', async () => {
            const mockResponse = {
                data: {
                    id: 'chatcmpl-sys',
                    object: 'chat.completion',
                    created: 1677652288,
                    model: 'gpt-4-turbo-preview',
                    choices: [
                        {
                            index: 0,
                            message: { role: 'assistant', content: 'Response' },
                            finish_reason: 'stop'
                        }
                    ],
                    usage: { prompt_tokens: 15, completion_tokens: 10, total_tokens: 25 }
                }
            };
            mockAxiosInstance.post.mockResolvedValue(mockResponse);
            await adapter.sendRequest({
                messages: [
                    { role: 'system', content: 'You are a helpful assistant' },
                    { role: 'user', content: 'Hello' }
                ],
                model: 'gpt-4-turbo-preview'
            });
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
                messages: expect.arrayContaining([
                    expect.objectContaining({ role: 'system' })
                ])
            }));
        });
        it('should handle API errors', async () => {
            mockAxiosInstance.post.mockRejectedValue(new Error('API Error'));
            await expect(adapter.sendRequest({
                messages: [{ role: 'user', content: 'Test' }],
                model: 'gpt-4-turbo-preview'
            })).rejects.toThrow('API Error');
        });
        it('should calculate cost correctly', async () => {
            const mockResponse = {
                data: {
                    id: 'chatcmpl-cost',
                    object: 'chat.completion',
                    created: 1677652288,
                    model: 'gpt-4-turbo-preview',
                    choices: [
                        {
                            index: 0,
                            message: { role: 'assistant', content: 'Response' },
                            finish_reason: 'stop'
                        }
                    ],
                    usage: {
                        prompt_tokens: 1000,
                        completion_tokens: 500,
                        total_tokens: 1500
                    }
                }
            };
            mockAxiosInstance.post.mockResolvedValue(mockResponse);
            const response = await adapter.sendRequest({
                messages: [{ role: 'user', content: 'Test' }],
                model: 'gpt-4-turbo-preview'
            });
            // Cost = (1000 * 0.00001) + (500 * 0.00003) = 0.01 + 0.015 = 0.025
            expect(response.cost).toBeCloseTo(0.025, 4);
        });
    });
    describe('validateApiKey', () => {
        it('should validate API key successfully', async () => {
            mockAxiosInstance.get.mockResolvedValue({ data: { object: 'list' } });
            const isValid = await adapter.validateApiKey();
            expect(isValid).toBe(true);
        });
        it('should return false for invalid API key', async () => {
            const error = new Error('Invalid API key');
            error.response = { status: 401 };
            mockAxiosInstance.get.mockRejectedValue(error);
            const isValid = await adapter.validateApiKey();
            expect(isValid).toBe(false);
        });
        it('should return true for non-auth errors', async () => {
            const error = new Error('Rate limit');
            error.response = { status: 429 };
            mockAxiosInstance.get.mockRejectedValue(error);
            const isValid = await adapter.validateApiKey();
            expect(isValid).toBe(true);
        });
    });
    describe('listModels', () => {
        it('should return list of available models', async () => {
            const models = await adapter.listModels();
            expect(models).toContain('gpt-4-turbo-preview');
            expect(models).toContain('gpt-4');
            expect(models).toContain('gpt-3.5-turbo');
            expect(models).toContain('o1-preview');
            expect(models.length).toBeGreaterThan(0);
        });
    });
});
//# sourceMappingURL=openaiAdapter.test.js.map