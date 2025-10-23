/**
 * Advanced Pattern Recognizer - AST-based pattern extraction and analysis
 *
 * Features:
 * - AST-based structural pattern extraction
 * - Function signature patterns
 * - Class hierarchy patterns
 * - Error handling patterns
 * - Async/await patterns
 * - Design pattern detection
 * - Code smell detection
 * - Pattern similarity analysis
 */
export interface StructuralPattern {
    id: string;
    type: PatternType;
    name: string;
    description: string;
    structure: {
        kind: string;
        signature?: string;
        hierarchy?: string[];
        dependencies?: string[];
        complexity?: number;
    };
    code: string;
    language: string;
    confidence: number;
    frequency: number;
    quality: number;
    relatedPatterns: string[];
    antiPatterns: string[];
}
export declare enum PatternType {
    FUNCTION_SIGNATURE = "function_signature",
    CLASS_STRUCTURE = "class_structure",
    ERROR_HANDLING = "error_handling",
    ASYNC_PATTERN = "async_pattern",
    DESIGN_PATTERN = "design_pattern",
    API_PATTERN = "api_pattern",
    DATA_STRUCTURE = "data_structure",
    ALGORITHM = "algorithm",
    TESTING_PATTERN = "testing_pattern",
    IMPORT_PATTERN = "import_pattern"
}
export interface PatternExtractionOptions {
    minComplexity?: number;
    maxComplexity?: number;
    includePrivate?: boolean;
    includeTests?: boolean;
    detectDesignPatterns?: boolean;
    detectAntiPatterns?: boolean;
}
export interface PatternSimilarity {
    pattern1: StructuralPattern;
    pattern2: StructuralPattern;
    similarity: number;
    structuralSimilarity: number;
    semanticSimilarity: number;
    commonElements: string[];
}
export declare class AdvancedPatternRecognizer {
    private patterns;
    private patternIndex;
    constructor();
    /**
    * Extract patterns from TypeScript code using AST
    */
    extractPatterns(code: string, filePath: string, options?: PatternExtractionOptions): StructuralPattern[];
    /**
    * Extract function signature patterns
    */
    private extractFunctionPatterns;
    /**
    * Extract class structure patterns
    */
    private extractClassPatterns;
    /**
    * Extract error handling patterns
    */
    private extractErrorHandlingPatterns;
    /**
    * Extract async/await patterns
    */
    private extractAsyncPatterns;
    /**
    * Detect design patterns (Singleton, Factory, Observer, etc.)
    */
    private detectDesignPatterns;
    /**
    * Detect Singleton pattern
    */
    private detectSingletonPattern;
    /**
    * Detect Factory pattern
    */
    private detectFactoryPattern;
    /**
    * Detect Observer pattern
    */
    private detectObserverPattern;
    /**
    * Calculate pattern similarity
    */
    calculateSimilarity(pattern1: StructuralPattern, pattern2: StructuralPattern): PatternSimilarity;
    /**
    * Get patterns by type
    */
    getPatternsByType(type: PatternType): StructuralPattern[];
    /**
    * Find similar patterns
    */
    findSimilarPatterns(pattern: StructuralPattern, minSimilarity?: number): PatternSimilarity[];
    private generatePatternId;
    private isPrivate;
    private extractSignature;
    private calculateComplexity;
    private calculateConfidence;
    private assessQuality;
    private hasJSDoc;
    private hasTypeAnnotations;
    private containsAwait;
    private containsTryCatch;
    private extractClassHierarchy;
    private extractMethods;
    private extractProperties;
    private hasPrivateConstructor;
    private hasStaticInstanceProperty;
    private hasGetInstanceMethod;
    private returnsNewInstance;
    private hasMethod;
    private compareStructure;
    private compareSemantics;
    private findCommonElements;
}
//# sourceMappingURL=advancedPatternRecognizer.d.ts.map