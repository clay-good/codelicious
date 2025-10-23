/**
 * Cancellation Token - Proper cancellation support for long-running workflows
 * PERFORMANCE: Enables graceful cancellation and resource cleanup
 *
 * Features:
 * - Cancellation propagation
 * - Cleanup callbacks
 * - Timeout support
 * - Child token creation
 */
export interface CancellationToken {
    readonly isCancellationRequested: boolean;
    readonly canBeCanceled: boolean;
    onCancellationRequested(callback: () => void): void;
    throwIfCancellationRequested(): void;
}
export declare class CancellationTokenSource {
    private _token;
    private _cancelled;
    private _timeoutHandle?;
    constructor();
    get token(): CancellationToken;
    cancel(): void;
    cancelAfter(ms: number): void;
    dispose(): void;
    get isCancellationRequested(): boolean;
}
export declare class CancellationError extends Error {
    constructor(message?: string);
}
/**
 * Non-cancellable token (for operations that cannot be cancelled)
 */
export declare const NonCancellableToken: CancellationToken;
/**
 * Create a linked cancellation token that cancels when any parent cancels
 */
export declare function createLinkedToken(...tokens: CancellationToken[]): CancellationTokenSource;
/**
 * Run an async operation with cancellation support
 */
export declare function withCancellation<T>(operation: (token: CancellationToken) => Promise<T>, token: CancellationToken): Promise<T>;
/**
 * Run an async operation with timeout
 */
export declare function withTimeout<T>(operation: (token: CancellationToken) => Promise<T>, timeoutMs: number): Promise<T>;
/**
 * Delay with cancellation support
 */
export declare function delay(ms: number, token?: CancellationToken): Promise<void>;
/**
 * Retry with cancellation support
 */
export declare function retry<T>(operation: (token: CancellationToken) => Promise<T>, options: {
    maxRetries: number;
    delayMs: number;
    token?: CancellationToken;
}): Promise<T>;
/**
 * Run operations in parallel with cancellation support
 */
export declare function parallelWithCancellation<T>(operations: Array<(token: CancellationToken) => Promise<T>>, token: CancellationToken): Promise<T[]>;
/**
 * Run operations in sequence with cancellation support
 */
export declare function sequenceWithCancellation<T>(operations: Array<(token: CancellationToken) => Promise<T>>, token: CancellationToken): Promise<T[]>;
//# sourceMappingURL=cancellationToken.d.ts.map