/**
 * Semantic Chunker - Advanced chunking with semantic boundary detection and AST analysis
 *
 * Features:
 * - Semantic boundary detection (logical code blocks, related statements)
 * - AST-based semantic analysis for better understanding
 * - Context preservation across chunks
 * - Intelligent chunk sizing based on semantic meaning
 */
import { CodeChunk } from './codeChunker';
export interface SemanticChunk extends CodeChunk {
    semanticType: 'definition' | 'implementation' | 'usage' | 'documentation' | 'mixed';
    relatedSymbols: string[];
    imports: string[];
    exports: string[];
    complexity: number;
    contextBefore?: string;
    contextAfter?: string;
}
export interface SemanticBoundary {
    line: number;
    type: 'hard' | 'soft';
    reason: string;
    confidence: number;
}
export declare class SemanticChunker {
    private maxChunkSize;
    private minChunkSize;
    private contextLines;
    constructor(maxChunkSize?: number, minChunkSize?: number, contextLines?: number);
    /**
    * Chunk code file with semantic awareness
    */
    chunkFile(filePath: string, content: string): Promise<SemanticChunk[]>;
    /**
    * Detect semantic boundaries in code
    */
    private detectSemanticBoundaries;
    /**
    * Create chunks from detected boundaries
    */
    private createChunksFromBoundaries;
    /**
    * Create a semantic chunk with metadata
    */
    private createSemanticChunk;
    /**
    * Determine the semantic type of a chunk
    */
    private determineSemanticType;
    /**
    * Extract related symbols mentioned in the content
    */
    private extractRelatedSymbols;
    /**
    * Estimate cyclomatic complexity
    */
    private estimateComplexity;
    private isComment;
    private isControlFlowStatement;
    private isImportOrExport;
    private isDecorator;
    private isMultiLineCommentStart;
    private getChunkType;
    private extractImports;
    private extractExports;
    private splitLargeChunk;
    private addContextToChunks;
}
//# sourceMappingURL=semanticChunker.d.ts.map