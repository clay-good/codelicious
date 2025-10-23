/**
 * Instruction File Reader
 *
 * Reads and parses instruction files (txt/markdown) for autonomous product building.
 * Supports:
 * - Plain text instructions
 * - Markdown formatted instructions
 * - Structured specifications with sections
 * - Multi-file instruction sets
 */
export interface InstructionFile {
    filePath: string;
    content: string;
    format: 'text' | 'markdown';
    sections: InstructionSection[];
    metadata: InstructionMetadata;
}
export interface InstructionSection {
    title: string;
    content: string;
    type: 'requirements' | 'features' | 'technical' | 'constraints' | 'examples' | 'other';
    priority: 'high' | 'medium' | 'low';
}
export interface InstructionMetadata {
    projectName?: string;
    projectType?: string;
    language?: string;
    framework?: string;
    dependencies?: string[];
    targetDirectory?: string;
}
export declare class InstructionFileReader {
    /**
    * Read instruction file
    */
    readInstructionFile(filePath: string): Promise<InstructionFile>;
    /**
    * Find instruction files in workspace
    */
    findInstructionFiles(workspaceRoot: string): Promise<string[]>;
    /**
    * Detect file format
    */
    private detectFormat;
    /**
    * Parse sections from content
    */
    private parseSections;
    /**
    * Parse markdown sections
    */
    private parseMarkdownSections;
    /**
    * Parse text sections (simple paragraph-based)
    */
    private parseTextSections;
    /**
    * Detect section type from title/content
    */
    private detectSectionType;
    /**
    * Detect priority from title/content
    */
    private detectPriority;
    /**
    * Extract metadata from content
    */
    private extractMetadata;
    /**
    * Convert instruction file to autonomous workflow input
    */
    convertToWorkflowInput(instruction: InstructionFile): string;
}
//# sourceMappingURL=instructionFileReader.d.ts.map