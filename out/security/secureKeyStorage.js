"use strict";
/**
 * Secure Key Storage
 *
 * Provides secure storage for API keys and sensitive credentials using:
 * - VS Code's SecretStorage API (encrypted at OS level)
 * - Key rotation support
 * - Audit logging
 * - Automatic migration from plain text config
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
exports.SecureKeyStorage = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('SecureKeyStorage');
class SecureKeyStorage {
    constructor(context) {
        this.keyPrefix = 'codelicious.apikey';
        this.metadataPrefix = 'codelicious.keymeta';
        this.auditLog = [];
        this.context = context;
        this.secretStorage = context.secrets;
        this.loadAuditLog();
    }
    /**
    * Store an API key securely
    */
    async storeKey(provider, key, expiresAt) {
        const keyId = this.getKeyId(provider);
        const metadataId = this.getMetadataId(provider);
        // Create stored key object
        const storedKey = {
            key,
            provider,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            rotationCount: 0,
            expiresAt
        };
        // Store key in SecretStorage (encrypted by VS Code)
        await this.secretStorage.store(keyId, JSON.stringify(storedKey));
        // Store metadata separately for quick access
        const metadata = {
            provider,
            createdAt: storedKey.createdAt,
            lastUsed: storedKey.lastUsed,
            rotationCount: storedKey.rotationCount,
            expiresAt,
            isExpired: false
        };
        await this.context.globalState.update(metadataId, metadata);
        // Audit log
        this.addAuditEntry({
            action: 'store',
            provider,
            timestamp: Date.now(),
            success: true
        });
        logger.info(`[SecureKeyStorage] Stored key for provider: ${provider}`);
    }
    /**
    * Retrieve an API key
    */
    async getKey(provider) {
        const keyId = this.getKeyId(provider);
        const storedKeyStr = await this.secretStorage.get(keyId);
        if (!storedKeyStr) {
            this.addAuditEntry({
                action: 'get',
                provider,
                timestamp: Date.now(),
                success: false,
                error: 'Key not found'
            });
            return undefined;
        }
        try {
            const storedKey = JSON.parse(storedKeyStr);
            // Check if expired
            if (storedKey.expiresAt && storedKey.expiresAt < Date.now()) {
                this.addAuditEntry({
                    action: 'get',
                    provider,
                    timestamp: Date.now(),
                    success: false,
                    error: 'Key expired'
                });
                return undefined;
            }
            // Update last used
            storedKey.lastUsed = Date.now();
            await this.secretStorage.store(keyId, JSON.stringify(storedKey));
            // Update metadata
            await this.updateMetadata(provider, { lastUsed: Date.now() });
            this.addAuditEntry({
                action: 'get',
                provider,
                timestamp: Date.now(),
                success: true
            });
            return storedKey.key;
        }
        catch (error) {
            this.addAuditEntry({
                action: 'get',
                provider,
                timestamp: Date.now(),
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return undefined;
        }
    }
    /**
    * Delete an API key
    */
    async deleteKey(provider) {
        const keyId = this.getKeyId(provider);
        const metadataId = this.getMetadataId(provider);
        await this.secretStorage.delete(keyId);
        await this.context.globalState.update(metadataId, undefined);
        this.addAuditEntry({
            action: 'delete',
            provider,
            timestamp: Date.now(),
            success: true
        });
        logger.info(`[SecureKeyStorage] Deleted key for provider: ${provider}`);
    }
    /**
    * Rotate an API key
    */
    async rotateKey(provider, newKey) {
        const keyId = this.getKeyId(provider);
        const storedKeyStr = await this.secretStorage.get(keyId);
        if (!storedKeyStr) {
            throw new Error(`No key found for provider: ${provider}`);
        }
        const storedKey = JSON.parse(storedKeyStr);
        storedKey.key = newKey;
        storedKey.rotationCount++;
        storedKey.lastUsed = Date.now();
        await this.secretStorage.store(keyId, JSON.stringify(storedKey));
        await this.updateMetadata(provider, {
            rotationCount: storedKey.rotationCount,
            lastUsed: Date.now()
        });
        this.addAuditEntry({
            action: 'rotate',
            provider,
            timestamp: Date.now(),
            success: true
        });
        logger.info(`[SecureKeyStorage] Rotated key for provider: ${provider} (rotation #${storedKey.rotationCount})`);
    }
    /**
    * Get metadata for a key
    */
    async getKeyMetadata(provider) {
        const metadataId = this.getMetadataId(provider);
        const metadata = this.context.globalState.get(metadataId);
        if (metadata && metadata.expiresAt) {
            metadata.isExpired = metadata.expiresAt < Date.now();
        }
        return metadata;
    }
    /**
    * List all stored providers
    */
    async listProviders() {
        const keys = this.context.globalState.keys();
        const providers = [];
        for (const key of keys) {
            if (key.startsWith(this.metadataPrefix)) {
                const provider = key.replace(`${this.metadataPrefix}.`, '');
                providers.push(provider);
            }
        }
        return providers;
    }
    /**
    * Check if a key needs rotation
    */
    async needsRotation(provider, policy) {
        if (!policy.enabled) {
            return false;
        }
        const metadata = await this.getKeyMetadata(provider);
        if (!metadata) {
            return false;
        }
        const daysSinceCreation = (Date.now() - metadata.createdAt) / (1000 * 60 * 60 * 24);
        return daysSinceCreation >= policy.intervalDays;
    }
    /**
    * Get rotation warning
    */
    async getRotationWarning(provider, policy) {
        if (!policy.enabled) {
            return undefined;
        }
        const metadata = await this.getKeyMetadata(provider);
        if (!metadata) {
            return undefined;
        }
        const daysSinceCreation = (Date.now() - metadata.createdAt) / (1000 * 60 * 60 * 24);
        const daysUntilRotation = policy.intervalDays - daysSinceCreation;
        if (daysUntilRotation <= policy.warnBeforeDays && daysUntilRotation > 0) {
            return `API key for ${provider} should be rotated in ${Math.ceil(daysUntilRotation)} days`;
        }
        if (daysUntilRotation <= 0) {
            return `API key for ${provider} should be rotated now`;
        }
        return undefined;
    }
    /**
    * Migrate from plain text configuration
    */
    async migrateFromPlainText(config) {
        const providers = ['claude', 'openai', 'gemini', 'ollama'];
        let migratedCount = 0;
        for (const provider of providers) {
            const key = config.get(`${provider}.apiKey`);
            if (key && key.trim()) {
                // Check if already migrated
                const existing = await this.getKey(provider);
                if (!existing) {
                    await this.storeKey(provider, key);
                    migratedCount++;
                    logger.info(`[SecureKeyStorage] Migrated ${provider} API key from plain text`);
                }
            }
        }
        if (migratedCount > 0) {
            vscode.window.showInformationMessage(`Migrated ${migratedCount} API key(s) to secure storage. Please remove them from settings.json.`);
        }
    }
    /**
    * Get audit log
    */
    getAuditLog() {
        return [...this.auditLog];
    }
    /**
    * Clear audit log
    */
    clearAuditLog() {
        this.auditLog = [];
        this.saveAuditLog();
    }
    /**
    * Get key ID for storage
    */
    getKeyId(provider) {
        return `${this.keyPrefix}.${provider}`;
    }
    /**
    * Get metadata ID for storage
    */
    getMetadataId(provider) {
        return `${this.metadataPrefix}.${provider}`;
    }
    /**
    * Update metadata
    */
    async updateMetadata(provider, updates) {
        const metadataId = this.getMetadataId(provider);
        const metadata = this.context.globalState.get(metadataId);
        if (metadata) {
            const updated = { ...metadata, ...updates };
            await this.context.globalState.update(metadataId, updated);
        }
    }
    /**
    * Add audit entry
    */
    addAuditEntry(entry) {
        this.auditLog.push(entry);
        // Keep only last 1000 entries
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }
        this.saveAuditLog();
    }
    /**
    * Load audit log
    */
    loadAuditLog() {
        const log = this.context.globalState.get('codelicious.keyaudit');
        if (log) {
            this.auditLog = log;
        }
    }
    /**
    * Save audit log
    */
    saveAuditLog() {
        this.context.globalState.update('codelicious.keyaudit', this.auditLog);
    }
}
exports.SecureKeyStorage = SecureKeyStorage;
//# sourceMappingURL=secureKeyStorage.js.map