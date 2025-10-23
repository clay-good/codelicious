"use strict";
/**
 * Manages extension configuration and settings
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationManager = void 0;
const vscode = __importStar(require("vscode"));
class ConfigurationManager {
    /**
    * Get the complete configuration
    */
    getConfig() {
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
    getIndexingConfig() {
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
    getModelsConfig() {
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
    getExecutionConfig() {
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
    getCacheConfig() {
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
    getEmbeddingServerConfig() {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        return {
            url: config.get('embeddingServer.url', 'http://localhost:8765'),
            timeout: config.get('embeddingServer.timeout', 30000)
        };
    }
    /**
    * Get ChromaDB configuration
    */
    getChromaDBConfig() {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        return {
            url: config.get('chromadb.url', 'http://localhost:8000'),
            enabled: config.get('chromadb.enabled', true)
        };
    }
    /**
    * Update a configuration value
    */
    async updateConfig(key, value, global = false) {
        const config = vscode.workspace.getConfiguration(ConfigurationManager.CONFIG_SECTION);
        await config.update(key, value, global ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace);
    }
    /**
    * Watch for configuration changes
    */
    onConfigChange(callback) {
        return vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(ConfigurationManager.CONFIG_SECTION)) {
                callback(e);
            }
        });
    }
}
exports.ConfigurationManager = ConfigurationManager;
ConfigurationManager.CONFIG_SECTION = 'codelicious';
//# sourceMappingURL=configurationManager.js.map