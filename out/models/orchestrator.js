"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelOrchestrator = exports.TaskComplexity = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("../types");
const claudeAdapter_1 = require("./adapters/claudeAdapter");
const openaiAdapter_1 = require("./adapters/openaiAdapter");
const geminiAdapter_1 = require("./adapters/geminiAdapter");
const ollamaAdapter_1 = require("./adapters/ollamaAdapter");
const modelRouter_1 = require("./modelRouter");
Object.defineProperty(exports, "TaskComplexity", { enumerable: true, get: function () { return modelRouter_1.TaskComplexity; } });
const circuitBreaker_1 = require("../core/circuitBreaker");
const rateLimiter_1 = require("../core/rateLimiter");
const requestQueue_1 = require("../core/requestQueue");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ModelOrchestrator');
class ModelOrchestrator {
    constructor(context, configManager, storageManager, cacheManager) {
        this.context = context;
        this.configManager = configManager;
        this.storageManager = storageManager;
        this.cacheManager = cacheManager;
        this.adapters = new Map();
        this.isInitialized = false;
        // Statistics
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
        // Budget tracking
        this.costLimit = 10.0; // Default $10 limit
        this.budgetWarningThreshold = 0.8; // Warn at 80%
        this.router = new modelRouter_1.ModelRouter();
        this.circuitBreakers = new circuitBreaker_1.CircuitBreakerManager();
        this.rateLimiters = new rateLimiter_1.RateLimiterManager();
        this.requestQueues = new requestQueue_1.RequestQueueManager();
        this.initializeRateLimiters();
    }
    /**
    * Initialize rate limiters for each provider
    */
    initializeRateLimiters() {
        // Initialize rate limiters with provider-specific limits
        for (const [provider, limits] of Object.entries(rateLimiter_1.PROVIDER_RATE_LIMITS)) {
            this.rateLimiters.getLimiter(provider, limits);
        }
    }
    /**
    * Initialize the model orchestrator
    */
    async initialize() {
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
    async initializeAdapters() {
        // Try to initialize Claude
        try {
            const claudeKey = await this.storageManager.get('claude-api-key');
            if (claudeKey) {
                const claudeAdapter = new claudeAdapter_1.ClaudeAdapter({ apiKey: claudeKey });
                if (await claudeAdapter.isAvailable()) {
                    this.adapters.set(types_1.ModelProvider.CLAUDE, claudeAdapter);
                    this.router.registerAdapter(types_1.ModelProvider.CLAUDE, claudeAdapter);
                    logger.info('Claude adapter initialized');
                }
            }
        }
        catch (error) {
            logger.info('Claude adapter not available');
        }
        // Try to initialize OpenAI
        try {
            const openaiKey = await this.storageManager.get('openai-api-key');
            if (openaiKey) {
                const openaiAdapter = new openaiAdapter_1.OpenAIAdapter({ apiKey: openaiKey });
                if (await openaiAdapter.isAvailable()) {
                    this.adapters.set(types_1.ModelProvider.OPENAI, openaiAdapter);
                    this.router.registerAdapter(types_1.ModelProvider.OPENAI, openaiAdapter);
                    logger.info('OpenAI adapter initialized');
                }
            }
        }
        catch (error) {
            logger.info('OpenAI adapter not available');
        }
        // Try to initialize Gemini
        try {
            const geminiKey = await this.storageManager.get('gemini-api-key');
            if (geminiKey) {
                const geminiAdapter = new geminiAdapter_1.GeminiAdapter({ apiKey: geminiKey });
                if (await geminiAdapter.isAvailable()) {
                    this.adapters.set(types_1.ModelProvider.GEMINI, geminiAdapter);
                    this.router.registerAdapter(types_1.ModelProvider.GEMINI, geminiAdapter);
                    logger.info('Gemini adapter initialized');
                }
            }
        }
        catch (error) {
            logger.info('Gemini adapter not available');
        }
        // Try to initialize Ollama (local models)
        try {
            const ollamaAdapter = new ollamaAdapter_1.OllamaAdapter();
            if (await ollamaAdapter.isAvailable()) {
                this.adapters.set(types_1.ModelProvider.LOCAL, ollamaAdapter);
                this.router.registerAdapter(types_1.ModelProvider.LOCAL, ollamaAdapter);
                const models = await ollamaAdapter.listModels();
                logger.info('Ollama adapter initialized');
                if (models.length > 0) {
                    logger.info(`Available local models: ${models.join(', ')}`);
                }
                else {
                    logger.info('No models installed. Run "ollama pull llama3" to get started.');
                }
            }
        }
        catch (error) {
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
    async sendRequest(request, routingContext) {
        if (!this.isInitialized) {
            throw new Error('ModelOrchestrator not initialized');
        }
        if (this.adapters.size === 0) {
            throw new Error('No AI providers available. Please configure API keys.');
        }
        // Determine priority based on context
        const priority = this.determinePriority(routingContext);
        // Enqueue request for processing
        return this.requestQueues.enqueue('ai-requests', async () => {
            // Check budget
            this.checkBudget();
            // Try to get from cache
            const cacheKey = this.generateCacheKey(request);
            const cached = await this.cacheManager.get(cacheKey);
            if (cached) {
                this.stats.cacheHits++;
                logger.debug('Cache hit for request');
                return cached;
            }
            this.stats.cacheMisses++;
            return this.executeRequest(request, routingContext);
        }, priority, {
            timeout: 300000, // 5 minutes
            queueOptions: {
                maxConcurrent: 5,
                maxQueueSize: 100
            }
        });
    }
    /**
    * Determine request priority based on context
    */
    determinePriority(context) {
        if (!context) {
            return requestQueue_1.RequestPriority.NORMAL;
        }
        // Complex tasks get high priority
        if (context.complexity === modelRouter_1.TaskComplexity.COMPLEX || context.complexity === modelRouter_1.TaskComplexity.REASONING) {
            return requestQueue_1.RequestPriority.HIGH;
        }
        // Simple tasks get low priority
        if (context.complexity === modelRouter_1.TaskComplexity.SIMPLE) {
            return requestQueue_1.RequestPriority.LOW;
        }
        return requestQueue_1.RequestPriority.NORMAL;
    }
    /**
    * Execute the actual request (internal method)
    */
    async executeRequest(request, routingContext) {
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
            const response = await this.rateLimiters.execute(decision.provider.toLowerCase(), async () => {
                return await this.circuitBreakers.execute(`${decision.provider}-${decision.model}`, async () => {
                    return await adapter.sendRequest({
                        ...request,
                        model: decision.model
                    });
                }, {
                    failureThreshold: 5,
                    successThreshold: 2,
                    timeout: 60000,
                    resetTimeout: 300000,
                    halfOpenMaxAttempts: 3
                });
            });
            // Update statistics
            this.updateStats(decision.provider, response);
            // Cache the response
            await this.cacheManager.set(cacheKey, response);
            // Save stats periodically
            if (this.stats.totalRequests % 10 === 0) {
                await this.saveStats();
            }
            return response;
        }
        catch (error) {
            // Handle circuit breaker errors
            if (error instanceof circuitBreaker_1.CircuitBreakerError) {
                logger.warn(`Circuit breaker triggered for ${decision.provider}: ${error.message}`);
            }
            else {
                logger.error(`Error with ${decision.provider}`, error);
            }
            // Try fallback to another provider
            return await this.fallbackRequest(request, decision.provider, routingContext);
        }
    }
    /**
    * Send a streaming request to an AI model
    */
    async sendStreamingRequest(request, onChunk, routingContext) {
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
            const response = await adapter.sendStreamingRequest({ ...request, model: decision.model }, onChunk);
            // Update statistics
            this.updateStats(decision.provider, response);
            // Save stats periodically
            if (this.stats.totalRequests % 10 === 0) {
                await this.saveStats();
            }
            return response;
        }
        catch (error) {
            logger.error(`Streaming error with ${decision.provider}`, error);
            throw error; // Don't fallback for streaming
        }
    }
    /**
    * Fallback to another provider on failure
    */
    async fallbackRequest(request, failedProvider, routingContext) {
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
                if (!adapter)
                    continue;
                logger.info(`Trying ${provider}...`);
                // Select appropriate model for this provider
                const model = this.selectFallbackModel(provider, routingContext);
                const response = await this.rateLimiters.execute(provider.toLowerCase(), async () => {
                    return await this.circuitBreakers.execute(`${provider}-${model}`, async () => {
                        return await adapter.sendRequest({
                            ...request,
                            model
                        });
                    }, {
                        failureThreshold: 3,
                        successThreshold: 2,
                        timeout: 30000,
                        resetTimeout: 180000,
                        halfOpenMaxAttempts: 2
                    });
                });
                logger.info(`Fallback to ${provider} successful`);
                this.updateStats(provider, response);
                return response;
            }
            catch (error) {
                if (error instanceof circuitBreaker_1.CircuitBreakerError) {
                    logger.debug(`${provider} circuit breaker open: ${error.message}`);
                }
                else {
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
    selectFallbackModel(provider, context) {
        switch (provider) {
            case types_1.ModelProvider.CLAUDE:
                return 'claude-3-5-sonnet-20241022';
            case types_1.ModelProvider.OPENAI:
                return 'gpt-4-turbo-preview';
            case types_1.ModelProvider.GEMINI:
                return 'gemini-1.5-pro';
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    /**
    * Check budget and warn/block if exceeded
    */
    checkBudget() {
        if (this.stats.totalCost >= this.costLimit) {
            throw new Error(`Budget limit exceeded: $${this.stats.totalCost.toFixed(4)} / $${this.costLimit.toFixed(2)}`);
        }
        const percentUsed = this.stats.totalCost / this.costLimit;
        if (percentUsed >= this.budgetWarningThreshold && this.stats.totalRequests % 5 === 0) {
            vscode.window.showWarningMessage(` AI Budget Warning: ${(percentUsed * 100).toFixed(1)}% used ($${this.stats.totalCost.toFixed(4)} / $${this.costLimit.toFixed(2)})`);
        }
    }
    /**
    * Update statistics
    */
    updateStats(provider, response) {
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
    generateCacheKey(request) {
        const content = request.messages.map(m => `${m.role}:${m.content}`).join('|');
        const params = `${request.model || 'auto'}:${request.temperature || 0.7}:${request.maxTokens || 'default'}`;
        return `model:${params}:${this.hashString(content)}`;
    }
    /**
    * Simple string hash function
    */
    hashString(str) {
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
    async loadStats() {
        try {
            const saved = this.context.globalState.get('orchestrator-stats');
            if (saved) {
                this.stats = saved;
            }
        }
        catch (error) {
            logger.warn('Failed to load orchestrator stats', error);
        }
    }
    /**
    * Save statistics to storage
    */
    async saveStats() {
        try {
            await this.context.globalState.update('orchestrator-stats', this.stats);
        }
        catch (error) {
            logger.warn('Failed to save orchestrator stats', error);
        }
    }
    /**
    * Get cost statistics
    */
    getCostStats() {
        return { ...this.stats };
    }
    /**
    * Reset statistics
    */
    async resetStats() {
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
    setCostLimit(limit) {
        this.costLimit = limit;
    }
    /**
    * Get available providers
    */
    getAvailableProviders() {
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
    resetCircuitBreakers() {
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
    resetRateLimiters() {
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
    clearRequestQueues() {
        this.requestQueues.clearAll();
    }
    /**
    * Check if orchestrator is ready
    */
    isReady() {
        return this.isInitialized && this.adapters.size > 0;
    }
    /**
    * Get adapter for a specific provider
    */
    getAdapter(provider) {
        return this.adapters.get(provider);
    }
}
exports.ModelOrchestrator = ModelOrchestrator;
//# sourceMappingURL=orchestrator.js.map