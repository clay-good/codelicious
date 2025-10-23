/**
 * Model Router - Intelligent routing to select the best model for each task
 *
 * Routes requests based on:
 * - Task complexity
 * - Context size
 * - Cost constraints
 * - Performance requirements
 * - Model availability
 */

import { ModelProvider, ModelRequest } from '../types';
import { BaseModelAdapter } from './baseAdapter';

export enum TaskComplexity {
 SIMPLE = 'simple', // Code completion, simple questions
 MODERATE = 'moderate', // Code explanation, refactoring
 COMPLEX = 'complex', // Architecture design, debugging
 REASONING = 'reasoning' // Deep reasoning, complex problem solving
}

export interface RoutingContext {
 complexity?: TaskComplexity;
 maxCost?: number;
 preferredProvider?: ModelProvider;
 requiresLargeContext?: boolean;
 requiresStreaming?: boolean;
 requiresVision?: boolean;
 requiresFunctionCalling?: boolean;
}

export interface RoutingDecision {
 provider: ModelProvider;
 model: string;
 reason: string;
 estimatedCost: number;
}

export class ModelRouter {
 private adapters: Map<ModelProvider, BaseModelAdapter> = new Map();
 private fallbackOrder: ModelProvider[] = [
 ModelProvider.CLAUDE,
 ModelProvider.OPENAI,
 ModelProvider.GEMINI
 ];

 /**
 * Register an adapter
 */
 registerAdapter(provider: ModelProvider, adapter: BaseModelAdapter): void {
 this.adapters.set(provider, adapter);
 }

 /**
 * Get all available adapters
 */
 getAvailableAdapters(): BaseModelAdapter[] {
 return Array.from(this.adapters.values());
 }

 /**
 * Route a request to the best model
 */
 async route(request: ModelRequest, context: RoutingContext = {}): Promise<RoutingDecision> {
 // If model is explicitly specified, use it
 if (request.model) {
 const provider = this.detectProviderFromModel(request.model);
 if (provider) {
 return {
 provider,
 model: request.model,
 reason: 'Explicitly specified model',
 estimatedCost: this.estimateCost(provider, request.model, request)
 };
 }
 }

 // If provider is preferred, try to use it
 if (context.preferredProvider) {
 const adapter = this.adapters.get(context.preferredProvider);
 if (adapter && await adapter.isAvailable()) {
 const model = this.selectModelForProvider(context.preferredProvider, context);
 return {
 provider: context.preferredProvider,
 model,
 reason: 'Preferred provider',
 estimatedCost: this.estimateCost(context.preferredProvider, model, request)
 };
 }
 }

 // Detect complexity if not provided
 const complexity = context.complexity || this.detectComplexity(request);

 // Route based on requirements
 const decision = await this.routeByRequirements(request, complexity, context);

 if (decision) {
 return decision;
 }

 // Fallback to first available provider
 for (const provider of this.fallbackOrder) {
 const adapter = this.adapters.get(provider);
 if (adapter && await adapter.isAvailable()) {
 const model = this.selectModelForProvider(provider, context);
 return {
 provider,
 model,
 reason: 'Fallback to available provider',
 estimatedCost: this.estimateCost(provider, model, request)
 };
 }
 }

 throw new Error('No available AI providers');
 }

 /**
 * Route based on specific requirements
 */
 private async routeByRequirements(
 request: ModelRequest,
 complexity: TaskComplexity,
 context: RoutingContext
 ): Promise<RoutingDecision | null> {
 // Large context requirement (>100k tokens)
 if (context.requiresLargeContext) {
 // Gemini 1.5 Pro has 2M context window
 const gemini = this.adapters.get(ModelProvider.GEMINI);
 if (gemini && await gemini.isAvailable()) {
 return {
 provider: ModelProvider.GEMINI,
 model: 'gemini-1.5-pro',
 reason: 'Large context window required (2M tokens)',
 estimatedCost: this.estimateCost(ModelProvider.GEMINI, 'gemini-1.5-pro', request)
 };
 }

 // Claude has 200k context
 const claude = this.adapters.get(ModelProvider.CLAUDE);
 if (claude && await claude.isAvailable()) {
 return {
 provider: ModelProvider.CLAUDE,
 model: 'claude-3-5-sonnet-20241022',
 reason: 'Large context window required (200k tokens)',
 estimatedCost: this.estimateCost(ModelProvider.CLAUDE, 'claude-3-5-sonnet-20241022', request)
 };
 }
 }

 // Route by complexity
 switch (complexity) {
 case TaskComplexity.REASONING:
 // o1 models are best for reasoning
 const openai = this.adapters.get(ModelProvider.OPENAI);
 if (openai && await openai.isAvailable()) {
 return {
 provider: ModelProvider.OPENAI,
 model: 'o1-preview',
 reason: 'Complex reasoning task',
 estimatedCost: this.estimateCost(ModelProvider.OPENAI, 'o1-preview', request)
 };
 }
 // Fallthrough to complex

 case TaskComplexity.COMPLEX:
 // Claude Opus or GPT-4 for complex tasks
 const claude = this.adapters.get(ModelProvider.CLAUDE);
 if (claude && await claude.isAvailable()) {
 return {
 provider: ModelProvider.CLAUDE,
 model: 'claude-3-5-sonnet-20241022',
 reason: 'Complex task requiring advanced reasoning',
 estimatedCost: this.estimateCost(ModelProvider.CLAUDE, 'claude-3-5-sonnet-20241022', request)
 };
 }
 break;

 case TaskComplexity.MODERATE:
 // Claude Sonnet or GPT-4 Turbo for moderate tasks
 const claudeMod = this.adapters.get(ModelProvider.CLAUDE);
 if (claudeMod && await claudeMod.isAvailable()) {
 return {
 provider: ModelProvider.CLAUDE,
 model: 'claude-3-5-sonnet-20241022',
 reason: 'Moderate complexity task',
 estimatedCost: this.estimateCost(ModelProvider.CLAUDE, 'claude-3-5-sonnet-20241022', request)
 };
 }
 break;

 case TaskComplexity.SIMPLE:
 // Use cheapest models for simple tasks
 // Gemini Flash is very cheap
 const gemini = this.adapters.get(ModelProvider.GEMINI);
 if (gemini && await gemini.isAvailable()) {
 return {
 provider: ModelProvider.GEMINI,
 model: 'gemini-1.5-flash',
 reason: 'Simple task - using cost-effective model',
 estimatedCost: this.estimateCost(ModelProvider.GEMINI, 'gemini-1.5-flash', request)
 };
 }

 // GPT-3.5 Turbo is also cheap
 const openaiSimple = this.adapters.get(ModelProvider.OPENAI);
 if (openaiSimple && await openaiSimple.isAvailable()) {
 return {
 provider: ModelProvider.OPENAI,
 model: 'gpt-3.5-turbo',
 reason: 'Simple task - using cost-effective model',
 estimatedCost: this.estimateCost(ModelProvider.OPENAI, 'gpt-3.5-turbo', request)
 };
 }
 break;
 }

 return null;
 }

 /**
 * Detect task complexity from request
 */
 private detectComplexity(request: ModelRequest): TaskComplexity {
 const content = request.messages.map(m => m.content.toLowerCase()).join(' ');

 // Reasoning indicators
 if (
 content.includes('why') ||
 content.includes('explain') ||
 content.includes('analyze') ||
 content.includes('debug') ||
 content.includes('architecture')
 ) {
 return TaskComplexity.COMPLEX;
 }

 // Moderate complexity indicators
 if (
 content.includes('refactor') ||
 content.includes('improve') ||
 content.includes('optimize') ||
 content.includes('review')
 ) {
 return TaskComplexity.MODERATE;
 }

 // Simple task indicators
 if (
 content.includes('complete') ||
 content.includes('generate') ||
 content.includes('write') ||
 content.length < 200
 ) {
 return TaskComplexity.SIMPLE;
 }

 // Default to moderate
 return TaskComplexity.MODERATE;
 }

 /**
 * Select best model for a provider based on context
 *
 * DEFAULT: Claude Sonnet 4/4.5 for all complex tasks
 * This ensures the highest quality AI assistance for code generation,
 * problem solving, refactoring, and troubleshooting.
 */
 private selectModelForProvider(provider: ModelProvider, context: RoutingContext): string {
 switch (provider) {
 case ModelProvider.CLAUDE:
 if (context.complexity === TaskComplexity.SIMPLE) {
 return 'claude-3-haiku-20240307';
 }
 // DEFAULT: Use Claude Sonnet 4.5 (latest) for all complex tasks
 // This is the best model for code generation, problem solving, and refactoring
 return 'claude-3-5-sonnet-20241022'; // Claude Sonnet 4.5

 case ModelProvider.OPENAI:
 if (context.complexity === TaskComplexity.REASONING) {
 return 'o1-preview';
 }
 if (context.complexity === TaskComplexity.SIMPLE) {
 return 'gpt-3.5-turbo';
 }
 return 'gpt-4-turbo-preview';

 case ModelProvider.GEMINI:
 if (context.complexity === TaskComplexity.SIMPLE) {
 return 'gemini-1.5-flash';
 }
 return 'gemini-1.5-pro';

 default:
 throw new Error(`Unknown provider: ${provider}`);
 }
 }

 /**
 * Detect provider from model name
 */
 private detectProviderFromModel(model: string): ModelProvider | null {
 if (model.startsWith('claude')) return ModelProvider.CLAUDE;
 if (model.startsWith('gpt') || model.startsWith('o1')) return ModelProvider.OPENAI;
 if (model.startsWith('gemini')) return ModelProvider.GEMINI;
 return null;
 }

 /**
 * Estimate cost for a request
 */
 private estimateCost(provider: ModelProvider, model: string, request: ModelRequest): number {
 const adapter = this.adapters.get(provider);
 if (!adapter) return 0;

 const capabilities = adapter.getCapabilities(model);
 const inputText = request.messages.map(m => m.content).join('\n');
 const estimatedInputTokens = Math.ceil(inputText.length / 4);
 const estimatedOutputTokens = request.maxTokens || 1000;

 return (
 estimatedInputTokens * capabilities.costPerInputToken +
 estimatedOutputTokens * capabilities.costPerOutputToken
 );
 }
}

