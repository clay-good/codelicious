/**
 * Incremental Indexer - Real-time index updates
 *
 * Watches file system changes and updates the persistent index incrementally
 * without rebuilding the entire index.
 */
import * as vscode from 'vscode';
import { PersistentContextEngine } from './persistentContextEngine';
export interface IndexUpdate {
    type: 'create' | 'update' | 'delete';
    filePath: string;
    timestamp: number;
}
export declare class IncrementalIndexer {
    private contextEngine;
    private workspaceRoot;
    private fileWatcher;
    private updateQueue;
    private isProcessing;
    private batchTimeout;
    constructor(contextEngine: PersistentContextEngine, workspaceRoot: string);
    /**
    * Start watching for file changes
    */
    start(): vscode.Disposable;
    /**
    * Queue an update for batch processing
    */
    private queueUpdate;
    /**
    * Process batched updates
    */
    private processBatch;
    /**
    * Process a single update
    */
    private processUpdate;
    /**
    * Update a file in the index
    */
    private updateFile;
    /**
    * Delete a file from the index
    */
    private deleteFile;
    /**
    * Force immediate processing of queued updates
    */
    flush(): Promise<void>;
    /**
    * Get statistics
    */
    getStats(): {
        queueSize: number;
        isProcessing: boolean;
    };
}
//# sourceMappingURL=incrementalIndexer.d.ts.map