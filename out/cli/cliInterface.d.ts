#!/usr/bin/env node
/**
 * CLI Interface for Codelicious
 *
 * Provides command-line interface for:
 * - Code generation
 * - Project analysis
 * - Autonomous building
 * - RAG queries
 */
export interface CLIOptions {
    model?: string;
    output?: string;
    verbose?: boolean;
    interactive?: boolean;
    config?: string;
}
export interface GenerateOptions {
    model: string;
    output?: string;
    verbose?: boolean;
}
export interface AnalyzeOptions {
    depth: string;
    format: 'json' | 'text';
}
export interface BuildOptions {
    model: string;
    watch?: boolean;
    yes?: boolean;
}
export interface QueryOptions {
    results: string;
    context?: boolean;
}
export interface IndexOptions {
    force?: boolean;
    watch?: boolean;
}
export interface TestOptions {
    coverage?: boolean;
    watch?: boolean;
}
export interface CodeAnalysisResult {
    files: number;
    lines: number;
    complexity: string;
    issues: string[];
}
export interface QueryResult {
    file: string;
    line: number;
    snippet: string;
    score: number;
}
export declare class CodeliciousCLI {
    private program;
    constructor();
    /**
    * Setup CLI commands
    */
    private setupCommands;
    /**
    * Handle generate command
    */
    private handleGenerate;
    /**
    * Handle analyze command
    */
    private handleAnalyze;
    /**
    * Handle build command
    */
    private handleBuild;
    /**
    * Handle query command
    */
    private handleQuery;
    /**
    * Handle index command
    */
    private handleIndex;
    /**
    * Handle test command
    */
    private handleTest;
    /**
    * Handle config command
    */
    private handleConfig;
    /**
    * Handle interactive mode
    */
    private handleInteractive;
    /**
    * Parse and execute CLI
    */
    run(argv: string[]): Promise<void>;
    private generateCode;
    private analyzeCode;
    private buildProject;
    private queryCodebase;
    private indexCodebase;
    private runTests;
    private setConfig;
    private getConfig;
    private printAnalysis;
}
//# sourceMappingURL=cliInterface.d.ts.map