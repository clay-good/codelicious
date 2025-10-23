/**
 * Master Code Generator - Orchestrates all code generation components
 * Goal: Generate world-class production-ready code for any product
 *
 * Features:
 * - Comprehensive context gathering
 * - Template-based generation
 * - Multi-pass refinement
 * - Quality validation
 * - Best practices enforcement
 * - Automatic testing
 */
import { EnhancedContext } from './enhancedContextGatherer';
export interface GenerationRequest {
    description: string;
    language: string;
    framework?: string;
    filePath: string;
    workspaceRoot: string;
    options?: GenerationOptions;
}
export interface GenerationOptions {
    useTemplates: boolean;
    targetQuality: number;
    maxRefinementPasses: number;
    includeTests: boolean;
    includeDocumentation: boolean;
    strictValidation: boolean;
}
export interface GenerationResult {
    success: boolean;
    code: string;
    testCode?: string;
    documentation?: string;
    quality: QualityReport;
    context: EnhancedContext;
    metadata: GenerationMetadata;
}
export interface QualityMetrics {
    complexity: number;
    maintainability: number;
    testability: number;
    documentation: number;
    [key: string]: number;
}
export interface QualityReport {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    metrics: QualityMetrics;
    issues: string[];
    recommendations: string[];
}
export interface GenerationMetadata {
    duration: number;
    refinementPasses: number;
    templateUsed?: string;
    validationPassed: boolean;
    improvements: string[];
}
export declare class MasterCodeGenerator {
    private contextGatherer;
    private templateSystem;
    private analyzer;
    private bestPractices;
    private refinement;
    private validation;
    constructor();
    /**
    * Generate production-ready code
    */
    generate(request: GenerationRequest): Promise<GenerationResult>;
    /**
    * Generate initial code
    */
    private generateInitialCode;
    /**
    * Find suitable template
    */
    private findSuitableTemplate;
    /**
    * Build template context
    */
    private buildTemplateContext;
    /**
    * Generate from scratch using AI with production-ready prompts
    */
    private generateFromScratch;
    /**
    * Build production-ready prompt
    */
    private buildProductionPrompt;
    /**
    * Generate production-ready TypeScript code
    */
    private generateTypeScriptCode;
    /**
    * Generate production-ready Python code
    */
    private generatePythonCode;
    /**
    * Generate production-ready JavaScript code
    */
    private generateJavaScriptCode;
    /**
    * Extract class name from description
    */
    private extractClassName;
    /**
    * Generate tests
    */
    private generateTests;
    /**
    * Generate documentation
    */
    private generateDocumentation;
    /**
    * Create quality report
    */
    private createQualityReport;
    /**
    * Get default options
    */
    private getDefaultOptions;
}
//# sourceMappingURL=masterCodeGenerator.d.ts.map