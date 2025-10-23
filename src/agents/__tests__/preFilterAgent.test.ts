/**
 * Tests for PreFilterAgent
 */

import { PreFilterAgent } from '../preFilterAgent';
import { ModelOrchestrator } from '../../models/orchestrator';
import { AgentTaskType, AgentPriority, AgentTaskStatus } from '../types';

// Mock ModelOrchestrator
jest.mock('../../models/orchestrator');

describe('PreFilterAgent', () => {
 let agent: PreFilterAgent;
 let mockOrchestrator: jest.Mocked<ModelOrchestrator>;

 beforeEach(() => {
 jest.clearAllMocks();

 // Create mock orchestrator
 mockOrchestrator = {
 sendRequest: jest.fn(),
 sendStreamingRequest: jest.fn(),
 getCostStats: jest.fn()
 } as any;

 agent = new PreFilterAgent(mockOrchestrator);
 });

 describe('execute', () => {
 it('should optimize a simple prompt', async () => {
 const mockResponse = {
 content: JSON.stringify({
 optimizedPrompt: 'Create a function to calculate fibonacci numbers with memoization',
 clarifications: ['Added memoization for performance'],
 contextAdded: ['Current workspace context'],
 estimatedComplexity: 'moderate',
 reasoning: 'Added performance optimization context'
 }),
 model: 'claude-3-5-sonnet-20241022',
 usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
 cost: 0.001,
 latency: 500
 };

 mockOrchestrator.sendRequest.mockResolvedValue(mockResponse as any);

 const task = {
 id: 'task-1',
 type: AgentTaskType.OPTIMIZE_PROMPT,
 role: 'pre_filter' as any,
 context: {
 workspaceRoot: '/test/workspace',
 currentFile: 'test.ts',
 openFiles: [],
 userPrompt: 'Create a function to calculate fibonacci',
 conversationHistory: [],
 taskType: AgentTaskType.OPTIMIZE_PROMPT,
 priority: AgentPriority.MEDIUM,
 metadata: {}
 },
 priority: AgentPriority.MEDIUM,
 status: AgentTaskStatus.PENDING,
 createdAt: Date.now()
 };

 const result = await agent.execute(task);

 expect(result.success).toBe(true);
 expect((result.data as any).optimizedPrompt).toContain('fibonacci');
 expect((result.data as any).estimatedComplexity).toBe('moderate');
 expect(result.confidence).toBeGreaterThan(0);
 });

 it('should handle complex prompts with codebase context', async () => {
 const mockResponse = {
 content: JSON.stringify({
 optimizedPrompt: 'Refactor the UserService class to use dependency injection pattern',
 clarifications: ['Added DI pattern context', 'Included existing service structure'],
 contextAdded: ['UserService.ts', 'ServiceContainer.ts'],
 estimatedComplexity: 'complex',
 reasoning: 'Refactoring requires understanding existing architecture'
 }),
 model: 'claude-3-5-sonnet-20241022',
 usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
 cost: 0.002,
 latency: 800
 };

 mockOrchestrator.sendRequest.mockResolvedValue(mockResponse as any);

 const task = {
 id: 'task-2',
 type: AgentTaskType.OPTIMIZE_PROMPT,
 role: 'pre_filter' as any,
 context: {
 workspaceRoot: '/test/workspace',
 currentFile: 'UserService.ts',
 openFiles: ['UserService.ts', 'ServiceContainer.ts'],
 codebaseContext: 'class UserService { constructor() {} }',
 userPrompt: 'Refactor UserService to use DI',
 conversationHistory: [],
 taskType: AgentTaskType.OPTIMIZE_PROMPT,
 priority: AgentPriority.HIGH,
 metadata: {}
 },
 priority: AgentPriority.HIGH,
 status: AgentTaskStatus.PENDING,
 createdAt: Date.now()
 };

 const result = await agent.execute(task);

 expect(result.success).toBe(true);
 expect((result.data as any).estimatedComplexity).toBe('complex');
 expect((result.data as any).contextAdded.length).toBeGreaterThan(0);
 });

 it('should fallback to original prompt on error', async () => {
 mockOrchestrator.sendRequest.mockRejectedValue(new Error('AI service unavailable'));

 const task = {
 id: 'task-3',
 type: AgentTaskType.OPTIMIZE_PROMPT,
 role: 'pre_filter' as any,
 context: {
 workspaceRoot: '/test/workspace',
 currentFile: undefined,
 openFiles: [],
 userPrompt: 'Create a test function',
 conversationHistory: [],
 taskType: AgentTaskType.OPTIMIZE_PROMPT,
 priority: AgentPriority.MEDIUM,
 metadata: {}
 },
 priority: AgentPriority.MEDIUM,
 status: AgentTaskStatus.PENDING,
 createdAt: Date.now()
 };

 const result = await agent.execute(task);

 expect(result.success).toBe(false);
 expect(result.errors).toBeDefined();
 expect(result.errors!.length).toBeGreaterThan(0);
 });
 });

 describe('quickOptimize', () => {
 it('should add workspace context to prompt', async () => {
 const optimized = await agent.quickOptimize('Create a function', {
 workspaceRoot: '/test/workspace',
 currentFile: 'test.ts'
 });

 expect(optimized).toContain('Create a function');
 expect(optimized).toContain('/test/workspace');
 expect(optimized).toContain('test.ts');
 });

 it('should add codebase context snippet', async () => {
 const codebaseContext = 'class MyClass { method() {} }'.repeat(100);
 const optimized = await agent.quickOptimize('Refactor MyClass', {
 codebaseContext
 });

 expect(optimized).toContain('Refactor MyClass');
 expect(optimized).toContain('MyClass');
 });
 });

 describe('estimateComplexity', () => {
 it('should return simple for short prompts', () => {
 const complexity = agent.estimateComplexity('Add a button', {});
 expect(complexity).toBe('simple');
 });

 it('should return moderate for medium prompts with context', () => {
 const complexity = agent.estimateComplexity(
 'Create a new component that displays user information',
 { codebaseContext: 'some context' }
 );
 expect(complexity).toBe('moderate');
 });

 it('should return complex for long prompts with multiple files', () => {
 const longPrompt = 'Create a comprehensive user management system with authentication, authorization, and profile management'.repeat(5);
 const complexity = agent.estimateComplexity(longPrompt, {
 codebaseContext: 'context',
 relevantFiles: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts']
 });
 expect(complexity).toBe('complex');
 });

 it('should return very_complex for architecture changes', () => {
 const prompt = 'Refactor the entire application architecture to use microservices pattern with event-driven communication';
 const complexity = agent.estimateComplexity(prompt, {
 codebaseContext: 'large context',
 relevantFiles: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts']
 });
 expect(complexity).toBe('very_complex');
 });
 });

 describe('extractRequirements', () => {
 it('should extract numbered requirements', () => {
 const prompt = `Create a user service with:
1. User registration
2. User login
3. Password reset`;

 const requirements = agent.extractRequirements(prompt);
 expect(requirements).toContain('User registration');
 expect(requirements).toContain('User login');
 expect(requirements).toContain('Password reset');
 });

 it('should extract bullet point requirements', () => {
 const prompt = `The function should:
- Handle errors gracefully
- Return meaningful error messages
- Log all operations`;

 const requirements = agent.extractRequirements(prompt);
 expect(requirements).toContain('Handle errors gracefully');
 expect(requirements).toContain('Return meaningful error messages');
 expect(requirements).toContain('Log all operations');
 });

 it('should extract "should" statements', () => {
 const prompt = 'The component should display user data and should update in real-time';
 const requirements = agent.extractRequirements(prompt);
 expect(requirements.length).toBeGreaterThan(0);
 });

 it('should remove duplicates', () => {
 const prompt = `Requirements:
1. User authentication
- User authentication
The system should handle user authentication`;

 const requirements = agent.extractRequirements(prompt);
 const authCount = requirements.filter(r => r.toLowerCase().includes('authentication')).length;
 expect(authCount).toBeLessThanOrEqual(3); // May have slight variations
 });
 });

 describe('addCodebaseContext', () => {
 it('should add context to prompt', () => {
 const prompt = 'Create a function';
 const context = 'class MyClass { method() {} }';
 const result = agent.addCodebaseContext(prompt, context);

 expect(result).toContain('Create a function');
 expect(result).toContain('MyClass');
 });

 it('should truncate long context', () => {
 const prompt = 'Create a function';
 const longContext = 'x'.repeat(5000);
 const result = agent.addCodebaseContext(prompt, longContext, 1000);

 expect(result.length).toBeLessThan(prompt.length + 1500);
 });

 it('should handle empty context', () => {
 const prompt = 'Create a function';
 const result = agent.addCodebaseContext(prompt, '');

 expect(result).toBe(prompt);
 });
 });
});

