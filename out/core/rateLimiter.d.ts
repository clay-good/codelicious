/**
 * Rate Limiter - Token bucket algorithm for API rate limiting
 * RELIABILITY: Prevents API rate limit errors and ensures fair resource usage
 *
 * Features:
 * - Token bucket algorithm
 * - Per-provider rate limits
 * - Automatic token refill
 * - Queue management
 * - Burst handling
 * - Metrics collection
 */
export interface RateLimiterOptions {
    tokensPerInterval: number;
    interval: number;
    maxTokens: number;
    name?: string;
}
export interface RateLimiterStats {
    currentTokens: number;
    maxTokens: number;
    tokensPerInterval: number;
    interval: number;
    totalRequests: number;
    totalThrottled: number;
    averageWaitTime: number;
    lastRefillTime: number;
}
export declare class RateLimitError extends Error {
    readonly retryAfter: number;
    constructor(message: string, retryAfter: number);
}
export declare class RateLimiter {
    private tokens;
    private lastRefillTime;
    private totalRequests;
    private totalThrottled;
    private totalWaitTime;
    private refillTimer?;
    private readonly options;
    constructor(options?: Partial<RateLimiterOptions>);
    /**
    * Try to consume tokens
    * Returns true if tokens were consumed, false if not enough tokens
    */
    tryConsume(tokens?: number): boolean;
    /**
    * Consume tokens, waiting if necessary
    */
    consume(tokens?: number): Promise<void>;
    /**
    * Execute operation with rate limiting
    */
    execute<T>(operation: () => Promise<T>, tokens?: number): Promise<T>;
    /**
    * Refill tokens based on elapsed time
    */
    private refill;
    /**
    * Start automatic refill timer
    */
    private startRefill;
    /**
    * Stop automatic refill
    */
    stop(): void;
    /**
    * Get estimated wait time for tokens
    */
    private getWaitTime;
    /**
    * Delay helper
    */
    private delay;
    /**
    * Get current token count
    */
    getTokens(): number;
    /**
    * Get statistics
    */
    getStats(): RateLimiterStats;
    /**
    * Reset rate limiter
    */
    reset(): void;
    /**
    * Get throttle rate
    */
    getThrottleRate(): number;
}
/**
 * Rate Limiter Manager - Manages multiple rate limiters
 */
export declare class RateLimiterManager {
    private limiters;
    /**
    * Get or create rate limiter
    */
    getLimiter(name: string, options?: Partial<RateLimiterOptions>): RateLimiter;
    /**
    * Execute operation with named rate limiter
    */
    execute<T>(name: string, operation: () => Promise<T>, options?: {
        tokens?: number;
        limiterOptions?: Partial<RateLimiterOptions>;
    }): Promise<T>;
    /**
    * Get all rate limiter stats
    */
    getAllStats(): Map<string, RateLimiterStats>;
    /**
    * Reset all rate limiters
    */
    resetAll(): void;
    /**
    * Stop all rate limiters
    */
    stopAll(): void;
    /**
    * Remove rate limiter
    */
    remove(name: string): void;
    /**
    * Clear all rate limiters
    */
    clear(): void;
}
/**
 * Provider-specific rate limits (based on actual API limits)
 */
export declare const PROVIDER_RATE_LIMITS: {
    claude: {
        tokensPerInterval: number;
        interval: number;
        maxTokens: number;
    };
    openai: {
        tokensPerInterval: number;
        interval: number;
        maxTokens: number;
    };
    gemini: {
        tokensPerInterval: number;
        interval: number;
        maxTokens: number;
    };
    ollama: {
        tokensPerInterval: number;
        interval: number;
        maxTokens: number;
    };
};
//# sourceMappingURL=rateLimiter.d.ts.map