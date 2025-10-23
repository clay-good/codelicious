/**
 * Cross-File Chunk Linking
 *
 * Links related chunks across files based on:
 * - Import/export relationships
 * - Function calls
 * - Type usage
 * - Semantic similarity
 * - Shared concepts
 */
import { CodeChunk } from './codeChunker';
import { CrossFileTracker } from './crossFileTracker';
export interface ChunkLink {
    sourceChunk: string;
    targetChunk: string;
    linkType: LinkType;
    confidence: number;
    reason: string;
    metadata: {
        sharedSymbols?: string[];
        sharedConcepts?: string[];
        semanticSimilarity?: number;
    };
}
export type LinkType = 'import' | 'call' | 'type_usage' | 'inheritance' | 'semantic' | 'concept' | 'dependency';
export interface ChunkLinkGraph {
    chunks: Map<string, CodeChunk>;
    links: ChunkLink[];
    clusters: ChunkCluster[];
}
export interface ChunkCluster {
    id: string;
    chunks: string[];
    cohesion: number;
    topic: string;
}
export declare class CrossFileChunkLinker {
    private crossFileTracker;
    private linkGraph;
    private chunkIndex;
    constructor(crossFileTracker: CrossFileTracker);
    /**
    * Add chunk to the linker
    */
    addChunk(chunk: CodeChunk): void;
    /**
    * Build links between all chunks
    */
    buildLinks(): Promise<void>;
    /**
    * Get linked chunks for a given chunk
    */
    getLinkedChunks(chunkId: string, options?: {
        linkTypes?: LinkType[];
        minConfidence?: number;
        maxResults?: number;
    }): Array<{
        chunk: CodeChunk;
        link: ChunkLink;
    }>;
    /**
    * Get chunk cluster
    */
    getChunkCluster(chunkId: string): ChunkCluster | undefined;
    /**
    * Find links between two chunks
    */
    private findLinks;
    /**
    * Detect import link
    */
    private detectImportLink;
    /**
    * Detect function call link
    */
    private detectCallLink;
    /**
    * Detect type usage link
    */
    private detectTypeLink;
    /**
    * Detect semantic similarity link
    */
    private detectSemanticLink;
    /**
    * Extract concepts from code
    */
    private extractConcepts;
    /**
    * Build chunk clusters
    */
    private buildClusters;
    /**
    * Expand cluster from seed chunk
    */
    private expandCluster;
    /**
    * Calculate cluster cohesion
    */
    private calculateClusterCohesion;
    /**
    * Get chunk ID
    */
    private getChunkId;
}
//# sourceMappingURL=crossFileChunkLinker.d.ts.map