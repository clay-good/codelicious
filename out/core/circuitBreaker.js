"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreakerManager = exports.CircuitBreaker = exports.CircuitBreakerError = exports.CircuitState = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CircuitBreaker');
var CircuitState;
(function (CircuitState) {
    CircuitState["CLOSED"] = "CLOSED";
    CircuitState["OPEN"] = "OPEN";
    CircuitState["HALF_OPEN"] = "HALF_OPEN";
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreakerError extends Error {
    constructor(message, circuitState) {
        super(message);
        this.circuitState = circuitState;
        this.name = 'CircuitBreakerError';
    }
}
exports.CircuitBreakerError = CircuitBreakerError;
class CircuitBreaker {
    constructor(options = {}) {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.totalRequests = 0;
        this.totalFailures = 0;
        this.totalSuccesses = 0;
        this.lastFailureTime = null;
        this.lastSuccessTime = null;
        this.stateChanges = 0;
        this.startTime = Date.now();
        this.nextAttemptTime = 0;
        this.halfOpenAttempts = 0;
        this.options = {
            failureThreshold: options.failureThreshold ?? 5,
            successThreshold: options.successThreshold ?? 2,
            timeout: options.timeout ?? 60000, // 1 minute
            resetTimeout: options.resetTimeout ?? 300000, // 5 minutes
            halfOpenMaxAttempts: options.halfOpenMaxAttempts ?? 3,
            name: options.name ?? 'CircuitBreaker'
        };
    }
    /**
    * Execute operation with circuit breaker protection
    */
    async execute(operation) {
        this.totalRequests++;
        // Check if circuit is open
        if (this.state === CircuitState.OPEN) {
            if (Date.now() < this.nextAttemptTime) {
                throw new CircuitBreakerError(`Circuit breaker is OPEN for ${this.options.name}. Next attempt in ${Math.ceil((this.nextAttemptTime - Date.now()) / 1000)}s`, CircuitState.OPEN);
            }
            // Transition to half-open
            this.transitionTo(CircuitState.HALF_OPEN);
            this.halfOpenAttempts = 0;
        }
        // Check half-open attempts
        if (this.state === CircuitState.HALF_OPEN) {
            if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
                throw new CircuitBreakerError(`Circuit breaker is HALF_OPEN with max attempts reached for ${this.options.name}`, CircuitState.HALF_OPEN);
            }
            this.halfOpenAttempts++;
        }
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    /**
    * Handle successful operation
    */
    onSuccess() {
        this.lastSuccessTime = Date.now();
        this.totalSuccesses++;
        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.options.successThreshold) {
                this.transitionTo(CircuitState.CLOSED);
                this.reset();
            }
        }
        else if (this.state === CircuitState.CLOSED) {
            // Reset failure count after successful operation
            if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.options.resetTimeout) {
                this.failureCount = 0;
            }
        }
    }
    /**
    * Handle failed operation
    */
    onFailure() {
        this.lastFailureTime = Date.now();
        this.totalFailures++;
        this.failureCount++;
        if (this.state === CircuitState.HALF_OPEN) {
            // Any failure in half-open state opens the circuit
            this.transitionTo(CircuitState.OPEN);
            this.nextAttemptTime = Date.now() + this.options.timeout;
        }
        else if (this.state === CircuitState.CLOSED) {
            if (this.failureCount >= this.options.failureThreshold) {
                this.transitionTo(CircuitState.OPEN);
                this.nextAttemptTime = Date.now() + this.options.timeout;
            }
        }
    }
    /**
    * Transition to new state
    */
    transitionTo(newState) {
        if (this.state !== newState) {
            const oldState = this.state;
            this.state = newState;
            this.stateChanges++;
            logger.info(`[${this.options.name}] Circuit breaker: ${oldState} → ${newState}`);
        }
    }
    /**
    * Reset circuit breaker
    */
    reset() {
        this.failureCount = 0;
        this.successCount = 0;
        this.halfOpenAttempts = 0;
    }
    /**
    * Force open the circuit
    */
    forceOpen() {
        this.transitionTo(CircuitState.OPEN);
        this.nextAttemptTime = Date.now() + this.options.timeout;
    }
    /**
    * Force close the circuit
    */
    forceClose() {
        this.transitionTo(CircuitState.CLOSED);
        this.reset();
    }
    /**
    * Get current state
    */
    getState() {
        return this.state;
    }
    /**
    * Get statistics
    */
    getStats() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            totalRequests: this.totalRequests,
            totalFailures: this.totalFailures,
            totalSuccesses: this.totalSuccesses,
            lastFailureTime: this.lastFailureTime,
            lastSuccessTime: this.lastSuccessTime,
            stateChanges: this.stateChanges,
            uptime: Date.now() - this.startTime
        };
    }
    /**
    * Check if circuit is healthy
    */
    isHealthy() {
        return this.state === CircuitState.CLOSED;
    }
    /**
    * Get failure rate
    */
    getFailureRate() {
        if (this.totalRequests === 0) {
            return 0;
        }
        return this.totalFailures / this.totalRequests;
    }
    /**
    * Get success rate
    */
    getSuccessRate() {
        if (this.totalRequests === 0) {
            return 0;
        }
        return this.totalSuccesses / this.totalRequests;
    }
}
exports.CircuitBreaker = CircuitBreaker;
/**
 * Circuit Breaker Manager - Manages multiple circuit breakers
 */
class CircuitBreakerManager {
    constructor() {
        this.breakers = new Map();
    }
    /**
    * Get or create circuit breaker
    */
    getBreaker(name, options) {
        if (!this.breakers.has(name)) {
            this.breakers.set(name, new CircuitBreaker({ ...options, name }));
        }
        return this.breakers.get(name);
    }
    /**
    * Execute operation with named circuit breaker
    */
    async execute(name, operation, options) {
        const breaker = this.getBreaker(name, options);
        return breaker.execute(operation);
    }
    /**
    * Get all circuit breaker stats
    */
    getAllStats() {
        const stats = new Map();
        for (const [name, breaker] of this.breakers.entries()) {
            stats.set(name, breaker.getStats());
        }
        return stats;
    }
    /**
    * Get health status of all breakers
    */
    getHealthStatus() {
        const healthy = [];
        const unhealthy = [];
        for (const [name, breaker] of this.breakers.entries()) {
            if (breaker.isHealthy()) {
                healthy.push(name);
            }
            else {
                unhealthy.push(name);
            }
        }
        return { healthy, unhealthy };
    }
    /**
    * Reset all circuit breakers
    */
    resetAll() {
        for (const breaker of this.breakers.values()) {
            breaker.forceClose();
        }
    }
    /**
    * Remove circuit breaker
    */
    remove(name) {
        this.breakers.delete(name);
    }
    /**
    * Clear all circuit breakers
    */
    clear() {
        this.breakers.clear();
    }
}
exports.CircuitBreakerManager = CircuitBreakerManager;
//# sourceMappingURL=circuitBreaker.js.map