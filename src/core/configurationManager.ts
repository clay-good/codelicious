/**
 * Manages extension configuration and settings
 */

import * as vscode from 'vscode';
import { CodeliciousConfig, IndexingConfig, ModelsConfig, ExecutionConfig, CacheConfig, EmbeddingServerConfig } from '../types';

export class ConfigurationManager {
 private static readonly CONFIG_SECTION = 'codelicious';

 /**
 * Get the complete configuration
 */
 getConfig(): CodeliciousConfig {
 return {
 indexing: this.getIndexingConfig(),
 models: this.getModelsConfig(),
 execution: this.getExecutionConfig(),
 cache: this.getCacheConfig(),
 embeddingServer: this.getEmbeddingServerConfig()
 };
 }

 /**
 * Get indexing configuration
 */
 getIndexingConfig(): IndexingConfig {
 const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
 return {
 progressive: config.get('indexing.progressive', true),
 background: config.get('indexing.background', true),
 maxMemory: config.get('indexing.maxMemory', '2GB'),
 excludePatterns: config.get('indexing.excludePatterns', [
 '**/node_modules/**',
 '**/dist/**',
 '**/out/**',
 '**/.git/**',
 '**/build/**',
 '**/.vscode-test/**'
 ])
 };
 }

 /**
 * Get models configuration
 */
 getModelsConfig(): ModelsConfig {
 const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
 return {
 preferLocal: config.get('models.preferLocal', true),
 fallbackToCloud: config.get('models.fallbackToCloud', true),
 costLimit: config.get('models.costLimit', 10.0),
 defaultProvider: config.get('models.defaultProvider')
 };
 }

 /**
 * Get execution configuration
 */
 getExecutionConfig(): ExecutionConfig {
 const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
 return {
 sandbox: config.get('execution.sandbox', true),
 timeout: config.get('execution.timeout', 30000),
 requireConfirmation: config.get('execution.requireConfirmation', true)
 };
 }

 /**
 * Get cache configuration
 */
 getCacheConfig(): CacheConfig {
 const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
 return {
 enabled: config.get('cache.enabled', true),
 maxSize: config.get('cache.maxSize', '1GB'),
 ttl: config.get('cache.ttl', 3600000) // 1 hour default
 };
 }

 /**
 * Get embedding server configuration
 */
 getEmbeddingServerConfig(): EmbeddingServerConfig {
 const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
 return {
 url: config.get('embeddingServer.url', 'http://localhost:8765'),
 timeout: config.get('embeddingServer.timeout', 30000)
 };
 }

 /**
 * Get ChromaDB configuration
 */
 getChromaDBConfig(): { url: string; enabled: boolean } {
 const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
 return {
 url: config.get('chromadb.url', 'http://localhost:8000'),
 enabled: config.get('chromadb.enabled', true)
 };
 }

 /**
 * Update a configuration value
 */
 async updateConfig(key: string, value: unknown, global = false): Promise<void> {
 const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
 await config.update(key, value, global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace);
 }

 /**
 * Watch for configuration changes
 */
 onConfigChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
 return vscode.workspace.onDidChangeConfiguration((e) => {
 if (e.affectsConfiguration(ConfigurationManager.CONFIG_SECTION)) {
 callback(e);
 }
 });
 }
}

