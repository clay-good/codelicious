/**
 * Agent Model Configuration
 *
 * Provides intelligent model selection and recommendations for different agent types.
 */
import { AgentRole } from './types';
/**
 * Model recommendation for an agent role
 */
export interface ModelRecommendation {
    primary: string;
    fallback: string[];
    reasoning: string;
    costEfficient?: string;
    highPerformance?: string;
}
/**
 * Model capabilities
 */
export interface ModelCapabilities {
    codeGeneration: number;
    reasoning: number;
    security: number;
    speed: number;
    cost: number;
    contextWindow: number;
}
/**
 * Model recommendations for each agent role
 *
 * DEFAULT STRATEGY: Use Claude Sonnet 4/4.5 for all critical operations
 * This ensures the highest quality AI assistance for code generation,
 * problem solving, refactoring, and troubleshooting.
 */
export declare const AGENT_MODEL_RECOMMENDATIONS: Record<AgentRole, ModelRecommendation>;
/**
 * Model capabilities database
 */
export declare const MODEL_CAPABILITIES: Record<string, ModelCapabilities>;
/**
 * Get model recommendation for an agent role
 */
export declare function getModelRecommendation(role: AgentRole, preference?: 'balanced' | 'cost-efficient' | 'high-performance'): string;
/**
 * Get fallback models for an agent role
 */
export declare function getFallbackModels(role: AgentRole): string[];
/**
 * Get model capabilities
 */
export declare function getModelCapabilities(model: string): ModelCapabilities | undefined;
/**
 * Compare two models for a specific capability
 */
export declare function compareModels(model1: string, model2: string, capability: keyof ModelCapabilities): number;
/**
 * Find best model for specific requirements
 */
export declare function findBestModel(requirements: Partial<Record<keyof ModelCapabilities, number>>, availableModels?: string[]): string | undefined;
/**
 * Get model recommendation explanation
 */
export declare function getRecommendationExplanation(role: AgentRole): string;
/**
 * Validate model for agent role
 */
export declare function validateModelForRole(model: string, role: AgentRole): {
    valid: boolean;
    warnings: string[];
    suggestions: string[];
};
//# sourceMappingURL=modelConfig.d.ts.map