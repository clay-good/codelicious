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
 tokensPerInterval: number; // Number of tokens to add per interval
 interval: number; // Interval in ms
 maxTokens: number; // Maximum tokens in bucket
 name?: string; // Rate limiter name for logging
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

export class RateLimitError extends Error {
 constructor(message: string, public readonly retryAfter: number) {
 super(message);
 this.name = 'RateLimitError';
 }
}

export class RateLimiter {
 private tokens: number;
 private lastRefillTime: number;
 private totalRequests = 0;
 private totalThrottled = 0;
 private totalWaitTime = 0;
 private refillTimer?: NodeJS.Timeout;

 private readonly options: Required<RateLimiterOptions>;

 constructor(options: Partial<RateLimiterOptions> = {}) {
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
 tryConsume(tokens: number = 1): boolean {
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
 async consume(tokens: number = 1): Promise<void> {
 const startTime = Date.now();

 while (!this.tryConsume(tokens)) {
 const waitTime = this.getWaitTime(tokens);

 if (waitTime > 60000) {
 // Don't wait more than 1 minute
 throw new RateLimitError(
 `Rate limit exceeded for ${this.options.name}. Too many requests.`,
 waitTime
 );
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
 async execute<T>(operation: () => Promise<T>, tokens: number = 1): Promise<T> {
 await this.consume(tokens);
 return operation();
 }

 /**
 * Refill tokens based on elapsed time
 */
 private refill(): void {
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
 private startRefill(): void {
 this.refillTimer = setInterval(() => {
 this.refill();
 }, this.options.interval);

 // Don't keep process alive
 this.refillTimer.unref();
 }

 /**
 * Stop automatic refill
 */
 stop(): void {
 if (this.refillTimer) {
 clearInterval(this.refillTimer);
 this.refillTimer = undefined;
 }
 }

 /**
 * Get estimated wait time for tokens
 */
 private getWaitTime(tokens: number): number {
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
 private delay(ms: number): Promise<void> {
 return new Promise(resolve => setTimeout(resolve, ms));
 }

 /**
 * Get current token count
 */
 getTokens(): number {
 this.refill();
 return this.tokens;
 }

 /**
 * Get statistics
 */
 getStats(): RateLimiterStats {
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
 reset(): void {
 this.tokens = this.options.maxTokens;
 this.lastRefillTime = Date.now();
 this.totalRequests = 0;
 this.totalThrottled = 0;
 this.totalWaitTime = 0;
 }

 /**
 * Get throttle rate
 */
 getThrottleRate(): number {
 if (this.totalRequests === 0) {
 return 0;
 }
 return this.totalThrottled / this.totalRequests;
 }
}

/**
 * Rate Limiter Manager - Manages multiple rate limiters
 */
export class RateLimiterManager {
 private limiters = new Map<string, RateLimiter>();

 /**
 * Get or create rate limiter
 */
 getLimiter(name: string, options?: Partial<RateLimiterOptions>): RateLimiter {
 if (!this.limiters.has(name)) {
 this.limiters.set(name, new RateLimiter({ ...options, name }));
 }
 return this.limiters.get(name)!;
 }

 /**
 * Execute operation with named rate limiter
 */
 async execute<T>(
 name: string,
 operation: () => Promise<T>,
 options?: { tokens?: number; limiterOptions?: Partial<RateLimiterOptions> }
 ): Promise<T> {
 const limiter = this.getLimiter(name, options?.limiterOptions);
 return limiter.execute(operation, options?.tokens);
 }

 /**
 * Get all rate limiter stats
 */
 getAllStats(): Map<string, RateLimiterStats> {
 const stats = new Map<string, RateLimiterStats>();
 for (const [name, limiter] of this.limiters.entries()) {
 stats.set(name, limiter.getStats());
 }
 return stats;
 }

 /**
 * Reset all rate limiters
 */
 resetAll(): void {
 for (const limiter of this.limiters.values()) {
 limiter.reset();
 }
 }

 /**
 * Stop all rate limiters
 */
 stopAll(): void {
 for (const limiter of this.limiters.values()) {
 limiter.stop();
 }
 }

 /**
 * Remove rate limiter
 */
 remove(name: string): void {
 const limiter = this.limiters.get(name);
 if (limiter) {
 limiter.stop();
 this.limiters.delete(name);
 }
 }

 /**
 * Clear all rate limiters
 */
 clear(): void {
 this.stopAll();
 this.limiters.clear();
 }
}

/**
 * Provider-specific rate limits (based on actual API limits)
 */
export const PROVIDER_RATE_LIMITS = {
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

