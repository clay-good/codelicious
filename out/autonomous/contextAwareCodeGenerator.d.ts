/**
 * Context-Aware Code Generator - Generate production-ready code with full context
 *
 * Matches Augment's context-aware generation with architectural understanding
 * ENHANCED: Now uses Master Code Generator for world-class code quality
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionPlan } from './intelligentPlanner';
import { ArchitecturalContext } from '../context/persistentContextEngine';
export interface GeneratedCode {
    filePath: string;
    content: string;
    operation: 'create' | 'modify' | 'delete';
    imports: string[];
    exports: string[];
    documentation: string;
    tests: string;
}
export interface GenerationOptions {
    includeTests: boolean;
    includeDocumentation: boolean;
    followPatterns: boolean;
    errorHandling: 'basic' | 'comprehensive';
    codeStyle: 'functional' | 'oop' | 'auto';
}
export interface GenerationResult {
    generatedFiles: GeneratedCode[];
    totalLines: number;
    estimatedQuality: number;
    warnings: string[];
}
export declare class ContextAwareCodeGenerator {
    private orchestrator;
    private workspaceRoot;
    private masterGenerator;
    private enhancedGenerator;
    constructor(orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Generate code for execution plan
    * OPTIMIZED: Parallel code generation with dependency-aware batching
    */
    generate(plan: ExecutionPlan, context: ArchitecturalContext, options: GenerationOptions): Promise<GenerationResult>;
    /**
    * Generate code for a single file operation
    * ENHANCED: Now uses Master Code Generator for superior quality
    */
    private generateForOperation;
    /**
    * Detect language from file path
    */
    private detectLanguage;
    /**
    * Detect framework from context
    */
    private detectFramework;
    /**
    * Extract imports from code
    */
    private extractImports;
    /**
    * Extract exports from code
    */
    private extractExports;
    /**
    * Build generation prompt
    */
    private buildGenerationPrompt;
    /**
    * Parse generated code from AI response
    */
    private parseGeneratedCode;
    /**
    * Extract documentation
    */
    private extractDocumentation;
    /**
    * Group operations by dependency level for parallel execution
    * PERFORMANCE: Enables parallel generation while respecting dependencies
    */
    private groupOperationsByDependencies;
    /**
    * Estimate code quality
    */
    private estimateQuality;
    /**
    * Write generated code to disk
    */
    writeCode(generated: GeneratedCode): Promise<void>;
    /**
    * Get test file path for a source file
    */
    private getTestPath;
    /**
    * Generate tests for code using enhanced generator
    */
    private generateTestsForCode;
    /**
    * Convert ArchitecturalContext to EnhancedContext
    */
    private convertToEnhancedContext;
    /**
    * Detect architecture style from patterns
    */
    private detectArchitectureStyle;
    /**
    * Extract layers from context
    */
    private extractLayers;
    /**
    * Detect project type from context
    */
    private detectProjectType;
    /**
    * Extract languages from context
    */
    private extractLanguages;
    /**
    * Extract frameworks from context
    */
    private extractFrameworks;
}
//# sourceMappingURL=contextAwareCodeGenerator.d.ts.map