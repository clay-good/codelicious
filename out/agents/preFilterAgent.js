"use strict";
/**
 * Pre-Filter Agent
 *
 * Optimizes user prompts before sending to the main code generation agent.
 * Adds context, clarifies requirements, and structures requests for better results.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreFilterAgent = void 0;
const baseAgent_1 = require("./baseAgent");
const types_1 = require("./types");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('PreFilterAgent');
class PreFilterAgent extends baseAgent_1.BaseAgent {
    constructor(orchestrator, config = {}) {
        super(types_1.AgentRole.PRE_FILTER, orchestrator, {
            role: types_1.AgentRole.PRE_FILTER,
            enabled: true,
            temperature: 0.3, // Lower temperature for more focused optimization
            maxTokens: 2000,
            ...config
        });
    }
    getDefaultSystemPrompt() {
        return `You are a Pre-Filter Agent specialized in optimizing user prompts for code generation.

Your responsibilities:
1. Analyze the user's request and identify ambiguities or missing information
2. Add relevant context from the codebase
3. Structure the request for optimal code generation
4. Estimate the complexity of the task
5. Suggest clarifications if needed

Output your analysis in JSON format:
{
 "optimizedPrompt": "The enhanced prompt with context and clarifications",
 "clarifications": ["List of clarifications added"],
 "contextAdded": ["List of context elements added"],
 "estimatedComplexity": "simple|moderate|complex|very_complex",
 "reasoning": "Explanation of your optimization decisions",
 "suggestions": ["Optional suggestions for the user"]
}

Be concise but thorough. Focus on making the prompt clear and actionable.`;
    }
    async buildPrompt(context) {
        let prompt = `Optimize this user request for code generation:\n\n`;
        prompt += `**User Request:**\n${context.userPrompt}\n\n`;
        // Add workspace context
        if (context.workspaceRoot) {
            prompt += `**Workspace:** ${context.workspaceRoot}\n`;
        }
        if (context.currentFile) {
            prompt += `**Current File:** ${context.currentFile}\n`;
        }
        if (context.openFiles.length > 0) {
            prompt += `**Open Files:** ${context.openFiles.slice(0, 5).join(', ')}\n`;
        }
        // Add codebase context if available
        if (context.codebaseContext) {
            prompt += `\n**Codebase Context:**\n${context.codebaseContext.substring(0, 2000)}\n`;
        }
        // Add relevant files
        if (context.relevantFiles && context.relevantFiles.length > 0) {
            prompt += `\n**Relevant Files:**\n${context.relevantFiles.slice(0, 10).join('\n')}\n`;
        }
        // Add dependencies
        if (context.dependencies && context.dependencies.length > 0) {
            prompt += `\n**Dependencies:**\n${context.dependencies.slice(0, 10).join(', ')}\n`;
        }
        prompt += `\nOptimize this request and provide your analysis in JSON format.`;
        return prompt;
    }
    async parseResponse(response, context) {
        try {
            const data = this.extractJSON(response); // Pre-filter agent response structure
            // Validate required fields
            if (!data.optimizedPrompt) {
                throw new Error('Missing optimizedPrompt in response');
            }
            // Calculate confidence based on response quality
            const confidence = this.calculateConfidence(response, [
                'optimizedPrompt',
                'clarifications',
                'contextAdded',
                'estimatedComplexity'
            ]);
            return {
                success: true,
                data: {
                    optimizedPrompt: data.optimizedPrompt,
                    clarifications: data.clarifications || [],
                    contextAdded: data.contextAdded || [],
                    estimatedComplexity: data.estimatedComplexity || 'moderate'
                },
                confidence,
                reasoning: data.reasoning,
                suggestions: data.suggestions || []
            };
        }
        catch (error) {
            // Fallback: use original prompt if parsing fails
            logger.warn('Pre-filter agent failed to parse response, using original prompt:', error);
            return {
                success: true,
                data: {
                    optimizedPrompt: context.userPrompt,
                    clarifications: [],
                    contextAdded: [],
                    estimatedComplexity: 'moderate'
                },
                confidence: 0.3,
                warnings: ['Failed to optimize prompt, using original'],
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
    }
    /**
    * Quick optimization without full AI call (for simple cases)
    */
    async quickOptimize(userPrompt, context) {
        let optimized = userPrompt;
        // Add workspace context if available
        if (context.workspaceRoot) {
            optimized += `\n\nWorkspace: ${context.workspaceRoot}`;
        }
        // Add current file context
        if (context.currentFile) {
            optimized += `\nCurrent file: ${context.currentFile}`;
        }
        // Add codebase context snippet
        if (context.codebaseContext) {
            const snippet = context.codebaseContext.substring(0, 500);
            optimized += `\n\nRelevant code context:\n${snippet}`;
        }
        return optimized;
    }
    /**
    * Estimate complexity without full AI call
    */
    estimateComplexity(userPrompt, context) {
        const promptLength = userPrompt.length;
        const hasCodebaseContext = !!context.codebaseContext;
        const fileCount = context.relevantFiles?.length || 0;
        const hasMultipleFiles = fileCount > 3;
        // Check for complexity indicators
        const complexityIndicators = [
            'refactor',
            'architecture',
            'design pattern',
            'optimize',
            'performance',
            'security',
            'database',
            'api',
            'integration'
        ];
        const hasComplexKeywords = complexityIndicators.some(keyword => userPrompt.toLowerCase().includes(keyword));
        if (promptLength > 1000 || (hasCodebaseContext && hasMultipleFiles && hasComplexKeywords)) {
            return 'very_complex';
        }
        else if (promptLength > 500 || (hasCodebaseContext && hasMultipleFiles)) {
            return 'complex';
        }
        else if (promptLength > 200 || hasCodebaseContext) {
            return 'moderate';
        }
        else {
            return 'simple';
        }
    }
    /**
    * Add codebase context to prompt
    */
    addCodebaseContext(prompt, codebaseContext, maxLength = 2000) {
        if (!codebaseContext) {
            return prompt;
        }
        const contextSnippet = codebaseContext.substring(0, maxLength);
        return `${prompt}\n\n**Codebase Context:**\n${contextSnippet}`;
    }
    /**
    * Extract key requirements from prompt
    */
    extractRequirements(prompt) {
        const requirements = [];
        // Look for numbered lists
        const numberedPattern = /\d+\.\s+([^\n]+)/g;
        let match;
        while ((match = numberedPattern.exec(prompt)) !== null) {
            requirements.push(match[1].trim());
        }
        // Look for bullet points
        const bulletPattern = /[-*]\s+([^\n]+)/g;
        while ((match = bulletPattern.exec(prompt)) !== null) {
            requirements.push(match[1].trim());
        }
        // Look for "should" statements
        const shouldPattern = /should\s+([^.!?\n]+)/gi;
        while ((match = shouldPattern.exec(prompt)) !== null) {
            requirements.push(match[1].trim());
        }
        return [...new Set(requirements)]; // Remove duplicates
    }
}
exports.PreFilterAgent = PreFilterAgent;
//# sourceMappingURL=preFilterAgent.js.map