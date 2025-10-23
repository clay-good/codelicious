/**
 * Best Practices Engine - Enforce language-specific best practices
 * Goal: Ensure generated code follows industry standards
 *
 * Features:
 * - Language-specific best practices
 * - Design pattern recommendations
 * - Anti-pattern detection
 * - Framework-specific guidelines
 * - Performance best practices
 * - Security best practices
 */
export interface BestPractice {
    id: string;
    category: 'naming' | 'structure' | 'performance' | 'security' | 'testing' | 'documentation';
    language: string;
    framework?: string;
    rule: string;
    description: string;
    example: string;
    antiPattern?: string;
    severity: 'must' | 'should' | 'consider';
}
export interface DesignPattern {
    name: string;
    category: 'creational' | 'structural' | 'behavioral';
    description: string;
    useCase: string;
    implementation: string;
    pros: string[];
    cons: string[];
}
export interface ValidationResult {
    passed: boolean;
    violations: BestPracticeViolation[];
    suggestions: string[];
    score: number;
}
export interface BestPracticeViolation {
    practice: BestPractice;
    location: {
        line: number;
        column: number;
    };
    message: string;
    fix?: string;
}
export declare class BestPracticesEngine {
    private practices;
    private patterns;
    constructor();
    /**
    * Validate code against best practices
    */
    validate(code: string, language: string, framework?: string): ValidationResult;
    /**
    * Get recommended design patterns for use case
    */
    recommendPatterns(useCase: string, language: string): DesignPattern[];
    /**
    * Get best practices for language
    */
    private getPracticesForLanguage;
    /**
    * Check if code violates a practice
    */
    private checkPractice;
    /**
    * Check naming conventions
    */
    private checkNamingConventions;
    /**
    * Check code structure
    */
    private checkStructure;
    /**
    * Check performance practices
    */
    private checkPerformance;
    /**
    * Check security practices
    */
    private checkSecurity;
    /**
    * Check testing practices
    */
    private checkTesting;
    /**
    * Check documentation practices
    */
    private checkDocumentation;
    /**
    * Calculate score based on violations
    */
    private calculateScore;
    /**
    * Generate suggestions
    */
    private generateSuggestions;
    /**
    * Extract class code
    */
    private extractClassCode;
    /**
    * Initialize best practices
    */
    private initializePractices;
    /**
    * Initialize design patterns
    */
    private initializePatterns;
}
//# sourceMappingURL=bestPracticesEngine.d.ts.map