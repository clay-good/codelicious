/**
 * Enhanced Code Generator - World-class code generation with quality enforcement
 *
 * Features:
 * - Framework-specific generation (React, Vue, Express, FastAPI)
 * - Few-shot learning with examples
 * - Quality gates (type safety, error handling, documentation)
 * - Architectural pattern enforcement (SOLID, Clean Architecture)
 * - Style enforcement (Prettier, ESLint)
 *
 * Goal: Consistently generate 90%+ quality code
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { EnhancedContext } from './enhancedContextGatherer';
export interface EnhancedGenerationRequest {
    description: string;
    language: string;
    framework?: string;
    filePath: string;
    context: EnhancedContext;
    existingCode?: string;
    requirements?: string[];
    constraints?: string[];
}
export interface EnhancedGenerationResult {
    code: string;
    quality: number;
    issues: string[];
    improvements: string[];
}
export interface CodeExample {
    description: string;
    code: string;
    quality: number;
}
export declare class EnhancedCodeGenerator {
    private orchestrator;
    private examples;
    private qualityEngine;
    constructor(orchestrator: ModelOrchestrator);
    /**
    * Generate production-ready code with quality enforcement
    */
    generate(request: EnhancedGenerationRequest): Promise<EnhancedGenerationResult>;
    /**
    * Get system prompt based on language and framework
    */
    private getSystemPrompt;
    /**
    * Build enhanced prompt with examples and constraints
    */
    private buildEnhancedPrompt;
    /**
    * Get relevant examples for few-shot learning
    */
    private getRelevantExamples;
    /**
    * Build constraints based on context
    */
    private buildConstraints;
    /**
    * Extract code from AI response
    */
    private extractCode;
    /**
    * Enforce quality gates
    */
    private enforceQualityGates;
    /**
    * Apply quality fixes
    */
    private applyQualityFixes;
    /**
    * Load code examples for few-shot learning
    */
    private loadExamples;
}
//# sourceMappingURL=enhancedCodeGenerator.d.ts.map