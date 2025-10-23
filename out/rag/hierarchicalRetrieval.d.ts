/**
 * Hierarchical Retrieval System
 *
 * Multi-level retrieval that progressively narrows down results:
 * Level 1: File-level retrieval (find relevant files)
 * Level 2: Chunk-level retrieval (find relevant chunks within files)
 * Level 3: Symbol-level retrieval (find specific symbols/functions)
 * Level 4: Line-level retrieval (find exact lines)
 *
 * This approach improves precision and reduces noise in retrieval results.
 */
import { CodeChunk } from '../embedding/codeChunker';
import { ASTSymbol } from '../embedding/astAnalyzer';
import { CrossFileTracker } from '../embedding/crossFileTracker';
export interface HierarchicalQuery {
    query: string;
    maxResults?: number;
    levels?: RetrievalLevel[];
    filters?: RetrievalFilters;
    expansionStrategy?: 'none' | 'related' | 'dependencies' | 'full';
}
export type RetrievalLevel = 'file' | 'chunk' | 'symbol' | 'line';
export interface RetrievalFilters {
    filePatterns?: string[];
    excludePatterns?: string[];
    languages?: string[];
    minRelevance?: number;
    symbolTypes?: string[];
    dateRange?: {
        start: Date;
        end: Date;
    };
}
export interface HierarchicalResult {
    level: RetrievalLevel;
    results: RetrievalItem[];
    metadata: {
        totalResults: number;
        processingTime: number;
        levelsProcessed: RetrievalLevel[];
        expansionApplied: boolean;
    };
}
export interface RetrievalItem {
    level: RetrievalLevel;
    path: string;
    content: string;
    relevance: number;
    context?: {
        parentFile?: string;
        parentChunk?: string;
        parentSymbol?: string;
        lineNumber?: number;
        relatedItems?: string[];
    };
    metadata: {
        language?: string;
        symbolType?: string;
        complexity?: number;
        lastModified?: number;
    };
}
export interface FileScore {
    path: string;
    score: number;
    reasons: string[];
}
export interface ChunkScore {
    chunk: CodeChunk;
    score: number;
    fileScore: number;
    reasons: string[];
}
export interface SymbolScore {
    symbol: ASTSymbol;
    score: number;
    chunkScore: number;
    reasons: string[];
}
export declare class HierarchicalRetrieval {
    private crossFileTracker;
    private fileCache;
    private chunkCache;
    private astCache;
    constructor(crossFileTracker: CrossFileTracker);
    /**
    * Perform hierarchical retrieval
    */
    retrieve(query: HierarchicalQuery): Promise<HierarchicalResult>;
    /**
    * Level 1: Retrieve relevant files
    */
    private retrieveFiles;
    /**
    * Level 2: Retrieve relevant chunks from files
    */
    private retrieveChunks;
    /**
    * Level 3: Retrieve relevant symbols
    */
    private retrieveSymbols;
    /**
    * Level 4: Retrieve relevant lines
    */
    private retrieveLines;
    /**
    * Expand results based on strategy
    */
    private expandResults;
    /**
    * Score a file for relevance
    */
    private scoreFile;
    /**
    * Score a chunk for relevance
    */
    private scoreChunk;
    /**
    * Score a symbol for relevance
    */
    private scoreSymbol;
    /**
    * Score a line match
    */
    private scoreLineMatch;
    /**
    * Check if file matches filters
    */
    private matchesFilters;
    /**
    * Fuzzy match
    */
    private fuzzyMatch;
    /**
    * Convert to retrieval item
    */
    private toRetrievalItem;
}
//# sourceMappingURL=hierarchicalRetrieval.d.ts.map