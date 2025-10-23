/**
 * Advanced Semantic Analyzer
 *
 * Provides deep semantic understanding of code including:
 * - Intent detection (what the code is trying to do)
 * - Code pattern recognition
 * - Semantic similarity scoring
 * - Purpose classification
 * - Complexity analysis
 */
import { ASTAnalysisResult } from './astAnalyzer';
export interface SemanticIntent {
    type: 'data_processing' | 'api_endpoint' | 'validation' | 'transformation' | 'authentication' | 'authorization' | 'database_operation' | 'file_operation' | 'network_operation' | 'ui_component' | 'business_logic' | 'utility' | 'test' | 'unknown';
    confidence: number;
    description: string;
    keywords: string[];
}
export interface CodePattern {
    name: string;
    type: 'design_pattern' | 'idiom' | 'anti_pattern' | 'best_practice';
    confidence: number;
    description: string;
    examples: string[];
}
export interface SemanticSimilarity {
    score: number;
    reasons: string[];
    sharedConcepts: string[];
}
export interface CodePurpose {
    primary: string;
    secondary: string[];
    domain: string;
    layer: string;
}
export interface SemanticAnalysis {
    intent: SemanticIntent;
    patterns: CodePattern[];
    purpose: CodePurpose;
    complexity: {
        cognitive: number;
        cyclomatic: number;
        maintainability: number;
    };
    concepts: string[];
    dependencies: string[];
    quality: {
        score: number;
        issues: string[];
        suggestions: string[];
    };
}
export declare class SemanticAnalyzer {
    private intentPatterns;
    private designPatterns;
    private domainKeywords;
    constructor();
    /**
    * Analyze code semantically
    */
    analyze(code: string, filePath: string, astAnalysis?: ASTAnalysisResult): Promise<SemanticAnalysis>;
    /**
    * Calculate semantic similarity between two code snippets
    */
    calculateSimilarity(code1: string, code2: string, analysis1?: SemanticAnalysis, analysis2?: SemanticAnalysis): SemanticSimilarity;
    /**
    * Detect intent of code
    */
    private detectIntent;
    /**
    * Detect design patterns
    */
    private detectPatterns;
    /**
    * Classify purpose of code
    */
    private classifyPurpose;
    /**
    * Analyze complexity
    */
    private analyzeComplexity;
    /**
    * Extract key concepts from code
    */
    private extractConcepts;
    /**
    * Extract semantic dependencies
    */
    private extractSemanticDependencies;
    /**
    * Assess code quality
    */
    private assessQuality;
    /**
    * Calculate nesting level
    */
    private calculateNestingLevel;
    /**
    * Calculate function lengths
    */
    private calculateFunctionLengths;
    /**
    * Calculate text similarity (fallback)
    */
    private calculateTextSimilarity;
    /**
    * Get intent description
    */
    private getIntentDescription;
    /**
    * Initialize intent patterns
    */
    private initializeIntentPatterns;
    /**
    * Initialize design patterns
    */
    private initializeDesignPatterns;
    /**
    * Initialize domain keywords
    */
    private initializeDomainKeywords;
}
//# sourceMappingURL=semanticAnalyzer.d.ts.map