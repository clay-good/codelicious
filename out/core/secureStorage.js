"use strict";
/**
 * Secure storage for API keys and sensitive data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureStorageManager = void 0;
class SecureStorageManager {
    constructor(context) {
        this.context = context;
    }
    /**
    * Store an API key securely
    */
    async storeApiKey(provider, apiKey) {
        const key = `${SecureStorageManager.API_KEY_PREFIX}${provider}`;
        await this.context.secrets.store(key, apiKey);
    }
    /**
    * Retrieve an API key
    */
    async getApiKey(provider) {
        const key = `${SecureStorageManager.API_KEY_PREFIX}${provider}`;
        return await this.context.secrets.get(key);
    }
    /**
    * Delete an API key
    */
    async deleteApiKey(provider) {
        const key = `${SecureStorageManager.API_KEY_PREFIX}${provider}`;
        await this.context.secrets.delete(key);
    }
    /**
    * Check if an API key exists for a provider
    */
    async hasApiKey(provider) {
        const apiKey = await this.getApiKey(provider);
        return apiKey !== undefined && apiKey.length > 0;
    }
    /**
    * Store generic secure data
    */
    async store(key, value) {
        await this.context.secrets.store(key, value);
    }
    /**
    * Retrieve generic secure data
    */
    async get(key) {
        return await this.context.secrets.get(key);
    }
    /**
    * Delete generic secure data
    */
    async delete(key) {
        await this.context.secrets.delete(key);
    }
}
exports.SecureStorageManager = SecureStorageManager;
SecureStorageManager.API_KEY_PREFIX = 'codelicious.apiKey.';
//# sourceMappingURL=secureStorage.js.map