/**
 * Enhanced AST Analyzer - Multi-language AST parsing with relationship detection
 *
 * Features:
 * - TypeScript/JavaScript AST parsing with TypeScript compiler API
 * - Python AST parsing (regex-based for now, can be enhanced with tree-sitter)
 * - Rust, Go, Java parsing (regex-based for now, can be enhanced with tree-sitter)
 * - Relationship detection (calls, inheritance, composition, dependencies)
 * - Hierarchical structure extraction
 * - Cross-reference tracking
 */
import { Symbol, SymbolKind } from '../types';
export interface ASTSymbol extends Symbol {
    parent?: string;
    children?: string[];
    calls?: string[];
    calledBy?: string[];
    inherits?: string[];
    implements?: string[];
    usedBy?: string[];
    uses?: string[];
    complexity?: number;
    parameters?: ParameterInfo[];
    returnType?: string;
    isAsync?: boolean;
    isExported?: boolean;
    isAbstract?: boolean;
    decorators?: string[];
    documentation?: string;
}
export interface ParameterInfo {
    name: string;
    type?: string;
    optional?: boolean;
    defaultValue?: string;
}
export interface ASTAnalysisResult {
    symbols: ASTSymbol[];
    relationships: SymbolRelationship[];
    hierarchy: SymbolHierarchy;
    imports: ImportInfo[];
    exports: ExportInfo[];
}
export interface SymbolRelationship {
    from: string;
    to: string;
    type: 'calls' | 'inherits' | 'implements' | 'uses' | 'contains';
    confidence: number;
}
export interface SymbolHierarchy {
    root: string;
    children: HierarchyNode[];
}
export interface HierarchyNode {
    name: string;
    kind: SymbolKind;
    children: HierarchyNode[];
    startLine: number;
    endLine: number;
}
export interface ImportInfo {
    module: string;
    names: string[];
    isDefault?: boolean;
    alias?: string;
}
export interface ExportInfo {
    name: string;
    kind: SymbolKind;
    isDefault?: boolean;
}
export declare class ASTAnalyzer {
    /**
    * Analyze code and extract symbols with relationships
    */
    analyze(content: string, filePath: string, language: string): Promise<ASTAnalysisResult>;
    /**
    * Analyze TypeScript/JavaScript using TypeScript compiler API
    */
    private analyzeTypeScript;
    /**
    * Parse class declaration
    */
    private parseClass;
    /**
    * Parse function declaration
    */
    private parseFunction;
    /**
    * Parse method declaration
    */
    private parseMethod;
    /**
    * Parse interface declaration
    */
    private parseInterface;
    /**
    * Parse import declaration
    */
    private parseImport;
    /**
    * Parse export declaration
    */
    private parseExport;
    /**
    * Detect function call
    */
    private detectFunctionCall;
    /**
    * Parse parameters
    */
    private parseParameters;
    /**
    * Calculate cyclomatic complexity
    */
    private calculateComplexity;
    /**
    * Check if node has export modifier
    */
    private hasExportModifier;
    /**
    * Check if node has default modifier
    */
    private hasDefaultModifier;
    /**
    * Check if node has abstract modifier
    */
    private hasAbstractModifier;
    /**
    * Check if node has async modifier
    */
    private hasAsyncModifier;
    /**
    * Check if node is export declaration
    */
    private isExportDeclaration;
    /**
    * Get decorators from node
    */
    private getDecorators;
    /**
    * Get JSDoc documentation
    */
    private getDocumentation;
    /**
    * Build hierarchy from symbols
    */
    private buildHierarchy;
    /**
    * Resolve relationships between symbols
    */
    private resolveRelationships;
    /**
    * Analyze Python code (regex-based for now)
    */
    private analyzePython;
    /**
    * Analyze Rust code (regex-based for now)
    */
    private analyzeRust;
    /**
    * Analyze Go code (regex-based for now)
    */
    private analyzeGo;
    /**
    * Analyze Java code (regex-based for now)
    */
    private analyzeJava;
    /**
    * Generic analyzer for unsupported languages
    */
    private analyzeGeneric;
}
//# sourceMappingURL=astAnalyzer.d.ts.map