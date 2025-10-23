/**
 * Requirements Parser - Parse natural language specifications into structured requirements
 *
 * Matches Augment's capability to convert natural language into executable tasks
 */
import { ModelOrchestrator } from '../models/orchestrator';
export interface Requirement {
    id: string;
    description: string;
    type: 'feature' | 'bugfix' | 'refactor' | 'test' | 'documentation';
    priority: 'critical' | 'high' | 'medium' | 'low';
    acceptanceCriteria: string[];
    technicalConstraints: string[];
    dependencies: string[];
    estimatedComplexity: 'simple' | 'moderate' | 'complex';
    affectedFiles: string[];
    testRequirements: TestRequirement[];
}
export interface TestRequirement {
    type: 'unit' | 'integration' | 'e2e';
    description: string;
    coverage: number;
}
export interface ParsedRequirements {
    mainRequirement: Requirement;
    subRequirements: Requirement[];
    totalEstimatedEffort: number;
    risks: string[];
    recommendations: string[];
}
export declare class RequirementsParser {
    private orchestrator;
    constructor(orchestrator: ModelOrchestrator);
    /**
    * Parse natural language specification into structured requirements
    */
    parse(specification: string): Promise<ParsedRequirements>;
    /**
    * Build prompt for requirements parsing
    */
    private buildParsingPrompt;
    /**
    * Parse AI response into structured requirements
    */
    private parseResponse;
    /**
    * Validate and normalize a requirement
    */
    private validateRequirement;
    private validateType;
    private validatePriority;
    private validateComplexity;
    /**
    * Refine requirements with additional context
    */
    refine(requirements: ParsedRequirements, additionalContext: string): Promise<ParsedRequirements>;
    /**
    * Validate requirements completeness
    */
    validateCompleteness(requirements: ParsedRequirements): {
        isComplete: boolean;
        missingElements: string[];
        score: number;
    };
}
//# sourceMappingURL=requirementsParser.d.ts.map