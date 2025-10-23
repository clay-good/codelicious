/**
 * Secure storage for API keys and sensitive data
 */

import * as vscode from 'vscode';

export class SecureStorageManager {
 private static readonly API_KEY_PREFIX = 'codelicious.apiKey.';

 constructor(private context: vscode.ExtensionContext) {}

 /**
 * Store an API key securely
 */
 async storeApiKey(provider: string, apiKey: string): Promise<void> {
 const key = `${SecureStorageManager.API_KEY_PREFIX}${provider}`;
 await this.context.secrets.store(key, apiKey);
 }

 /**
 * Retrieve an API key
 */
 async getApiKey(provider: string): Promise<string | undefined> {
 const key = `${SecureStorageManager.API_KEY_PREFIX}${provider}`;
 return await this.context.secrets.get(key);
 }

 /**
 * Delete an API key
 */
 async deleteApiKey(provider: string): Promise<void> {
 const key = `${SecureStorageManager.API_KEY_PREFIX}${provider}`;
 await this.context.secrets.delete(key);
 }

 /**
 * Check if an API key exists for a provider
 */
 async hasApiKey(provider: string): Promise<boolean> {
 const apiKey = await this.getApiKey(provider);
 return apiKey !== undefined && apiKey.length > 0;
 }

 /**
 * Store generic secure data
 */
 async store(key: string, value: string): Promise<void> {
 await this.context.secrets.store(key, value);
 }

 /**
 * Retrieve generic secure data
 */
 async get(key: string): Promise<string | undefined> {
 return await this.context.secrets.get(key);
 }

 /**
 * Delete generic secure data
 */
 async delete(key: string): Promise<void> {
 await this.context.secrets.delete(key);
 }
}

