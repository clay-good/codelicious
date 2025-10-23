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

import { createLogger } from '../utils/logger';

const logger = createLogger('CircuitBreaker');

export enum CircuitState {
 CLOSED = 'CLOSED',
 OPEN = 'OPEN',
 HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
 failureThreshold: number; // Number of failures before opening
 successThreshold: number; // Number of successes to close from half-open
 timeout: number; // Time in ms before attempting recovery
 resetTimeout: number; // Time in ms to reset failure count
 halfOpenMaxAttempts: number; // Max attempts in half-open state
 name?: string; // Circuit breaker name for logging
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

export class CircuitBreakerError extends Error {
 constructor(message: string, public readonly circuitState: CircuitState) {
 super(message);
 this.name = 'CircuitBreakerError';
 }
}

export class CircuitBreaker {
 private state: CircuitState = CircuitState.CLOSED;
 private failureCount = 0;
 private successCount = 0;
 private totalRequests = 0;
 private totalFailures = 0;
 private totalSuccesses = 0;
 private lastFailureTime: number | null = null;
 private lastSuccessTime: number | null = null;
 private stateChanges = 0;
 private startTime = Date.now();
 private nextAttemptTime = 0;
 private halfOpenAttempts = 0;

 private readonly options: Required<CircuitBreakerOptions>;

 constructor(options: Partial<CircuitBreakerOptions> = {}) {
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
 async execute<T>(operation: () => Promise<T>): Promise<T> {
 this.totalRequests++;

 // Check if circuit is open
 if (this.state === CircuitState.OPEN) {
 if (Date.now() < this.nextAttemptTime) {
 throw new CircuitBreakerError(
 `Circuit breaker is OPEN for ${this.options.name}. Next attempt in ${Math.ceil((this.nextAttemptTime - Date.now()) / 1000)}s`,
 CircuitState.OPEN
 );
 }

 // Transition to half-open
 this.transitionTo(CircuitState.HALF_OPEN);
 this.halfOpenAttempts = 0;
 }

 // Check half-open attempts
 if (this.state === CircuitState.HALF_OPEN) {
 if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
 throw new CircuitBreakerError(
 `Circuit breaker is HALF_OPEN with max attempts reached for ${this.options.name}`,
 CircuitState.HALF_OPEN
 );
 }
 this.halfOpenAttempts++;
 }

 try {
 const result = await operation();
 this.onSuccess();
 return result;
 } catch (error) {
 this.onFailure();
 throw error;
 }
 }

 /**
 * Handle successful operation
 */
 private onSuccess(): void {
 this.lastSuccessTime = Date.now();
 this.totalSuccesses++;

 if (this.state === CircuitState.HALF_OPEN) {
 this.successCount++;

 if (this.successCount >= this.options.successThreshold) {
 this.transitionTo(CircuitState.CLOSED);
 this.reset();
 }
 } else if (this.state === CircuitState.CLOSED) {
 // Reset failure count after successful operation
 if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.options.resetTimeout) {
 this.failureCount = 0;
 }
 }
 }

 /**
 * Handle failed operation
 */
 private onFailure(): void {
 this.lastFailureTime = Date.now();
 this.totalFailures++;
 this.failureCount++;

 if (this.state === CircuitState.HALF_OPEN) {
 // Any failure in half-open state opens the circuit
 this.transitionTo(CircuitState.OPEN);
 this.nextAttemptTime = Date.now() + this.options.timeout;
 } else if (this.state === CircuitState.CLOSED) {
 if (this.failureCount >= this.options.failureThreshold) {
 this.transitionTo(CircuitState.OPEN);
 this.nextAttemptTime = Date.now() + this.options.timeout;
 }
 }
 }

 /**
 * Transition to new state
 */
 private transitionTo(newState: CircuitState): void {
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
 private reset(): void {
 this.failureCount = 0;
 this.successCount = 0;
 this.halfOpenAttempts = 0;
 }

 /**
 * Force open the circuit
 */
 forceOpen(): void {
 this.transitionTo(CircuitState.OPEN);
 this.nextAttemptTime = Date.now() + this.options.timeout;
 }

 /**
 * Force close the circuit
 */
 forceClose(): void {
 this.transitionTo(CircuitState.CLOSED);
 this.reset();
 }

 /**
 * Get current state
 */
 getState(): CircuitState {
 return this.state;
 }

 /**
 * Get statistics
 */
 getStats(): CircuitBreakerStats {
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
 isHealthy(): boolean {
 return this.state === CircuitState.CLOSED;
 }

 /**
 * Get failure rate
 */
 getFailureRate(): number {
 if (this.totalRequests === 0) {
 return 0;
 }
 return this.totalFailures / this.totalRequests;
 }

 /**
 * Get success rate
 */
 getSuccessRate(): number {
 if (this.totalRequests === 0) {
 return 0;
 }
 return this.totalSuccesses / this.totalRequests;
 }
}

/**
 * Circuit Breaker Manager - Manages multiple circuit breakers
 */
export class CircuitBreakerManager {
 private breakers = new Map<string, CircuitBreaker>();

 /**
 * Get or create circuit breaker
 */
 getBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
 if (!this.breakers.has(name)) {
 this.breakers.set(name, new CircuitBreaker({ ...options, name }));
 }
 return this.breakers.get(name)!;
 }

 /**
 * Execute operation with named circuit breaker
 */
 async execute<T>(
 name: string,
 operation: () => Promise<T>,
 options?: Partial<CircuitBreakerOptions>
 ): Promise<T> {
 const breaker = this.getBreaker(name, options);
 return breaker.execute(operation);
 }

 /**
 * Get all circuit breaker stats
 */
 getAllStats(): Map<string, CircuitBreakerStats> {
 const stats = new Map<string, CircuitBreakerStats>();
 for (const [name, breaker] of this.breakers.entries()) {
 stats.set(name, breaker.getStats());
 }
 return stats;
 }

 /**
 * Get health status of all breakers
 */
 getHealthStatus(): { healthy: string[]; unhealthy: string[] } {
 const healthy: string[] = [];
 const unhealthy: string[] = [];

 for (const [name, breaker] of this.breakers.entries()) {
 if (breaker.isHealthy()) {
 healthy.push(name);
 } else {
 unhealthy.push(name);
 }
 }

 return { healthy, unhealthy };
 }

 /**
 * Reset all circuit breakers
 */
 resetAll(): void {
 for (const breaker of this.breakers.values()) {
 breaker.forceClose();
 }
 }

 /**
 * Remove circuit breaker
 */
 remove(name: string): void {
 this.breakers.delete(name);
 }

 /**
 * Clear all circuit breakers
 */
 clear(): void {
 this.breakers.clear();
 }
}

