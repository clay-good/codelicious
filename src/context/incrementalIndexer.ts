/**
 * Incremental Indexer - Real-time index updates
 *
 * Watches file system changes and updates the persistent index incrementally
 * without rebuilding the entire index.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { PersistentContextEngine, FileMetadata } from './persistentContextEngine';
import { createLogger } from '../utils/logger';

const logger = createLogger('IncrementalIndexer');

export interface IndexUpdate {
 type: 'create' | 'update' | 'delete';
 filePath: string;
 timestamp: number;
}

export class IncrementalIndexer {
 private fileWatcher: vscode.FileSystemWatcher | null = null;
 private updateQueue: IndexUpdate[] = [];
 private isProcessing = false;
 private batchTimeout: NodeJS.Timeout | null = null;

 constructor(
 private contextEngine: PersistentContextEngine,
 private workspaceRoot: string
 ) {}

 /**
 * Start watching for file changes
 */
 start(): vscode.Disposable {
 logger.info('Starting incremental indexer...');

 // Watch all code files
 const patterns = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.go'];
 const watchers: vscode.Disposable[] = [];

 for (const pattern of patterns) {
 const watcher = vscode.workspace.createFileSystemWatcher(
 new vscode.RelativePattern(this.workspaceRoot, pattern)
 );

 // File created
 watcher.onDidCreate(uri => {
 this.queueUpdate({
 type: 'create',
 filePath: uri.fsPath,
 timestamp: Date.now()
 });
 });

 // File changed
 watcher.onDidChange(uri => {
 this.queueUpdate({
 type: 'update',
 filePath: uri.fsPath,
 timestamp: Date.now()
 });
 });

 // File deleted
 watcher.onDidDelete(uri => {
 this.queueUpdate({
 type: 'delete',
 filePath: uri.fsPath,
 timestamp: Date.now()
 });
 });

 watchers.push(watcher);
 }

 logger.info('Incremental indexer started');

 return vscode.Disposable.from(...watchers);
 }

 /**
 * Queue an update for batch processing
 */
 private queueUpdate(update: IndexUpdate): void {
 this.updateQueue.push(update);

 // Clear existing timeout
 if (this.batchTimeout) {
 clearTimeout(this.batchTimeout);
 }

 // Batch updates - process after 1 second of inactivity
 this.batchTimeout = setTimeout(() => {
 this.processBatch();
 }, 1000);
 }

 /**
 * Process batched updates
 */
 private async processBatch(): Promise<void> {
 if (this.isProcessing || this.updateQueue.length === 0) {
 return;
 }

 this.isProcessing = true;
 const updates = [...this.updateQueue];
 this.updateQueue = [];

 logger.info(`Processing ${updates.length} index updates...`);

 try {
 for (const update of updates) {
 await this.processUpdate(update);
 }
 logger.info('Index updates processed');
 } catch (error) {
 logger.error('Failed to process index updates', error);
 } finally {
 this.isProcessing = false;
 }
 }

 /**
 * Process a single update
 */
 private async processUpdate(update: IndexUpdate): Promise<void> {
 switch (update.type) {
 case 'create':
 case 'update':
 await this.updateFile(update.filePath);
 break;
 case 'delete':
 await this.deleteFile(update.filePath);
 break;
 }
 }

 /**
 * Update a file in the index
 */
 private async updateFile(filePath: string): Promise<void> {
 // The context engine will handle the update
 // This is a placeholder - actual implementation would update the persistent index
 logger.debug(`Updating index for: ${path.basename(filePath)}`);
 }

 /**
 * Delete a file from the index
 */
 private async deleteFile(filePath: string): Promise<void> {
 // The context engine will handle the deletion
 // This is a placeholder - actual implementation would remove from persistent index
 logger.debug(`Removing from index: ${path.basename(filePath)}`);
 }

 /**
 * Force immediate processing of queued updates
 */
 async flush(): Promise<void> {
 if (this.batchTimeout) {
 clearTimeout(this.batchTimeout);
 this.batchTimeout = null;
 }
 await this.processBatch();
 }

 /**
 * Get statistics
 */
 getStats(): { queueSize: number; isProcessing: boolean } {
 return {
 queueSize: this.updateQueue.length,
 isProcessing: this.isProcessing
 };
 }
}

