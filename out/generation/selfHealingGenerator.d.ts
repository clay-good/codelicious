/**
 * Self-Healing Code Generator - Automatically fixes issues during generation
 *
 * Features:
 * - Real-time quality monitoring
 * - Automatic issue detection
 * - Self-correction during generation
 * - Multi-iteration refinement
 * - Learning from fixes
 *
 * Goal: Generate perfect code on first try (99%+ success rate)
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { EnhancedGenerationRequest, EnhancedGenerationResult } from './enhancedCodeGenerator';
import { ExecutionEngine } from '../core/executionEngine';
export interface SelfHealingRequest extends EnhancedGenerationRequest {
    maxIterations?: number;
    targetQuality?: number;
    autoFix?: boolean;
}
export interface SelfHealingResult extends EnhancedGenerationResult {
    iterations: number;
    finalQuality: number;
    grade: string;
    healingHistory: HealingStep[];
    success: boolean;
}
export interface HealingStep {
    iteration: number;
    quality: number;
    issuesFound: number;
    issuesFixed: number;
    action: 'generated' | 'analyzed' | 'fixed' | 'refined';
    details: string;
}
export declare class SelfHealingGenerator {
    private orchestrator;
    private executionEngine;
    private qualityEngine;
    private enhancedGenerator;
    constructor(orchestrator: ModelOrchestrator, executionEngine: ExecutionEngine);
    /**
    * Generate code with self-healing
    */
    generate(request: SelfHealingRequest): Promise<SelfHealingResult>;
    /**
    * Heal code by fixing issues
    */
    private healCode;
    /**
    * Fix security issues
    */
    private fixSecurityIssues;
    /**
    * Fix performance issues
    */
    private fixPerformanceIssues;
    /**
    * Improve maintainability
    */
    private improveMaintainability;
    /**
    * AI-assisted refinement
    */
    private aiRefine;
}
//# sourceMappingURL=selfHealingGenerator.d.ts.map