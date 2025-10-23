/**
 * Multi-Language Support for Autonomous Building
 *
 * Supports:
 * - TypeScript/JavaScript (existing)
 * - Python
 * - Go
 * - Rust
 *
 * Features:
 * - Language-specific error parsing
 * - Language-specific compilation
 * - Language-specific fix generation
 * - Language-specific testing
 */
import { ExecutionEngine } from '../core/executionEngine';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { DetectedError, Language } from './errorDetector';
export interface LanguageConfig {
    language: Language;
    fileExtensions: string[];
    compiler?: string;
    compileCommand: (file: string) => string;
    testCommand: (file: string) => string;
    lintCommand?: (file: string) => string;
    formatCommand?: (file: string) => string;
    packageManager?: string;
    installCommand: (packages: string[]) => string;
    errorPatterns: RegExp[];
}
export interface CompilationResult {
    success: boolean;
    output: string;
    errors: DetectedError[];
    warnings: DetectedError[];
    duration: number;
}
export declare class MultiLanguageSupport {
    private executionEngine;
    private languageConfigs;
    constructor(executionEngine: ExecutionEngine);
    /**
    * Compile code for any supported language
    */
    compile(file: GeneratedCode, workspaceRoot: string): Promise<CompilationResult>;
    /**
    * Run tests for any supported language
    */
    runTests(file: GeneratedCode, workspaceRoot: string): Promise<{
        success: boolean;
        output: string;
    }>;
    /**
    * Install dependencies for any supported language
    */
    installDependencies(language: Language, packages: string[], workspaceRoot: string): Promise<{
        success: boolean;
        output: string;
    }>;
    /**
    * Lint code for any supported language
    */
    lint(file: GeneratedCode, workspaceRoot: string): Promise<{
        success: boolean;
        output: string;
        issues: DetectedError[];
    }>;
    /**
    * Format code for any supported language
    */
    format(file: GeneratedCode, workspaceRoot: string): Promise<{
        success: boolean;
        formattedContent?: string;
    }>;
    /**
    * Detect language from file path
    */
    private detectLanguage;
    /**
    * Parse errors from output
    */
    private parseErrors;
    /**
    * Initialize language configurations
    */
    private initializeLanguageConfigs;
    /**
    * Get language config
    */
    getLanguageConfig(language: Language): LanguageConfig | undefined;
    /**
    * Check if language is supported
    */
    isLanguageSupported(language: Language): boolean;
    /**
    * Get all supported languages
    */
    getSupportedLanguages(): Language[];
}
//# sourceMappingURL=multiLanguageSupport.d.ts.map