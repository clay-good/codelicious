/**
 * Model Orchestrator - Production implementation
 *
 * Orchestrates AI model requests with:
 * - Intelligent routing
 * - Cost tracking and budget enforcement
 * - Automatic fallback
 * - Response caching
 * - Streaming support
 */

import * as vscode from 'vscode';
import { ConfigurationManager } from '../core/configurationManager';
import { SecureStorageManager } from '../core/secureStorage';
import { CacheManager } from '../cache/cacheManager';
import { ModelRequest, ModelResponse, ModelProvider } from '../types';
import { BaseModelAdapter, StreamChunk } from './baseAdapter';
import { ClaudeAdapter } from './adapters/claudeAdapter';
import { OpenAIAdapter } from './adapters/openaiAdapter';
import { GeminiAdapter } from './adapters/geminiAdapter';
import { OllamaAdapter } from './adapters/ollamaAdapter';
import { ModelRouter, RoutingContext, TaskComplexity } from './modelRouter';
import { CircuitBreakerManager, CircuitBreakerError } from '../core/circuitBreaker';
import { RateLimiterManager, PROVIDER_RATE_LIMITS } from '../core/rateLimiter';
import { RequestQueueManager, RequestPriority } from '../core/requestQueue';
import { createLogger } from '../utils/logger';

const logger = createLogger('ModelOrchestrator');

// Re-export TaskComplexity for convenience
export { TaskComplexity };

export interface OrchestratorStats {
 totalRequests: number;
 totalCost: number;
 totalTokens: number;
 requestsByProvider: Record<string, number>;
 costByProvider: Record<string, number>;
 averageLatency: number;
 cacheHits: number;
 cacheMisses: number;
}

export class ModelOrchestrator {
 private router: ModelRouter;
 private adapters: Map<ModelProvider, BaseModelAdapter> = new Map();
 private isInitialized: boolean = false;
 private circuitBreakers: CircuitBreakerManager;
 private rateLimiters: RateLimiterManager;
 private requestQueues: RequestQueueManager;

 // Statistics
 private stats: OrchestratorStats = {
 totalRequests: 0,
 totalCost: 0,
 totalTokens: 0,
 requestsByProvider: {},
 costByProvider: {},
 averageLatency: 0,
 cacheHits: 0,
 cacheMisses: 0
 };

 // Budget tracking
 private costLimit: number = 10.0; // Default $10 limit
 private budgetWarningThreshold: number = 0.8; // Warn at 80%

 constructor(
 private context: vscode.ExtensionContext,
 private configManager: ConfigurationManager,
 private storageManager: SecureStorageManager,
 private cacheManager: CacheManager
 ) {
 this.router = new ModelRouter();
 this.circuitBreakers = new CircuitBreakerManager();
 this.rateLimiters = new RateLimiterManager();
 this.requestQueues = new RequestQueueManager();
 this.initializeRateLimiters();
 }

 /**
 * Initialize rate limiters for each provider
 */
 private initializeRateLimiters(): void {
 // Initialize rate limiters with provider-specific limits
 for (const [provider, limits] of Object.entries(PROVIDER_RATE_LIMITS)) {
 this.rateLimiters.getLimiter(provider, limits);
 }
 }

 /**
 * Initialize the model orchestrator
 */
 async initialize(): Promise<void> {
 logger.info('Initializing Model Orchestrator...');

 // Load cost limit from config
 const modelsConfig = this.configManager.getModelsConfig();
 this.costLimit = modelsConfig.costLimit || 10.0;

 // Initialize adapters based on available API keys
 await this.initializeAdapters();

 // Load statistics from storage
 await this.loadStats();

 this.isInitialized = true;
 logger.info('Model Orchestrator initialized');
 logger.info(`Available providers: ${Array.from(this.adapters.keys()).join(', ')}`);
 logger.info(`Cost limit: $${this.costLimit.toFixed(2)}`);
 logger.info(`Current spend: $${this.stats.totalCost.toFixed(4)}`);
 }

 /**
 * Initialize AI provider adapters
 */
 private async initializeAdapters(): Promise<void> {
 // Try to initialize Claude
 try {
 const claudeKey = await this.storageManager.get('claude-api-key');
 if (claudeKey) {
 const claudeAdapter = new ClaudeAdapter({ apiKey: claudeKey });
 if (await claudeAdapter.isAvailable()) {
 this.adapters.set(ModelProvider.CLAUDE, claudeAdapter);
 this.router.registerAdapter(ModelProvider.CLAUDE, claudeAdapter);
 logger.info('Claude adapter initialized');
 }
 }
 } catch (error) {
 logger.info('Claude adapter not available');
 }

 // Try to initialize OpenAI
 try {
 const openaiKey = await this.storageManager.get('openai-api-key');
 if (openaiKey) {
 const openaiAdapter = new OpenAIAdapter({ apiKey: openaiKey });
 if (await openaiAdapter.isAvailable()) {
 this.adapters.set(ModelProvider.OPENAI, openaiAdapter);
 this.router.registerAdapter(ModelProvider.OPENAI, openaiAdapter);
 logger.info('OpenAI adapter initialized');
 }
 }
 } catch (error) {
 logger.info('OpenAI adapter not available');
 }

 // Try to initialize Gemini
 try {
 const geminiKey = await this.storageManager.get('gemini-api-key');
 if (geminiKey) {
 const geminiAdapter = new GeminiAdapter({ apiKey: geminiKey });
 if (await geminiAdapter.isAvailable()) {
 this.adapters.set(ModelProvider.GEMINI, geminiAdapter);
 this.router.registerAdapter(ModelProvider.GEMINI, geminiAdapter);
 logger.info('Gemini adapter initialized');
 }
 }
 } catch (error) {
 logger.info('Gemini adapter not available');
 }

 // Try to initialize Ollama (local models)
 try {
 const ollamaAdapter = new OllamaAdapter();
 if (await ollamaAdapter.isAvailable()) {
 this.adapters.set(ModelProvider.LOCAL, ollamaAdapter);
 this.router.registerAdapter(ModelProvider.LOCAL, ollamaAdapter);
 const models = await ollamaAdapter.listModels();
 logger.info('Ollama adapter initialized');
 if (models.length > 0) {
 logger.info(`Available local models: ${models.join(', ')}`);
 } else {
 logger.info('No models installed. Run "ollama pull llama3" to get started.');
 }
 }
 } catch (error) {
 logger.info('Ollama not available (install from https://ollama.ai)');
 }

 if (this.adapters.size === 0) {
 logger.warn('No AI providers available. Please configure API keys or install Ollama.');
 }
 }

 /**
 * Send a request to an AI model
 * ENHANCED: Queue management, rate limiting, circuit breaker protection
 */
 async sendRequest(
 request: ModelRequest,
 routingContext?: RoutingContext
 ): Promise<ModelResponse> {
 if (!this.isInitialized) {
 throw new Error('ModelOrchestrator not initialized');
 }

 if (this.adapters.size === 0) {
 throw new Error('No AI providers available. Please configure API keys.');
 }

 // Determine priority based on context
 const priority = this.determinePriority(routingContext);

 // Enqueue request for processing
 return this.requestQueues.enqueue(
 'ai-requests',
 async () => {
 // Check budget
 this.checkBudget();

 // Try to get from cache
 const cacheKey = this.generateCacheKey(request);
 const cached = await this.cacheManager.get<ModelResponse>(cacheKey);

 if (cached) {
 this.stats.cacheHits++;
 logger.debug('Cache hit for request');
 return cached;
 }

 this.stats.cacheMisses++;

 return this.executeRequest(request, routingContext);
 },
 priority,
 {
 timeout: 300000, // 5 minutes
 queueOptions: {
 maxConcurrent: 5,
 maxQueueSize: 100
 }
 }
 );
 }

 /**
 * Determine request priority based on context
 */
 private determinePriority(context?: RoutingContext): RequestPriority {
 if (!context) {
 return RequestPriority.NORMAL;
 }

 // Complex tasks get high priority
 if (context.complexity === TaskComplexity.COMPLEX || context.complexity === TaskComplexity.REASONING) {
 return RequestPriority.HIGH;
 }

 // Simple tasks get low priority
 if (context.complexity === TaskComplexity.SIMPLE) {
 return RequestPriority.LOW;
 }

 return RequestPriority.NORMAL;
 }

 /**
 * Execute the actual request (internal method)
 */
 private async executeRequest(
 request: ModelRequest,
 routingContext?: RoutingContext
 ): Promise<ModelResponse> {
 // Generate cache key
 const cacheKey = this.generateCacheKey(request);

 // Route the request
 const decision = await this.router.route(request, routingContext || {});
 logger.info(`Routing to ${decision.provider}/${decision.model}: ${decision.reason}`);

 // Get the adapter
 const adapter = this.adapters.get(decision.provider);
 if (!adapter) {
 throw new Error(`Adapter not available for ${decision.provider}`);
 }

 // Send the request with rate limiting and circuit breaker protection
 try {
 const response = await this.rateLimiters.execute(
 decision.provider.toLowerCase(),
 async () => {
 return await this.circuitBreakers.execute(
 `${decision.provider}-${decision.model}`,
 async () => {
 return await adapter.sendRequest({
 ...request,
 model: decision.model
 });
 },
 {
 failureThreshold: 5,
 successThreshold: 2,
 timeout: 60000,
 resetTimeout: 300000,
 halfOpenMaxAttempts: 3
 }
 );
 }
 );

 // Update statistics
 this.updateStats(decision.provider, response);

 // Cache the response
 await this.cacheManager.set(cacheKey, response);

 // Save stats periodically
 if (this.stats.totalRequests % 10 === 0) {
 await this.saveStats();
 }

 return response;

 } catch (error: unknown) {
 // Handle circuit breaker errors
 if (error instanceof CircuitBreakerError) {
 logger.warn(`Circuit breaker triggered for ${decision.provider}: ${error.message}`);
 } else {
 logger.error(`Error with ${decision.provider}`, error);
 }

 // Try fallback to another provider
 return await this.fallbackRequest(request, decision.provider, routingContext);
 }
 }

 /**
 * Send a streaming request to an AI model
 */
 async sendStreamingRequest(
 request: ModelRequest,
 onChunk: (chunk: StreamChunk) => void,
 routingContext?: RoutingContext
 ): Promise<ModelResponse> {
 if (!this.isInitialized) {
 throw new Error('ModelOrchestrator not initialized');
 }

 if (this.adapters.size === 0) {
 throw new Error('No AI providers available. Please configure API keys.');
 }

 // Check budget
 this.checkBudget();

 // Route the request
 const decision = await this.router.route(request, {
 ...routingContext,
 requiresStreaming: true
 });
 logger.info(`Streaming to ${decision.provider}/${decision.model}: ${decision.reason}`);

 // Get the adapter
 const adapter = this.adapters.get(decision.provider);
 if (!adapter) {
 throw new Error(`Adapter not available for ${decision.provider}`);
 }

 // Send the streaming request
 try {
 const response = await adapter.sendStreamingRequest(
 { ...request, model: decision.model },
 onChunk
 );

 // Update statistics
 this.updateStats(decision.provider, response);

 // Save stats periodically
 if (this.stats.totalRequests % 10 === 0) {
 await this.saveStats();
 }

 return response;

 } catch (error: unknown) {
 logger.error(`Streaming error with ${decision.provider}`, error);
 throw error; // Don't fallback for streaming
 }
 }

 /**
 * Fallback to another provider on failure
 */
 private async fallbackRequest(
 request: ModelRequest,
 failedProvider: ModelProvider,
 routingContext?: RoutingContext
 ): Promise<ModelResponse> {
 logger.info(`Attempting fallback from ${failedProvider}...`);

 // Get all available providers except the failed one
 const availableProviders = Array.from(this.adapters.keys())
 .filter(p => p !== failedProvider);

 if (availableProviders.length === 0) {
 throw new Error('No fallback providers available');
 }

 // Try each provider
 for (const provider of availableProviders) {
 try {
 const adapter = this.adapters.get(provider);
 if (!adapter) continue;

 logger.info(`Trying ${provider}...`);

 // Select appropriate model for this provider
 const model = this.selectFallbackModel(provider, routingContext);

 const response = await this.rateLimiters.execute(
 provider.toLowerCase(),
 async () => {
 return await this.circuitBreakers.execute(
 `${provider}-${model}`,
 async () => {
 return await adapter.sendRequest({
 ...request,
 model
 });
 },
 {
 failureThreshold: 3,
 successThreshold: 2,
 timeout: 30000,
 resetTimeout: 180000,
 halfOpenMaxAttempts: 2
 }
 );
 }
 );

 logger.info(`Fallback to ${provider} successful`);
 this.updateStats(provider, response);
 return response;

 } catch (error: unknown) {
 if (error instanceof CircuitBreakerError) {
 logger.debug(`${provider} circuit breaker open: ${error.message}`);
 } else {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 logger.debug(`${provider} also failed: ${errorMessage}`);
 }
 continue;
 }
 }

 throw new Error('All providers failed');
 }

 /**
 * Select fallback model for a provider
 */
 private selectFallbackModel(provider: ModelProvider, context?: RoutingContext): string {
 switch (provider) {
 case ModelProvider.CLAUDE:
 return 'claude-3-5-sonnet-20241022';
 case ModelProvider.OPENAI:
 return 'gpt-4-turbo-preview';
 case ModelProvider.GEMINI:
 return 'gemini-1.5-pro';
 default:
 throw new Error(`Unknown provider: ${provider}`);
 }
 }

 /**
 * Check budget and warn/block if exceeded
 */
 private checkBudget(): void {
 if (this.stats.totalCost >= this.costLimit) {
 throw new Error(
 `Budget limit exceeded: $${this.stats.totalCost.toFixed(4)} / $${this.costLimit.toFixed(2)}`
 );
 }

 const percentUsed = this.stats.totalCost / this.costLimit;
 if (percentUsed >= this.budgetWarningThreshold && this.stats.totalRequests % 5 === 0) {
 vscode.window.showWarningMessage(
 ` AI Budget Warning: ${(percentUsed * 100).toFixed(1)}% used ($${this.stats.totalCost.toFixed(4)} / $${this.costLimit.toFixed(2)})`
 );
 }
 }

 /**
 * Update statistics
 */
 private updateStats(provider: ModelProvider, response: ModelResponse): void {
 this.stats.totalRequests++;
 this.stats.totalCost += response.cost;
 this.stats.totalTokens += response.usage.totalTokens;

 // Update provider-specific stats
 this.stats.requestsByProvider[provider] = (this.stats.requestsByProvider[provider] || 0) + 1;
 this.stats.costByProvider[provider] = (this.stats.costByProvider[provider] || 0) + response.cost;

 // Update average latency
 const totalLatency = this.stats.averageLatency * (this.stats.totalRequests - 1) + response.latency;
 this.stats.averageLatency = totalLatency / this.stats.totalRequests;
 }

 /**
 * Generate cache key for a request
 */
 private generateCacheKey(request: ModelRequest): string {
 const content = request.messages.map(m => `${m.role}:${m.content}`).join('|');
 const params = `${request.model || 'auto'}:${request.temperature || 0.7}:${request.maxTokens || 'default'}`;
 return `model:${params}:${this.hashString(content)}`;
 }

 /**
 * Simple string hash function
 */
 private hashString(str: string): string {
 let hash = 0;
 for (let i = 0; i < str.length; i++) {
 const char = str.charCodeAt(i);
 hash = ((hash << 5) - hash) + char;
 hash = hash & hash; // Convert to 32-bit integer
 }
 return Math.abs(hash).toString(36);
 }

 /**
 * Load statistics from storage
 */
 private async loadStats(): Promise<void> {
 try {
 const saved = this.context.globalState.get<OrchestratorStats>('orchestrator-stats');
 if (saved) {
 this.stats = saved;
 }
 } catch (error) {
 logger.warn('Failed to load orchestrator stats', error);
 }
 }

 /**
 * Save statistics to storage
 */
 private async saveStats(): Promise<void> {
 try {
 await this.context.globalState.update('orchestrator-stats', this.stats);
 } catch (error) {
 logger.warn('Failed to save orchestrator stats', error);
 }
 }

 /**
 * Get cost statistics
 */
 getCostStats(): OrchestratorStats {
 return { ...this.stats };
 }

 /**
 * Reset statistics
 */
 async resetStats(): Promise<void> {
 this.stats = {
 totalRequests: 0,
 totalCost: 0,
 totalTokens: 0,
 requestsByProvider: {},
 costByProvider: {},
 averageLatency: 0,
 cacheHits: 0,
 cacheMisses: 0
 };
 await this.saveStats();
 }

 /**
 * Set cost limit
 */
 setCostLimit(limit: number): void {
 this.costLimit = limit;
 }

 /**
 * Get available providers
 */
 getAvailableProviders(): ModelProvider[] {
 return Array.from(this.adapters.keys());
 }

 /**
 * Get circuit breaker stats
 */
 getCircuitBreakerStats() {
 return this.circuitBreakers.getAllStats();
 }

 /**
 * Get circuit breaker health status
 */
 getCircuitBreakerHealth() {
 return this.circuitBreakers.getHealthStatus();
 }

 /**
 * Reset all circuit breakers
 */
 resetCircuitBreakers(): void {
 this.circuitBreakers.resetAll();
 }

 /**
 * Get rate limiter stats
 */
 getRateLimiterStats() {
 return this.rateLimiters.getAllStats();
 }

 /**
 * Reset all rate limiters
 */
 resetRateLimiters(): void {
 this.rateLimiters.resetAll();
 }

 /**
 * Get request queue stats
 */
 getRequestQueueStats() {
 return this.requestQueues.getAllStats();
 }

 /**
 * Clear all request queues
 */
 clearRequestQueues(): void {
 this.requestQueues.clearAll();
 }

 /**
 * Check if orchestrator is ready
 */
 isReady(): boolean {
 return this.isInitialized && this.adapters.size > 0;
 }

 /**
 * Get adapter for a specific provider
 */
 getAdapter(provider: ModelProvider): BaseModelAdapter | undefined {
 return this.adapters.get(provider);
 }
}

