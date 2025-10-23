/**
 * Enhanced Code Renderer for Chat Interface
 * Provides better code rendering, diff preview, and one-click apply
 */
export interface CodeBlock {
    id: string;
    code: string;
    language: string;
    filePath?: string;
    operation?: 'create' | 'modify' | 'delete';
    lineNumbers?: boolean;
}
export interface DiffPreview {
    filePath: string;
    original: string;
    modified: string;
    language: string;
}
export declare class EnhancedCodeRenderer {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    /**
    * Render code block with enhanced features
    */
    renderCodeBlock(block: CodeBlock): string;
    /**
    * Render code with line numbers
    */
    private renderWithLineNumbers;
    /**
    * Generate diff preview HTML
    */
    generateDiffPreview(diff: DiffPreview): Promise<string>;
    /**
    * Compute simple diff between two arrays of lines
    */
    private computeDiff;
    /**
    * Render a single diff line
    */
    private renderDiffLine;
    /**
    * Extract code blocks from AI response
    */
    extractCodeBlocks(content: string): CodeBlock[];
    /**
    * Extract file path from code comments
    */
    private extractFilePath;
    /**
    * Smart file detection - detect file path from context
    */
    detectFilePath(code: string, language: string): Promise<string | undefined>;
    /**
    * Find similar files in workspace
    */
    private findSimilarFiles;
    /**
    * Get file extension for language
    */
    private getExtensionForLanguage;
    /**
    * Generate unique ID
    */
    private generateId;
    /**
    * Escape HTML
    */
    private escapeHtml;
}
//# sourceMappingURL=enhancedCodeRenderer.d.ts.map