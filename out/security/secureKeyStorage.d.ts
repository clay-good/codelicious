/**
 * Secure Key Storage
 *
 * Provides secure storage for API keys and sensitive credentials using:
 * - VS Code's SecretStorage API (encrypted at OS level)
 * - Key rotation support
 * - Audit logging
 * - Automatic migration from plain text config
 */
import * as vscode from 'vscode';
export interface StoredKey {
    key: string;
    provider: string;
    createdAt: number;
    lastUsed: number;
    rotationCount: number;
    expiresAt?: number;
}
export interface KeyMetadata {
    provider: string;
    createdAt: number;
    lastUsed: number;
    rotationCount: number;
    expiresAt?: number;
    isExpired: boolean;
}
export interface KeyRotationPolicy {
    enabled: boolean;
    intervalDays: number;
    warnBeforeDays: number;
}
export declare class SecureKeyStorage {
    private secretStorage;
    private context;
    private keyPrefix;
    private metadataPrefix;
    private auditLog;
    constructor(context: vscode.ExtensionContext);
    /**
    * Store an API key securely
    */
    storeKey(provider: string, key: string, expiresAt?: number): Promise<void>;
    /**
    * Retrieve an API key
    */
    getKey(provider: string): Promise<string | undefined>;
    /**
    * Delete an API key
    */
    deleteKey(provider: string): Promise<void>;
    /**
    * Rotate an API key
    */
    rotateKey(provider: string, newKey: string): Promise<void>;
    /**
    * Get metadata for a key
    */
    getKeyMetadata(provider: string): Promise<KeyMetadata | undefined>;
    /**
    * List all stored providers
    */
    listProviders(): Promise<string[]>;
    /**
    * Check if a key needs rotation
    */
    needsRotation(provider: string, policy: KeyRotationPolicy): Promise<boolean>;
    /**
    * Get rotation warning
    */
    getRotationWarning(provider: string, policy: KeyRotationPolicy): Promise<string | undefined>;
    /**
    * Migrate from plain text configuration
    */
    migrateFromPlainText(config: vscode.WorkspaceConfiguration): Promise<void>;
    /**
    * Get audit log
    */
    getAuditLog(): KeyAuditEntry[];
    /**
    * Clear audit log
    */
    clearAuditLog(): void;
    /**
    * Get key ID for storage
    */
    private getKeyId;
    /**
    * Get metadata ID for storage
    */
    private getMetadataId;
    /**
    * Update metadata
    */
    private updateMetadata;
    /**
    * Add audit entry
    */
    private addAuditEntry;
    /**
    * Load audit log
    */
    private loadAuditLog;
    /**
    * Save audit log
    */
    private saveAuditLog;
}
export interface KeyAuditEntry {
    action: 'store' | 'get' | 'delete' | 'rotate';
    provider: string;
    timestamp: number;
    success: boolean;
    error?: string;
}
//# sourceMappingURL=secureKeyStorage.d.ts.map