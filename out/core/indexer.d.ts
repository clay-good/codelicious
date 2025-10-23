/**
 * Progressive Indexing Engine
 * Implements 5-phase progressive indexing with incremental updates
 */
import * as vscode from 'vscode';
import { ConfigurationManager } from './configurationManager';
import { StatusBarManager } from '../ui/statusBar';
import { IndexingProgress, FileMetadata } from '../types';
export interface IEmbeddingService {
    embedAllFiles(workspacePath: string): Promise<void>;
    updateFileEmbeddings(filePath: string, workspacePath: string): Promise<void>;
    deleteFileEmbeddings(filePath: string): Promise<void>;
    isReady(): boolean;
}
export declare class IndexingEngine {
    private context;
    private configManager;
    private statusBar;
    private progressCallbacks;
    private currentProgress;
    private indexedFiles;
    private fileQueue;
    private isIndexing;
    private shouldStop;
    private workspacePath;
    private projectType;
    private embeddingService?;
    private parallelIndexer;
    constructor(context: vscode.ExtensionContext, configManager: ConfigurationManager, statusBar: StatusBarManager);
    /**
    * Start indexing a workspace with progressive phases
    */
    startIndexing(workspacePath: string): Promise<void>;
    /**
    * Phase 1: Basic indexing (0-5s)
    * - Map file structure
    * - Detect project type
    * - Parse package files
    */
    private runPhase1Basic;
    /**
    * Phase 2: Structure indexing (5-30s)
    * - Extract symbols from files
    * - Build import/export graphs
    * - Identify patterns
    *
    * OPTIMIZED: Uses parallel processing for 60-70% faster indexing
    */
    private runPhase2Structure;
    /**
    * Fallback: Sequential structure indexing
    */
    private runPhase2StructureSequential;
    /**
    * Index file structure (symbols, imports, exports)
    */
    private indexFileStructure;
    /**
    * Phase 3: Semantic indexing (30s-2m)
    * - Generate embeddings
    * - Build semantic index
    * - Map relationships
    */
    private runPhase3Semantic;
    /**
    * Phase 4: Deep analysis (2-5m)
    * - Code quality analysis
    * - Calculate metrics
    * - Dependency analysis
    */
    private runPhase4Deep;
    /**
    * Phase 5: Continuous updates
    * - Track changes in real-time
    * - Update incrementally
    */
    private enterPhase5Continuous;
    /**
    * Index a single file (for real-time updates)
    */
    indexFile(filePath: string): Promise<void>;
    /**
    * Set the embedding service (to avoid circular dependency)
    */
    setEmbeddingService(embeddingService: IEmbeddingService): void;
    /**
    * Update an indexed file
    */
    updateFile(filePath: string): Promise<void>;
    /**
    * Remove a file from the index
    */
    removeFile(filePath: string): Promise<void>;
    /**
    * Reindex the entire workspace
    */
    reindex(): Promise<void>;
    /**
    * Get current indexing status
    */
    getStatus(): IndexingProgress;
    /**
    * Get metadata for a specific file
    */
    getFileMetadata(filePath: string): FileMetadata | undefined;
    /**
    * Get all indexed files
    */
    getIndexedFiles(): FileMetadata[];
    /**
    * Search for symbols by name
    */
    searchSymbols(query: string): FileMetadata[];
    /**
    * Get project statistics
    */
    getStatistics(): {
        totalFiles: number;
        totalSymbols: number;
        byLanguage: Map<string, number>;
        byType: Map<string, number>;
    };
    /**
    * Register a progress callback
    */
    onProgress(callback: (progress: IndexingProgress) => void): void;
    /**
    * Update progress and notify callbacks
    */
    private updateProgress;
    /**
    * Stop indexing
    */
    stop(): void;
    /**
    * Clean up resources
    */
    dispose(): Promise<void>;
}
//# sourceMappingURL=indexer.d.ts.map