/**
 * Circuit Breaker - Prevent cascading failures in distributed systems
 * RELIABILITY: Protects against repeated failures and allows graceful degradation
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Too many failures, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 *
 * Features:
 * - Automatic state transitions
 * - Configurable thresholds
 * - Exponential backoff
 * - Health monitoring
 * - Metrics collection
 */
export declare enum CircuitState {
    CLOSED = "CLOSED",
    OPEN = "OPEN",
    HALF_OPEN = "HALF_OPEN"
}
export interface CircuitBreakerOptions {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    resetTimeout: number;
    halfOpenMaxAttempts: number;
    name?: string;
}
export interface CircuitBreakerStats {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    lastFailureTime: number | null;
    lastSuccessTime: number | null;
    stateChanges: number;
    uptime: number;
}
export declare class CircuitBreakerError extends Error {
    readonly circuitState: CircuitState;
    constructor(message: string, circuitState: CircuitState);
}
export declare class CircuitBreaker {
    private state;
    private failureCount;
    private successCount;
    private totalRequests;
    private totalFailures;
    private totalSuccesses;
    private lastFailureTime;
    private lastSuccessTime;
    private stateChanges;
    private startTime;
    private nextAttemptTime;
    private halfOpenAttempts;
    private readonly options;
    constructor(options?: Partial<CircuitBreakerOptions>);
    /**
    * Execute operation with circuit breaker protection
    */
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /**
    * Handle successful operation
    */
    private onSuccess;
    /**
    * Handle failed operation
    */
    private onFailure;
    /**
    * Transition to new state
    */
    private transitionTo;
    /**
    * Reset circuit breaker
    */
    private reset;
    /**
    * Force open the circuit
    */
    forceOpen(): void;
    /**
    * Force close the circuit
    */
    forceClose(): void;
    /**
    * Get current state
    */
    getState(): CircuitState;
    /**
    * Get statistics
    */
    getStats(): CircuitBreakerStats;
    /**
    * Check if circuit is healthy
    */
    isHealthy(): boolean;
    /**
    * Get failure rate
    */
    getFailureRate(): number;
    /**
    * Get success rate
    */
    getSuccessRate(): number;
}
/**
 * Circuit Breaker Manager - Manages multiple circuit breakers
 */
export declare class CircuitBreakerManager {
    private breakers;
    /**
    * Get or create circuit breaker
    */
    getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker;
    /**
    * Execute operation with named circuit breaker
    */
    execute<T>(name: string, operation: () => Promise<T>, options?: Partial<CircuitBreakerOptions>): Promise<T>;
    /**
    * Get all circuit breaker stats
    */
    getAllStats(): Map<string, CircuitBreakerStats>;
    /**
    * Get health status of all breakers
    */
    getHealthStatus(): {
        healthy: string[];
        unhealthy: string[];
    };
    /**
    * Reset all circuit breakers
    */
    resetAll(): void;
    /**
    * Remove circuit breaker
    */
    remove(name: string): void;
    /**
    * Clear all circuit breakers
    */
    clear(): void;
}
//# sourceMappingURL=circuitBreaker.d.ts.map