/**
 * Real-Time Compilation Feedback
 *
 * Compiles files in real-time and fixes errors immediately.
 * This provides instant feedback during code generation, allowing the system
 * to catch and fix errors as they happen rather than waiting until the end.
 *
 * Features:
 * - Incremental compilation
 * - Immediate error detection
 * - Automatic error fixing
 * - Type checking
 * - Syntax validation
 * - Import resolution
 */
import { ExecutionEngine } from '../core/executionEngine';
import { ModelOrchestrator } from '../models/orchestrator';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { BuildError } from './buildErrorFixer';
export interface CompileOptions {
    maxAttempts: number;
    autoFix: boolean;
    strictMode: boolean;
    checkTypes: boolean;
    checkSyntax: boolean;
    checkImports: boolean;
}
export interface CompileResult {
    success: boolean;
    file: GeneratedCode;
    errors: BuildError[];
    warnings: BuildError[];
    attempts: number;
    fixesApplied: number;
    output?: string;
}
export interface IncrementalCompileResult {
    success: boolean;
    compiledFiles: GeneratedCode[];
    totalErrors: number;
    totalWarnings: number;
    totalAttempts: number;
    totalFixes: number;
    duration: number;
}
export declare class RealtimeCompiler {
    private executionEngine;
    private orchestrator;
    private workspaceRoot;
    private compilerOptions;
    private errorFixer;
    private multiLangSupport;
    constructor(executionEngine: ExecutionEngine, orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Compile a single file with automatic error fixing
    */
    compileAndFix(file: GeneratedCode, options?: Partial<CompileOptions>): Promise<CompileResult>;
    /**
    * Compile multiple files incrementally
    */
    compileIncremental(files: GeneratedCode[], options?: Partial<CompileOptions>): Promise<IncrementalCompileResult>;
    /**
    * Compile a file
    */
    private compile;
    /**
    * Compile TypeScript file
    */
    private compileTypeScript;
    /**
    * Compile JavaScript file
    */
    private compileJavaScript;
    /**
    * Check syntax errors
    */
    private checkSyntax;
    /**
    * Check type errors
    */
    private checkTypes;
    /**
    * Check import errors
    */
    private checkImports;
    /**
    * Load TypeScript compiler options
    */
    private loadCompilerOptions;
}
//# sourceMappingURL=realtimeCompiler.d.ts.map