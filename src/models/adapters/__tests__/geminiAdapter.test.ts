import { GeminiAdapter } from '../geminiAdapter';
import { ModelProvider } from '../../../types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GeminiAdapter', () => {
 let adapter: GeminiAdapter;
 let mockAxiosInstance: any;
 const mockApiKey = 'test-gemini-key-123';

 beforeEach(() => {
 // Create mock axios instance
 mockAxiosInstance = {
 get: jest.fn(),
 post: jest.fn()
 };

 mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

 adapter = new GeminiAdapter({ apiKey: mockApiKey });
 });

 afterEach(() => {
 jest.clearAllMocks();
 });

 describe('initialization', () => {
 it('should create adapter with API key', () => {
 expect(adapter).toBeDefined();
 expect(adapter.getProvider()).toBe(ModelProvider.GEMINI);
 });

 it('should create adapter with custom base URL', () => {
 const customAdapter = new GeminiAdapter({
 apiKey: mockApiKey,
 baseURL: 'https://custom-api.google.com/v1'
 });
 expect(customAdapter).toBeDefined();
 });

 it('should create adapter with custom timeout', () => {
 const customAdapter = new GeminiAdapter({
 apiKey: mockApiKey,
 timeout: 30000
 });
 expect(customAdapter).toBeDefined();
 });
 });

 describe('getProvider', () => {
 it('should return GEMINI provider', () => {
 expect(adapter.getProvider()).toBe(ModelProvider.GEMINI);
 });
 });

 describe('getCapabilities', () => {
 it('should return capabilities for gemini-1.5-pro', () => {
 const caps = adapter.getCapabilities('gemini-1.5-pro');

 expect(caps.maxTokens).toBe(8192);
 expect(caps.contextWindow).toBe(2000000);
 expect(caps.supportsStreaming).toBe(true);
 expect(caps.supportsFunctionCalling).toBe(true);
 expect(caps.supportsVision).toBe(true);
 expect(caps.costPerInputToken).toBe(0.00000125);
 expect(caps.costPerOutputToken).toBe(0.000005);
 });

 it('should return capabilities for gemini-1.5-flash', () => {
 const caps = adapter.getCapabilities('gemini-1.5-flash');

 expect(caps.maxTokens).toBe(8192);
 expect(caps.contextWindow).toBe(1000000);
 expect(caps.costPerInputToken).toBe(0.000000075);
 expect(caps.costPerOutputToken).toBe(0.0000003);
 });

 it('should return capabilities for gemini-pro', () => {
 const caps = adapter.getCapabilities('gemini-pro');

 expect(caps.maxTokens).toBe(8192);
 expect(caps.contextWindow).toBe(32760);
 expect(caps.costPerInputToken).toBe(0.0000005);
 expect(caps.costPerOutputToken).toBe(0.0000015);
 });

 it('should return capabilities for gemini-pro-vision', () => {
 const caps = adapter.getCapabilities('gemini-pro-vision');

 expect(caps.maxTokens).toBe(4096);
 expect(caps.contextWindow).toBe(16384);
 expect(caps.supportsVision).toBe(true);
 expect(caps.costPerInputToken).toBe(0.00000025);
 expect(caps.costPerOutputToken).toBe(0.00000125);
 });

 it('should return default capabilities for unknown model', () => {
 const caps = adapter.getCapabilities('unknown-model');

 expect(caps.maxTokens).toBe(8192);
 expect(caps.contextWindow).toBe(2000000);
 expect(caps.supportsStreaming).toBe(true);
 });

 it('should have non-zero costs for all models', () => {
 const models = [
 'gemini-1.5-pro',
 'gemini-1.5-flash',
 'gemini-pro',
 'gemini-pro-vision'
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
 candidates: [
 {
 content: {
 parts: [{ text: 'Hello! How can I help you?' }],
 role: 'model'
 },
 finishReason: 'STOP'
 }
 ],
 usageMetadata: {
 promptTokenCount: 10,
 candidatesTokenCount: 20,
 totalTokenCount: 30
 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 const response = await adapter.sendRequest({
 messages: [
 { role: 'user', content: 'Hello' }
 ],
 model: 'gemini-1.5-pro'
 });

 expect(response.content).toBe('Hello! How can I help you?');
 expect(response.model).toBe('gemini-1.5-pro');
 expect(response.usage.promptTokens).toBe(10);
 expect(response.usage.completionTokens).toBe(20);
 expect(response.usage.totalTokens).toBe(30);
 expect(response.cost).toBeGreaterThan(0);
 });

 it('should handle request with temperature', async () => {
 const mockResponse = {
 data: {
 candidates: [
 {
 content: {
 parts: [{ text: 'Response' }],
 role: 'model'
 },
 finishReason: 'STOP'
 }
 ],
 usageMetadata: {
 promptTokenCount: 5,
 candidatesTokenCount: 10,
 totalTokenCount: 15
 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 await adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'gemini-1.5-pro',
 temperature: 0.7
 });

 expect(mockAxiosInstance.post).toHaveBeenCalledWith(
 expect.stringContaining('gemini-1.5-pro'),
 expect.objectContaining({
 generationConfig: expect.objectContaining({
 temperature: 0.7
 })
 })
 );
 });

 it('should handle request with max tokens', async () => {
 const mockResponse = {
 data: {
 candidates: [
 {
 content: {
 parts: [{ text: 'Response' }],
 role: 'model'
 },
 finishReason: 'STOP'
 }
 ],
 usageMetadata: {
 promptTokenCount: 5,
 candidatesTokenCount: 10,
 totalTokenCount: 15
 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 await adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'gemini-1.5-pro',
 maxTokens: 1000
 });

 expect(mockAxiosInstance.post).toHaveBeenCalledWith(
 expect.stringContaining('gemini-1.5-pro'),
 expect.objectContaining({
 generationConfig: expect.objectContaining({
 maxOutputTokens: 1000
 })
 })
 );
 });

 it('should handle system message', async () => {
 const mockResponse = {
 data: {
 candidates: [
 {
 content: {
 parts: [{ text: 'Response' }],
 role: 'model'
 },
 finishReason: 'STOP'
 }
 ],
 usageMetadata: {
 promptTokenCount: 15,
 candidatesTokenCount: 10,
 totalTokenCount: 25
 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 await adapter.sendRequest({
 messages: [
 { role: 'system', content: 'You are a helpful assistant' },
 { role: 'user', content: 'Hello' }
 ],
 model: 'gemini-1.5-pro'
 });

 expect(mockAxiosInstance.post).toHaveBeenCalled();
 });

 it('should handle API errors', async () => {
 mockAxiosInstance.post.mockRejectedValue(new Error('API Error'));

 await expect(
 adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'gemini-1.5-pro'
 })
 ).rejects.toThrow('API Error');
 });

 it('should calculate cost correctly', async () => {
 const mockResponse = {
 data: {
 candidates: [
 {
 content: {
 parts: [{ text: 'Response' }],
 role: 'model'
 },
 finishReason: 'STOP'
 }
 ],
 usageMetadata: {
 promptTokenCount: 1000,
 candidatesTokenCount: 500,
 totalTokenCount: 1500
 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 const response = await adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'gemini-1.5-pro'
 });

 // Cost = (1000 * 0.00000125) + (500 * 0.000005) = 0.00125 + 0.0025 = 0.00375
 expect(response.cost).toBeCloseTo(0.00375, 5);
 });

 it('should handle missing usage metadata', async () => {
 const mockResponse = {
 data: {
 candidates: [
 {
 content: {
 parts: [{ text: 'Response' }],
 role: 'model'
 },
 finishReason: 'STOP'
 }
 ]
 // No usageMetadata
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 const response = await adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'gemini-1.5-pro'
 });

 expect(response.content).toBe('Response');
 // When usage metadata is missing, tokens are estimated
 expect(response.usage.promptTokens).toBeGreaterThan(0);
 expect(response.usage.completionTokens).toBeGreaterThan(0);
 expect(response.usage.totalTokens).toBeGreaterThan(0);
 });
 });

 describe('validateApiKey', () => {
 it('should validate API key successfully', async () => {
 mockAxiosInstance.post.mockResolvedValue({ data: { candidates: [] } });

 const isValid = await adapter.validateApiKey();
 expect(isValid).toBe(true);
 });

 it('should return false for invalid API key', async () => {
 const error = new Error('Invalid API key');
 (error as any).response = { status: 401 };
 mockAxiosInstance.post.mockRejectedValue(error);

 const isValid = await adapter.validateApiKey();
 expect(isValid).toBe(false);
 });

 it('should return true for non-auth errors', async () => {
 const error = new Error('Rate limit');
 (error as any).response = { status: 429 };
 mockAxiosInstance.post.mockRejectedValue(error);

 const isValid = await adapter.validateApiKey();
 expect(isValid).toBe(true);
 });
 });

 describe('listModels', () => {
 it('should return list of available models', async () => {
 const models = await adapter.listModels();

 expect(models).toContain('gemini-1.5-pro');
 expect(models).toContain('gemini-1.5-flash');
 expect(models).toContain('gemini-pro');
 expect(models).toContain('gemini-pro-vision');
 expect(models.length).toBe(4);
 });
 });
});

