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
import * as crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('SecureKeyStorage');

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

export class SecureKeyStorage {
 private secretStorage: vscode.SecretStorage;
 private context: vscode.ExtensionContext;
 private keyPrefix = 'codelicious.apikey';
 private metadataPrefix = 'codelicious.keymeta';
 private auditLog: KeyAuditEntry[] = [];

 constructor(context: vscode.ExtensionContext) {
 this.context = context;
 this.secretStorage = context.secrets;
 this.loadAuditLog();
 }

 /**
 * Store an API key securely
 */
 async storeKey(provider: string, key: string, expiresAt?: number): Promise<void> {
 const keyId = this.getKeyId(provider);
 const metadataId = this.getMetadataId(provider);

 // Create stored key object
 const storedKey: StoredKey = {
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
 const metadata: KeyMetadata = {
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
 async getKey(provider: string): Promise<string | undefined> {
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
 const storedKey: StoredKey = JSON.parse(storedKeyStr);

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
 } catch (error) {
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
 async deleteKey(provider: string): Promise<void> {
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
 async rotateKey(provider: string, newKey: string): Promise<void> {
 const keyId = this.getKeyId(provider);
 const storedKeyStr = await this.secretStorage.get(keyId);

 if (!storedKeyStr) {
 throw new Error(`No key found for provider: ${provider}`);
 }

 const storedKey: StoredKey = JSON.parse(storedKeyStr);
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
 async getKeyMetadata(provider: string): Promise<KeyMetadata | undefined> {
 const metadataId = this.getMetadataId(provider);
 const metadata = this.context.globalState.get<KeyMetadata>(metadataId);

 if (metadata && metadata.expiresAt) {
 metadata.isExpired = metadata.expiresAt < Date.now();
 }

 return metadata;
 }

 /**
 * List all stored providers
 */
 async listProviders(): Promise<string[]> {
 const keys = this.context.globalState.keys();
 const providers: string[] = [];

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
 async needsRotation(provider: string, policy: KeyRotationPolicy): Promise<boolean> {
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
 async getRotationWarning(provider: string, policy: KeyRotationPolicy): Promise<string | undefined> {
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
 async migrateFromPlainText(config: vscode.WorkspaceConfiguration): Promise<void> {
 const providers = ['claude', 'openai', 'gemini', 'ollama'];
 let migratedCount = 0;

 for (const provider of providers) {
 const key = config.get<string>(`${provider}.apiKey`);
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
 vscode.window.showInformationMessage(
 `Migrated ${migratedCount} API key(s) to secure storage. Please remove them from settings.json.`
 );
 }
 }

 /**
 * Get audit log
 */
 getAuditLog(): KeyAuditEntry[] {
 return [...this.auditLog];
 }

 /**
 * Clear audit log
 */
 clearAuditLog(): void {
 this.auditLog = [];
 this.saveAuditLog();
 }

 /**
 * Get key ID for storage
 */
 private getKeyId(provider: string): string {
 return `${this.keyPrefix}.${provider}`;
 }

 /**
 * Get metadata ID for storage
 */
 private getMetadataId(provider: string): string {
 return `${this.metadataPrefix}.${provider}`;
 }

 /**
 * Update metadata
 */
 private async updateMetadata(provider: string, updates: Partial<KeyMetadata>): Promise<void> {
 const metadataId = this.getMetadataId(provider);
 const metadata = this.context.globalState.get<KeyMetadata>(metadataId);

 if (metadata) {
 const updated = { ...metadata, ...updates };
 await this.context.globalState.update(metadataId, updated);
 }
 }

 /**
 * Add audit entry
 */
 private addAuditEntry(entry: KeyAuditEntry): void {
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
 private loadAuditLog(): void {
 const log = this.context.globalState.get<KeyAuditEntry[]>('codelicious.keyaudit');
 if (log) {
 this.auditLog = log;
 }
 }

 /**
 * Save audit log
 */
 private saveAuditLog(): void {
 this.context.globalState.update('codelicious.keyaudit', this.auditLog);
 }
}

export interface KeyAuditEntry {
 action: 'store' | 'get' | 'delete' | 'rotate';
 provider: string;
 timestamp: number;
 success: boolean;
 error?: string;
}

