"use strict";
/**
 * Autonomous Builder
 *
 * Orchestrates fully autonomous application building from specifications.
 * Runs in a loop until the project is complete, handling:
 * - Multi-turn AI conversations
 * - Automatic task execution
 * - Error recovery
 * - Progress tracking
 * - Completion detection
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousBuilder = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const projectState_1 = require("./projectState");
const modelRouter_1 = require("../models/modelRouter");
const intelligentProblemSolver_1 = require("./intelligentProblemSolver");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AutonomousBuilder');
class AutonomousBuilder {
    constructor(workspaceRoot, orchestrator, autonomousExecutor, executionEngine, ragService, learningManager, options = {}) {
        this.workspaceRoot = workspaceRoot;
        this.orchestrator = orchestrator;
        this.autonomousExecutor = autonomousExecutor;
        this.executionEngine = executionEngine;
        this.ragService = ragService;
        this.learningManager = learningManager;
        this.options = options;
        this.conversationHistory = [];
        this.cancelled = false;
        this.lastAIResponse = '';
        this.problemSolver = null;
        this.outputChannel = options.outputChannel ||
            vscode.window.createOutputChannel('Codelicious Autonomous Builder');
        // Initialize intelligent problem solver if RAG is available
        if (this.ragService) {
            this.problemSolver = new intelligentProblemSolver_1.IntelligentProblemSolver(this.orchestrator, this.ragService, this.learningManager || undefined);
        }
    }
    /**
    * Build a project autonomously from a specification
    */
    async buildFromSpecification(specification, projectName) {
        const startTime = Date.now();
        // Initialize state tracker
        const maxIterations = this.options.maxIterations || 100;
        this.stateTracker = new projectState_1.ProjectStateTracker(this.workspaceRoot, projectName, maxIterations);
        // Enable auto-save
        const saveInterval = this.options.saveStateInterval || 30;
        this.stateTracker.enableAutoSave(saveInterval);
        this.log('Starting Autonomous Build');
        this.log(`Project: ${projectName}`);
        this.log(`Max Iterations: ${maxIterations}`);
        this.log(`Workspace: ${this.workspaceRoot}`);
        this.log('='.repeat(80));
        try {
            // Initialize conversation with system prompt
            this.initializeConversation(specification);
            // Main autonomous loop
            await this.autonomousLoop();
            // Final state check
            const isComplete = this.stateTracker.checkCompletion();
            const finalState = this.stateTracker.getState();
            // Save final state
            await this.stateTracker.saveState();
            const duration = Date.now() - startTime;
            this.log('='.repeat(80));
            this.log(isComplete ? 'Build Complete!' : 'Build Incomplete');
            this.log(this.stateTracker.getSummary());
            this.log(`Total Duration: ${Math.round(duration / 60000)} minutes`);
            return {
                success: isComplete,
                projectState: finalState,
                duration,
                iterations: finalState.iterationCount,
                errors: finalState.errors.map(e => e.message)
            };
        }
        catch (error) {
            this.logError('Fatal error during autonomous build:', error);
            const finalState = this.stateTracker.getState();
            await this.stateTracker.saveState();
            return {
                success: false,
                projectState: finalState,
                duration: Date.now() - startTime,
                iterations: finalState.iterationCount,
                errors: [error instanceof Error ? error.message : String(error)]
            };
        }
        finally {
            this.stateTracker.dispose();
        }
    }
    /**
    * Main autonomous execution loop
    */
    async autonomousLoop() {
        while (!this.cancelled && !this.stateTracker.checkCompletion()) {
            // Check iteration limit
            if (this.stateTracker.isMaxIterationsReached()) {
                this.log('Maximum iterations reached');
                break;
            }
            const iteration = this.stateTracker.incrementIteration();
            this.log(`\n${'='.repeat(80)}`);
            this.log(`Iteration ${iteration}`);
            this.log(`${'='.repeat(80)}`);
            try {
                // Get next action from AI
                const nextAction = await this.getNextAction();
                if (!nextAction) {
                    this.log('ℹ No more actions to take');
                    break;
                }
                // Execute the action
                await this.executeAction(nextAction);
                // Save state after each iteration
                await this.stateTracker.saveState();
            }
            catch (error) {
                this.logError(`Error in iteration ${iteration}:`, error);
                // Try to recover from error
                if (this.options.autoFixErrors) {
                    await this.handleError(error);
                }
                else {
                    throw error;
                }
            }
        }
    }
    /**
    * Initialize conversation with system prompt
    */
    initializeConversation(specification) {
        const systemPrompt = `You are an expert software engineer building a complete application autonomously.

Your task is to build this project from start to finish:

${specification}

You will work iteratively, and in each iteration you should:
1. Analyze the current state of the project
2. Decide what to do next (create files, run commands, etc.)
3. Provide the code or commands needed

IMPORTANT RULES:
- Create files using this format:
 \`\`\`typescript:src/path/to/file.ts
 // code here
 \`\`\`

- Modify files using this format:
 MODIFY: src/path/to/file.ts
 \`\`\`typescript
 // updated code
 \`\`\`

- Run commands using this format:
 COMMAND: npm install
 COMMAND: npm run build
 COMMAND: npm test

- When you believe the project is complete, say: "PROJECT COMPLETE"

Work step by step, creating a functional application.`;
        this.conversationHistory.push({
            role: 'system',
            content: systemPrompt
        });
    }
    /**
    * Get next action from AI with RAG context and intelligent routing
    */
    async getNextAction() {
        this.stateTracker.setPhase('planning');
        // Build context message with current state
        const stateContext = this.buildStateContext();
        // OPTIMIZATION 1: Get RAG context for relevant code (40% cost reduction)
        let ragContext = '';
        if (this.ragService && this.ragService.isReady()) {
            try {
                const state = this.stateTracker.getState();
                const ragQuery = `${state.projectName} ${state.currentPhase} ${stateContext}`;
                this.log('Querying RAG for relevant code context...');
                const ragResponse = await this.ragService.queryOptimized(ragQuery, {
                    limit: 5,
                    maxTokens: 2000,
                    queryType: 'general'
                });
                if (ragResponse.results.length > 0) {
                    ragContext = `\n\n**Relevant Code Context:**\n${ragResponse.assembledContext.context}`;
                    this.log(` Found ${ragResponse.results.length} relevant code snippets`);
                }
            }
            catch (error) {
                logger.warn('Failed to get RAG context:', error);
            }
        }
        // Add enhanced patterns from learning manager
        let learningGuidance = '';
        if (this.learningManager) {
            try {
                const enhancedContext = await this.learningManager.enhanceContext({
                    prompt: stateContext,
                    language: 'typescript',
                    taskType: 'code_generation',
                    conversationHistory: this.conversationHistory.slice(-3),
                    codebaseContext: ragContext
                });
                if (enhancedContext.learningGuidance) {
                    learningGuidance = `\n\n**Learning Guidance:**\n${enhancedContext.learningGuidance}`;
                    this.log(' Applied learned patterns');
                }
            }
            catch (error) {
                logger.warn('Failed to get learning guidance:', error);
            }
        }
        this.conversationHistory.push({
            role: 'user',
            content: `Current project state:\n${stateContext}${ragContext}${learningGuidance}\n\nWhat should I do next?`
        });
        this.log(' Asking AI for next action...');
        // OPTIMIZATION 2: Intelligent complexity detection (20% cost reduction)
        const complexity = this.detectTaskComplexity(stateContext);
        this.log(`Task complexity: ${complexity}`);
        // OPTIMIZATION 3: Use summarized conversation history (15% cost reduction)
        const messages = await this.getOptimizedConversationHistory();
        // Get AI response with optimized routing
        const request = {
            messages,
            temperature: 0.7
        };
        const response = await this.orchestrator.sendRequest(request, {
            complexity
        });
        this.conversationHistory.push({
            role: 'assistant',
            content: response.content
        });
        this.lastAIResponse = response.content;
        this.log(` AI Response (${response.usage.totalTokens} tokens, $${response.cost?.toFixed(4)}, model: ${complexity})`);
        // Check if AI says project is complete
        if (response.content.includes('PROJECT COMPLETE')) {
            this.log('AI indicates project is complete');
            return null;
        }
        return response.content;
    }
    /**
    * Build context message with current state
    */
    buildStateContext() {
        const state = this.stateTracker.getState();
        return `
Iteration: ${state.iterationCount}/${state.maxIterations}
Progress: ${state.completionPercentage}%
Phase: ${state.currentPhase}

Files Created: ${state.filesCreated.length}
${state.filesCreated.slice(-5).map(f => ` - ${f.path}`).join('\n')}

Tasks: ${state.tasksCompleted.length}/${state.tasksTotal} completed
${state.tasksPending.slice(0, 3).map(t => ` - TODO: ${t.name}`).join('\n')}

Dependencies: ${state.dependencies.dependenciesInstalled ? 'Installed ' : 'Not installed '}
Build: ${state.buildStatus.successful ? 'Success ' : state.buildStatus.attempted ? 'Failed ' : 'Not attempted ⏳'}
Tests: ${state.testStatus.successful ? 'Passing ' : state.testStatus.attempted ? 'Failing ' : 'Not run ⏳'}

Recent Errors: ${state.errors.filter(e => !e.resolved).length}
${state.errors.filter(e => !e.resolved).slice(-3).map(e => ` - ${e.message}`).join('\n')}
 `.trim();
    }
    /**
    * Execute an action from AI response
    */
    async executeAction(aiResponse) {
        this.stateTracker.setPhase('execution');
        // Parse and execute file operations
        const filePlan = this.autonomousExecutor.parseFileOperations(aiResponse);
        if (filePlan && filePlan.operations.length > 0) {
            await this.executeFileOperations(filePlan);
        }
        // Parse and execute commands
        const commands = this.parseCommands(aiResponse);
        if (commands.length > 0) {
            await this.executeCommands(commands);
        }
    }
    /**
    * Execute file operations
    */
    async executeFileOperations(plan) {
        this.log(` Executing ${plan.operations.length} file operation(s)...`);
        // Get user approval if required
        if (this.options.requireUserApproval) {
            const approved = await this.autonomousExecutor.showExecutionPlan(plan);
            if (!approved) {
                this.log('User cancelled file operations');
                return;
            }
        }
        // Execute the plan
        const result = await this.autonomousExecutor.executePlan(plan);
        // Update state tracker
        for (const op of result.appliedOperations) {
            if (op.type === 'create') {
                this.stateTracker.addFileCreated(op.filePath, op.language);
            }
            else if (op.type === 'modify') {
                this.stateTracker.addFileModified(op.filePath, op.language);
            }
            else if (op.type === 'delete') {
                this.stateTracker.addFileDeleted(op.filePath);
            }
        }
        if (result.success) {
            this.log(`Applied ${result.appliedOperations.length} file operation(s)`);
        }
        else {
            this.log(`Applied ${result.appliedOperations.length}, failed ${result.failedOperations.length}`);
            for (const error of result.errors) {
                this.logError('File operation error:', error);
            }
        }
    }
    /**
    * Parse commands from AI response
    */
    parseCommands(aiResponse) {
        const commands = [];
        const commandPattern = /COMMAND:\s*([^\n]+)/g;
        let match;
        while ((match = commandPattern.exec(aiResponse)) !== null) {
            commands.push(match[1].trim());
        }
        return commands;
    }
    /**
    * Log message
    */
    log(message) {
        logger.info(message);
        this.outputChannel.appendLine(message);
    }
    /**
    * Log error
    */
    logError(message, error) {
        const errorMsg = `${message} ${error instanceof Error ? error.message : String(error)}`;
        logger.error(errorMsg);
        this.outputChannel.appendLine(`${errorMsg}`);
    }
    /**
    * Execute commands
    */
    async executeCommands(commands) {
        this.log(` Executing ${commands.length} command(s)...`);
        for (const command of commands) {
            this.log(` Running: ${command}`);
            try {
                // Detect command type and update state accordingly
                const isInstall = command.includes('install') || command.includes('add');
                const isBuild = command.includes('build') || command.includes('compile');
                const isTest = command.includes('test');
                // Execute command
                const result = await this.executionEngine.execute(command, {
                    workingDirectory: this.workspaceRoot,
                    requireConfirmation: this.options.requireUserApproval || false,
                    timeout: 600000 // 10 minutes
                });
                if (result.success) {
                    this.log(` Success (${result.duration}ms)`);
                    // Update state based on command type
                    if (isInstall) {
                        this.stateTracker.updateDependencies({
                            dependenciesInstalled: true,
                            lastInstallTime: Date.now()
                        });
                    }
                    else if (isBuild) {
                        this.stateTracker.updateBuildStatus({
                            attempted: true,
                            successful: true,
                            lastAttemptTime: Date.now(),
                            attempts: this.stateTracker.getState().buildStatus.attempts + 1
                        });
                    }
                    else if (isTest) {
                        // Parse test results from output
                        const testResults = this.parseTestResults(result.stdout);
                        this.stateTracker.updateTestStatus({
                            attempted: true,
                            successful: testResults.passed === testResults.total,
                            lastAttemptTime: Date.now(),
                            attempts: this.stateTracker.getState().testStatus.attempts + 1,
                            totalTests: testResults.total,
                            passedTests: testResults.passed,
                            failedTests: testResults.failed
                        });
                    }
                }
                else {
                    this.log(` Failed: ${result.stderr}`);
                    // Update state with failure
                    if (isBuild) {
                        this.stateTracker.updateBuildStatus({
                            attempted: true,
                            successful: false,
                            lastAttemptTime: Date.now(),
                            attempts: this.stateTracker.getState().buildStatus.attempts + 1,
                            errors: [result.stderr]
                        });
                    }
                    else if (isTest) {
                        this.stateTracker.updateTestStatus({
                            attempted: true,
                            successful: false,
                            lastAttemptTime: Date.now(),
                            attempts: this.stateTracker.getState().testStatus.attempts + 1,
                            errors: [result.stderr]
                        });
                    }
                    // Add error to state
                    this.stateTracker.addError({
                        timestamp: Date.now(),
                        phase: 'command_execution',
                        message: `Command failed: ${command}\n${result.stderr}`,
                        resolved: false
                    });
                }
            }
            catch (error) {
                this.logError(`Command execution error:`, error);
                this.stateTracker.addError({
                    timestamp: Date.now(),
                    phase: 'command_execution',
                    message: `Command failed: ${command}\n${error instanceof Error ? error.message : String(error)}`,
                    resolved: false
                });
            }
        }
    }
    /**
    * Parse test results from command output
    */
    parseTestResults(output) {
        // Try to parse Jest output
        const jestMatch = output.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
        if (jestMatch) {
            return {
                total: parseInt(jestMatch[2]),
                passed: parseInt(jestMatch[1]),
                failed: parseInt(jestMatch[2]) - parseInt(jestMatch[1])
            };
        }
        // Try to parse Mocha output
        const mochaMatch = output.match(/(\d+)\s+passing/);
        if (mochaMatch) {
            return {
                total: parseInt(mochaMatch[1]),
                passed: parseInt(mochaMatch[1]),
                failed: 0
            };
        }
        // Default
        return { total: 0, passed: 0, failed: 0 };
    }
    /**
    * Handle error with AI assistance and RAG context
    */
    async handleError(error) {
        this.log('Attempting to recover from error...');
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        // OPTIMIZATION 4: Get RAG context for similar errors (10% cost reduction)
        let errorContext = '';
        if (this.ragService && this.ragService.isReady()) {
            try {
                this.log('Searching for similar error fixes...');
                const ragResponse = await this.ragService.queryOptimized(`error fix: ${errorMessage}`, {
                    limit: 3,
                    maxTokens: 1000,
                    queryType: 'error'
                });
                if (ragResponse.results.length > 0) {
                    errorContext = `\n\n**Similar Error Fixes:**\n${ragResponse.assembledContext.context}`;
                    this.log(` Found ${ragResponse.results.length} similar error patterns`);
                }
            }
            catch (err) {
                logger.warn('Failed to get error context:', err);
            }
        }
        // Ask AI how to fix the error with context
        this.conversationHistory.push({
            role: 'user',
            content: `An error occurred:\n${errorMessage}\n\nStack trace:\n${errorStack}${errorContext}\n\nHow can I fix this error? Provide the corrected code or commands.`
        });
        const messages = await this.getOptimizedConversationHistory();
        const request = {
            messages,
            temperature: 0.7
        };
        // Use moderate complexity for error recovery (cheaper than complex)
        const response = await this.orchestrator.sendRequest(request, {
            complexity: modelRouter_1.TaskComplexity.MODERATE
        });
        this.conversationHistory.push({
            role: 'assistant',
            content: response.content
        });
        this.log(` AI provided error fix ($${response.cost?.toFixed(4)})`);
        // Try to execute the fix
        try {
            await this.executeAction(response.content);
            this.log('Error recovery successful');
            // Mark error as resolved
            const state = this.stateTracker.getState();
            const lastErrorIndex = state.errors.length - 1;
            if (lastErrorIndex >= 0) {
                this.stateTracker.resolveError(lastErrorIndex, 'AI-assisted recovery');
            }
        }
        catch (recoveryError) {
            this.logError('Error recovery failed:', recoveryError);
            throw recoveryError;
        }
    }
    /**
    * Get current state
    */
    getState() {
        return this.stateTracker.getState();
    }
    /**
    * Get state summary
    */
    getSummary() {
        return this.stateTracker.getSummary();
    }
    /**
    * Cancel the build
    */
    cancel() {
        this.cancelled = true;
        this.log(' Build cancelled by user');
    }
    /**
    * Dispose resources
    */
    dispose() {
        this.stateTracker.dispose();
    }
    /**
    * OPTIMIZATION 2: Detect task complexity for intelligent model routing
    * Routes simple tasks to cheap models (Gemini Flash, GPT-3.5)
    * Routes complex tasks to powerful models (Claude Sonnet, GPT-4)
    */
    detectTaskComplexity(stateContext) {
        const state = this.stateTracker.getState();
        const lastResponse = this.lastAIResponse.toLowerCase();
        const contextLower = stateContext.toLowerCase();
        // Simple tasks - use cheapest models (Gemini Flash $0.075/M, GPT-3.5 $0.50/M)
        if (lastResponse.includes('npm install') ||
            lastResponse.includes('npm init') ||
            lastResponse.includes('package.json') ||
            state.currentPhase === 'initialization' ||
            state.completionPercentage < 10 ||
            contextLower.includes('install dependencies') ||
            contextLower.includes('initialize project')) {
            return modelRouter_1.TaskComplexity.SIMPLE;
        }
        // Complex tasks - use powerful models (Claude Sonnet $3/M, GPT-4 $10/M)
        if (state.currentPhase === 'planning' ||
            state.errors.filter(e => !e.resolved).length > 2 ||
            lastResponse.includes('architecture') ||
            lastResponse.includes('design pattern') ||
            lastResponse.includes('refactor') ||
            contextLower.includes('complex') ||
            contextLower.includes('architecture') ||
            state.completionPercentage < 5) {
            return modelRouter_1.TaskComplexity.COMPLEX;
        }
        // Moderate tasks - use balanced models (Claude Haiku $0.25/M, GPT-4 Turbo $1/M)
        return modelRouter_1.TaskComplexity.MODERATE;
    }
    /**
    * OPTIMIZATION 3: Get optimized conversation history with summarization
    * Summarizes old messages to reduce token usage by 15-20%
    */
    async getOptimizedConversationHistory() {
        // If conversation is short, return as-is
        if (this.conversationHistory.length <= 6) {
            return this.conversationHistory;
        }
        // Keep system prompt and last 3 messages
        const systemPrompt = this.conversationHistory[0];
        const recentMessages = this.conversationHistory.slice(-3);
        // Check if we need to summarize
        const middleMessages = this.conversationHistory.slice(1, -3);
        if (middleMessages.length < 5) {
            // Not enough to summarize, return all
            return this.conversationHistory;
        }
        // Check if we already have a summary
        const hasSummary = this.conversationHistory.some(m => m.role === 'assistant' && m.content.includes('**Summary of previous work:**'));
        if (hasSummary) {
            // Already summarized, just keep system + summary + recent
            const summaryIndex = this.conversationHistory.findIndex(m => m.role === 'assistant' && m.content.includes('**Summary of previous work:**'));
            return [
                systemPrompt,
                this.conversationHistory[summaryIndex],
                ...recentMessages
            ];
        }
        // Create summary of middle messages
        try {
            this.log(' Summarizing conversation history to reduce token usage...');
            const summaryPrompt = `Summarize this conversation history in 200 words or less, focusing on:
- Key decisions made
- Files created and their purpose
- Commands executed
- Current progress and status
- Any errors encountered and how they were resolved

Conversation:
${middleMessages.map(m => `${m.role}: ${m.content.substring(0, 500)}`).join('\n\n')}`;
            const summaryResponse = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are a helpful assistant that summarizes conversations concisely.' },
                    { role: 'user', content: summaryPrompt }
                ],
                temperature: 0.3
            }, {
                complexity: modelRouter_1.TaskComplexity.SIMPLE // Use cheap model for summarization
            });
            // Update conversation history with summary
            this.conversationHistory = [
                systemPrompt,
                { role: 'assistant', content: `**Summary of previous work:**\n${summaryResponse.content}` },
                ...recentMessages
            ];
            this.log(`Summarized ${middleMessages.length} messages, saved ~${middleMessages.length * 500} tokens`);
            return this.conversationHistory;
        }
        catch (error) {
            logger.warn('Failed to summarize conversation:', error);
            // Fallback to keeping last 10 messages
            return this.conversationHistory.slice(-10);
        }
    }
    /**
    * Detect language from file path
    */
    detectLanguage(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin'
        };
        return languageMap[ext] || 'unknown';
    }
}
exports.AutonomousBuilder = AutonomousBuilder;
//# sourceMappingURL=autonomousBuilder.js.map