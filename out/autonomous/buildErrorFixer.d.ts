/**
 * Build Error Parser & Fixer
 *
 * Parses build errors from TypeScript, ESLint, Webpack, etc. and automatically fixes them.
 * This is critical for autonomous building - the system needs to understand and fix build errors.
 *
 * Supported error types:
 * - TypeScript compilation errors
 * - ESLint/TSLint errors
 * - Webpack bundling errors
 * - Import/export errors
 * - Type errors
 * - Missing dependencies
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { ExecutionEngine } from '../core/executionEngine';
export interface BuildError {
    type: 'typescript' | 'eslint' | 'webpack' | 'import' | 'dependency' | 'other';
    severity: 'error' | 'warning';
    file: string;
    line?: number;
    column?: number;
    code?: string;
    message: string;
    suggestion?: string;
}
export interface ErrorGroup {
    type: string;
    errors: BuildError[];
    commonPattern?: string;
}
export interface FixResult {
    success: boolean;
    fixedFiles: GeneratedCode[];
    fixedErrors: BuildError[];
    remainingErrors: BuildError[];
    appliedFixes: AppliedFix[];
}
export interface AppliedFix {
    error: BuildError;
    file: string;
    description: string;
    oldCode?: string;
    newCode: string;
    confidence: number;
}
export declare class BuildErrorFixer {
    private orchestrator;
    private executionEngine;
    private workspaceRoot;
    private errorDetector;
    private aiFixGenerator;
    constructor(orchestrator: ModelOrchestrator, executionEngine: ExecutionEngine, workspaceRoot: string);
    /**
    * Fix build errors automatically (Enhanced with AI)
    */
    fixBuildErrors(buildOutput: string, files: GeneratedCode[]): Promise<FixResult>;
    /**
    * Convert new DetectedError to old BuildError format
    */
    private convertToOldError;
    /**
    * Map new error types to old types
    */
    private mapErrorType;
    /**
    * Parse build errors from output
    */
    parseBuildErrors(buildOutput: string): BuildError[];
    /**
    * Parse TypeScript compilation errors
    */
    private parseTypeScriptErrors;
    /**
    * Parse ESLint errors
    */
    private parseESLintErrors;
    /**
    * Parse Webpack errors
    */
    private parseWebpackErrors;
    /**
    * Parse import/export errors
    */
    private parseImportErrors;
    /**
    * Group errors by type and pattern
    */
    groupErrors(errors: BuildError[]): ErrorGroup[];
    /**
    * Find common pattern in error messages
    */
    private findCommonPattern;
    /**
    * Generate fixes for an error group
    */
    private generateFixesForGroup;
    /**
    * Fix undefined variable errors
    */
    private fixUndefinedVariables;
    /**
    * Fix missing import errors
    */
    private fixMissingImports;
    /**
    * Fix missing export errors
    */
    private fixMissingExports;
    /**
    * Fix type mismatch errors
    */
    private fixTypeMismatches;
    /**
    * Fix generic errors using AI
    */
    private fixGenericErrors;
    /**
    * Check if variable needs to be imported
    */
    private checkIfNeedsImport;
    /**
    * Generate import statement
    */
    private generateImportStatement;
    /**
    * Add import to file content
    */
    private addImport;
    /**
    * Apply fixes to files
    */
    private applyFixes;
}
//# sourceMappingURL=buildErrorFixer.d.ts.map