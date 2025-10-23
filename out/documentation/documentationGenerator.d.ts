import { ModelOrchestrator } from '../models/orchestrator';
/**
 * Documentation type
 */
export declare enum DocumentationType {
    README = "readme",
    API_REFERENCE = "api_reference",
    USAGE_GUIDE = "usage_guide",
    ARCHITECTURE = "architecture",
    CHANGELOG = "changelog",
    CONTRIBUTING = "contributing"
}
/**
 * Documentation section
 */
export interface DocumentationSection {
    title: string;
    content: string;
    subsections?: DocumentationSection[];
}
/**
 * Documentation result
 */
export interface DocumentationResult {
    type: DocumentationType;
    filePath: string;
    content: string;
    sections: DocumentationSection[];
}
/**
 * Auto-generate comprehensive documentation
 * Creates README, API references, usage guides, and more
 */
export declare class DocumentationGenerator {
    private orchestrator;
    private workspaceRoot;
    constructor(orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Generate README.md
    */
    generateReadme(projectInfo: {
        name: string;
        description: string;
        features: string[];
        installation: string;
        usage: string;
    }): Promise<DocumentationResult>;
    /**
    * Generate API reference documentation
    */
    generateApiReference(sourceFiles: Array<{
        path: string;
        content: string;
    }>): Promise<DocumentationResult>;
    /**
    * Generate usage guide
    */
    generateUsageGuide(projectInfo: {
        name: string;
        mainFeatures: string[];
        examples: Array<{
            title: string;
            description: string;
            code: string;
        }>;
    }): Promise<DocumentationResult>;
    /**
    * Generate architecture documentation
    */
    generateArchitectureDoc(components: Array<{
        name: string;
        description: string;
        dependencies: string[];
    }>): Promise<DocumentationResult>;
    /**
    * Generate inline code comments
    */
    generateInlineComments(code: string, language: string): Promise<string>;
    /**
    * Parse markdown into sections
    */
    private parseMarkdownSections;
    /**
    * Write documentation to file
    */
    writeDocumentation(doc: DocumentationResult): Promise<void>;
    /**
    * Generate all documentation for a project
    */
    generateAllDocumentation(projectInfo: {
        name: string;
        description: string;
        features: string[];
        sourceFiles: Array<{
            path: string;
            content: string;
        }>;
    }): Promise<DocumentationResult[]>;
}
//# sourceMappingURL=documentationGenerator.d.ts.map