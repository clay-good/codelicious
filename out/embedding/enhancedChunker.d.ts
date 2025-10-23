/**
 * Enhanced Code Chunker - Semantic-aware chunking with hierarchical structure
 *
 * Features:
 * - Semantic-aware chunking (respects code boundaries)
 * - Hierarchical structure (file → class → method)
 * - Context preservation (includes surrounding context)
 * - Overlap optimization (smart overlap based on dependencies)
 * - Multi-level chunking (different granularities)
 * - Chunk quality scoring
 * - Adaptive chunk sizing
 */
import { CodeChunk } from './codeChunker';
export interface EnhancedChunk extends CodeChunk {
    id: string;
    parentId?: string;
    childIds: string[];
    contextBefore: string;
    contextAfter: string;
    dependencies: string[];
    quality: number;
    completeness: number;
    complexity: number;
    semanticType: SemanticType;
    keywords: string[];
    summary: string;
}
export declare enum SemanticType {
    FILE_HEADER = "file_header",
    IMPORT_BLOCK = "import_block",
    CLASS_DEFINITION = "class_definition",
    INTERFACE_DEFINITION = "interface_definition",
    FUNCTION_DEFINITION = "function_definition",
    METHOD_DEFINITION = "method_definition",
    TYPE_DEFINITION = "type_definition",
    CONSTANT_BLOCK = "constant_block",
    COMMENT_BLOCK = "comment_block",
    CODE_BLOCK = "code_block"
}
export interface ChunkingStrategy {
    maxChunkSize: number;
    minChunkSize: number;
    overlapSize: number;
    contextLines: number;
    respectBoundaries: boolean;
    includeContext: boolean;
    adaptiveSize: boolean;
}
export interface HierarchicalChunks {
    root: EnhancedChunk;
    level1: EnhancedChunk[];
    level2: EnhancedChunk[];
    level3: EnhancedChunk[];
    flat: EnhancedChunk[];
}
export declare class EnhancedChunker {
    private strategy;
    private chunkIdCounter;
    constructor(strategy?: ChunkingStrategy);
    /**
    * Create hierarchical chunks from code
    */
    createHierarchicalChunks(filePath: string, content: string): HierarchicalChunks;
    /**
    * Create TypeScript/JavaScript hierarchical chunks using AST
    */
    private createTypeScriptHierarchy;
    /**
    * Create file-level chunk (summary)
    */
    private createFileChunk;
    /**
    * Create class-level chunk
    */
    private createClassChunk;
    /**
    * Create method-level chunk
    */
    private createMethodChunk;
    /**
    * Create function-level chunk
    */
    private createFunctionChunk;
    /**
    * Split large chunk into smaller blocks
    */
    private splitIntoBlocks;
    /**
    * Create simple hierarchy for non-TypeScript files
    */
    private createSimpleHierarchy;
    private generateChunkId;
    private getContext;
    private calculateComplexity;
    private extractDependencies;
    private extractMethodSignature;
    private extractFunctionSignature;
    private extractKeywords;
    private assessChunkQuality;
    private createFileSummary;
    private createSimpleSummary;
}
//# sourceMappingURL=enhancedChunker.d.ts.map