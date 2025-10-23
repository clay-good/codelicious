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

import { createLogger } from './logger';

const logger = createLogger('CancellationToken');

export interface CancellationToken {
 readonly isCancellationRequested: boolean;
 readonly canBeCanceled: boolean;
 onCancellationRequested(callback: () => void): void;
 throwIfCancellationRequested(): void;
}

export class CancellationTokenSource {
 private _token: MutableCancellationToken;
 private _cancelled = false;
 private _timeoutHandle?: NodeJS.Timeout;

 constructor() {
 this._token = new MutableCancellationToken(this);
 }

 get token(): CancellationToken {
 return this._token;
 }

 cancel(): void {
 if (!this._cancelled) {
 this._cancelled = true;
 this._token.cancel();

 if (this._timeoutHandle) {
 clearTimeout(this._timeoutHandle);
 this._timeoutHandle = undefined;
 }
 }
 }

 cancelAfter(ms: number): void {
 if (this._timeoutHandle) {
 clearTimeout(this._timeoutHandle);
 }

 this._timeoutHandle = setTimeout(() => {
 this.cancel();
 }, ms);
 }

 dispose(): void {
 this.cancel();
 }

 get isCancellationRequested(): boolean {
 return this._cancelled;
 }
}

class MutableCancellationToken implements CancellationToken {
 private _callbacks: Array<() => void> = [];
 private _cancelled = false;

 constructor(private _source: CancellationTokenSource) {}

 get isCancellationRequested(): boolean {
 return this._cancelled || this._source.isCancellationRequested;
 }

 get canBeCanceled(): boolean {
 return true;
 }

 onCancellationRequested(callback: () => void): void {
 if (this._cancelled) {
 callback();
 } else {
 this._callbacks.push(callback);
 }
 }

 throwIfCancellationRequested(): void {
 if (this.isCancellationRequested) {
 throw new CancellationError('Operation was cancelled');
 }
 }

 cancel(): void {
 if (!this._cancelled) {
 this._cancelled = true;

 // Execute all callbacks
 for (const callback of this._callbacks) {
 try {
 callback();
 } catch (error) {
 logger.error('Error in cancellation callback:', error);
 }
 }

 this._callbacks = [];
 }
 }
}

export class CancellationError extends Error {
 constructor(message: string = 'Operation was cancelled') {
 super(message);
 this.name = 'CancellationError';
 }
}

/**
 * Non-cancellable token (for operations that cannot be cancelled)
 */
export const NonCancellableToken: CancellationToken = {
 isCancellationRequested: false,
 canBeCanceled: false,
 onCancellationRequested: () => {},
 throwIfCancellationRequested: () => {}
};

/**
 * Create a linked cancellation token that cancels when any parent cancels
 */
export function createLinkedToken(...tokens: CancellationToken[]): CancellationTokenSource {
 const source = new CancellationTokenSource();

 for (const token of tokens) {
 if (token.canBeCanceled) {
 token.onCancellationRequested(() => {
 source.cancel();
 });
 }
 }

 return source;
}

/**
 * Run an async operation with cancellation support
 */
export async function withCancellation<T>(
 operation: (token: CancellationToken) => Promise<T>,
 token: CancellationToken
): Promise<T> {
 return new Promise<T>((resolve, reject) => {
 // Check if already cancelled
 if (token.isCancellationRequested) {
 reject(new CancellationError());
 return;
 }

 // Set up cancellation handler
 token.onCancellationRequested(() => {
 reject(new CancellationError());
 });

 // Run the operation
 operation(token).then(resolve, reject);
 });
}

/**
 * Run an async operation with timeout
 */
export async function withTimeout<T>(
 operation: (token: CancellationToken) => Promise<T>,
 timeoutMs: number
): Promise<T> {
 const source = new CancellationTokenSource();
 source.cancelAfter(timeoutMs);

 try {
 return await withCancellation(operation, source.token);
 } finally {
 source.dispose();
 }
}

/**
 * Delay with cancellation support
 */
export function delay(ms: number, token?: CancellationToken): Promise<void> {
 return new Promise((resolve, reject) => {
 if (token?.isCancellationRequested) {
 reject(new CancellationError());
 return;
 }

 const handle = setTimeout(resolve, ms);

 token?.onCancellationRequested(() => {
 clearTimeout(handle);
 reject(new CancellationError());
 });
 });
}

/**
 * Retry with cancellation support
 */
export async function retry<T>(
 operation: (token: CancellationToken) => Promise<T>,
 options: {
 maxRetries: number;
 delayMs: number;
 token?: CancellationToken;
 }
): Promise<T> {
 const token = options.token ?? NonCancellableToken;
 let lastError: Error | undefined;

 for (let i = 0; i <= options.maxRetries; i++) {
 try {
 token.throwIfCancellationRequested();
 return await operation(token);
 } catch (error) {
 if (error instanceof CancellationError) {
 throw error;
 }

 lastError = error as Error;

 if (i < options.maxRetries) {
 await delay(options.delayMs, token);
 }
 }
 }

 throw lastError ?? new Error('Retry failed');
}

/**
 * Run operations in parallel with cancellation support
 */
export async function parallelWithCancellation<T>(
 operations: Array<(token: CancellationToken) => Promise<T>>,
 token: CancellationToken
): Promise<T[]> {
 token.throwIfCancellationRequested();

 const promises = operations.map(op => withCancellation(op, token));
 return Promise.all(promises);
}

/**
 * Run operations in sequence with cancellation support
 */
export async function sequenceWithCancellation<T>(
 operations: Array<(token: CancellationToken) => Promise<T>>,
 token: CancellationToken
): Promise<T[]> {
 const results: T[] = [];

 for (const operation of operations) {
 token.throwIfCancellationRequested();
 const result = await operation(token);
 results.push(result);
 }

 return results;
}

