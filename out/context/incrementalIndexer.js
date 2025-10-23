"use strict";
/**
 * Incremental Indexer - Real-time index updates
 *
 * Watches file system changes and updates the persistent index incrementally
 * without rebuilding the entire index.
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
exports.IncrementalIndexer = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('IncrementalIndexer');
class IncrementalIndexer {
    constructor(contextEngine, workspaceRoot) {
        this.contextEngine = contextEngine;
        this.workspaceRoot = workspaceRoot;
        this.fileWatcher = null;
        this.updateQueue = [];
        this.isProcessing = false;
        this.batchTimeout = null;
    }
    /**
    * Start watching for file changes
    */
    start() {
        logger.info('Starting incremental indexer...');
        // Watch all code files
        const patterns = ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.py', '**/*.java', '**/*.go'];
        const watchers = [];
        for (const pattern of patterns) {
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.workspaceRoot, pattern));
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
    queueUpdate(update) {
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
    async processBatch() {
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
        }
        catch (error) {
            logger.error('Failed to process index updates', error);
        }
        finally {
            this.isProcessing = false;
        }
    }
    /**
    * Process a single update
    */
    async processUpdate(update) {
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
    async updateFile(filePath) {
        // The context engine will handle the update
        // This is a placeholder - actual implementation would update the persistent index
        logger.debug(`Updating index for: ${path.basename(filePath)}`);
    }
    /**
    * Delete a file from the index
    */
    async deleteFile(filePath) {
        // The context engine will handle the deletion
        // This is a placeholder - actual implementation would remove from persistent index
        logger.debug(`Removing from index: ${path.basename(filePath)}`);
    }
    /**
    * Force immediate processing of queued updates
    */
    async flush() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        await this.processBatch();
    }
    /**
    * Get statistics
    */
    getStats() {
        return {
            queueSize: this.updateQueue.length,
            isProcessing: this.isProcessing
        };
    }
}
exports.IncrementalIndexer = IncrementalIndexer;
//# sourceMappingURL=incrementalIndexer.js.map