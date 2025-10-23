/**
 * Sophisticated Error Detector
 *
 * Features:
 * - Pattern recognition for common error types
 * - Semantic analysis of error context
 * - Multi-language support (TypeScript, JavaScript, Python, Go, Rust)
 * - Error severity classification
 * - Root cause analysis
 * - Fix suggestion generation
 */
import { GeneratedCode } from './contextAwareCodeGenerator';
export interface DetectedError {
    id: string;
    type: ErrorType;
    severity: ErrorSeverity;
    language: Language;
    file: string;
    line?: number;
    column?: number;
    code?: string;
    message: string;
    context: ErrorContext;
    rootCause?: string;
    suggestedFixes: SuggestedFix[];
    relatedErrors: string[];
    confidence: number;
}
export type ErrorType = 'syntax' | 'type' | 'import' | 'export' | 'undefined-variable' | 'undefined-function' | 'missing-dependency' | 'circular-dependency' | 'null-reference' | 'type-mismatch' | 'async-await' | 'promise' | 'memory-leak' | 'security' | 'performance' | 'logic' | 'other';
export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';
export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'other';
export interface ErrorContext {
    surroundingCode: string;
    imports: string[];
    exports: string[];
    variables: string[];
    functions: string[];
    classes: string[];
    dependencies: string[];
}
export interface SuggestedFix {
    description: string;
    confidence: number;
    type: 'add' | 'remove' | 'replace' | 'refactor';
    changes: CodeChange[];
    reasoning: string;
}
export interface CodeChange {
    file: string;
    line?: number;
    column?: number;
    oldCode?: string;
    newCode: string;
}
export interface ErrorPattern {
    pattern: RegExp;
    type: ErrorType;
    severity: ErrorSeverity;
    language: Language[];
    extractInfo: (match: RegExpMatchArray) => Partial<DetectedError>;
}
export declare class ErrorDetector {
    private errorPatterns;
    private errorHistory;
    constructor();
    /**
    * Detect errors in build output
    */
    detectErrors(buildOutput: string, files: GeneratedCode[]): Promise<DetectedError[]>;
    /**
    * Detect errors using pattern matching
    */
    private detectWithPatterns;
    /**
    * Detect semantic errors in a file
    */
    private detectSemanticErrors;
    /**
    * Detect TypeScript semantic errors
    */
    private detectTypeScriptSemanticErrors;
    /**
    * Detect Python semantic errors
    */
    private detectPythonSemanticErrors;
    /**
    * Detect Go semantic errors
    */
    private detectGoSemanticErrors;
    /**
    * Detect Rust semantic errors
    */
    private detectRustSemanticErrors;
    /**
    * Detect cross-file errors
    */
    private detectCrossFileErrors;
    /**
    * Initialize error patterns
    */
    private initializePatterns;
    private generateErrorId;
    private detectLanguage;
    private extractContext;
    private extractImports;
    private extractExports;
    private detectCircularDependencies;
    private analyzeErrorRelationships;
    private areErrorsRelated;
    private generateFixSuggestions;
    private storeInHistory;
}
//# sourceMappingURL=errorDetector.d.ts.map