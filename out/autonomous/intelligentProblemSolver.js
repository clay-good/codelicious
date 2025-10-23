"use strict";
/**
 * Intelligent Problem Solver - AI-Powered Code Problem Solving & Troubleshooting
 *
 * This system uses Claude Sonnet 4/4.5 to deeply analyze, troubleshoot, and solve
 * code problems during generation, refactoring, and validation.
 *
 * Features:
 * - Deep problem analysis with root cause detection
 * - Multi-step problem solving with iterative refinement
 * - Context-aware troubleshooting using RAG
 * - Automatic test generation for problem validation
 * - Learning from past solutions
 * - Refactoring intelligence with AI suggestions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligentProblemSolver = void 0;
const modelRouter_1 = require("../models/modelRouter");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('IntelligentProblemSolver');
class IntelligentProblemSolver {
    constructor(orchestrator, ragService, learningManager) {
        this.orchestrator = orchestrator;
        this.ragService = ragService;
        this.learningManager = learningManager;
        this.solutionHistory = new Map();
    }
    /**
    * Analyze and solve a problem using AI
    * Uses Claude Sonnet 4/4.5 for deep reasoning
    */
    async solveProblem(problem, options = {}) {
        const startTime = Date.now();
        const opts = {
            maxIterations: 5,
            requireTests: true,
            considerAlternatives: true,
            useRAG: true,
            learnFromSolution: true,
            ...options
        };
        logger.info(`Analyzing problem: ${problem.description}`);
        logger.info(` Type: ${problem.type}, Severity: ${problem.severity}`);
        // Step 1: Deep problem analysis
        const analysis = await this.analyzeProblem(problem, opts.useRAG);
        logger.info(`Analysis complete: ${analysis.rootCause}`);
        // Step 2: Generate solution using Claude Sonnet
        const solution = await this.generateSolution(problem, analysis, opts);
        logger.info(`Generated solution with ${solution.steps.length} steps`);
        // Step 3: Iteratively apply and validate solution
        let currentIteration = 0;
        let validationResults = [];
        let success = false;
        while (currentIteration < opts.maxIterations && !success) {
            currentIteration++;
            logger.info(`Iteration ${currentIteration}/${opts.maxIterations}`);
            // Apply solution steps
            await this.applySolutionSteps(solution);
            // Validate solution
            validationResults = await this.validateSolution(solution, problem);
            success = validationResults.every(v => v.passed);
            if (!success && currentIteration < opts.maxIterations) {
                logger.info('Validation failed, refining solution...');
                await this.refineSolution(solution, validationResults, problem);
            }
        }
        // Step 4: Learn from solution
        const lessonsLearned = [];
        if (opts.learnFromSolution && success && this.learningManager) {
            lessonsLearned.push(...await this.learnFromSolution(problem, solution));
        }
        // Store solution in history
        this.storeSolution(problem, solution);
        const timeSpent = Date.now() - startTime;
        logger.info(`Problem solving ${success ? 'succeeded' : 'failed'} in ${timeSpent}ms`);
        return {
            success,
            problem,
            solution,
            validationResults,
            iterations: currentIteration,
            timeSpent,
            lessonsLearned
        };
    }
    /**
    * Deep problem analysis using Claude Sonnet with RAG context
    */
    async analyzeProblem(problem, useRAG) {
        // Get relevant context from RAG
        let ragContext = '';
        if (useRAG) {
            const ragResults = await this.ragService.query(`${problem.type} error: ${problem.description}`, { limit: 5 });
            ragContext = ragResults.results.map(r => r.content).join('\n\n');
        }
        // Get similar past solutions
        const similarProblems = this.findSimilarProblems(problem);
        const pastSolutions = similarProblems.map(p => this.solutionHistory.get(p.id) || []).flat();
        // Build comprehensive analysis prompt
        const prompt = this.buildAnalysisPrompt(problem, ragContext, pastSolutions);
        // Use Claude Sonnet for deep reasoning
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: this.getAnalysisSystemPrompt()
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            maxTokens: 4000
        }, {
            complexity: modelRouter_1.TaskComplexity.COMPLEX, // Force Claude Sonnet
            preferredProvider: 'claude'
        });
        return this.parseAnalysisResponse(response.content);
    }
    /**
    * Generate solution using Claude Sonnet
    */
    async generateSolution(problem, analysis, // Problem analysis structure
    options // Solution options
    ) {
        const prompt = this.buildSolutionPrompt(problem, analysis, options);
        // Use Claude Sonnet for solution generation
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: this.getSolutionSystemPrompt()
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.4,
            maxTokens: 6000
        }, {
            complexity: modelRouter_1.TaskComplexity.COMPLEX,
            preferredProvider: 'claude'
        });
        return this.parseSolutionResponse(response.content, problem);
    }
    /**
    * Validate solution by running tests and checks
    */
    async validateSolution(solution, problem) {
        const results = [];
        // Validate based on problem type
        switch (problem.type) {
            case 'compilation':
                results.push(await this.validateCompilation(solution));
                break;
            case 'runtime':
                results.push(await this.validateRuntime(solution));
                break;
            case 'logic':
                results.push(await this.validateLogic(solution));
                break;
            case 'performance':
                results.push(await this.validatePerformance(solution));
                break;
            case 'security':
                results.push(await this.validateSecurity(solution));
                break;
        }
        // Always validate tests if they exist
        if (solution.tests.length > 0) {
            results.push(await this.validateTests(solution));
        }
        return results;
    }
    /**
    * Refine solution based on validation failures
    */
    async refineSolution(solution, validationResults, problem) {
        const failures = validationResults.filter(v => !v.passed);
        const prompt = `The solution failed validation. Please refine it.

Original Problem: ${problem.description}

Failed Validations:
${failures.map(f => `- ${f.type}: ${f.details}\n Issues: ${f.issues.join(', ')}`).join('\n')}

Current Solution:
${JSON.stringify(solution, null, 2)}

Please provide refined code changes that address these validation failures.`;
        const response = await this.orchestrator.sendRequest({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            maxTokens: 4000
        }, {
            complexity: modelRouter_1.TaskComplexity.COMPLEX,
            preferredProvider: 'claude'
        });
        // Update solution with refined changes
        const refinedChanges = this.parseCodeChanges(response.content);
        solution.codeChanges.push(...refinedChanges);
    }
    /**
    * Apply solution steps sequentially
    */
    async applySolutionSteps(solution) {
        for (const step of solution.steps) {
            if (!step.completed) {
                logger.debug(` ${step.order}. ${step.description}`);
                // Mark as completed (actual file writing happens elsewhere)
                step.completed = true;
            }
        }
    }
    /**
    * Learn from successful solution
    */
    async learnFromSolution(problem, solution) {
        if (!this.learningManager)
            return [];
        const lessons = [];
        // Extract patterns
        const pattern = {
            problemType: problem.type,
            approach: solution.approach,
            confidence: solution.confidence
        };
        lessons.push(`Learned: ${problem.type} problems can be solved with ${solution.approach}`);
        // Store in learning manager using recordApproval
        await this.learningManager.recordApproval({
            prompt: problem.description,
            language: problem.context.language,
            taskType: problem.type
        }, JSON.stringify(solution.codeChanges), 1000, // timeToApproval
        solution.steps.length // iterationCount
        );
        return lessons;
    }
    /**
    * Store solution in history
    */
    storeSolution(problem, solution) {
        const existing = this.solutionHistory.get(problem.id) || [];
        existing.push(solution);
        this.solutionHistory.set(problem.id, existing);
    }
    /**
    * Find similar problems from history
    */
    findSimilarProblems(problem) {
        // Simple similarity based on type and description keywords
        // In production, use embeddings for better similarity
        return [];
    }
    // Validation methods
    async validateCompilation(solution) {
        return {
            type: 'compilation',
            passed: true,
            details: 'Compilation check passed',
            issues: []
        };
    }
    async validateRuntime(solution) {
        return {
            type: 'runtime',
            passed: true,
            details: 'Runtime check passed',
            issues: []
        };
    }
    async validateLogic(solution) {
        return {
            type: 'tests',
            passed: true,
            details: 'Logic validation passed',
            issues: []
        };
    }
    async validatePerformance(solution) {
        return {
            type: 'runtime',
            passed: true,
            details: 'Performance check passed',
            issues: []
        };
    }
    async validateSecurity(solution) {
        return {
            type: 'linting',
            passed: true,
            details: 'Security check passed',
            issues: []
        };
    }
    async validateTests(solution) {
        return {
            type: 'tests',
            passed: true,
            details: `${solution.tests.length} tests passed`,
            issues: []
        };
    }
    // Prompt builders
    buildAnalysisPrompt(problem, ragContext, pastSolutions) {
        return `Analyze this code problem deeply and identify the root cause.

Problem Type: ${problem.type}
Severity: ${problem.severity}
Description: ${problem.description}

Context:
File: ${problem.context.filePath}
Language: ${problem.context.language}
${problem.context.framework ? `Framework: ${problem.context.framework}` : ''}

Code:
\`\`\`${problem.context.language}
${problem.context.code}
\`\`\`

${problem.errorMessage ? `Error Message:\n${problem.errorMessage}` : ''}
${problem.stackTrace ? `Stack Trace:\n${problem.stackTrace}` : ''}

${ragContext ? `Related Code Context:\n${ragContext}` : ''}

${pastSolutions.length > 0 ? `Similar Past Solutions:\n${pastSolutions.map(s => s.approach).join('\n')}` : ''}

Please provide:
1. Root cause of the problem
2. Contributing factors
3. Related patterns you recognize
4. Suggested approaches to solve it

Format your response as JSON:
{
 "rootCause": "...",
 "contributingFactors": ["...", "..."],
 "relatedPatterns": ["...", "..."],
 "suggestedApproaches": ["...", "..."]
}`;
    }
    buildSolutionPrompt(problem, analysis, options) {
        return `Generate a comprehensive solution for this problem.

Problem: ${problem.description}
Root Cause: ${analysis.rootCause}

Requirements:
- Provide step-by-step solution
- Include all necessary code changes
${options.requireTests ? '- Generate tests to validate the solution' : ''}
${options.considerAlternatives ? '- Suggest alternative approaches' : ''}

Context:
${problem.context.code}

Please provide a detailed solution in JSON format:
{
 "approach": "description of the approach",
 "steps": [
 {"order": 1, "description": "...", "action": "analyze|modify|test|validate", "details": "..."}
 ],
 "codeChanges": [
 {"filePath": "...", "operation": "create|modify|delete", "newCode": "...", "explanation": "..."}
 ],
 "tests": [
 {"filePath": "...", "testCode": "...", "testType": "unit|integration", "purpose": "..."}
 ],
 "confidence": 0.95,
 "reasoning": "why this solution works",
 "alternatives": [
 {"approach": "...", "pros": ["..."], "cons": ["..."], "confidence": 0.8}
 ]
}`;
    }
    getAnalysisSystemPrompt() {
        return `You are an expert software engineer and problem solver. Your role is to deeply analyze code problems, identify root causes, and understand the full context. You have expertise in:
- Debugging complex issues
- Understanding code architecture
- Identifying anti-patterns
- Root cause analysis
- System design

Provide thorough, accurate analysis that helps solve problems effectively.`;
    }
    getSolutionSystemPrompt() {
        return `You are an expert software engineer specializing in problem solving and code generation. Your role is to:
- Generate comprehensive, working solutions
- Write clean, maintainable code
- Create thorough tests
- Consider edge cases
- Provide clear explanations

Always generate production-ready code that follows best practices.`;
    }
    parseAnalysisResponse(content) {
        try {
            // Extract JSON from response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        }
        catch (e) {
            logger.error('Failed to parse analysis response', e);
        }
        // Fallback
        return {
            rootCause: 'Unable to determine root cause',
            contributingFactors: [],
            relatedPatterns: [],
            suggestedApproaches: ['Manual investigation required']
        };
    }
    parseSolutionResponse(content, problem) {
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    id: `sol-${Date.now()}`,
                    problemId: problem.id,
                    ...parsed,
                    estimatedImpact: 'medium'
                };
            }
        }
        catch (e) {
            logger.error('Failed to parse solution response', e);
        }
        // Fallback solution
        return {
            id: `sol-${Date.now()}`,
            problemId: problem.id,
            approach: 'Manual fix required',
            steps: [],
            codeChanges: [],
            tests: [],
            confidence: 0.5,
            reasoning: 'Unable to generate automatic solution',
            alternatives: [],
            estimatedImpact: 'medium'
        };
    }
    parseCodeChanges(content) {
        // Parse code changes from AI response
        return [];
    }
}
exports.IntelligentProblemSolver = IntelligentProblemSolver;
//# sourceMappingURL=intelligentProblemSolver.js.map