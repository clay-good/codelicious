/**
 * Enhanced Context Gatherer - Deep context for better code generation
 * Goal: Gather comprehensive context for high-quality code generation
 *
 * Features:
 * - Dependency analysis
 * - API documentation extraction
 * - Code pattern detection
 * - Framework conventions
 * - Project structure analysis
 * - Related code discovery
 */
export interface EnhancedContext {
    projectType: 'web' | 'api' | 'library' | 'cli' | 'mobile' | 'desktop' | 'unknown';
    languages: string[];
    frameworks: string[];
    dependencies: DependencyInfo[];
    relatedFiles: RelatedFile[];
    codePatterns: CodePattern[];
    conventions: Convention[];
    apiDocumentation: APIDoc[];
    externalAPIs: ExternalAPI[];
    architecture: ArchitectureInfo;
    designPatterns: string[];
}
export interface DependencyInfo {
    name: string;
    version: string;
    type: 'production' | 'development';
    usage: string[];
    documentation?: string;
}
export interface RelatedFile {
    path: string;
    type: 'similar' | 'dependency' | 'test' | 'config';
    relevance: number;
    summary: string;
}
export interface CodePattern {
    pattern: string;
    frequency: number;
    examples: string[];
    category: 'naming' | 'structure' | 'error-handling' | 'testing' | 'other';
}
export interface Convention {
    type: 'naming' | 'structure' | 'formatting' | 'testing';
    rule: string;
    examples: string[];
}
export interface APIDoc {
    name: string;
    description: string;
    methods: APIMethod[];
    examples: string[];
}
export interface APIMethod {
    name: string;
    parameters: Parameter[];
    returnType: string;
    description: string;
    example: string;
}
export interface Parameter {
    name: string;
    type: string;
    required: boolean;
    description: string;
}
export interface ExternalAPI {
    name: string;
    baseUrl: string;
    authentication: string;
    endpoints: APIEndpoint[];
}
export interface APIEndpoint {
    method: string;
    path: string;
    description: string;
    parameters: Parameter[];
    response: string;
}
export interface ArchitectureInfo {
    style: 'mvc' | 'mvvm' | 'clean' | 'layered' | 'microservices' | 'monolithic' | 'unknown';
    layers: string[];
    directories: DirectoryInfo[];
}
export interface DirectoryInfo {
    path: string;
    purpose: string;
    fileCount: number;
}
export declare class EnhancedContextGatherer {
    /**
    * Gather comprehensive context for code generation
    */
    gather(workspaceRoot: string, targetFile: string): Promise<EnhancedContext>;
    /**
    * Detect project type
    */
    private detectProjectType;
    /**
    * Detect languages used in project
    */
    private detectLanguages;
    /**
    * Detect frameworks
    */
    private detectFrameworks;
    /**
    * Analyze dependencies
    */
    private analyzeDependencies;
    /**
    * Find where a dependency is used
    */
    private findDependencyUsage;
    /**
    * Find related files
    */
    private findRelatedFiles;
    /**
    * Detect code patterns
    */
    private detectCodePatterns;
    /**
    * Detect conventions
    */
    private detectConventions;
    /**
    * Extract API documentation
    */
    private extractAPIDocumentation;
    /**
    * Detect external APIs
    */
    private detectExternalAPIs;
    /**
    * Analyze architecture
    */
    private analyzeArchitecture;
    /**
    * Infer directory purpose
    */
    private inferDirectoryPurpose;
    /**
    * Infer architecture style
    */
    private inferArchitectureStyle;
    /**
    * Detect design patterns
    */
    private detectDesignPatterns;
    /**
    * Get all files recursively
    */
    private getAllFiles;
}
//# sourceMappingURL=enhancedContextGatherer.d.ts.map