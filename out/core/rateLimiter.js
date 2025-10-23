"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVIDER_RATE_LIMITS = exports.RateLimiterManager = exports.RateLimiter = exports.RateLimitError = void 0;
class RateLimitError extends Error {
    constructor(message, retryAfter) {
        super(message);
        this.retryAfter = retryAfter;
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
class RateLimiter {
    constructor(options = {}) {
        this.totalRequests = 0;
        this.totalThrottled = 0;
        this.totalWaitTime = 0;
        this.options = {
            tokensPerInterval: options.tokensPerInterval ?? 10,
            interval: options.interval ?? 1000,
            maxTokens: options.maxTokens ?? 100,
            name: options.name ?? 'RateLimiter'
        };
        this.tokens = this.options.maxTokens;
        this.lastRefillTime = Date.now();
        // Start automatic refill
        this.startRefill();
    }
    /**
    * Try to consume tokens
    * Returns true if tokens were consumed, false if not enough tokens
    */
    tryConsume(tokens = 1) {
        this.refill();
        this.totalRequests++;
        if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
        }
        this.totalThrottled++;
        return false;
    }
    /**
    * Consume tokens, waiting if necessary
    */
    async consume(tokens = 1) {
        const startTime = Date.now();
        while (!this.tryConsume(tokens)) {
            const waitTime = this.getWaitTime(tokens);
            if (waitTime > 60000) {
                // Don't wait more than 1 minute
                throw new RateLimitError(`Rate limit exceeded for ${this.options.name}. Too many requests.`, waitTime);
            }
            await this.delay(Math.min(waitTime, 1000));
        }
        const waitTime = Date.now() - startTime;
        if (waitTime > 0) {
            this.totalWaitTime += waitTime;
        }
    }
    /**
    * Execute operation with rate limiting
    */
    async execute(operation, tokens = 1) {
        await this.consume(tokens);
        return operation();
    }
    /**
    * Refill tokens based on elapsed time
    */
    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefillTime;
        const intervalsElapsed = elapsed / this.options.interval;
        if (intervalsElapsed >= 1) {
            const tokensToAdd = Math.floor(intervalsElapsed * this.options.tokensPerInterval);
            this.tokens = Math.min(this.tokens + tokensToAdd, this.options.maxTokens);
            this.lastRefillTime = now;
        }
    }
    /**
    * Start automatic refill timer
    */
    startRefill() {
        this.refillTimer = setInterval(() => {
            this.refill();
        }, this.options.interval);
        // Don't keep process alive
        this.refillTimer.unref();
    }
    /**
    * Stop automatic refill
    */
    stop() {
        if (this.refillTimer) {
            clearInterval(this.refillTimer);
            this.refillTimer = undefined;
        }
    }
    /**
    * Get estimated wait time for tokens
    */
    getWaitTime(tokens) {
        const tokensNeeded = tokens - this.tokens;
        if (tokensNeeded <= 0) {
            return 0;
        }
        const intervalsNeeded = Math.ceil(tokensNeeded / this.options.tokensPerInterval);
        return intervalsNeeded * this.options.interval;
    }
    /**
    * Delay helper
    */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
    * Get current token count
    */
    getTokens() {
        this.refill();
        return this.tokens;
    }
    /**
    * Get statistics
    */
    getStats() {
        this.refill();
        return {
            currentTokens: this.tokens,
            maxTokens: this.options.maxTokens,
            tokensPerInterval: this.options.tokensPerInterval,
            interval: this.options.interval,
            totalRequests: this.totalRequests,
            totalThrottled: this.totalThrottled,
            averageWaitTime: this.totalThrottled > 0 ? this.totalWaitTime / this.totalThrottled : 0,
            lastRefillTime: this.lastRefillTime
        };
    }
    /**
    * Reset rate limiter
    */
    reset() {
        this.tokens = this.options.maxTokens;
        this.lastRefillTime = Date.now();
        this.totalRequests = 0;
        this.totalThrottled = 0;
        this.totalWaitTime = 0;
    }
    /**
    * Get throttle rate
    */
    getThrottleRate() {
        if (this.totalRequests === 0) {
            return 0;
        }
        return this.totalThrottled / this.totalRequests;
    }
}
exports.RateLimiter = RateLimiter;
/**
 * Rate Limiter Manager - Manages multiple rate limiters
 */
class RateLimiterManager {
    constructor() {
        this.limiters = new Map();
    }
    /**
    * Get or create rate limiter
    */
    getLimiter(name, options) {
        if (!this.limiters.has(name)) {
            this.limiters.set(name, new RateLimiter({ ...options, name }));
        }
        return this.limiters.get(name);
    }
    /**
    * Execute operation with named rate limiter
    */
    async execute(name, operation, options) {
        const limiter = this.getLimiter(name, options?.limiterOptions);
        return limiter.execute(operation, options?.tokens);
    }
    /**
    * Get all rate limiter stats
    */
    getAllStats() {
        const stats = new Map();
        for (const [name, limiter] of this.limiters.entries()) {
            stats.set(name, limiter.getStats());
        }
        return stats;
    }
    /**
    * Reset all rate limiters
    */
    resetAll() {
        for (const limiter of this.limiters.values()) {
            limiter.reset();
        }
    }
    /**
    * Stop all rate limiters
    */
    stopAll() {
        for (const limiter of this.limiters.values()) {
            limiter.stop();
        }
    }
    /**
    * Remove rate limiter
    */
    remove(name) {
        const limiter = this.limiters.get(name);
        if (limiter) {
            limiter.stop();
            this.limiters.delete(name);
        }
    }
    /**
    * Clear all rate limiters
    */
    clear() {
        this.stopAll();
        this.limiters.clear();
    }
}
exports.RateLimiterManager = RateLimiterManager;
/**
 * Provider-specific rate limits (based on actual API limits)
 */
exports.PROVIDER_RATE_LIMITS = {
    claude: {
        tokensPerInterval: 50, // 50 requests per minute
        interval: 60000, // 1 minute
        maxTokens: 100
    },
    openai: {
        tokensPerInterval: 60, // 60 requests per minute (tier 1)
        interval: 60000,
        maxTokens: 120
    },
    gemini: {
        tokensPerInterval: 60, // 60 requests per minute
        interval: 60000,
        maxTokens: 120
    },
    ollama: {
        tokensPerInterval: 100, // Local, no strict limit
        interval: 60000,
        maxTokens: 200
    }
};
//# sourceMappingURL=rateLimiter.js.map