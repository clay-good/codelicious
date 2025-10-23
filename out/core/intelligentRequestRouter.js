"use strict";
/**
 * Intelligent Request Router - Automatically detects build requests and routes appropriately
 *
 * This is the KEY component that makes autonomous building automatic!
 * No more special trigger phrases - just natural language.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligentRequestRouter = exports.RequestType = void 0;
const modelRouter_1 = require("../models/modelRouter");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('IntelligentRequestRouter');
var RequestType;
(function (RequestType) {
    RequestType["BUILD_REQUEST"] = "BUILD_REQUEST";
    RequestType["CODE_QUESTION"] = "CODE_QUESTION";
    RequestType["CODE_EXPLANATION"] = "CODE_EXPLANATION";
    RequestType["CODE_REVIEW"] = "CODE_REVIEW";
    RequestType["DEBUGGING"] = "DEBUGGING";
    RequestType["GENERAL_CHAT"] = "GENERAL_CHAT"; // General conversation
})(RequestType || (exports.RequestType = RequestType = {}));
class IntelligentRequestRouter {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
    * Analyze user intent and determine request type
    * Uses lightweight model (Gemini Flash) for cost efficiency
    */
    async analyzeIntent(userMessage, conversationHistory = []) {
        // Quick keyword-based pre-filtering (FREE)
        const quickAnalysis = this.quickAnalyze(userMessage);
        // If confidence is high, return immediately
        if (quickAnalysis.confidence >= 0.9) {
            return quickAnalysis;
        }
        // Use AI for ambiguous cases (costs ~$0.01)
        return await this.aiAnalyze(userMessage, conversationHistory);
    }
    /**
    * Quick keyword-based analysis (FREE, instant)
    * BUILDER MODE: Aggressively detect ANY code-related request
    */
    quickAnalyze(message) {
        const lower = message.toLowerCase();
        // Strong build indicators - EXPANDED for builder mode
        const buildKeywords = [
            'build', 'create', 'make', 'implement', 'develop', 'generate',
            'write a', 'write an', 'write some', 'write code',
            'i need a', 'i want a', 'i need some', 'i want some',
            'can you build', 'can you create', 'can you make', 'can you write',
            'help me build', 'help me create', 'help me write',
            'show me how to', 'give me an example', 'provide an example',
            'fix this', 'fix the', 'correct this', 'improve this',
            'refactor', 'optimize', 'add', 'update', 'modify',
            'example of', 'sample', 'demo', 'prototype'
        ];
        // Project type indicators
        const projectTypes = {
            'rest api': 'api',
            'graphql api': 'api',
            'web app': 'web',
            'website': 'web',
            'cli tool': 'cli',
            'command line': 'cli',
            'script': 'cli',
            'library': 'library',
            'package': 'library',
            'bot': 'bot',
            'discord bot': 'bot',
            'slack bot': 'bot'
        };
        // Language indicators
        const languages = {
            'python': ['python', 'py', 'django', 'flask', 'fastapi'],
            'typescript': ['typescript', 'ts', 'node', 'express', 'nest'],
            'javascript': ['javascript', 'js', 'react', 'vue', 'angular'],
            'rust': ['rust', 'cargo', 'actix', 'rocket'],
            'go': ['go', 'golang', 'gin', 'echo'],
            'java': ['java', 'spring', 'springboot']
        };
        // Check for build keywords
        const hasBuildKeyword = buildKeywords.some(keyword => lower.includes(keyword));
        // Detect project type
        let projectType;
        for (const [type, keyword] of Object.entries(projectTypes)) {
            if (lower.includes(keyword)) {
                projectType = type;
                break;
            }
        }
        // Detect languages
        const detectedLanguages = [];
        for (const [lang, keywords] of Object.entries(languages)) {
            if (keywords.some(keyword => lower.includes(keyword))) {
                detectedLanguages.push(lang);
            }
        }
        // Strong build indicators
        if (hasBuildKeyword && (projectType || detectedLanguages.length > 0)) {
            return {
                type: RequestType.BUILD_REQUEST,
                confidence: 0.95,
                specification: message,
                projectType,
                languages: detectedLanguages,
                complexity: this.estimateComplexity(message),
                estimatedTasks: this.estimateTaskCount(message),
                reasoning: 'Strong build keywords + project type/language detected'
            };
        }
        // Question indicators - but treat as BUILD if asking for examples/code
        const questionKeywords = ['how do i', 'how to', 'what is', 'why does', 'can you explain', 'show me'];
        const wantsCode = lower.includes('example') || lower.includes('code') || lower.includes('sample') ||
            lower.includes('demo') || lower.includes('implement') || lower.includes('write');
        if (questionKeywords.some(keyword => lower.includes(keyword))) {
            // If they want code examples, treat as BUILD_REQUEST
            if (wantsCode) {
                return {
                    type: RequestType.BUILD_REQUEST,
                    confidence: 0.90,
                    specification: message,
                    complexity: modelRouter_1.TaskComplexity.SIMPLE,
                    reasoning: 'Question asking for code example - will create example files'
                };
            }
            return {
                type: RequestType.CODE_QUESTION,
                confidence: 0.85,
                specification: message,
                complexity: modelRouter_1.TaskComplexity.SIMPLE,
                reasoning: 'Question keywords detected'
            };
        }
        // Debugging indicators - ALWAYS treat as BUILD (we'll create fixed versions)
        const debugKeywords = ['error', 'bug', 'not working', 'broken', 'fix', 'debug', 'issue', 'problem'];
        if (debugKeywords.some(keyword => lower.includes(keyword))) {
            return {
                type: RequestType.DEBUGGING,
                confidence: 0.90,
                specification: message,
                complexity: modelRouter_1.TaskComplexity.MODERATE,
                reasoning: 'Debugging request - will create fixed versions'
            };
        }
        // Low confidence - need AI analysis
        return {
            type: RequestType.GENERAL_CHAT,
            confidence: 0.3,
            specification: message,
            complexity: modelRouter_1.TaskComplexity.SIMPLE,
            reasoning: 'No clear indicators - needs AI analysis'
        };
    }
    /**
    * AI-based analysis for ambiguous cases
    * Uses Gemini Flash for cost efficiency (~$0.01 per analysis)
    * BUILDER MODE: Bias towards building/creating files
    */
    async aiAnalyze(message, conversationHistory) {
        const prompt = `Analyze this user message and determine their intent.

User message: "${message}"

IMPORTANT: We are in BUILDER MODE. We prefer to CREATE FILES over just explaining.
- If they ask for examples → BUILD_REQUEST (create example files)
- If they ask how to do something → BUILD_REQUEST (create working example)
- If they want to fix something → DEBUGGING (create fixed version)
- If they want to see code → BUILD_REQUEST (create the code)

Classify as one of:
1. BUILD_REQUEST - User wants to build/create/implement something OR wants examples/demos (code saved to files)
2. CODE_QUESTION - User has a theoretical question (no code needed)
3. CODE_EXPLANATION - User wants existing code explained (will create documented version)
4. CODE_REVIEW - User wants code reviewed (will create improved version)
5. DEBUGGING - User needs help debugging (will create fixed version)
6. GENERAL_CHAT - General conversation (no code involved)

When in doubt, choose BUILD_REQUEST - we're a builder, not a chat bot!

Respond in JSON format:
{
 "type": "BUILD_REQUEST|CODE_QUESTION|CODE_EXPLANATION|CODE_REVIEW|DEBUGGING|GENERAL_CHAT",
 "confidence": 0.0-1.0,
 "specification": "cleaned/enhanced specification if BUILD_REQUEST",
 "projectType": "web|api|cli|library|bot|other",
 "languages": ["python", "typescript", etc],
 "frameworks": ["express", "flask", etc],
 "complexity": "simple|moderate|complex",
 "estimatedTasks": number,
 "reasoning": "why this classification"
}`;
        try {
            const response = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are an intent classifier. Respond only with valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1
            }, {
                complexity: modelRouter_1.TaskComplexity.SIMPLE // Use cheap model
            });
            // Parse JSON response
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const analysis = JSON.parse(jsonMatch[0]);
            // Map complexity string to enum
            const complexityMap = {
                'simple': modelRouter_1.TaskComplexity.SIMPLE,
                'moderate': modelRouter_1.TaskComplexity.MODERATE,
                'complex': modelRouter_1.TaskComplexity.COMPLEX
            };
            return {
                type: analysis.type,
                confidence: analysis.confidence,
                specification: analysis.specification || message,
                projectType: analysis.projectType,
                languages: analysis.languages,
                frameworks: analysis.frameworks,
                complexity: complexityMap[analysis.complexity] || modelRouter_1.TaskComplexity.MODERATE,
                estimatedTasks: analysis.estimatedTasks,
                reasoning: analysis.reasoning
            };
        }
        catch (error) {
            logger.error('AI analysis failed:', error);
            // Fallback to conservative classification
            return {
                type: RequestType.GENERAL_CHAT,
                confidence: 0.5,
                specification: message,
                complexity: modelRouter_1.TaskComplexity.SIMPLE,
                reasoning: 'AI analysis failed - defaulting to chat'
            };
        }
    }
    /**
    * Estimate task complexity based on message
    */
    estimateComplexity(message) {
        const lower = message.toLowerCase();
        // Complex indicators
        const complexKeywords = [
            'authentication', 'authorization', 'database', 'api', 'microservice',
            'distributed', 'real-time', 'websocket', 'graphql', 'machine learning'
        ];
        if (complexKeywords.some(keyword => lower.includes(keyword))) {
            return modelRouter_1.TaskComplexity.COMPLEX;
        }
        // Simple indicators
        const simpleKeywords = [
            'hello world', 'simple', 'basic', 'quick', 'small'
        ];
        if (simpleKeywords.some(keyword => lower.includes(keyword))) {
            return modelRouter_1.TaskComplexity.SIMPLE;
        }
        return modelRouter_1.TaskComplexity.MODERATE;
    }
    /**
    * Estimate number of tasks based on message
    */
    estimateTaskCount(message) {
        const lower = message.toLowerCase();
        // Count feature indicators
        let taskCount = 3; // Base: structure, implementation, tests
        if (lower.includes('database') || lower.includes('db'))
            taskCount += 2;
        if (lower.includes('api'))
            taskCount += 2;
        if (lower.includes('auth'))
            taskCount += 3;
        if (lower.includes('test'))
            taskCount += 1;
        if (lower.includes('deploy'))
            taskCount += 2;
        if (lower.includes('docker'))
            taskCount += 1;
        if (lower.includes('ci/cd'))
            taskCount += 1;
        return Math.min(taskCount, 20); // Cap at 20 tasks
    }
    /**
    * Enhance specification with context
    */
    async enhanceSpecification(originalSpec, projectType, languages) {
        // Add context to make specification more complete
        let enhanced = originalSpec;
        if (projectType) {
            enhanced += `\n\nProject Type: ${projectType}`;
        }
        if (languages && languages.length > 0) {
            enhanced += `\n\nPreferred Languages: ${languages.join(', ')}`;
        }
        // Add best practices reminder
        enhanced += `\n\nRequirements:
- Follow best practices and design patterns
- Include comprehensive error handling
- Add logging where appropriate
- Generate tests with good coverage
- Include documentation (README, comments)
- Use modern, idiomatic code`;
        return enhanced;
    }
}
exports.IntelligentRequestRouter = IntelligentRequestRouter;
//# sourceMappingURL=intelligentRequestRouter.js.map