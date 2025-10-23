/**
 * Secure storage for API keys and sensitive data
 */
import * as vscode from 'vscode';
export declare class SecureStorageManager {
    private context;
    private static readonly API_KEY_PREFIX;
    constructor(context: vscode.ExtensionContext);
    /**
    * Store an API key securely
    */
    storeApiKey(provider: string, apiKey: string): Promise<void>;
    /**
    * Retrieve an API key
    */
    getApiKey(provider: string): Promise<string | undefined>;
    /**
    * Delete an API key
    */
    deleteApiKey(provider: string): Promise<void>;
    /**
    * Check if an API key exists for a provider
    */
    hasApiKey(provider: string): Promise<boolean>;
    /**
    * Store generic secure data
    */
    store(key: string, value: string): Promise<void>;
    /**
    * Retrieve generic secure data
    */
    get(key: string): Promise<string | undefined>;
    /**
    * Delete generic secure data
    */
    delete(key: string): Promise<void>;
}
//# sourceMappingURL=secureStorage.d.ts.map