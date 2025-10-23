/**
 * Manages extension configuration and settings
 */
import * as vscode from 'vscode';
import { CodeliciousConfig, IndexingConfig, ModelsConfig, ExecutionConfig, CacheConfig, EmbeddingServerConfig } from '../types';
export declare class ConfigurationManager {
    private static readonly CONFIG_SECTION;
    /**
    * Get the complete configuration
    */
    getConfig(): CodeliciousConfig;
    /**
    * Get indexing configuration
    */
    getIndexingConfig(): IndexingConfig;
    /**
    * Get models configuration
    */
    getModelsConfig(): ModelsConfig;
    /**
    * Get execution configuration
    */
    getExecutionConfig(): ExecutionConfig;
    /**
    * Get cache configuration
    */
    getCacheConfig(): CacheConfig;
    /**
    * Get embedding server configuration
    */
    getEmbeddingServerConfig(): EmbeddingServerConfig;
    /**
    * Get ChromaDB configuration
    */
    getChromaDBConfig(): {
        url: string;
        enabled: boolean;
    };
    /**
    * Update a configuration value
    */
    updateConfig(key: string, value: unknown, global?: boolean): Promise<void>;
    /**
    * Watch for configuration changes
    */
    onConfigChange(callback: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable;
}
//# sourceMappingURL=configurationManager.d.ts.map