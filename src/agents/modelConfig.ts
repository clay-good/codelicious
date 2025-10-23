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
 codeGeneration: number; // 0-10
 reasoning: number; // 0-10
 security: number; // 0-10
 speed: number; // 0-10
 cost: number; // 0-10 (higher = more expensive)
 contextWindow: number; // tokens
}

/**
 * Model recommendations for each agent role
 *
 * DEFAULT STRATEGY: Use Claude Sonnet 4/4.5 for all critical operations
 * This ensures the highest quality AI assistance for code generation,
 * problem solving, refactoring, and troubleshooting.
 */
export const AGENT_MODEL_RECOMMENDATIONS: Record<AgentRole, ModelRecommendation> = {
 [AgentRole.PRE_FILTER]: {
 primary: 'claude-3-haiku',
 fallback: ['gpt-4o-mini', 'gpt-3.5-turbo', 'ollama:llama3'],
 reasoning: 'Pre-filtering requires fast, cost-efficient models. Claude Haiku provides excellent balance of speed and quality.',
 costEfficient: 'gpt-3.5-turbo',
 highPerformance: 'claude-3.5-sonnet'
 },

 [AgentRole.CODE_GENERATOR]: {
 primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for code generation
 fallback: ['gpt-4o', 'gpt-4-turbo', 'ollama:codellama'],
 reasoning: 'Code generation requires strong reasoning and code understanding. Claude Sonnet 4.5 excels at complex code generation, problem solving, and refactoring.',
 costEfficient: 'gpt-4o-mini',
 highPerformance: 'claude-3.5-sonnet'
 },

 [AgentRole.SECURITY_REVIEWER]: {
 primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for security analysis
 fallback: ['gpt-4o', 'gpt-4-turbo', 'ollama:llama3'],
 reasoning: 'Security review requires deep reasoning and attention to detail. Claude Sonnet 4.5 excels at thorough analysis and vulnerability detection.',
 costEfficient: 'claude-3-haiku',
 highPerformance: 'claude-3-opus'
 },

 [AgentRole.QUALITY_REVIEWER]: {
 primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for quality review
 fallback: ['gpt-4o', 'gpt-4-turbo', 'ollama:llama3'],
 reasoning: 'Quality review requires code understanding and best practices knowledge. Claude Sonnet 4.5 provides comprehensive analysis and actionable recommendations.',
 costEfficient: 'gpt-4o-mini',
 highPerformance: 'claude-3.5-sonnet'
 },

 [AgentRole.TESTING_VALIDATOR]: {
 primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for test generation
 fallback: ['gpt-4o-mini', 'gpt-3.5-turbo', 'ollama:codellama'],
 reasoning: 'Test generation requires deep code understanding and edge case detection. Claude Sonnet 4.5 generates comprehensive, high-quality tests.',
 costEfficient: 'gpt-3.5-turbo',
 highPerformance: 'claude-3.5-sonnet'
 },

 [AgentRole.ORCHESTRATOR]: {
 primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for orchestration
 fallback: ['gpt-4o', 'gpt-4-turbo'],
 reasoning: 'Orchestration requires strong reasoning, planning, and coordination. Claude Sonnet 4.5 provides excellent multi-step problem solving.',
 costEfficient: 'gpt-4o-mini',
 highPerformance: 'claude-3.5-sonnet'
 }
};

/**
 * Model capabilities database
 */
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
 'gpt-4o': {
 codeGeneration: 10,
 reasoning: 10,
 security: 9,
 speed: 7,
 cost: 8,
 contextWindow: 128000
 },
 'gpt-4o-mini': {
 codeGeneration: 8,
 reasoning: 8,
 security: 7,
 speed: 9,
 cost: 3,
 contextWindow: 128000
 },
 'gpt-4-turbo': {
 codeGeneration: 9,
 reasoning: 9,
 security: 8,
 speed: 6,
 cost: 7,
 contextWindow: 128000
 },
 'gpt-3.5-turbo': {
 codeGeneration: 6,
 reasoning: 6,
 security: 5,
 speed: 10,
 cost: 1,
 contextWindow: 16385
 },
 'claude-3.5-sonnet': {
 codeGeneration: 10,
 reasoning: 10,
 security: 10,
 speed: 7,
 cost: 8,
 contextWindow: 200000
 },
 'claude-3-opus': {
 codeGeneration: 9,
 reasoning: 10,
 security: 10,
 speed: 5,
 cost: 10,
 contextWindow: 200000
 },
 'claude-3-haiku': {
 codeGeneration: 7,
 reasoning: 7,
 security: 7,
 speed: 10,
 cost: 2,
 contextWindow: 200000
 },
 'gemini-1.5-pro': {
 codeGeneration: 8,
 reasoning: 8,
 security: 7,
 speed: 7,
 cost: 5,
 contextWindow: 1000000
 },
 'ollama:llama3': {
 codeGeneration: 7,
 reasoning: 7,
 security: 6,
 speed: 6,
 cost: 0,
 contextWindow: 8192
 },
 'ollama:codellama': {
 codeGeneration: 8,
 reasoning: 6,
 security: 5,
 speed: 7,
 cost: 0,
 contextWindow: 16384
 },
 'ollama:mistral': {
 codeGeneration: 7,
 reasoning: 7,
 security: 6,
 speed: 8,
 cost: 0,
 contextWindow: 8192
 }
};

/**
 * Get model recommendation for an agent role
 */
export function getModelRecommendation(
 role: AgentRole,
 preference: 'balanced' | 'cost-efficient' | 'high-performance' = 'balanced'
): string {
 const recommendation = AGENT_MODEL_RECOMMENDATIONS[role];

 switch (preference) {
 case 'cost-efficient':
 return recommendation.costEfficient || recommendation.primary;
 case 'high-performance':
 return recommendation.highPerformance || recommendation.primary;
 default:
 return recommendation.primary;
 }
}

/**
 * Get fallback models for an agent role
 */
export function getFallbackModels(role: AgentRole): string[] {
 return AGENT_MODEL_RECOMMENDATIONS[role].fallback;
}

/**
 * Get model capabilities
 */
export function getModelCapabilities(model: string): ModelCapabilities | undefined {
 return MODEL_CAPABILITIES[model];
}

/**
 * Compare two models for a specific capability
 */
export function compareModels(
 model1: string,
 model2: string,
 capability: keyof ModelCapabilities
): number {
 const caps1 = MODEL_CAPABILITIES[model1];
 const caps2 = MODEL_CAPABILITIES[model2];

 if (!caps1 || !caps2) {
 return 0;
 }

 return caps1[capability] - caps2[capability];
}

/**
 * Find best model for specific requirements
 */
export function findBestModel(
 requirements: Partial<Record<keyof ModelCapabilities, number>>,
 availableModels?: string[]
): string | undefined {
 const models = availableModels || Object.keys(MODEL_CAPABILITIES);

 let bestModel: string | undefined;
 let bestScore = -Infinity;

 for (const model of models) {
 const capabilities = MODEL_CAPABILITIES[model];
 if (!capabilities) continue;

 let score = 0;
 let requirementCount = 0;

 for (const [capability, minValue] of Object.entries(requirements)) {
 const capValue = capabilities[capability as keyof ModelCapabilities];
 if (capValue >= minValue) {
 score += capValue;
 } else {
 score -= (minValue - capValue) * 2; // Penalty for not meeting requirement
 }
 requirementCount++;
 }

 if (requirementCount > 0) {
 score /= requirementCount;
 }

 if (score > bestScore) {
 bestScore = score;
 bestModel = model;
 }
 }

 return bestModel;
}

/**
 * Get model recommendation explanation
 */
export function getRecommendationExplanation(role: AgentRole): string {
 return AGENT_MODEL_RECOMMENDATIONS[role].reasoning;
}

/**
 * Validate model for agent role
 */
export function validateModelForRole(model: string, role: AgentRole): {
 valid: boolean;
 warnings: string[];
 suggestions: string[];
} {
 const capabilities = MODEL_CAPABILITIES[model];
 const recommendation = AGENT_MODEL_RECOMMENDATIONS[role];
 const warnings: string[] = [];
 const suggestions: string[] = [];

 if (!capabilities) {
 return {
 valid: false,
 warnings: [`Model '${model}' is not recognized`],
 suggestions: [`Use recommended model: ${recommendation.primary}`]
 };
 }

 // Check if model is suitable for role
 switch (role) {
 case AgentRole.CODE_GENERATOR:
 if (capabilities.codeGeneration < 7) {
 warnings.push(`Model has low code generation capability (${capabilities.codeGeneration}/10)`);
 suggestions.push(`Consider using ${recommendation.primary} for better code generation`);
 }
 break;

 case AgentRole.SECURITY_REVIEWER:
 if (capabilities.security < 7) {
 warnings.push(`Model has low security analysis capability (${capabilities.security}/10)`);
 suggestions.push(`Consider using ${recommendation.primary} for better security review`);
 }
 if (capabilities.reasoning < 8) {
 warnings.push(`Model has low reasoning capability (${capabilities.reasoning}/10)`);
 }
 break;

 case AgentRole.PRE_FILTER:
 case AgentRole.TESTING_VALIDATOR:
 if (capabilities.speed < 6) {
 warnings.push(`Model is slow (${capabilities.speed}/10) for this role`);
 suggestions.push(`Consider using ${recommendation.costEfficient} for faster processing`);
 }
 break;
 }

 // Cost warnings
 if (capabilities.cost > 7) {
 warnings.push(`Model is expensive (${capabilities.cost}/10 cost rating)`);
 if (recommendation.costEfficient) {
 suggestions.push(`Consider using ${recommendation.costEfficient} to reduce costs`);
 }
 }

 return {
 valid: warnings.length === 0,
 warnings,
 suggestions
 };
}

