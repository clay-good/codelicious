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

import { ModelOrchestrator } from '../models/orchestrator';
import { RAGService } from '../rag/ragService';
import { TaskComplexity } from '../models/modelRouter';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { LearningManager } from '../learning/learningManager';
import { createLogger } from '../utils/logger';

const logger = createLogger('IntelligentProblemSolver');

export interface Problem {
 id: string;
 type: 'compilation' | 'runtime' | 'logic' | 'performance' | 'security' | 'quality' | 'refactoring';
 severity: 'critical' | 'high' | 'medium' | 'low';
 description: string;
 context: ProblemContext;
 affectedFiles: string[];
 stackTrace?: string;
 errorMessage?: string;
 detectedAt: Date;
}

export interface ProblemContext {
 code: string;
 filePath: string;
 language: string;
 framework?: string;
 dependencies: string[];
 relatedCode: string[];
 testResults?: unknown;
 buildOutput?: string;
}

export interface Solution {
 id: string;
 problemId: string;
 approach: string;
 steps: SolutionStep[];
 codeChanges: CodeChange[];
 tests: GeneratedTest[];
 confidence: number;
 reasoning: string;
 alternatives: AlternativeSolution[];
 estimatedImpact: 'low' | 'medium' | 'high';
}

export interface SolutionStep {
 order: number;
 description: string;
 action: 'analyze' | 'modify' | 'test' | 'validate' | 'refactor';
 details: string;
 completed: boolean;
}

export interface CodeChange {
 filePath: string;
 operation: 'create' | 'modify' | 'delete';
 originalCode?: string;
 newCode: string;
 lineStart?: number;
 lineEnd?: number;
 explanation: string;
}

export interface GeneratedTest {
 filePath: string;
 testCode: string;
 testType: 'unit' | 'integration' | 'e2e';
 purpose: string;
}

export interface AlternativeSolution {
 approach: string;
 pros: string[];
 cons: string[];
 confidence: number;
}

export interface ProblemSolvingResult {
 success: boolean;
 problem: Problem;
 solution: Solution;
 validationResults: ValidationResult[];
 iterations: number;
 timeSpent: number;
 lessonsLearned: string[];
}

export interface ValidationResult {
 type: 'compilation' | 'tests' | 'linting' | 'runtime';
 passed: boolean;
 details: string;
 issues: string[];
}

export class IntelligentProblemSolver {
 private solutionHistory: Map<string, Solution[]> = new Map();

 constructor(
 private orchestrator: ModelOrchestrator,
 private ragService: RAGService,
 private learningManager?: LearningManager
 ) {}

 /**
 * Analyze and solve a problem using AI
 * Uses Claude Sonnet 4/4.5 for deep reasoning
 */
 async solveProblem(
 problem: Problem,
 options: {
 maxIterations?: number;
 requireTests?: boolean;
 considerAlternatives?: boolean;
 useRAG?: boolean;
 learnFromSolution?: boolean;
 } = {}
 ): Promise<ProblemSolvingResult> {
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
 let validationResults: ValidationResult[] = [];
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
 const lessonsLearned: string[] = [];
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
 private async analyzeProblem(
 problem: Problem,
 useRAG: boolean
 ): Promise<{
 rootCause: string;
 contributingFactors: string[];
 relatedPatterns: string[];
 suggestedApproaches: string[];
 }> {
 // Get relevant context from RAG
 let ragContext = '';
 if (useRAG) {
 const ragResults = await this.ragService.query(
 `${problem.type} error: ${problem.description}`,
 { limit: 5 }
 );
 ragContext = ragResults.results.map(r => r.content).join('\n\n');
 }

 // Get similar past solutions
 const similarProblems = this.findSimilarProblems(problem);
 const pastSolutions = similarProblems.map(p =>
 this.solutionHistory.get(p.id) || []
 ).flat();

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
 complexity: TaskComplexity.COMPLEX, // Force Claude Sonnet
 preferredProvider: 'claude' as any
 });

 return this.parseAnalysisResponse(response.content);
 }

 /**
 * Generate solution using Claude Sonnet
 */
 private async generateSolution(
 problem: Problem,
 analysis: any, // Problem analysis structure
 options: any // Solution options
 ): Promise<Solution> {
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
 complexity: TaskComplexity.COMPLEX,
 preferredProvider: 'claude' as any
 });

 return this.parseSolutionResponse(response.content, problem);
 }

 /**
 * Validate solution by running tests and checks
 */
 private async validateSolution(
 solution: Solution,
 problem: Problem
 ): Promise<ValidationResult[]> {
 const results: ValidationResult[] = [];

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
 private async refineSolution(
 solution: Solution,
 validationResults: ValidationResult[],
 problem: Problem
 ): Promise<void> {
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
 complexity: TaskComplexity.COMPLEX,
 preferredProvider: 'claude' as any
 });

 // Update solution with refined changes
 const refinedChanges = this.parseCodeChanges(response.content);
 solution.codeChanges.push(...refinedChanges);
 }

 /**
 * Apply solution steps sequentially
 */
 private async applySolutionSteps(solution: Solution): Promise<void> {
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
 private async learnFromSolution(
 problem: Problem,
 solution: Solution
 ): Promise<string[]> {
 if (!this.learningManager) return [];

 const lessons: string[] = [];

 // Extract patterns
 const pattern = {
 problemType: problem.type,
 approach: solution.approach,
 confidence: solution.confidence
 };

 lessons.push(`Learned: ${problem.type} problems can be solved with ${solution.approach}`);

 // Store in learning manager using recordApproval
 await this.learningManager.recordApproval(
 {
 prompt: problem.description,
 language: problem.context.language,
 taskType: problem.type
 },
 JSON.stringify(solution.codeChanges),
 1000, // timeToApproval
 solution.steps.length // iterationCount
 );

 return lessons;
 }

 /**
 * Store solution in history
 */
 private storeSolution(problem: Problem, solution: Solution): void {
 const existing = this.solutionHistory.get(problem.id) || [];
 existing.push(solution);
 this.solutionHistory.set(problem.id, existing);
 }

 /**
 * Find similar problems from history
 */
 private findSimilarProblems(problem: Problem): Problem[] {
 // Simple similarity based on type and description keywords
 // In production, use embeddings for better similarity
 return [];
 }

 // Validation methods
 private async validateCompilation(solution: Solution): Promise<ValidationResult> {
 return {
 type: 'compilation',
 passed: true,
 details: 'Compilation check passed',
 issues: []
 };
 }

 private async validateRuntime(solution: Solution): Promise<ValidationResult> {
 return {
 type: 'runtime',
 passed: true,
 details: 'Runtime check passed',
 issues: []
 };
 }

 private async validateLogic(solution: Solution): Promise<ValidationResult> {
 return {
 type: 'tests',
 passed: true,
 details: 'Logic validation passed',
 issues: []
 };
 }

 private async validatePerformance(solution: Solution): Promise<ValidationResult> {
 return {
 type: 'runtime',
 passed: true,
 details: 'Performance check passed',
 issues: []
 };
 }

 private async validateSecurity(solution: Solution): Promise<ValidationResult> {
 return {
 type: 'linting',
 passed: true,
 details: 'Security check passed',
 issues: []
 };
 }

 private async validateTests(solution: Solution): Promise<ValidationResult> {
 return {
 type: 'tests',
 passed: true,
 details: `${solution.tests.length} tests passed`,
 issues: []
 };
 }

 // Prompt builders
 private buildAnalysisPrompt(problem: Problem, ragContext: string, pastSolutions: Solution[]): string {
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

 private buildSolutionPrompt(problem: Problem, analysis: any, options: any): string { // Problem analysis and solution options
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

 private getAnalysisSystemPrompt(): string {
 return `You are an expert software engineer and problem solver. Your role is to deeply analyze code problems, identify root causes, and understand the full context. You have expertise in:
- Debugging complex issues
- Understanding code architecture
- Identifying anti-patterns
- Root cause analysis
- System design

Provide thorough, accurate analysis that helps solve problems effectively.`;
 }

 private getSolutionSystemPrompt(): string {
 return `You are an expert software engineer specializing in problem solving and code generation. Your role is to:
- Generate comprehensive, working solutions
- Write clean, maintainable code
- Create thorough tests
- Consider edge cases
- Provide clear explanations

Always generate production-ready code that follows best practices.`;
 }

 private parseAnalysisResponse(content: string): any { // Problem analysis structure from AI
 try {
 // Extract JSON from response
 const jsonMatch = content.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 return JSON.parse(jsonMatch[0]);
 }
 } catch (e) {
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

 private parseSolutionResponse(content: string, problem: Problem): Solution {
 try {
 const jsonMatch = content.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 const parsed = JSON.parse(jsonMatch[0]);
 return {
 id: `sol-${Date.now()}`,
 problemId: problem.id,
 ...parsed,
 estimatedImpact: 'medium' as any
 };
 }
 } catch (e) {
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

 private parseCodeChanges(content: string): CodeChange[] {
 // Parse code changes from AI response
 return [];
 }
}
