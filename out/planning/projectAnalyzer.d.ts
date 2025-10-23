/**
 * Project Analyzer
 *
 * Analyzes project specifications and extracts:
 * - Requirements (functional, non-functional, technical)
 * - Constraints (time, resources, technology)
 * - Technical stack recommendations
 * - Architecture patterns
 * - Complexity assessment
 * - Success criteria
 */
import { ModelOrchestrator } from '../models/orchestrator';
export interface Requirement {
    id: string;
    type: 'functional' | 'non-functional' | 'technical';
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    acceptanceCriteria: string[];
}
export interface Constraint {
    type: 'time' | 'resource' | 'technology' | 'budget' | 'compliance';
    description: string;
    impact: 'blocking' | 'limiting' | 'preferential';
    details: Record<string, any>;
}
export interface TechStackRecommendation {
    category: 'language' | 'framework' | 'database' | 'infrastructure' | 'tool';
    name: string;
    version?: string;
    reason: string;
    alternatives: string[];
    confidence: number;
}
export interface ArchitecturePattern {
    name: string;
    description: string;
    applicability: string;
    benefits: string[];
    tradeoffs: string[];
    confidence: number;
}
export interface ComplexityAssessment {
    overall: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex';
    score: number;
    factors: {
        technical: number;
        scope: number;
        integration: number;
        novelty: number;
        risk: number;
    };
    reasoning: string;
}
export interface SuccessCriteria {
    id: string;
    description: string;
    measurable: boolean;
    metric?: string;
    target?: string;
    priority: 'must-have' | 'should-have' | 'nice-to-have';
}
export interface ProjectAnalysis {
    projectName: string;
    projectType: string;
    description: string;
    requirements: Requirement[];
    constraints: Constraint[];
    techStack: TechStackRecommendation[];
    architecture: ArchitecturePattern[];
    complexity: ComplexityAssessment;
    successCriteria: SuccessCriteria[];
    estimatedDuration: {
        min: number;
        max: number;
        confidence: number;
    };
    risks: string[];
    assumptions: string[];
    metadata: {
        analyzedAt: number;
        version: string;
    };
}
export declare class ProjectAnalyzer {
    private orchestrator;
    constructor(orchestrator: ModelOrchestrator);
    /**
    * Analyze a project specification
    */
    analyzeSpecification(specification: string): Promise<ProjectAnalysis>;
    /**
    * Extract basic project information
    */
    private extractBasicInfo;
    /**
    * Extract requirements from specification
    */
    private extractRequirements;
    /**
    * Extract constraints
    */
    private extractConstraints;
    /**
    * Recommend technology stack
    */
    private recommendTechStack;
    /**
    * Recommend architecture patterns (stub implementation)
    */
    private recommendArchitecture;
    /**
    * Assess project complexity (stub implementation)
    */
    private assessComplexity;
    /**
    * Extract success criteria (stub implementation)
    */
    private extractSuccessCriteria;
    /**
    * Estimate project duration (stub implementation)
    */
    private estimateDuration;
    /**
    * Identify project risks (stub implementation)
    */
    private identifyRisks;
    /**
    * Extract assumptions (stub implementation)
    */
    private extractAssumptions;
}
//# sourceMappingURL=projectAnalyzer.d.ts.map