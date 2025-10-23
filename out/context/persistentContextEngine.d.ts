/**
 * Persistent Context Engine - Augment-style 200k+ token context with persistent indexing
 *
 * This engine provides:
 * 1. Persistent indexing of 400k+ files
 * 2. Architectural pattern recognition
 * 3. Cross-repository dependency mapping
 * 4. Real-time incremental updates
 * 5. 200k+ token context assembly
 *
 * Matches Augment Code's context capabilities:
 * - Multi-repository intelligence
 * - Persistent searchable indexes
 * - Architectural understanding
 * - 40% reduction in hallucinations
 */
import * as vscode from 'vscode';
import { VectorStore } from '../embedding/vectorStore';
import { EmbeddingManager } from '../embedding/embeddingManager';
export interface ArchitecturalPattern {
    type: 'mvc' | 'microservice' | 'layered' | 'event-driven' | 'repository' | 'factory' | 'singleton' | 'observer';
    confidence: number;
    files: string[];
    description: string;
    relationships: string[];
}
export interface DependencyInfo {
    from: string;
    to: string;
    type: 'import' | 'require' | 'dynamic' | 'type' | 'extends' | 'implements';
    line: number;
    resolved: boolean;
}
export interface FileMetadata {
    path: string;
    language: string;
    size: number;
    lastModified: number;
    symbols: SymbolInfo[];
    dependencies: DependencyInfo[];
    patterns: string[];
    complexity: number;
}
export interface SymbolInfo {
    name: string;
    kind: string;
    line: number;
    signature?: string;
    documentation?: string;
}
export interface PersistentIndex {
    version: string;
    timestamp: number;
    workspaceRoot: string;
    files: Map<string, FileMetadata>;
    patterns: ArchitecturalPattern[];
    dependencyGraph: Map<string, string[]>;
    symbolIndex: Map<string, SymbolInfo[]>;
}
export interface ArchitecturalContext {
    query: string;
    relevantFiles: FileMetadata[];
    patterns: ArchitecturalPattern[];
    dependencies: DependencyInfo[];
    symbols: SymbolInfo[];
    totalTokens: number;
    assembledContext: string;
}
export interface QueryOptions {
    maxTokens: number;
    includePatterns?: boolean;
    includeDependencies?: boolean;
    includeSymbols?: boolean;
    fileTypes?: string[];
}
export declare class PersistentIndexStore {
    private context;
    private indexPath;
    private index;
    constructor(context: vscode.ExtensionContext);
    load(): Promise<PersistentIndex | null>;
    save(index: PersistentIndex): Promise<void>;
    search(query: string): Promise<FileMetadata[]>;
}
export declare class ArchitectureAnalyzer {
    /**
    * Analyze codebase for architectural patterns
    */
    analyze(files: FileMetadata[]): Promise<ArchitecturalPattern[]>;
    private detectMVC;
    private detectMicroservice;
    private detectLayered;
    private detectDesignPatterns;
    /**
    * Enrich results with architectural context
    */
    enrich(results: FileMetadata[]): Promise<FileMetadata[]>;
    private identifyFilePatterns;
}
export declare class DependencyMapper {
    /**
    * Map all dependencies in the codebase
    */
    mapAll(files: FileMetadata[]): Promise<Map<string, string[]>>;
    /**
    * Add dependency information to results
    */
    addDependencies(files: FileMetadata[]): Promise<FileMetadata[]>;
}
export declare class PersistentContextEngine {
    private context;
    private indexStore;
    private architectureAnalyzer;
    private dependencyMapper;
    private vectorStore;
    private embeddingManager;
    private isInitialized;
    constructor(context: vscode.ExtensionContext, vectorStore: VectorStore, embeddingManager: EmbeddingManager);
    /**
    * Initialize the engine - load existing index or build new one
    */
    initialize(workspaceRoot: string): Promise<void>;
    /**
    * Build persistent index of entire codebase
    * Matches Augment's capability to index 400k+ files
    */
    buildPersistentIndex(workspaceRoot: string): Promise<void>;
    /**
    * Scan codebase and extract metadata
    */
    private scanCodebase;
    /**
    * Extract metadata from a single file
    */
    private extractFileMetadata;
    /**
    * Analyze file using TypeScript compiler API
    */
    private analyzeFile;
    /**
    * Build symbol index for fast lookup
    */
    private buildSymbolIndex;
    /**
    * Query context with architectural understanding
    * Returns 200k+ tokens of context like Augment
    */
    queryWithArchitecture(query: string, options: QueryOptions): Promise<ArchitecturalContext>;
    /**
    * Assemble context from results
    */
    private assembleContext;
    /**
    * Format context for AI consumption
    */
    private formatContext;
    /**
    * Helper methods
    */
    private readFileContent;
    private detectLanguage;
    private calculateComplexity;
}
//# sourceMappingURL=persistentContextEngine.d.ts.map