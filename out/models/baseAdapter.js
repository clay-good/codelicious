"use strict";
/**
 * Base Model Adapter - Abstract interface for AI providers
 *
 * This provides a unified interface that all AI provider adapters must implement.
 * It handles common functionality like rate limiting, retries, and error handling.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseModelAdapter = void 0;
class BaseModelAdapter {
    constructor(config) {
        this.requestCount = 0;
        this.totalCost = 0;
        this.totalTokens = 0;
        this.config = {
            timeout: 60000,
            maxRetries: 3,
            retryDelay: 1000,
            ...config
        };
    }
    /**
    * Calculate cost for a request
    */
    calculateCost(model, promptTokens, completionTokens) {
        const capabilities = this.getCapabilities(model);
        const inputCost = promptTokens * capabilities.costPerInputToken;
        const outputCost = completionTokens * capabilities.costPerOutputToken;
        return inputCost + outputCost;
    }
    /**
    * Update statistics
    */
    updateStats(response) {
        this.requestCount++;
        this.totalCost += response.cost;
        this.totalTokens += response.usage.totalTokens;
    }
    /**
    * Get statistics
    */
    getStats() {
        return {
            requestCount: this.requestCount,
            totalCost: this.totalCost,
            totalTokens: this.totalTokens,
            averageCost: this.requestCount > 0 ? this.totalCost / this.requestCount : 0,
            averageTokens: this.requestCount > 0 ? this.totalTokens / this.requestCount : 0
        };
    }
    /**
    * Reset statistics
    */
    resetStats() {
        this.requestCount = 0;
        this.totalCost = 0;
        this.totalTokens = 0;
    }
    /**
    * Retry logic with exponential backoff
    */
    async retryWithBackoff(fn, retries = this.config.maxRetries || 3) {
        let lastError;
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // Don't retry on certain errors
                if (this.shouldNotRetry(error)) {
                    throw error;
                }
                // Wait before retrying (exponential backoff)
                if (i < retries - 1) {
                    const delay = (this.config.retryDelay || 1000) * Math.pow(2, i);
                    await this.sleep(delay);
                }
            }
        }
        throw lastError || new Error('Max retries exceeded');
    }
    /**
    * Check if error should not be retried
    */
    shouldNotRetry(error) {
        if (error && typeof error === 'object' && 'status' in error) {
            const statusError = error;
            // Don't retry on authentication errors
            if (statusError.status === 401 || statusError.status === 403) {
                return true;
            }
            // Don't retry on invalid request errors
            if (statusError.status === 400 || statusError.status === 422) {
                return true;
            }
        }
        return false;
    }
    /**
    * Sleep utility
    */
    sleep(ms) {
        return new Promise(resolve => {
            const timer = setTimeout(resolve, ms);
            timer.unref(); // Allow Node.js to exit even if this timer is active
        });
    }
    /**
    * Estimate token count (rough approximation)
    */
    estimateTokens(text) {
        // Rough estimate: 1 token ≈ 4 characters
        return Math.ceil(text.length / 4);
    }
    /**
    * Validate request
    */
    validateRequest(request) {
        if (!request.messages || request.messages.length === 0) {
            throw new Error('Request must contain at least one message');
        }
        for (const message of request.messages) {
            if (!message.role || !message.content) {
                throw new Error('Each message must have a role and content');
            }
        }
    }
    /**
    * Format error message
    */
    formatError(error) {
        if (error && typeof error === 'object' && 'response' in error) {
            const axiosError = error;
            if (axiosError.response?.data?.error?.message) {
                return axiosError.response.data.error.message;
            }
        }
        if (error && typeof error === 'object' && 'message' in error) {
            return error.message;
        }
        return 'Unknown error occurred';
    }
    /**
    * Check if model is available
    */
    async isAvailable() {
        try {
            return await this.validateApiKey();
        }
        catch {
            return false;
        }
    }
    /**
    * Get provider name
    */
    getProviderName() {
        return this.getProvider();
    }
}
exports.BaseModelAdapter = BaseModelAdapter;
//# sourceMappingURL=baseAdapter.js.map