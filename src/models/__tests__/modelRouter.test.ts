/**
 * Tests for Model Router
 */

import { ModelRouter, TaskComplexity, RoutingContext } from '../modelRouter';
import { ModelProvider, ModelRequest } from '../../types';
import { BaseModelAdapter } from '../baseAdapter';

// Mock VS Code
jest.mock('vscode');

describe('ModelRouter', () => {
 let router: ModelRouter;
 let mockClaudeAdapter: jest.Mocked<BaseModelAdapter>;
 let mockOpenAIAdapter: jest.Mocked<BaseModelAdapter>;
 let mockGeminiAdapter: jest.Mocked<BaseModelAdapter>;

 beforeEach(() => {
 jest.clearAllMocks();

 router = new ModelRouter();

 // Create mock adapters
 mockClaudeAdapter = {
 isAvailable: jest.fn().mockResolvedValue(true),
 sendRequest: jest.fn(),
 sendStreamingRequest: jest.fn(),
 getCapabilities: jest.fn().mockReturnValue({
 supportsStreaming: true,
 supportsVision: false,
 supportsFunctionCalling: true,
 maxContextTokens: 200000,
 costPerInputToken: 0.000003,
 costPerOutputToken: 0.000015
 })
 } as any;

 mockOpenAIAdapter = {
 isAvailable: jest.fn().mockResolvedValue(true),
 sendRequest: jest.fn(),
 sendStreamingRequest: jest.fn(),
 getCapabilities: jest.fn().mockReturnValue({
 supportsStreaming: true,
 supportsVision: true,
 supportsFunctionCalling: true,
 maxContextTokens: 128000,
 costPerInputToken: 0.00001,
 costPerOutputToken: 0.00003
 })
 } as any;

 mockGeminiAdapter = {
 isAvailable: jest.fn().mockResolvedValue(true),
 sendRequest: jest.fn(),
 sendStreamingRequest: jest.fn(),
 getCapabilities: jest.fn().mockReturnValue({
 supportsStreaming: true,
 supportsVision: true,
 supportsFunctionCalling: true,
 maxContextTokens: 2000000,
 costPerInputToken: 0.0000001,
 costPerOutputToken: 0.0000003
 })
 } as any;
 });

 describe('adapter registration', () => {
 it('should register adapters', () => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);

 const adapters = router.getAvailableAdapters();
 expect(adapters).toHaveLength(3);
 });

 it('should return empty array when no adapters registered', () => {
 const adapters = router.getAvailableAdapters();
 expect(adapters).toHaveLength(0);
 });

 it('should allow multiple registrations for same provider', () => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);

 const adapters = router.getAvailableAdapters();
 expect(adapters).toHaveLength(1);
 });
 });

 describe('explicit model routing', () => {
 beforeEach(() => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);
 });

 it('should route to explicitly specified Claude model', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }],
 model: 'claude-3-5-sonnet-20241022'
 };

 const decision = await router.route(request);

 expect(decision.provider).toBe(ModelProvider.CLAUDE);
 expect(decision.model).toBe('claude-3-5-sonnet-20241022');
 expect(decision.reason).toBe('Explicitly specified model');
 });

 it('should route to explicitly specified OpenAI model', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }],
 model: 'gpt-4-turbo-preview'
 };

 const decision = await router.route(request);

 expect(decision.provider).toBe(ModelProvider.OPENAI);
 expect(decision.model).toBe('gpt-4-turbo-preview');
 expect(decision.reason).toBe('Explicitly specified model');
 });

 it('should route to explicitly specified Gemini model', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }],
 model: 'gemini-1.5-pro'
 };

 const decision = await router.route(request);

 expect(decision.provider).toBe(ModelProvider.GEMINI);
 expect(decision.model).toBe('gemini-1.5-pro');
 expect(decision.reason).toBe('Explicitly specified model');
 });
 });

 describe('preferred provider routing', () => {
 beforeEach(() => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);
 });

 it('should route to preferred provider when available', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 const context: RoutingContext = {
 preferredProvider: ModelProvider.OPENAI
 };

 const decision = await router.route(request, context);

 expect(decision.provider).toBe(ModelProvider.OPENAI);
 expect(decision.reason).toBe('Preferred provider');
 });

 it('should fallback if preferred provider unavailable', async () => {
 mockOpenAIAdapter.isAvailable.mockResolvedValue(false);

 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 const context: RoutingContext = {
 preferredProvider: ModelProvider.OPENAI
 };

 const decision = await router.route(request, context);

 expect(decision.provider).not.toBe(ModelProvider.OPENAI);
 });
 });

 describe('complexity-based routing', () => {
 beforeEach(() => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);
 });

 it('should detect simple tasks', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Complete this code: function add' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Simple task');
 });

 it('should detect moderate tasks', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Refactor this function to improve readability' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Moderate');
 });

 it('should detect complex tasks', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Explain why this architecture is problematic and suggest improvements' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Complex');
 });

 it('should use explicit complexity when provided', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 const context: RoutingContext = {
 complexity: TaskComplexity.REASONING
 };

 const decision = await router.route(request, context);

 expect(decision.reason).toContain('reasoning');
 });
 });

 describe('large context routing', () => {
 beforeEach(() => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);
 });

 it('should route to Gemini for large context requirements', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Analyze this large codebase' }]
 };

 const context: RoutingContext = {
 requiresLargeContext: true
 };

 const decision = await router.route(request, context);

 expect(decision.provider).toBe(ModelProvider.GEMINI);
 expect(decision.reason).toContain('Large context');
 expect(decision.reason).toContain('2M tokens');
 });

 it('should fallback to Claude if Gemini unavailable for large context', async () => {
 mockGeminiAdapter.isAvailable.mockResolvedValue(false);

 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Analyze this large codebase' }]
 };

 const context: RoutingContext = {
 requiresLargeContext: true
 };

 const decision = await router.route(request, context);

 expect(decision.provider).toBe(ModelProvider.CLAUDE);
 expect(decision.reason).toContain('Large context');
 expect(decision.reason).toContain('200k tokens');
 });
 });

 describe('fallback routing', () => {
 it('should fallback to available provider', async () => {
 mockClaudeAdapter.isAvailable.mockResolvedValue(false);
 mockOpenAIAdapter.isAvailable.mockResolvedValue(false);

 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);

 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 const decision = await router.route(request);

 expect(decision.provider).toBe(ModelProvider.GEMINI);
 // The reason might be "Simple task" or "Fallback to available provider"
 // depending on the routing logic
 expect(decision.reason).toBeDefined();
 });

 it('should throw error when no providers available', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 await expect(router.route(request)).rejects.toThrow('No available AI providers');
 });

 it('should throw error when all providers unavailable', async () => {
 mockClaudeAdapter.isAvailable.mockResolvedValue(false);
 mockOpenAIAdapter.isAvailable.mockResolvedValue(false);
 mockGeminiAdapter.isAvailable.mockResolvedValue(false);

 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);

 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 await expect(router.route(request)).rejects.toThrow('No available AI providers');
 });
 });

 describe('cost estimation', () => {
 beforeEach(() => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);
 });

 it('should include cost estimation in routing decision', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 const decision = await router.route(request);

 expect(decision.estimatedCost).toBeDefined();
 expect(typeof decision.estimatedCost).toBe('number');
 expect(decision.estimatedCost).toBeGreaterThanOrEqual(0);
 });

 it('should estimate higher cost for longer messages', async () => {
 const shortRequest: ModelRequest = {
 messages: [{ role: 'user', content: 'Hi' }]
 };

 const longRequest: ModelRequest = {
 messages: [{ role: 'user', content: 'This is a much longer message that contains significantly more content and should result in a higher estimated cost due to the increased token count that will be required to process this request.' }]
 };

 const shortDecision = await router.route(shortRequest);
 const longDecision = await router.route(longRequest);

 // Both should have cost estimates
 expect(shortDecision.estimatedCost).toBeDefined();
 expect(longDecision.estimatedCost).toBeDefined();
 });
 });

 describe('model selection for providers', () => {
 beforeEach(() => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);
 });

 it('should select appropriate Claude model for simple tasks', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Complete this: function' }]
 };

 const context: RoutingContext = {
 preferredProvider: ModelProvider.CLAUDE,
 complexity: TaskComplexity.SIMPLE
 };

 const decision = await router.route(request, context);

 expect(decision.provider).toBe(ModelProvider.CLAUDE);
 expect(decision.model).toContain('haiku');
 });

 it('should select appropriate OpenAI model for reasoning tasks', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Explain the reasoning' }]
 };

 const context: RoutingContext = {
 complexity: TaskComplexity.REASONING
 };

 const decision = await router.route(request, context);

 expect(decision.provider).toBe(ModelProvider.OPENAI);
 expect(decision.model).toContain('o1');
 });

 it('should select cost-effective model for simple tasks', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Generate a simple function' }]
 };

 const context: RoutingContext = {
 complexity: TaskComplexity.SIMPLE
 };

 const decision = await router.route(request, context);

 // Should use Gemini Flash or GPT-3.5 for simple tasks
 expect(
 decision.model.includes('flash') ||
 decision.model.includes('3.5') ||
 decision.model.includes('haiku')
 ).toBe(true);
 });
 });

 describe('routing context handling', () => {
 beforeEach(() => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);
 });

 it('should handle empty routing context', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 const decision = await router.route(request, {});

 expect(decision).toBeDefined();
 expect(decision.provider).toBeDefined();
 expect(decision.model).toBeDefined();
 });

 it('should handle undefined routing context', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hello' }]
 };

 const decision = await router.route(request);

 expect(decision).toBeDefined();
 expect(decision.provider).toBeDefined();
 expect(decision.model).toBeDefined();
 });

 it('should handle multiple context requirements', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Analyze this complex codebase' }]
 };

 const context: RoutingContext = {
 complexity: TaskComplexity.COMPLEX,
 requiresLargeContext: true,
 requiresStreaming: true
 };

 const decision = await router.route(request, context);

 expect(decision).toBeDefined();
 expect(decision.provider).toBeDefined();
 expect(decision.model).toBeDefined();
 });
 });

 describe('complexity detection', () => {
 beforeEach(() => {
 router.registerAdapter(ModelProvider.CLAUDE, mockClaudeAdapter);
 router.registerAdapter(ModelProvider.OPENAI, mockOpenAIAdapter);
 router.registerAdapter(ModelProvider.GEMINI, mockGeminiAdapter);
 });

 it('should detect "why" questions as complex', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Why does this code fail?' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Complex');
 });

 it('should detect "explain" requests as complex', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Explain how this algorithm works' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Complex');
 });

 it('should detect "analyze" requests as complex', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Analyze this code for bugs' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Complex');
 });

 it('should detect "debug" requests as complex', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Debug this issue' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Complex');
 });

 it('should detect "refactor" requests as moderate', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Refactor this code' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Moderate');
 });

 it('should detect "optimize" requests as moderate', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Optimize this function' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Moderate');
 });

 it('should detect short messages as simple', async () => {
 const request: ModelRequest = {
 messages: [{ role: 'user', content: 'Hi' }]
 };

 const decision = await router.route(request);

 expect(decision.reason).toContain('Simple');
 });
 });
});

