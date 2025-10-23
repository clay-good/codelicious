import { ClaudeAdapter } from '../claudeAdapter';
import { ModelProvider } from '../../../types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ClaudeAdapter', () => {
 let adapter: ClaudeAdapter;
 let mockAxiosInstance: any;
 const mockApiKey = 'test-api-key-123';

 beforeEach(() => {
 // Create mock axios instance
 mockAxiosInstance = {
 get: jest.fn(),
 post: jest.fn()
 };

 mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

 adapter = new ClaudeAdapter({ apiKey: mockApiKey });
 });

 afterEach(() => {
 jest.clearAllMocks();
 });

 describe('initialization', () => {
 it('should create adapter with API key', () => {
 expect(adapter).toBeDefined();
 expect(adapter.getProvider()).toBe(ModelProvider.CLAUDE);
 });

 it('should create adapter with custom base URL', () => {
 const customAdapter = new ClaudeAdapter({
 apiKey: mockApiKey,
 baseURL: 'https://custom-api.anthropic.com/v1'
 });
 expect(customAdapter).toBeDefined();
 });

 it('should create adapter with custom timeout', () => {
 const customAdapter = new ClaudeAdapter({
 apiKey: mockApiKey,
 timeout: 30000
 });
 expect(customAdapter).toBeDefined();
 });
 });

 describe('getProvider', () => {
 it('should return CLAUDE provider', () => {
 expect(adapter.getProvider()).toBe(ModelProvider.CLAUDE);
 });
 });

 describe('getCapabilities', () => {
 it('should return capabilities for claude-3-5-sonnet-20241022', () => {
 const caps = adapter.getCapabilities('claude-3-5-sonnet-20241022');

 expect(caps.maxTokens).toBe(8192);
 expect(caps.contextWindow).toBe(200000);
 expect(caps.supportsStreaming).toBe(true);
 expect(caps.supportsFunctionCalling).toBe(true);
 expect(caps.supportsVision).toBe(true);
 expect(caps.costPerInputToken).toBe(0.000003);
 expect(caps.costPerOutputToken).toBe(0.000015);
 });

 it('should return capabilities for claude-3-opus-20240229', () => {
 const caps = adapter.getCapabilities('claude-3-opus-20240229');

 expect(caps.maxTokens).toBe(4096);
 expect(caps.contextWindow).toBe(200000);
 expect(caps.costPerInputToken).toBe(0.000015);
 expect(caps.costPerOutputToken).toBe(0.000075);
 });

 it('should return capabilities for claude-3-haiku-20240307', () => {
 const caps = adapter.getCapabilities('claude-3-haiku-20240307');

 expect(caps.maxTokens).toBe(4096);
 expect(caps.contextWindow).toBe(200000);
 expect(caps.costPerInputToken).toBe(0.00000025);
 expect(caps.costPerOutputToken).toBe(0.00000125);
 });

 it('should return default capabilities for unknown model', () => {
 const caps = adapter.getCapabilities('unknown-model');

 expect(caps.maxTokens).toBe(8192);
 expect(caps.contextWindow).toBe(200000);
 expect(caps.supportsStreaming).toBe(true);
 });

 it('should have non-zero costs for all models', () => {
 const models = [
 'claude-3-5-sonnet-20241022',
 'claude-3-opus-20240229',
 'claude-3-sonnet-20240229',
 'claude-3-haiku-20240307'
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
 id: 'msg_123',
 type: 'message',
 role: 'assistant',
 content: [
 { type: 'text', text: 'Hello! How can I help you?' }
 ],
 model: 'claude-3-5-sonnet-20241022',
 stop_reason: 'end_turn',
 usage: {
 input_tokens: 10,
 output_tokens: 20
 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 const response = await adapter.sendRequest({
 messages: [
 { role: 'user', content: 'Hello' }
 ],
 model: 'claude-3-5-sonnet-20241022'
 });

 expect(response.content).toBe('Hello! How can I help you?');
 expect(response.model).toBe('claude-3-5-sonnet-20241022');
 expect(response.usage.promptTokens).toBe(10);
 expect(response.usage.completionTokens).toBe(20);
 expect(response.usage.totalTokens).toBe(30);
 expect(response.cost).toBeGreaterThan(0);
 });

 it('should handle request with temperature', async () => {
 const mockResponse = {
 data: {
 id: 'msg_456',
 type: 'message',
 role: 'assistant',
 content: [{ type: 'text', text: 'Response' }],
 model: 'claude-3-5-sonnet-20241022',
 stop_reason: 'end_turn',
 usage: { input_tokens: 5, output_tokens: 10 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 await adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'claude-3-5-sonnet-20241022',
 temperature: 0.7
 });

 expect(mockAxiosInstance.post).toHaveBeenCalledWith(
 '/messages',
 expect.objectContaining({
 temperature: 0.7
 })
 );
 });

 it('should handle request with max tokens', async () => {
 const mockResponse = {
 data: {
 id: 'msg_789',
 type: 'message',
 role: 'assistant',
 content: [{ type: 'text', text: 'Response' }],
 model: 'claude-3-5-sonnet-20241022',
 stop_reason: 'end_turn',
 usage: { input_tokens: 5, output_tokens: 10 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 await adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'claude-3-5-sonnet-20241022',
 maxTokens: 1000
 });

 expect(mockAxiosInstance.post).toHaveBeenCalledWith(
 '/messages',
 expect.objectContaining({
 max_tokens: 1000
 })
 );
 });

 it('should handle system message', async () => {
 const mockResponse = {
 data: {
 id: 'msg_sys',
 type: 'message',
 role: 'assistant',
 content: [{ type: 'text', text: 'Response' }],
 model: 'claude-3-5-sonnet-20241022',
 stop_reason: 'end_turn',
 usage: { input_tokens: 15, output_tokens: 10 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 await adapter.sendRequest({
 messages: [
 { role: 'system', content: 'You are a helpful assistant' },
 { role: 'user', content: 'Hello' }
 ],
 model: 'claude-3-5-sonnet-20241022'
 });

 expect(mockAxiosInstance.post).toHaveBeenCalledWith(
 '/messages',
 expect.objectContaining({
 system: 'You are a helpful assistant'
 })
 );
 });

 it('should handle API errors', async () => {
 mockAxiosInstance.post.mockRejectedValue(new Error('API Error'));

 await expect(
 adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'claude-3-5-sonnet-20241022'
 })
 ).rejects.toThrow('API Error');
 });

 it('should calculate cost correctly', async () => {
 const mockResponse = {
 data: {
 id: 'msg_cost',
 type: 'message',
 role: 'assistant',
 content: [{ type: 'text', text: 'Response' }],
 model: 'claude-3-5-sonnet-20241022',
 stop_reason: 'end_turn',
 usage: {
 input_tokens: 1000,
 output_tokens: 500
 }
 }
 };

 mockAxiosInstance.post.mockResolvedValue(mockResponse);

 const response = await adapter.sendRequest({
 messages: [{ role: 'user', content: 'Test' }],
 model: 'claude-3-5-sonnet-20241022'
 });

 // Cost = (1000 * 0.000003) + (500 * 0.000015) = 0.003 + 0.0075 = 0.0105
 expect(response.cost).toBeCloseTo(0.0105, 4);
 });
 });

 describe('validateApiKey', () => {
 it('should validate API key successfully', async () => {
 mockAxiosInstance.post.mockResolvedValue({ data: { id: 'test' } });

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

 expect(models).toContain('claude-3-5-sonnet-20241022');
 expect(models).toContain('claude-3-opus-20240229');
 expect(models).toContain('claude-3-sonnet-20240229');
 expect(models).toContain('claude-3-haiku-20240307');
 expect(models.length).toBe(4);
 });
 });
});

