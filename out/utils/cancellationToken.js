"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NonCancellableToken = exports.CancellationError = exports.CancellationTokenSource = void 0;
exports.createLinkedToken = createLinkedToken;
exports.withCancellation = withCancellation;
exports.withTimeout = withTimeout;
exports.delay = delay;
exports.retry = retry;
exports.parallelWithCancellation = parallelWithCancellation;
exports.sequenceWithCancellation = sequenceWithCancellation;
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)('CancellationToken');
class CancellationTokenSource {
    constructor() {
        this._cancelled = false;
        this._token = new MutableCancellationToken(this);
    }
    get token() {
        return this._token;
    }
    cancel() {
        if (!this._cancelled) {
            this._cancelled = true;
            this._token.cancel();
            if (this._timeoutHandle) {
                clearTimeout(this._timeoutHandle);
                this._timeoutHandle = undefined;
            }
        }
    }
    cancelAfter(ms) {
        if (this._timeoutHandle) {
            clearTimeout(this._timeoutHandle);
        }
        this._timeoutHandle = setTimeout(() => {
            this.cancel();
        }, ms);
    }
    dispose() {
        this.cancel();
    }
    get isCancellationRequested() {
        return this._cancelled;
    }
}
exports.CancellationTokenSource = CancellationTokenSource;
class MutableCancellationToken {
    constructor(_source) {
        this._source = _source;
        this._callbacks = [];
        this._cancelled = false;
    }
    get isCancellationRequested() {
        return this._cancelled || this._source.isCancellationRequested;
    }
    get canBeCanceled() {
        return true;
    }
    onCancellationRequested(callback) {
        if (this._cancelled) {
            callback();
        }
        else {
            this._callbacks.push(callback);
        }
    }
    throwIfCancellationRequested() {
        if (this.isCancellationRequested) {
            throw new CancellationError('Operation was cancelled');
        }
    }
    cancel() {
        if (!this._cancelled) {
            this._cancelled = true;
            // Execute all callbacks
            for (const callback of this._callbacks) {
                try {
                    callback();
                }
                catch (error) {
                    logger.error('Error in cancellation callback:', error);
                }
            }
            this._callbacks = [];
        }
    }
}
class CancellationError extends Error {
    constructor(message = 'Operation was cancelled') {
        super(message);
        this.name = 'CancellationError';
    }
}
exports.CancellationError = CancellationError;
/**
 * Non-cancellable token (for operations that cannot be cancelled)
 */
exports.NonCancellableToken = {
    isCancellationRequested: false,
    canBeCanceled: false,
    onCancellationRequested: () => { },
    throwIfCancellationRequested: () => { }
};
/**
 * Create a linked cancellation token that cancels when any parent cancels
 */
function createLinkedToken(...tokens) {
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
async function withCancellation(operation, token) {
    return new Promise((resolve, reject) => {
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
async function withTimeout(operation, timeoutMs) {
    const source = new CancellationTokenSource();
    source.cancelAfter(timeoutMs);
    try {
        return await withCancellation(operation, source.token);
    }
    finally {
        source.dispose();
    }
}
/**
 * Delay with cancellation support
 */
function delay(ms, token) {
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
async function retry(operation, options) {
    const token = options.token ?? exports.NonCancellableToken;
    let lastError;
    for (let i = 0; i <= options.maxRetries; i++) {
        try {
            token.throwIfCancellationRequested();
            return await operation(token);
        }
        catch (error) {
            if (error instanceof CancellationError) {
                throw error;
            }
            lastError = error;
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
async function parallelWithCancellation(operations, token) {
    token.throwIfCancellationRequested();
    const promises = operations.map(op => withCancellation(op, token));
    return Promise.all(promises);
}
/**
 * Run operations in sequence with cancellation support
 */
async function sequenceWithCancellation(operations, token) {
    const results = [];
    for (const operation of operations) {
        token.throwIfCancellationRequested();
        const result = await operation(token);
        results.push(result);
    }
    return results;
}
//# sourceMappingURL=cancellationToken.js.map