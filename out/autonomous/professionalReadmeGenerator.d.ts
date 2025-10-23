/**
 * Professional README Generator
 * Generates comprehensive, professional READMEs without emojis
 * Includes: Description, Installation, Usage, Architecture, System Design
 */
import { ModelOrchestrator } from '../models/orchestrator';
export interface ProjectInfo {
    name: string;
    description: string;
    version?: string;
    author?: string;
    license?: string;
    repository?: string;
    homepage?: string;
    keywords?: string[];
}
export interface ReadmeContent {
    title: string;
    description: string;
    features: string[];
    installation: string;
    usage: string;
    api?: string;
    architecture?: string;
    systemDesign?: string;
    configuration?: string;
    development?: string;
    testing?: string;
    contributing?: string;
    license?: string;
    support?: string;
}
export declare class ProfessionalReadmeGenerator {
    private orchestrator;
    private workspaceRoot;
    constructor(orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Generate professional README from project analysis
    */
    generateFromProject(projectInfo: ProjectInfo): Promise<string>;
    /**
    * Generate README content using AI
    */
    private generateReadmeContent;
    /**
    * Format README with proper structure
    */
    private formatReadme;
    /**
    * Analyze project structure
    */
    private analyzeProjectStructure;
    /**
    * Detect technology stack
    */
    private detectTechnologyStack;
    /**
    * Generate fallback content
    */
    private generateFallbackContent;
    /**
    * Write README to file
    */
    writeReadme(content: string): Promise<void>;
}
//# sourceMappingURL=professionalReadmeGenerator.d.ts.map