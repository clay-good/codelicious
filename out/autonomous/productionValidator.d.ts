/**
 * Production Validator - Multi-dimensional validation system
 *
 * Matches Augment's production-ready validation with comprehensive checks
 */
import { ExecutionEngine } from '../core/executionEngine';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { GeneratedTest } from './automaticTestGenerator';
import { ParsedRequirements } from './requirementsParser';
export interface ValidationCheck {
    name: string;
    passed: boolean;
    score: number;
    issues: string[];
    warnings: string[];
    suggestions: string[];
}
export interface ValidationResult {
    overallScore: number;
    passed: boolean;
    checks: ValidationCheck[];
    summary: string;
    criticalIssues: string[];
    recommendations: string[];
}
export declare class ProductionValidator {
    private executionEngine;
    private workspaceRoot;
    constructor(executionEngine: ExecutionEngine, workspaceRoot: string);
    /**
    * Validate generated code and tests
    */
    validate(generatedCode: GeneratedCode[], generatedTests: GeneratedTest[], requirements: ParsedRequirements): Promise<ValidationResult>;
    /**
    * Check if code compiles
    */
    private checkCompilation;
    /**
    * Check if tests pass
    */
    private checkTests;
    /**
    * Check linting
    */
    private checkLinting;
    /**
    * Check security
    */
    private checkSecurity;
    /**
    * Check if requirements are met
    */
    private checkRequirements;
    /**
    * Check performance
    */
    private checkPerformance;
    /**
    * Check documentation
    */
    private checkDocumentation;
    /**
    * Calculate overall score
    */
    private calculateOverallScore;
    /**
    * Generate recommendations
    */
    private generateRecommendations;
    /**
    * Generate summary
    */
    private generateSummary;
}
//# sourceMappingURL=productionValidator.d.ts.map