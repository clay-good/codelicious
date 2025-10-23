"use strict";
/**
 * Agent Orchestrator
 *
 * Coordinates multiple AI agents to collaborate on code generation tasks.
 * Manages workflows, agent communication, and result aggregation.
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
exports.AgentOrchestrator = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const autonomousExecutor_1 = require("../core/autonomousExecutor");
const preFilterAgent_1 = require("./preFilterAgent");
const securityAgent_1 = require("./securityAgent");
const testingAgent_1 = require("./testingAgent");
const errorRecovery_1 = require("./errorRecovery");
const workflowVisualizer_1 = require("./workflowVisualizer");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AgentOrchestrator');
const types_1 = require("./types");
class AgentOrchestrator {
    constructor(modelOrchestrator, executionEngine, workspaceRoot, context, learningManager) {
        this.modelOrchestrator = modelOrchestrator;
        this.executionEngine = executionEngine;
        this.workspaceRoot = workspaceRoot;
        this.context = context;
        this.workflows = new Map();
        this.taskQueue = [];
        this.learningManager = learningManager;
        // Get model configurations from VS Code settings
        const config = vscode.workspace.getConfiguration('codelicious.agents');
        // Get default model (applies to all agents if not overridden)
        const defaultModel = config.get('defaultModel', '');
        // Initialize agents with user-specified models (or default)
        this.preFilterAgent = new preFilterAgent_1.PreFilterAgent(modelOrchestrator, {
            role: types_1.AgentRole.PRE_FILTER,
            enabled: true,
            model: config.get('preFilter.model') || defaultModel
        });
        this.securityAgent = new securityAgent_1.SecurityReviewAgent(modelOrchestrator, {
            role: types_1.AgentRole.SECURITY_REVIEWER,
            enabled: true,
            model: config.get('securityReviewer.model') || defaultModel
        });
        this.testingAgent = new testingAgent_1.TestingAgent(modelOrchestrator, executionEngine, {
            role: types_1.AgentRole.TESTING_VALIDATOR,
            enabled: true,
            model: config.get('testingValidator.model') || defaultModel
        });
        this.autonomousExecutor = new autonomousExecutor_1.AutonomousExecutor(workspaceRoot, context);
        this.errorRecovery = new errorRecovery_1.ErrorRecoveryManager();
        // Initialize visualizer if context is provided
        if (context) {
            this.visualizer = new workflowVisualizer_1.WorkflowVisualizer(context, {
                showNotifications: true,
                autoOpen: true
            });
        }
        // Log model selections
        logger.info('Agent models configured:');
        logger.info(`Default Model: ${defaultModel || 'auto (orchestrator decides)'}`);
        logger.info(`Pre-Filter: ${this.preFilterAgent.getEffectiveModel()}`);
        logger.info(`Security Review: ${this.securityAgent.getEffectiveModel()}`);
        logger.info(`Testing: ${this.testingAgent.getEffectiveModel()}`);
    }
    /**
    * Execute a complete code generation workflow with multiple agents
    */
    async executeCodeGenerationWorkflow(userPrompt, conversationHistory = [], options = {}) {
        const startTime = Date.now();
        const workflowId = this.generateWorkflowId();
        // Set defaults
        const autoWriteFiles = options.autoWriteFiles !== false; // Default: true
        const autoExecuteTests = options.autoExecuteTests !== false; // Default: true
        const requireApproval = options.requireApproval !== false; // Default: true
        // Create workflow
        const workflow = {
            id: workflowId,
            name: 'Code Generation Workflow',
            description: 'Multi-agent code generation with optimization, security review, testing, and automatic file writing',
            steps: this.buildCodeGenerationSteps(options),
            context: this.buildContext(userPrompt, conversationHistory, options),
            status: types_1.AgentTaskStatus.IN_PROGRESS,
            results: new Map(),
            startedAt: Date.now(),
            tasks: this.buildWorkflowTasks(options)
        };
        this.workflows.set(workflowId, workflow);
        // Start workflow visualization
        if (this.visualizer) {
            this.visualizer.startWorkflow(workflow);
        }
        try {
            // Step 1: Pre-filter (optimize prompt)
            let optimizedPrompt = userPrompt;
            if (!options.skipPreFilter) {
                this.updateTaskStatus(workflowId, 'pre-filter', 'running');
                const preFilterResult = await this.executePreFilter(workflow.context);
                workflow.results.set(types_1.AgentRole.PRE_FILTER, preFilterResult);
                if (preFilterResult.success) {
                    optimizedPrompt = preFilterResult.data.optimizedPrompt;
                    workflow.context.userPrompt = optimizedPrompt;
                    this.updateTaskStatus(workflowId, 'pre-filter', 'completed');
                }
                else {
                    this.updateTaskStatus(workflowId, 'pre-filter', 'failed', { error: 'Pre-filter failed' });
                }
            }
            else {
                this.updateTaskStatus(workflowId, 'pre-filter', 'skipped');
            }
            // Step 2: Code generation (main AI)
            const codeResult = await this.executeCodeGeneration(workflow.context);
            workflow.results.set(types_1.AgentRole.CODE_GENERATOR, codeResult);
            if (!codeResult.success) {
                throw new Error('Code generation failed');
            }
            const generatedCode = codeResult.data.code;
            const language = codeResult.data.language;
            const filePath = codeResult.data.filePath;
            // Step 3: Security review
            if (!options.skipSecurityReview) {
                const securityResult = await this.executeSecurityReview(generatedCode, language, filePath, workflow.context);
                workflow.results.set(types_1.AgentRole.SECURITY_REVIEWER, securityResult);
                // If security review fails, return with warnings
                if (!securityResult.data.approved) {
                    workflow.status = types_1.AgentTaskStatus.COMPLETED;
                    workflow.completedAt = Date.now();
                    return {
                        success: false,
                        finalOutput: {
                            code: generatedCode,
                            language,
                            filePath,
                            securityIssues: securityResult.data.vulnerabilities
                        },
                        agentResults: workflow.results,
                        workflow,
                        duration: Date.now() - startTime,
                        totalCost: this.calculateTotalCost(workflow),
                        summary: 'Code generation completed but failed security review'
                    };
                }
            }
            // Step 4: Testing
            let testResults;
            if (!options.skipTesting) {
                const testingResult = await this.executeTesting(generatedCode, language, filePath, workflow.context);
                workflow.results.set(types_1.AgentRole.TESTING_VALIDATOR, testingResult);
                testResults = testingResult.data.testsGenerated;
            }
            // Step 5: Write files to disk (NEW!)
            let fileWriteResult;
            if (autoWriteFiles) {
                fileWriteResult = await this.writeFilesToDisk(generatedCode, filePath, language, testResults, requireApproval);
            }
            // Step 6: Execute tests (NEW!)
            let testExecutionResult;
            if (autoExecuteTests && fileWriteResult?.success) {
                testExecutionResult = await this.executeTestsInTerminal(filePath, language, testResults);
            }
            // Workflow complete
            workflow.status = types_1.AgentTaskStatus.COMPLETED;
            workflow.completedAt = Date.now();
            // Record learning feedback if enabled
            if (this.learningManager) {
                try {
                    const usedPatternIds = workflow.context.usedPatternIds || [];
                    const duration = Date.now() - startTime;
                    // Record approval (workflow succeeded)
                    await this.learningManager.recordApproval({
                        prompt: workflow.context.userPrompt,
                        language,
                        taskType: 'code_generation'
                    }, generatedCode, duration, 1, // iteration count
                    usedPatternIds);
                    // Record test results if available
                    if (testExecutionResult && testExecutionResult.success !== undefined) {
                        // Parse test output to extract pass/fail counts (simplified)
                        const passed = testExecutionResult.success ? 1 : 0;
                        const failed = testExecutionResult.success ? 0 : 1;
                        await this.learningManager.recordTestResults({
                            prompt: workflow.context.userPrompt,
                            language,
                            taskType: 'code_generation'
                        }, generatedCode, {
                            passed,
                            failed,
                            total: passed + failed,
                            duration: 0,
                            errors: testExecutionResult.success ? [] : [testExecutionResult.output]
                        }, usedPatternIds);
                    }
                }
                catch (error) {
                    logger.warn('Failed to record learning feedback', error);
                }
            }
            return {
                success: true,
                finalOutput: {
                    code: generatedCode,
                    language,
                    filePath,
                    tests: testResults,
                    explanation: codeResult.data.explanation,
                    filesWritten: fileWriteResult?.filesWritten || [],
                    testExecution: testExecutionResult
                },
                agentResults: workflow.results,
                workflow,
                duration: Date.now() - startTime,
                totalCost: this.calculateTotalCost(workflow),
                summary: this.buildWorkflowSummary(fileWriteResult, testExecutionResult)
            };
        }
        catch (error) {
            workflow.status = types_1.AgentTaskStatus.FAILED;
            workflow.completedAt = Date.now();
            return {
                success: false,
                finalOutput: null,
                agentResults: workflow.results,
                workflow,
                duration: Date.now() - startTime,
                totalCost: this.calculateTotalCost(workflow),
                summary: `Workflow failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    /**
    * Execute pre-filter agent
    */
    async executePreFilter(context) {
        const task = {
            id: this.generateTaskId(),
            type: types_1.AgentTaskType.OPTIMIZE_PROMPT,
            role: types_1.AgentRole.PRE_FILTER,
            context,
            priority: types_1.AgentPriority.HIGH,
            status: types_1.AgentTaskStatus.PENDING,
            createdAt: Date.now()
        };
        return await this.preFilterAgent.execute(task);
    }
    /**
    * Execute code generation (main AI)
    */
    async executeCodeGeneration(context) {
        // Build code generation prompt
        let prompt = `Generate code for the following request:\n\n${context.userPrompt}`;
        // Enhance with learned patterns if learning is enabled
        const usedPatternIds = [];
        if (this.learningManager) {
            try {
                // Detect language from context
                const detectedLanguage = this.detectLanguageFromContext(context);
                const enhancedContext = await this.learningManager.enhanceContext({
                    prompt: context.userPrompt,
                    language: detectedLanguage,
                    taskType: 'code_generation',
                    conversationHistory: context.conversationHistory,
                    codebaseContext: context.codebaseContext
                });
                // Add learning guidance to prompt
                if (enhancedContext.learningGuidance) {
                    prompt += `\n\n**Learning Guidance:**\n${enhancedContext.learningGuidance}`;
                }
                // Add quality expectations
                if (enhancedContext.qualityExpectations) {
                    prompt += `\n\n**Quality Expectations:**\n${enhancedContext.qualityExpectations}`;
                }
                // Add recommended patterns
                if (enhancedContext.recommendedPatterns.patterns.length > 0) {
                    prompt += `\n\n**Recommended Patterns (based on ${enhancedContext.recommendedPatterns.confidence.toFixed(0)}% confidence):**\n`;
                    enhancedContext.recommendedPatterns.patterns.slice(0, 3).forEach((match, i) => {
                        prompt += `\n${i + 1}. ${match.pattern.name} (${match.pattern.successRate.toFixed(0)}% success rate)\n`;
                        prompt += ` \`\`\`${match.pattern.language}\n ${match.pattern.code.substring(0, 200)}...\n \`\`\`\n`;
                        usedPatternIds.push(match.pattern.id);
                    });
                }
            }
            catch (error) {
                logger.warn('Failed to enhance context with learning', error);
            }
        }
        // Add codebase context
        let fullPrompt = prompt;
        if (context.codebaseContext) {
            fullPrompt += `\n\n**Codebase Context:**\n${context.codebaseContext}`;
        }
        // Store pattern IDs in context for later feedback
        context.usedPatternIds = usedPatternIds;
        // Call main AI model
        const response = await this.modelOrchestrator.sendRequest({
            messages: [
                { role: 'system', content: 'You are an expert software engineer. Generate high-quality, production-ready code.' },
                ...context.conversationHistory.slice(-5),
                { role: 'user', content: fullPrompt }
            ]
        });
        // Parse response
        const codeMatch = response.content.match(/```(\w+)?\n([\s\S]*?)\n```/);
        const code = codeMatch ? codeMatch[2] : response.content;
        const language = codeMatch ? codeMatch[1] || 'typescript' : 'typescript';
        return {
            success: true,
            data: {
                code,
                language,
                filePath: context.currentFile,
                explanation: response.content
            },
            confidence: 0.8
        };
    }
    /**
    * Execute security review
    */
    async executeSecurityReview(code, language, filePath, context) {
        const reviewContext = {
            ...context,
            metadata: {
                ...context.metadata,
                code,
                language,
                filePath
            }
        };
        const task = {
            id: this.generateTaskId(),
            type: types_1.AgentTaskType.REVIEW_SECURITY,
            role: types_1.AgentRole.SECURITY_REVIEWER,
            context: reviewContext,
            priority: types_1.AgentPriority.HIGH,
            status: types_1.AgentTaskStatus.PENDING,
            createdAt: Date.now()
        };
        return await this.securityAgent.execute(task);
    }
    /**
    * Execute testing
    */
    async executeTesting(code, language, filePath, context) {
        const testContext = {
            ...context,
            metadata: {
                ...context.metadata,
                code,
                language,
                filePath
            }
        };
        const task = {
            id: this.generateTaskId(),
            type: types_1.AgentTaskType.GENERATE_TESTS,
            role: types_1.AgentRole.TESTING_VALIDATOR,
            context: testContext,
            priority: types_1.AgentPriority.MEDIUM,
            status: types_1.AgentTaskStatus.PENDING,
            createdAt: Date.now()
        };
        return await this.testingAgent.execute(task);
    }
    /**
    * Build workflow steps
    */
    buildCodeGenerationSteps(options) {
        const steps = [];
        if (!options.skipPreFilter) {
            steps.push({
                role: types_1.AgentRole.PRE_FILTER,
                taskType: types_1.AgentTaskType.OPTIMIZE_PROMPT
            });
        }
        steps.push({
            role: types_1.AgentRole.CODE_GENERATOR,
            taskType: types_1.AgentTaskType.GENERATE_CODE,
            dependsOn: options.skipPreFilter ? [] : [types_1.AgentRole.PRE_FILTER]
        });
        if (!options.skipSecurityReview) {
            steps.push({
                role: types_1.AgentRole.SECURITY_REVIEWER,
                taskType: types_1.AgentTaskType.REVIEW_SECURITY,
                dependsOn: [types_1.AgentRole.CODE_GENERATOR]
            });
        }
        if (!options.skipTesting) {
            steps.push({
                role: types_1.AgentRole.TESTING_VALIDATOR,
                taskType: types_1.AgentTaskType.GENERATE_TESTS,
                dependsOn: [types_1.AgentRole.CODE_GENERATOR],
                optional: true
            });
        }
        return steps;
    }
    /**
    * Build agent context
    */
    buildContext(userPrompt, conversationHistory, options) {
        return {
            workspaceRoot: this.workspaceRoot,
            currentFile: options.currentFile,
            openFiles: this.getOpenFiles(),
            codebaseContext: options.codebaseContext,
            userPrompt,
            conversationHistory,
            taskType: types_1.AgentTaskType.GENERATE_CODE,
            priority: types_1.AgentPriority.MEDIUM,
            metadata: {}
        };
    }
    /**
    * Get open files in workspace
    */
    getOpenFiles() {
        return vscode.workspace.textDocuments
            .filter(doc => !doc.isUntitled)
            .map(doc => doc.fileName);
    }
    /**
    * Write generated files to disk with error recovery
    */
    async writeFilesToDisk(code, filePath, language, tests = [], requireApproval = true) {
        const filesWritten = [];
        const errors = [];
        // Wrap the entire operation in error recovery
        return await this.errorRecovery.recover(async () => {
            // Create file operation for main code file
            const operations = [];
            // Determine full path
            const fullPath = path.isAbsolute(filePath)
                ? filePath
                : path.join(this.workspaceRoot, filePath);
            // Check if file exists with retry
            const fileExists = await this.errorRecovery.recover(async () => fs.existsSync(fullPath), { maxRetries: 2, context: { operation: 'check_file_exists', filePath: fullPath } });
            operations.push({
                type: fileExists ? 'modify' : 'create',
                filePath: path.relative(this.workspaceRoot, fullPath),
                content: code,
                originalContent: fileExists ? fs.readFileSync(fullPath, 'utf8') : undefined,
                language
            });
            // Add test files if generated
            if (tests && tests.length > 0) {
                for (const test of tests) {
                    if (test.filePath && test.content) {
                        const testFullPath = path.isAbsolute(test.filePath)
                            ? test.filePath
                            : path.join(this.workspaceRoot, test.filePath);
                        const testExists = fs.existsSync(testFullPath);
                        operations.push({
                            type: testExists ? 'modify' : 'create',
                            filePath: path.relative(this.workspaceRoot, testFullPath),
                            content: test.content,
                            originalContent: testExists ? fs.readFileSync(testFullPath, 'utf8') : undefined,
                            language: test.language || language
                        });
                    }
                }
            }
            // Create execution plan
            const plan = {
                operations,
                description: `Write ${operations.length} file(s) to disk`,
                estimatedImpact: operations.length > 3 ? 'high' : operations.length > 1 ? 'medium' : 'low'
            };
            // Get user approval if required
            if (requireApproval) {
                const approved = await this.autonomousExecutor.showExecutionPlan(plan);
                if (!approved) {
                    return {
                        success: false,
                        filesWritten: [],
                        errors: ['User cancelled file write operation']
                    };
                }
            }
            // Execute the plan with error recovery
            const result = await this.errorRecovery.recover(async () => this.autonomousExecutor.executePlan(plan), {
                maxRetries: 2,
                enableUserIntervention: true,
                context: { operation: 'execute_file_plan', fileCount: operations.length }
            });
            // Collect results
            for (const op of result.appliedOperations) {
                filesWritten.push(op.filePath);
            }
            for (const error of result.errors) {
                errors.push(error);
            }
            // Make scripts executable if needed (with retry)
            if (language === 'shell' || language === 'bash' || language === 'sh') {
                await this.errorRecovery.recover(async () => this.makeExecutable(fullPath), { maxRetries: 2, context: { operation: 'make_executable', filePath: fullPath } });
            }
            // Determine if this was a partial success
            const partialSuccess = filesWritten.length > 0 && errors.length > 0;
            if (partialSuccess) {
                vscode.window.showWarningMessage(` Partial success: ${filesWritten.length} file(s) written, ${errors.length} error(s) occurred`);
            }
            return {
                success: result.success,
                filesWritten,
                errors,
                partialSuccess
            };
        }, {
            maxRetries: 1,
            enableUserIntervention: true,
            context: { operation: 'write_files_to_disk', filePath, language }
        });
    }
    /**
    * Make file executable (chmod +x)
    */
    async makeExecutable(filePath) {
        try {
            const result = await this.executionEngine.execute(`chmod +x "${filePath}"`, {
                requireConfirmation: false,
                sandbox: false
            });
            if (result.success) {
                vscode.window.showInformationMessage(` Made executable: ${path.basename(filePath)}`);
            }
        }
        catch (error) {
            logger.error('Failed to make file executable', error);
        }
    }
    /**
    * Execute tests in terminal with error recovery
    */
    async executeTestsInTerminal(filePath, language, tests = []) {
        // Wrap in error recovery
        return await this.errorRecovery.recover(async () => {
            // Determine test command based on language
            const testCommand = this.getTestCommand(filePath, language);
            if (!testCommand) {
                return {
                    success: false,
                    output: 'No test command available for this language',
                    exitCode: -1
                };
            }
            // Show output channel
            const outputChannel = vscode.window.createOutputChannel('Codelicious Test Execution');
            outputChannel.show();
            outputChannel.appendLine(` Running tests for ${path.basename(filePath)}...`);
            outputChannel.appendLine(`Command: ${testCommand}`);
            outputChannel.appendLine(''.repeat(80));
            // Execute tests with retry logic
            const result = await this.errorRecovery.recover(async () => this.executionEngine.execute(testCommand, {
                workingDirectory: this.workspaceRoot,
                timeout: 300000, // 5 minutes
                requireConfirmation: false,
                sandbox: false
            }), {
                maxRetries: 2,
                initialBackoffMs: 2000,
                context: { operation: 'execute_tests', testCommand, filePath }
            });
            // Display results
            outputChannel.appendLine(result.stdout);
            if (result.stderr) {
                outputChannel.appendLine('STDERR:');
                outputChannel.appendLine(result.stderr);
            }
            outputChannel.appendLine(''.repeat(80));
            outputChannel.appendLine(`Exit code: ${result.exitCode}`);
            outputChannel.appendLine(`Duration: ${result.duration}ms`);
            if (result.success) {
                outputChannel.appendLine(' Tests passed!');
                vscode.window.showInformationMessage(' Tests passed!');
            }
            else {
                outputChannel.appendLine(' Tests failed!');
                vscode.window.showWarningMessage(' Tests failed! Check output for details.');
            }
            return {
                success: result.success,
                output: result.stdout + '\n' + result.stderr,
                exitCode: result.exitCode
            };
        }, {
            maxRetries: 1,
            enableUserIntervention: false, // Don't ask user for test failures
            context: { operation: 'execute_tests_in_terminal', filePath, language }
        });
    }
    /**
    * Get test command for language
    */
    getTestCommand(filePath, language) {
        const fileName = path.basename(filePath);
        const fileDir = path.dirname(filePath);
        switch (language) {
            case 'typescript':
            case 'javascript':
                // Check if it's a test file
                if (fileName.includes('.test.') || fileName.includes('.spec.')) {
                    return `npm test -- ${filePath}`;
                }
                // Otherwise run all tests
                return 'npm test';
            case 'python':
                if (fileName.startsWith('test_') || fileName.endsWith('_test.py')) {
                    return `python -m pytest ${filePath} -v`;
                }
                return `python -m pytest ${fileDir} -v`;
            case 'rust':
                return 'cargo test';
            case 'go':
                return `go test ${fileDir}/...`;
            case 'java':
                return 'mvn test';
            case 'shell':
            case 'bash':
            case 'sh':
                // Execute the script directly
                return `bash ${filePath}`;
            default:
                return null;
        }
    }
    /**
    * Build workflow summary with error recovery stats
    */
    buildWorkflowSummary(fileWriteResult, testExecutionResult) {
        let summary = 'Code generation workflow completed';
        // Add error recovery stats
        const recoveryStats = this.errorRecovery.getStats();
        if (recoveryStats.totalErrors > 0) {
            summary += `\n\n Error Recovery: ${recoveryStats.recoveredErrors}/${recoveryStats.totalErrors} errors recovered`;
            if (recoveryStats.retriesAttempted > 0) {
                summary += ` (${recoveryStats.retriesAttempted} ${recoveryStats.retriesAttempted === 1 ? 'retry' : 'retries'})`;
            }
        }
        if (fileWriteResult) {
            if (fileWriteResult.partialSuccess) {
                summary += `\n Partial success: ${fileWriteResult.filesWritten.length} file(s) written, ${fileWriteResult.errors.length} error(s)`;
            }
            else if (fileWriteResult.success) {
                summary += `\n Wrote ${fileWriteResult.filesWritten.length} file(s) to disk`;
            }
            else {
                summary += `\n Failed to write files: ${fileWriteResult.errors.join(', ')}`;
            }
        }
        if (testExecutionResult) {
            if (testExecutionResult.success) {
                summary += '\n Tests passed';
                if (testExecutionResult.retries && testExecutionResult.retries > 0) {
                    summary += ` (after ${testExecutionResult.retries} ${testExecutionResult.retries === 1 ? 'retry' : 'retries'})`;
                }
            }
            else {
                summary += '\n Tests failed';
            }
        }
        return summary;
    }
    /**
    * Show error recovery report
    */
    showErrorRecoveryReport() {
        this.errorRecovery.showReport();
    }
    /**
    * Reset error recovery statistics
    */
    resetErrorRecoveryStats() {
        this.errorRecovery.resetStats();
    }
    /**
    * Calculate total cost from workflow
    */
    calculateTotalCost(workflow) {
        // This would integrate with the model orchestrator's cost tracking
        return 0; // Placeholder
    }
    /**
    * Generate workflow ID
    */
    generateWorkflowId() {
        return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
    * Generate task ID
    */
    generateTaskId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
    * Get workflow by ID
    */
    getWorkflow(workflowId) {
        return this.workflows.get(workflowId);
    }
    /**
    * Get all agent metrics
    */
    getAllMetrics() {
        return {
            preFilter: this.preFilterAgent.getMetrics(),
            security: this.securityAgent.getMetrics(),
            testing: this.testingAgent.getMetrics()
        };
    }
    /**
    * Build workflow tasks for visualization
    */
    buildWorkflowTasks(options) {
        const tasks = [];
        if (!options.skipPreFilter) {
            tasks.push({
                id: 'pre-filter',
                name: 'Optimize Prompt',
                status: 'pending'
            });
        }
        tasks.push({
            id: 'code-generation',
            name: 'Generate Code',
            status: 'pending'
        });
        if (!options.skipSecurityReview) {
            tasks.push({
                id: 'security-review',
                name: 'Security Review',
                status: 'pending'
            });
        }
        if (!options.skipTesting) {
            tasks.push({
                id: 'testing',
                name: 'Generate Tests',
                status: 'pending'
            });
        }
        if (options.autoWriteFiles !== false) {
            tasks.push({
                id: 'file-writing',
                name: 'Write Files',
                status: 'pending'
            });
        }
        if (options.autoExecuteTests !== false) {
            tasks.push({
                id: 'test-execution',
                name: 'Execute Tests',
                status: 'pending'
            });
        }
        return tasks;
    }
    /**
    * Update task status in visualizer
    */
    updateTaskStatus(workflowId, taskId, status, details) {
        if (!this.visualizer) {
            return;
        }
        this.visualizer.updateTask(workflowId, taskId, status, details);
    }
    /**
    * Detect programming language from context
    */
    detectLanguageFromContext(context) {
        // Check for explicit language mention in prompt
        const prompt = context.userPrompt.toLowerCase();
        const languageKeywords = {
            'typescript': ['typescript', '.ts', 'tsx'],
            'javascript': ['javascript', '.js', 'jsx', 'node'],
            'python': ['python', '.py', 'django', 'flask'],
            'java': ['java', '.java', 'spring'],
            'rust': ['rust', '.rs', 'cargo'],
            'go': ['golang', 'go', '.go'],
            'cpp': ['c++', 'cpp', '.cpp'],
            'csharp': ['c#', 'csharp', '.cs', 'dotnet']
        };
        for (const [lang, keywords] of Object.entries(languageKeywords)) {
            if (keywords.some(kw => prompt.includes(kw))) {
                return lang;
            }
        }
        // Check codebase context for file extensions
        if (context.codebaseContext) {
            if (context.codebaseContext.includes('.ts') || context.codebaseContext.includes('.tsx')) {
                return 'typescript';
            }
            if (context.codebaseContext.includes('.py')) {
                return 'python';
            }
            if (context.codebaseContext.includes('.java')) {
                return 'java';
            }
            if (context.codebaseContext.includes('.rs')) {
                return 'rust';
            }
            if (context.codebaseContext.includes('.go')) {
                return 'go';
            }
        }
        // Default to typescript for VS Code extension context
        return 'typescript';
    }
    /**
    * Show workflow visualization
    */
    showWorkflowVisualization() {
        if (this.visualizer) {
            this.visualizer.show();
        }
    }
    /**
    * Dispose resources
    */
    dispose() {
        if (this.visualizer) {
            this.visualizer.dispose();
        }
    }
}
exports.AgentOrchestrator = AgentOrchestrator;
//# sourceMappingURL=agentOrchestrator.js.map