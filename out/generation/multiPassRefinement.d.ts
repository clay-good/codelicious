/**
 * Multi-Pass Code Refinement System
 * Goal: Iteratively improve generated code through multiple passes
 *
 * Features:
 * - Multiple refinement passes
 * - Quality improvement tracking
 * - Automatic issue fixing
 * - Optimization passes
 * - Validation after each pass
 */
import { AnalysisResult } from './advancedCodeAnalyzer';
import { ValidationResult } from './bestPracticesEngine';
export interface RefinementPass {
    name: string;
    description: string;
    priority: number;
    execute: (code: string, context: RefinementContext) => Promise<string>;
}
export interface RefinementContext {
    language: string;
    framework?: string;
    targetQuality: number;
    maxPasses: number;
    currentPass: number;
    previousAnalysis?: AnalysisResult;
    previousValidation?: ValidationResult;
}
export interface RefinementResult {
    originalCode: string;
    refinedCode: string;
    passes: PassResult[];
    finalQuality: number;
    improvements: string[];
    totalPasses: number;
}
export interface PassResult {
    passName: string;
    changes: number;
    qualityBefore: number;
    qualityAfter: number;
    issues: string[];
    fixes: string[];
}
export declare class MultiPassRefinement {
    private analyzer;
    private bestPractices;
    private passes;
    constructor();
    /**
    * Refine code through multiple passes
    */
    refine(code: string, context: RefinementContext): Promise<RefinementResult>;
    /**
    * Initialize refinement passes
    */
    private initializePasses;
    /**
    * Extract complex conditions into separate functions
    */
    private extractComplexConditions;
    /**
    * Break down long functions
    */
    private breakDownLongFunctions;
    /**
    * Apply naming fix
    */
    private applyNamingFix;
    /**
    * Add missing documentation
    */
    private addMissingDocumentation;
    /**
    * Add error handling
    */
    private addErrorHandling;
    /**
    * Optimize performance
    */
    private optimizePerformance;
    /**
    * Apply security fix
    */
    private applySecurityFix;
    /**
    * Format code
    */
    private formatCode;
    /**
    * Count changes between two code versions
    */
    private countChanges;
    /**
    * Extract issues from analysis
    */
    private extractIssues;
    /**
    * Extract fixes from analysis
    */
    private extractFixes;
}
//# sourceMappingURL=multiPassRefinement.d.ts.map