"use strict";
/**
 * AI-Powered Fix Generator
 *
 * Features:
 * - Context-aware fix generation
 * - Multi-step fix planning
 * - Learning from past fixes
 * - Multi-language support
 * - Confidence scoring
 * - Fix validation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIFixGenerator = void 0;
const mlFixRanker_1 = require("./mlFixRanker");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AIFixGenerator');
class AIFixGenerator {
    constructor(orchestrator, embeddingManager) {
        this.orchestrator = orchestrator;
        this.fixHistory = [];
        this.fixPatterns = new Map();
        this.mlRanker = null;
        this.initializeFixPatterns();
        // Initialize ML ranker if embedding manager provided
        if (embeddingManager) {
            this.mlRanker = new mlFixRanker_1.MLFixRanker(embeddingManager);
        }
    }
    /**
    * Generate fixes for errors using AI
    */
    async generateFixes(errors, files, options = {}) {
        const opts = {
            maxFixes: 3,
            minConfidence: 0.6,
            includeExplanation: true,
            considerHistory: true,
            multiStep: true,
            validateFixes: true,
            useMLRanking: true,
            ...options
        };
        const generatedFixes = [];
        for (const error of errors) {
            // 1. Check if we have pattern-based fixes
            const patternFixes = this.getPatternFixes(error);
            // 2. Check fix history for similar errors
            const historicalFixes = opts.considerHistory
                ? this.getHistoricalFixes(error)
                : [];
            // 3. Generate AI-powered fixes
            const aiFixes = await this.generateAIFixes(error, files, opts);
            // 4. Combine all fixes
            const allFixes = [...patternFixes, ...historicalFixes, ...aiFixes];
            // 5. Rank fixes (ML-based or simple)
            let rankedFixes;
            if (opts.useMLRanking && this.mlRanker) {
                // Use ML-based ranking
                const fileContext = this.getFileContext(error, files);
                const mlRanked = await this.mlRanker.rankFixes(allFixes, error, fileContext);
                // Log ML ranking insights
                if (mlRanked.length > 0) {
                    logger.info(` ML Ranking for ${error.type}:`);
                    for (let i = 0; i < Math.min(3, mlRanked.length); i++) {
                        logger.info(` ${i + 1}. Score: ${(mlRanked[i].score * 100).toFixed(1)}% - ${mlRanked[i].fix.description}`);
                        logger.info(` ${mlRanked[i].explanation.join(', ')}`);
                    }
                }
                rankedFixes = mlRanked.map(r => r.fix);
            }
            else {
                // Use simple ranking
                rankedFixes = this.rankFixes(allFixes, opts.minConfidence);
            }
            // 6. Take top N fixes
            const topFixes = rankedFixes.slice(0, opts.maxFixes);
            // 7. Validate fixes if requested
            const validatedFixes = opts.validateFixes
                ? await this.validateFixes(topFixes, error, files)
                : topFixes;
            generatedFixes.push({
                error,
                fixes: validatedFixes,
                reasoning: this.generateReasoning(error, validatedFixes),
                confidence: this.calculateOverallConfidence(validatedFixes),
                estimatedImpact: this.estimateImpact(error, validatedFixes),
                requiresManualReview: this.requiresManualReview(error, validatedFixes)
            });
        }
        return generatedFixes;
    }
    /**
    * Generate AI-powered fixes
    */
    async generateAIFixes(error, files, options) {
        const fixes = [];
        // Build context-rich prompt
        const prompt = this.buildFixPrompt(error, files, options);
        try {
            const response = await this.orchestrator.sendRequest({
                messages: [
                    {
                        role: 'system',
                        content: this.getSystemPrompt(error.language)
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                maxTokens: 2000
            });
            // Parse AI response into fixes
            const parsedFixes = this.parseAIResponse(response.content, error);
            fixes.push(...parsedFixes);
        }
        catch (error) {
            logger.error('Error generating AI fixes:', error);
        }
        return fixes;
    }
    /**
    * Build context-aware prompt for fix generation
    */
    buildFixPrompt(error, files, options) {
        const file = files.find(f => f.filePath === error.file);
        const fileContent = file?.content || '';
        // Extract relevant code context
        const contextLines = this.extractContextLines(fileContent, error.line || 0, 10);
        let prompt = `# Error Fix Request

## Error Details
- **Type**: ${error.type}
- **Severity**: ${error.severity}
- **Language**: ${error.language}
- **File**: ${error.file}
- **Line**: ${error.line || 'unknown'}
- **Message**: ${error.message}

## Code Context
\`\`\`${error.language}
${contextLines}
\`\`\`

## File Imports
${error.context.imports.join('\n')}

## File Exports
${error.context.exports.join('\n')}
`;
        if (error.rootCause) {
            prompt += `\n## Root Cause\n${error.rootCause}\n`;
        }
        if (error.relatedErrors.length > 0) {
            prompt += `\n## Related Errors\nThis error is related to ${error.relatedErrors.length} other error(s).\n`;
        }
        // Add historical context if available
        if (options.considerHistory) {
            const similarFixes = this.getHistoricalFixes(error);
            if (similarFixes.length > 0) {
                prompt += `\n## Similar Past Fixes\n`;
                for (const fix of similarFixes.slice(0, 2)) {
                    prompt += `- ${fix.description} (confidence: ${fix.confidence})\n`;
                }
            }
        }
        prompt += `
## Task
Generate ${options.maxFixes || 3} possible fixes for this error.

For each fix, provide:
1. **Description**: Clear description of what the fix does
2. **Type**: add, remove, replace, or refactor
3. **Changes**: Specific code changes needed
4. **Reasoning**: Why this fix will work
5. **Confidence**: Your confidence in this fix (0.0 to 1.0)

${options.multiStep ? 'If the fix requires multiple steps, break it down into individual changes.' : ''}

Format your response as JSON:
\`\`\`json
{
 "fixes": [
 {
 "description": "...",
 "type": "replace",
 "confidence": 0.9,
 "reasoning": "...",
 "changes": [
 {
 "file": "${error.file}",
 "line": ${error.line || 0},
 "oldCode": "...",
 "newCode": "..."
 }
 ]
 }
 ]
}
\`\`\`
`;
        return prompt;
    }
    /**
    * Get system prompt for specific language
    */
    getSystemPrompt(language) {
        const basePrompt = `You are an expert software engineer specializing in debugging and fixing code errors. You have deep knowledge of best practices, common pitfalls, and idiomatic patterns.`;
        const languageSpecific = {
            typescript: `${basePrompt} You are particularly skilled in TypeScript, including advanced types, generics, decorators, and the TypeScript compiler.`,
            javascript: `${basePrompt} You are particularly skilled in JavaScript, including ES6+, async/await, promises, and modern JavaScript patterns.`,
            python: `${basePrompt} You are particularly skilled in Python, including type hints, decorators, context managers, and Pythonic idioms.`,
            go: `${basePrompt} You are particularly skilled in Go, including goroutines, channels, interfaces, and Go idioms like error handling.`,
            rust: `${basePrompt} You are particularly skilled in Rust, including ownership, borrowing, lifetimes, traits, and safe concurrency.`,
            other: basePrompt
        };
        return languageSpecific[language] || basePrompt;
    }
    /**
    * Parse AI response into structured fixes
    */
    parseAIResponse(response, error) {
        const fixes = [];
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/```json\n([\s\S]+?)\n```/);
            if (!jsonMatch) {
                // Try parsing entire response as JSON
                const parsed = JSON.parse(response);
                if (parsed.fixes) {
                    return parsed.fixes;
                }
                return [];
            }
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.fixes && Array.isArray(parsed.fixes)) {
                fixes.push(...parsed.fixes);
            }
        }
        catch (error) {
            logger.error('Error parsing AI response:', error);
        }
        return fixes;
    }
    /**
    * Get pattern-based fixes
    */
    getPatternFixes(error) {
        const key = `${error.type}_${error.language}`;
        return this.fixPatterns.get(key) || [];
    }
    /**
    * Get historical fixes for similar errors
    */
    getHistoricalFixes(error) {
        const similarFixes = this.fixHistory
            .filter(h => h.errorType === error.type &&
            h.language === error.language &&
            h.success)
            .map(h => h.fix);
        return similarFixes;
    }
    /**
    * Rank fixes by confidence and relevance
    */
    rankFixes(fixes, minConfidence) {
        return fixes
            .filter(f => f.confidence >= minConfidence)
            .sort((a, b) => b.confidence - a.confidence);
    }
    /**
    * Validate fixes
    */
    async validateFixes(fixes, error, files) {
        const validatedFixes = [];
        for (const fix of fixes) {
            // Basic validation
            let isValid = true;
            // Check if changes are valid
            for (const change of fix.changes) {
                // Validate file exists
                const file = files.find(f => f.filePath === change.file);
                if (!file) {
                    isValid = false;
                    break;
                }
                // Validate line number
                if (change.line) {
                    const lines = file.content.split('\n');
                    if (change.line > lines.length) {
                        isValid = false;
                        break;
                    }
                }
            }
            if (isValid) {
                validatedFixes.push(fix);
            }
        }
        return validatedFixes;
    }
    /**
    * Generate reasoning for fixes
    */
    generateReasoning(error, fixes) {
        if (fixes.length === 0) {
            return `No fixes could be generated for this ${error.type} error.`;
        }
        const topFix = fixes[0];
        return `The most likely fix is to ${topFix.description}. ${topFix.reasoning}`;
    }
    /**
    * Calculate overall confidence
    */
    calculateOverallConfidence(fixes) {
        if (fixes.length === 0)
            return 0;
        return fixes.reduce((sum, f) => sum + f.confidence, 0) / fixes.length;
    }
    /**
    * Estimate impact of fixes
    */
    estimateImpact(error, fixes) {
        if (error.severity === 'critical')
            return 'high';
        if (error.severity === 'error')
            return 'medium';
        return 'low';
    }
    /**
    * Determine if manual review is required
    */
    requiresManualReview(error, fixes) {
        // Require manual review for critical errors or low confidence fixes
        if (error.severity === 'critical')
            return true;
        if (fixes.length === 0)
            return true;
        if (fixes[0].confidence < 0.7)
            return true;
        return false;
    }
    /**
    * Extract context lines around error
    */
    extractContextLines(content, line, contextSize) {
        const lines = content.split('\n');
        const start = Math.max(0, line - contextSize);
        const end = Math.min(lines.length, line + contextSize);
        return lines
            .slice(start, end)
            .map((l, i) => `${start + i + 1}: ${l}`)
            .join('\n');
    }
    /**
    * Initialize common fix patterns
    */
    initializeFixPatterns() {
        // TypeScript: Missing import
        this.fixPatterns.set('undefined-variable_typescript', [
            {
                description: 'Add missing import statement',
                confidence: 0.8,
                type: 'add',
                changes: [],
                reasoning: 'Variable is likely defined in another module'
            }
        ]);
        // Python: Missing import
        this.fixPatterns.set('undefined-variable_python', [
            {
                description: 'Add missing import statement',
                confidence: 0.8,
                type: 'add',
                changes: [],
                reasoning: 'Name is likely defined in another module'
            }
        ]);
        // Go: Unused variable
        this.fixPatterns.set('undefined-variable_go', [
            {
                description: 'Remove unused variable or use it',
                confidence: 0.9,
                type: 'replace',
                changes: [],
                reasoning: 'Go requires all declared variables to be used'
            }
        ]);
    }
    /**
    * Get file context for ML ranking
    */
    getFileContext(error, files) {
        const file = files.find(f => f.filePath === error.file);
        const fileContent = file?.content || '';
        const fileSize = Buffer.byteLength(fileContent, 'utf8');
        const linesOfCode = fileContent.split('\n').length;
        const hasTests = fileContent.includes('test') || fileContent.includes('describe') || fileContent.includes('it(');
        const inProduction = !error.file.includes('test') && !error.file.includes('spec');
        return {
            fileContent,
            fileSize,
            linesOfCode,
            hasTests,
            inProduction
        };
    }
    /**
    * Record fix success/failure for learning
    */
    recordFixResult(error, fix, success, context) {
        this.fixHistory.push({
            errorType: error.type,
            language: error.language,
            fix,
            success,
            timestamp: new Date(),
            context
        });
        // Also record in ML ranker if available
        if (this.mlRanker) {
            // We don't have the features here, so ML ranker will extract them
            // This is a simplified version - in production, we'd pass the features
            logger.info(`Recording fix outcome for ML learning: ${success ? 'SUCCESS' : 'FAILURE'}`);
        }
        // Keep history size manageable
        if (this.fixHistory.length > 1000) {
            this.fixHistory = this.fixHistory.slice(-1000);
        }
        // Share history with ML ranker
        if (this.mlRanker) {
            this.mlRanker.loadHistory(this.fixHistory);
        }
    }
    /**
    * Get ML ranking metrics
    */
    getMLMetrics() {
        return this.mlRanker?.getMetrics();
    }
    /**
    * Get ML ranking weights
    */
    getMLWeights() {
        return this.mlRanker?.getWeights();
    }
}
exports.AIFixGenerator = AIFixGenerator;
//# sourceMappingURL=aiFixGenerator.js.map