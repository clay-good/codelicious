/**
 * Code Chunker - Intelligently splits code into meaningful chunks for embedding
 */
import { SymbolKind } from '../types';
export interface CodeChunk {
    content: string;
    type: 'file' | 'class' | 'function' | 'block';
    startLine: number;
    endLine: number;
    symbolName?: string;
    symbolKind?: SymbolKind;
    language: string;
}
export declare class CodeChunker {
    private maxChunkSize;
    private overlapLines;
    private semanticChunker;
    private useSemanticChunking;
    constructor(maxChunkSize?: number, overlapLines?: number, useSemanticChunking?: boolean);
    /**
    * Chunk code file into meaningful pieces
    */
    chunkFile(filePath: string, content: string): Promise<CodeChunk[]>;
    /**
    * Chunk by symbols (classes, functions, etc.)
    */
    private chunkBySymbols;
    /**
    * Find the end line of a symbol
    */
    private findSymbolEnd;
    /**
    * Split large symbols into smaller chunks
    */
    private splitLargeSymbol;
    /**
    * Chunk by lines (fallback for files without symbols)
    */
    private chunkByLines;
    /**
    * Get chunk type from symbol kind
    */
    private getChunkType;
    /**
    * Create hierarchical chunks (file → class → function)
    */
    createHierarchicalChunks(filePath: string, content: string): {
        file: CodeChunk;
        classes: CodeChunk[];
        functions: CodeChunk[];
    };
    /**
    * Create a summary of the file for file-level embedding
    */
    private createFileSummary;
    /**
    * Chunk code with context (includes surrounding code)
    */
    chunkWithContext(filePath: string, content: string, contextLines?: number): Promise<CodeChunk[]>;
}
//# sourceMappingURL=codeChunker.d.ts.map