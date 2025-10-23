"use strict";
/**
 * Agent Model Configuration
 *
 * Provides intelligent model selection and recommendations for different agent types.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_CAPABILITIES = exports.AGENT_MODEL_RECOMMENDATIONS = void 0;
exports.getModelRecommendation = getModelRecommendation;
exports.getFallbackModels = getFallbackModels;
exports.getModelCapabilities = getModelCapabilities;
exports.compareModels = compareModels;
exports.findBestModel = findBestModel;
exports.getRecommendationExplanation = getRecommendationExplanation;
exports.validateModelForRole = validateModelForRole;
const types_1 = require("./types");
/**
 * Model recommendations for each agent role
 *
 * DEFAULT STRATEGY: Use Claude Sonnet 4/4.5 for all critical operations
 * This ensures the highest quality AI assistance for code generation,
 * problem solving, refactoring, and troubleshooting.
 */
exports.AGENT_MODEL_RECOMMENDATIONS = {
    [types_1.AgentRole.PRE_FILTER]: {
        primary: 'claude-3-haiku',
        fallback: ['gpt-4o-mini', 'gpt-3.5-turbo', 'ollama:llama3'],
        reasoning: 'Pre-filtering requires fast, cost-efficient models. Claude Haiku provides excellent balance of speed and quality.',
        costEfficient: 'gpt-3.5-turbo',
        highPerformance: 'claude-3.5-sonnet'
    },
    [types_1.AgentRole.CODE_GENERATOR]: {
        primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for code generation
        fallback: ['gpt-4o', 'gpt-4-turbo', 'ollama:codellama'],
        reasoning: 'Code generation requires strong reasoning and code understanding. Claude Sonnet 4.5 excels at complex code generation, problem solving, and refactoring.',
        costEfficient: 'gpt-4o-mini',
        highPerformance: 'claude-3.5-sonnet'
    },
    [types_1.AgentRole.SECURITY_REVIEWER]: {
        primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for security analysis
        fallback: ['gpt-4o', 'gpt-4-turbo', 'ollama:llama3'],
        reasoning: 'Security review requires deep reasoning and attention to detail. Claude Sonnet 4.5 excels at thorough analysis and vulnerability detection.',
        costEfficient: 'claude-3-haiku',
        highPerformance: 'claude-3-opus'
    },
    [types_1.AgentRole.QUALITY_REVIEWER]: {
        primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for quality review
        fallback: ['gpt-4o', 'gpt-4-turbo', 'ollama:llama3'],
        reasoning: 'Quality review requires code understanding and best practices knowledge. Claude Sonnet 4.5 provides comprehensive analysis and actionable recommendations.',
        costEfficient: 'gpt-4o-mini',
        highPerformance: 'claude-3.5-sonnet'
    },
    [types_1.AgentRole.TESTING_VALIDATOR]: {
        primary: 'claude-3.5-sonnet', // Claude Sonnet 4.5 - BEST for test generation
        fallback: ['gpt-4o-mini', 'gpt-3.5-turbo', 'ollama:codellama'],
        reasoning: 'Test generation requires deep code understanding and edge case detection. Claude Sonnet 4.5 generates comprehensive, high-quality tests.',
        costEfficient: 'gpt-3.5-turbo',
        highPerformance: 'claude-3.5-sonnet'
    },
    [types_1.AgentRole.ORCHESTRATOR]: {
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
exports.MODEL_CAPABILITIES = {
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
function getModelRecommendation(role, preference = 'balanced') {
    const recommendation = exports.AGENT_MODEL_RECOMMENDATIONS[role];
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
function getFallbackModels(role) {
    return exports.AGENT_MODEL_RECOMMENDATIONS[role].fallback;
}
/**
 * Get model capabilities
 */
function getModelCapabilities(model) {
    return exports.MODEL_CAPABILITIES[model];
}
/**
 * Compare two models for a specific capability
 */
function compareModels(model1, model2, capability) {
    const caps1 = exports.MODEL_CAPABILITIES[model1];
    const caps2 = exports.MODEL_CAPABILITIES[model2];
    if (!caps1 || !caps2) {
        return 0;
    }
    return caps1[capability] - caps2[capability];
}
/**
 * Find best model for specific requirements
 */
function findBestModel(requirements, availableModels) {
    const models = availableModels || Object.keys(exports.MODEL_CAPABILITIES);
    let bestModel;
    let bestScore = -Infinity;
    for (const model of models) {
        const capabilities = exports.MODEL_CAPABILITIES[model];
        if (!capabilities)
            continue;
        let score = 0;
        let requirementCount = 0;
        for (const [capability, minValue] of Object.entries(requirements)) {
            const capValue = capabilities[capability];
            if (capValue >= minValue) {
                score += capValue;
            }
            else {
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
function getRecommendationExplanation(role) {
    return exports.AGENT_MODEL_RECOMMENDATIONS[role].reasoning;
}
/**
 * Validate model for agent role
 */
function validateModelForRole(model, role) {
    const capabilities = exports.MODEL_CAPABILITIES[model];
    const recommendation = exports.AGENT_MODEL_RECOMMENDATIONS[role];
    const warnings = [];
    const suggestions = [];
    if (!capabilities) {
        return {
            valid: false,
            warnings: [`Model '${model}' is not recognized`],
            suggestions: [`Use recommended model: ${recommendation.primary}`]
        };
    }
    // Check if model is suitable for role
    switch (role) {
        case types_1.AgentRole.CODE_GENERATOR:
            if (capabilities.codeGeneration < 7) {
                warnings.push(`Model has low code generation capability (${capabilities.codeGeneration}/10)`);
                suggestions.push(`Consider using ${recommendation.primary} for better code generation`);
            }
            break;
        case types_1.AgentRole.SECURITY_REVIEWER:
            if (capabilities.security < 7) {
                warnings.push(`Model has low security analysis capability (${capabilities.security}/10)`);
                suggestions.push(`Consider using ${recommendation.primary} for better security review`);
            }
            if (capabilities.reasoning < 8) {
                warnings.push(`Model has low reasoning capability (${capabilities.reasoning}/10)`);
            }
            break;
        case types_1.AgentRole.PRE_FILTER:
        case types_1.AgentRole.TESTING_VALIDATOR:
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
//# sourceMappingURL=modelConfig.js.map