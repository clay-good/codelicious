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
import { RoutingContext, TaskComplexity } from './modelRouter';
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
export declare class ModelOrchestrator {
    private context;
    private configManager;
    private storageManager;
    private cacheManager;
    private router;
    private adapters;
    private isInitialized;
    private circuitBreakers;
    private rateLimiters;
    private requestQueues;
    private stats;
    private costLimit;
    private budgetWarningThreshold;
    constructor(context: vscode.ExtensionContext, configManager: ConfigurationManager, storageManager: SecureStorageManager, cacheManager: CacheManager);
    /**
    * Initialize rate limiters for each provider
    */
    private initializeRateLimiters;
    /**
    * Initialize the model orchestrator
    */
    initialize(): Promise<void>;
    /**
    * Initialize AI provider adapters
    */
    private initializeAdapters;
    /**
    * Send a request to an AI model
    * ENHANCED: Queue management, rate limiting, circuit breaker protection
    */
    sendRequest(request: ModelRequest, routingContext?: RoutingContext): Promise<ModelResponse>;
    /**
    * Determine request priority based on context
    */
    private determinePriority;
    /**
    * Execute the actual request (internal method)
    */
    private executeRequest;
    /**
    * Send a streaming request to an AI model
    */
    sendStreamingRequest(request: ModelRequest, onChunk: (chunk: StreamChunk) => void, routingContext?: RoutingContext): Promise<ModelResponse>;
    /**
    * Fallback to another provider on failure
    */
    private fallbackRequest;
    /**
    * Select fallback model for a provider
    */
    private selectFallbackModel;
    /**
    * Check budget and warn/block if exceeded
    */
    private checkBudget;
    /**
    * Update statistics
    */
    private updateStats;
    /**
    * Generate cache key for a request
    */
    private generateCacheKey;
    /**
    * Simple string hash function
    */
    private hashString;
    /**
    * Load statistics from storage
    */
    private loadStats;
    /**
    * Save statistics to storage
    */
    private saveStats;
    /**
    * Get cost statistics
    */
    getCostStats(): OrchestratorStats;
    /**
    * Reset statistics
    */
    resetStats(): Promise<void>;
    /**
    * Set cost limit
    */
    setCostLimit(limit: number): void;
    /**
    * Get available providers
    */
    getAvailableProviders(): ModelProvider[];
    /**
    * Get circuit breaker stats
    */
    getCircuitBreakerStats(): Map<string, import("../core/circuitBreaker").CircuitBreakerStats>;
    /**
    * Get circuit breaker health status
    */
    getCircuitBreakerHealth(): {
        healthy: string[];
        unhealthy: string[];
    };
    /**
    * Reset all circuit breakers
    */
    resetCircuitBreakers(): void;
    /**
    * Get rate limiter stats
    */
    getRateLimiterStats(): Map<string, import("../core/rateLimiter").RateLimiterStats>;
    /**
    * Reset all rate limiters
    */
    resetRateLimiters(): void;
    /**
    * Get request queue stats
    */
    getRequestQueueStats(): Map<string, import("../core/requestQueue").RequestQueueStats>;
    /**
    * Clear all request queues
    */
    clearRequestQueues(): void;
    /**
    * Check if orchestrator is ready
    */
    isReady(): boolean;
    /**
    * Get adapter for a specific provider
    */
    getAdapter(provider: ModelProvider): BaseModelAdapter | undefined;
}
//# sourceMappingURL=orchestrator.d.ts.map