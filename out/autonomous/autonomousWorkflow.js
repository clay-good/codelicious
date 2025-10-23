"use strict";
/**
 * Autonomous Workflow Orchestrator - End-to-end autonomous coding workflow
 *
 * Matches Augment's autonomous agent workflow with full spec-to-deployment automation
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
exports.AutonomousWorkflow = void 0;
const vscode = __importStar(require("vscode"));
const requirementsParser_1 = require("./requirementsParser");
const intelligentPlanner_1 = require("./intelligentPlanner");
const contextAwareCodeGenerator_1 = require("./contextAwareCodeGenerator");
const automaticTestGenerator_1 = require("./automaticTestGenerator");
const productionValidator_1 = require("./productionValidator");
const professionalReadmeGenerator_1 = require("./professionalReadmeGenerator");
const cancellationToken_1 = require("../utils/cancellationToken");
const iterativeRefinementEngine_1 = require("./iterativeRefinementEngine");
const buildErrorFixer_1 = require("./buildErrorFixer");
const dependencyResolver_1 = require("./dependencyResolver");
const realtimeCompiler_1 = require("./realtimeCompiler");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AutonomousWorkflow');
class AutonomousWorkflow {
    constructor(orchestrator, ragService, executionEngine, workspaceRoot, mcpRegistry) {
        this.orchestrator = orchestrator;
        this.ragService = ragService;
        this.executionEngine = executionEngine;
        this.workspaceRoot = workspaceRoot;
        this.cleanupCallbacks = [];
        this.requirementsParser = new requirementsParser_1.RequirementsParser(orchestrator);
        this.planner = new intelligentPlanner_1.IntelligentPlanner(orchestrator);
        this.codeGenerator = new contextAwareCodeGenerator_1.ContextAwareCodeGenerator(orchestrator, workspaceRoot);
        this.testGenerator = new automaticTestGenerator_1.AutomaticTestGenerator(orchestrator, workspaceRoot);
        this.validator = new productionValidator_1.ProductionValidator(executionEngine, workspaceRoot);
        this.readmeGenerator = new professionalReadmeGenerator_1.ProfessionalReadmeGenerator(orchestrator, workspaceRoot);
        this.mcpRegistry = mcpRegistry;
        // Initialize new autonomous components
        this.refinementEngine = new iterativeRefinementEngine_1.IterativeRefinementEngine(orchestrator, this.validator, executionEngine, workspaceRoot);
        this.buildErrorFixer = new buildErrorFixer_1.BuildErrorFixer(orchestrator, executionEngine, workspaceRoot);
        this.dependencyResolver = new dependencyResolver_1.DependencyResolver(executionEngine, orchestrator, workspaceRoot);
        this.realtimeCompiler = new realtimeCompiler_1.RealtimeCompiler(executionEngine, orchestrator, workspaceRoot);
    }
    /**
    * Execute full autonomous workflow from specification to deployment
    * ENHANCED: Cancellation support and progress tracking
    */
    async execute(specification, options) {
        const startTime = Date.now();
        const errors = [];
        const filesWritten = [];
        // Set up cancellation
        const token = options.cancellationToken;
        if (options.timeoutMs) {
            this.cancellationSource = new cancellationToken_1.CancellationTokenSource();
            this.cancellationSource.cancelAfter(options.timeoutMs);
        }
        try {
            logger.info('Starting autonomous workflow...');
            token?.throwIfCancellationRequested();
            // Step 1: Parse requirements
            logger.info('Step 1/6: Parsing requirements...');
            options.onProgress?.('parsing', 0.1);
            const requirements = await this.requirementsParser.parse(specification);
            token?.throwIfCancellationRequested();
            // Validate requirements completeness
            const reqValidation = this.requirementsParser.validateCompleteness(requirements);
            if (!reqValidation.isComplete) {
                logger.warn(`Requirements incomplete (${reqValidation.score}/100)`, reqValidation.missingElements);
            }
            // Step 2: Query architectural context
            logger.info('Step 2/6: Analyzing architecture...');
            options.onProgress?.('architecture', 0.2);
            const context = await this.ragService.queryWithArchitecture(specification, { maxTokens: 200000 });
            token?.throwIfCancellationRequested();
            if (!context) {
                throw new Error('Failed to get architectural context');
            }
            logger.info(`Found ${context.relevantFiles.length} relevant files, ${context.patterns.length} patterns`);
            // Step 3: Create execution plan
            logger.info('Step 3/6: Creating execution plan...');
            let plan = await this.planner.createPlan(requirements, context);
            // Optimize execution order
            plan = this.planner.optimizeExecutionOrder(plan);
            // Validate plan
            const planValidation = this.planner.validatePlan(plan);
            if (!planValidation.isValid) {
                logger.warn(`Plan has issues (${planValidation.score}/100)`, planValidation.issues);
            }
            logger.info(`Plan created: ${plan.fileOperations.length} file operations`);
            // Step 4: Generate code
            logger.info('Step 4/6: Generating code...');
            const generationOptions = {
                includeTests: false, // Tests generated separately
                includeDocumentation: true,
                followPatterns: true,
                errorHandling: 'comprehensive',
                codeStyle: 'auto'
            };
            const generatedCode = await this.codeGenerator.generate(plan, context, generationOptions);
            logger.info(`Generated ${generatedCode.generatedFiles.length} files (${generatedCode.totalLines} lines)`);
            // NEW: Step 4.5: Real-time compilation (if enabled)
            let compiledCode = generatedCode;
            let compilationAttempts = 0;
            if (options.enableRealtimeCompilation) {
                logger.info('Step 4.5: Real-time compilation...');
                options.onProgress?.('compilation', 0.45);
                const compileResult = await this.realtimeCompiler.compileIncremental(generatedCode.generatedFiles, { maxAttempts: 3, autoFix: true });
                compilationAttempts = compileResult.totalAttempts;
                compiledCode = {
                    ...generatedCode,
                    generatedFiles: compileResult.compiledFiles
                };
                logger.info(`Compilation: ${compileResult.totalErrors} errors, ${compileResult.totalFixes} fixes applied`);
            }
            // NEW: Step 4.6: Dependency resolution (if enabled)
            let dependenciesInstalled = 0;
            if (options.enableDependencyResolution) {
                logger.info('Step 4.6: Resolving dependencies...');
                options.onProgress?.('dependencies', 0.48);
                const filePaths = compiledCode.generatedFiles.map(f => f.filePath);
                const depResult = await this.dependencyResolver.resolveDependencies([], filePaths);
                dependenciesInstalled = depResult.installed.length;
                if (depResult.success) {
                    logger.info(`Installed ${dependenciesInstalled} dependencies`);
                }
                else {
                    logger.warn(`Dependency resolution had errors: ${depResult.errors.join(', ')}`);
                }
            }
            // Step 5: Generate tests
            logger.info('Step 5: Generating tests...');
            options.onProgress?.('tests', 0.5);
            const generatedTests = await this.testGenerator.generate(compiledCode.generatedFiles, context);
            logger.info(`Generated ${generatedTests.totalTests} tests across ${generatedTests.tests.length} files`);
            // NEW: Step 5.5: Iterative refinement (if enabled)
            let finalCode = compiledCode;
            let refinementResult;
            if (options.enableIterativeRefinement) {
                logger.info('Step 5.5: Iterative refinement...');
                options.onProgress?.('refinement', 0.6);
                refinementResult = await this.refinementEngine.refineUntilPerfect(compiledCode, requirements, {
                    maxIterations: options.maxRefinementIterations || 10,
                    targetScore: options.targetQualityScore || 95,
                    fixCompilationErrors: true,
                    fixTestFailures: true,
                    fixLintingIssues: true,
                    fixLogicErrors: true,
                    verbose: true
                });
                finalCode = refinementResult.finalCode;
                logger.info(`Refinement: ${refinementResult.iterations} iterations, score ${refinementResult.finalScore}/100`);
            }
            // Step 6: Write files (if approved)
            if (options.autoWriteFiles) {
                logger.info('Step 6: Writing files...');
                options.onProgress?.('writing', 0.8);
                if (options.requireApproval) {
                    const approved = await this.requestApproval(finalCode, generatedTests);
                    if (!approved) {
                        throw new Error('User rejected file operations');
                    }
                }
                // Write code files with error recovery
                for (const code of finalCode.generatedFiles) {
                    let retries = 0;
                    const maxRetries = 3;
                    while (retries < maxRetries) {
                        try {
                            await this.codeGenerator.writeCode(code);
                            filesWritten.push(code.filePath);
                            break;
                        }
                        catch (error) {
                            retries++;
                            if (retries >= maxRetries) {
                                logger.error(`Failed to write ${code.filePath} after ${maxRetries} attempts`, error);
                                throw error;
                            }
                            logger.warn(`Retry ${retries}/${maxRetries} for ${code.filePath}`);
                            await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // Exponential backoff
                        }
                    }
                }
                // Write test files with error recovery
                let testRetries = 0;
                const maxTestRetries = 3;
                while (testRetries < maxTestRetries) {
                    try {
                        await this.testGenerator.writeTests(generatedTests.tests);
                        filesWritten.push(...generatedTests.tests.map(t => t.filePath));
                        break;
                    }
                    catch (error) {
                        testRetries++;
                        if (testRetries >= maxTestRetries) {
                            logger.error(`Failed to write test files after ${maxTestRetries} attempts`, error);
                            throw error;
                        }
                        logger.warn(`Retry ${testRetries}/${maxTestRetries} for test files`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * testRetries));
                    }
                }
                logger.info(`Wrote ${filesWritten.length} files`);
                // Step 6.5: Generate professional README (if requested)
                if (options.generateReadme !== false) {
                    logger.info('Step 6.5: Generating professional README...');
                    try {
                        const projectInfo = {
                            name: 'Project',
                            description: requirements.mainRequirement.description,
                            version: '1.0.0',
                            license: 'MIT'
                        };
                        const readmeContent = await this.readmeGenerator.generateFromProject(projectInfo);
                        await this.readmeGenerator.writeReadme(readmeContent);
                        filesWritten.push('README.md');
                        logger.info('Professional README generated (no emojis)');
                    }
                    catch (error) {
                        logger.warn('README generation failed', error);
                        // Don't fail the whole workflow if README generation fails
                    }
                }
            }
            // Step 7: Validate (if files were written)
            let validation;
            if (options.autoWriteFiles) {
                logger.info('Step 7: Validating production readiness...');
                options.onProgress?.('validation', 0.9);
                validation = await this.validator.validate(finalCode.generatedFiles, generatedTests.tests, requirements);
                logger.info(`Validation: ${validation.overallScore}/100 (${validation.passed ? 'PASSED' : 'FAILED'})`);
                if (!validation.passed) {
                    errors.push(...validation.criticalIssues);
                }
            }
            else {
                validation = {
                    overallScore: 0,
                    passed: false,
                    checks: [],
                    summary: 'Validation skipped (files not written)',
                    criticalIssues: [],
                    recommendations: []
                };
            }
            const duration = Date.now() - startTime;
            const success = validation.passed || !options.autoWriteFiles;
            const qualityScore = refinementResult?.finalScore || validation.overallScore;
            logger.info(`${'='.repeat(80)}`);
            logger.info(`Autonomous Workflow Complete!`);
            logger.info(`${'='.repeat(80)}`);
            logger.info(`Duration: ${(duration / 1000).toFixed(1)}s`);
            logger.info(`Files Generated: ${finalCode.generatedFiles.length}`);
            logger.info(`Tests Generated: ${generatedTests.totalTests}`);
            logger.info(`Quality Score: ${qualityScore}/100`);
            if (options.enableIterativeRefinement && refinementResult) {
                logger.info(`Refinement Iterations: ${refinementResult.iterations}`);
            }
            if (options.enableRealtimeCompilation) {
                logger.info(`Compilation Attempts: ${compilationAttempts}`);
            }
            if (options.enableDependencyResolution) {
                logger.info(`Dependencies Installed: ${dependenciesInstalled}`);
            }
            logger.info(`Status: ${success ? 'SUCCESS' : 'FAILED'}`);
            logger.info(`${'='.repeat(80)}`);
            options.onProgress?.('complete', 1.0);
            return {
                success,
                requirements,
                plan,
                generatedCode: finalCode,
                generatedTests,
                validation,
                filesWritten,
                duration,
                errors,
                refinementResult,
                dependenciesInstalled,
                compilationAttempts,
                qualityScore
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            // Handle cancellation gracefully
            if (error instanceof cancellationToken_1.CancellationError) {
                logger.info('Workflow cancelled by user');
                errors.push('Workflow cancelled');
                // Run cleanup
                await this.cleanup();
                return {
                    success: false,
                    requirements: {},
                    plan: {},
                    generatedCode: {},
                    generatedTests: {},
                    validation: {},
                    filesWritten,
                    duration,
                    errors
                };
            }
            errors.push(`Workflow failed: ${error}`);
            logger.error('Workflow failed', error);
            // Run cleanup
            await this.cleanup();
            throw error;
        }
        finally {
            // Always dispose cancellation source
            this.cancellationSource?.dispose();
            this.cancellationSource = undefined;
        }
    }
    /**
    * Cancel the workflow
    */
    cancel() {
        if (this.cancellationSource) {
            this.cancellationSource.cancel();
        }
    }
    /**
    * Register cleanup callback
    */
    onCleanup(callback) {
        this.cleanupCallbacks.push(callback);
    }
    /**
    * Run cleanup callbacks
    */
    async cleanup() {
        logger.info('Running cleanup...');
        for (const callback of this.cleanupCallbacks) {
            try {
                callback();
            }
            catch (error) {
                logger.error('Error in cleanup callback', error);
            }
        }
        this.cleanupCallbacks = [];
    }
    /**
    * Request user approval for file operations
    */
    async requestApproval(generatedCode, generatedTests) {
        const totalFiles = generatedCode.generatedFiles.length + generatedTests.tests.length;
        const totalLines = generatedCode.totalLines +
            generatedTests.tests.reduce((sum, t) => sum + t.content.split('\n').length, 0);
        const message = `Ready to write ${totalFiles} files (${totalLines} lines). Continue?`;
        const choice = await vscode.window.showInformationMessage(message, { modal: true }, 'Yes', 'No', 'Preview');
        if (choice === 'Preview') {
            // Show preview and ask again
            await this.showPreview(generatedCode, generatedTests);
            return this.requestApproval(generatedCode, generatedTests);
        }
        return choice === 'Yes';
    }
    /**
    * Show preview of generated files
    */
    async showPreview(generatedCode, generatedTests) {
        const outputChannel = vscode.window.createOutputChannel('Codelicious Preview');
        outputChannel.clear();
        outputChannel.appendLine('# Generated Files Preview\n');
        outputChannel.appendLine('## Code Files:\n');
        for (const code of generatedCode.generatedFiles) {
            outputChannel.appendLine(`### ${code.filePath} (${code.operation})\n`);
            outputChannel.appendLine('```typescript');
            outputChannel.appendLine(code.content.substring(0, 500));
            if (code.content.length > 500) {
                outputChannel.appendLine('... (truncated)');
            }
            outputChannel.appendLine('```\n');
        }
        outputChannel.appendLine('## Test Files:\n');
        for (const test of generatedTests.tests) {
            outputChannel.appendLine(`### ${test.filePath} (${test.testCount} tests)\n`);
            outputChannel.appendLine('```typescript');
            outputChannel.appendLine(test.content.substring(0, 500));
            if (test.content.length > 500) {
                outputChannel.appendLine('... (truncated)');
            }
            outputChannel.appendLine('```\n');
        }
        outputChannel.show();
    }
    /**
    * Get workflow status
    */
    getStatus() {
        return 'Ready';
    }
    /**
    * Recommend MCP tools for a task
    * NEW: MCP tool recommendation
    */
    async recommendMCPTools(task) {
        if (!this.mcpRegistry) {
            return [];
        }
        const context = {
            workspaceRoot: this.workspaceRoot,
            projectType: 'unknown', // Could be inferred from workspace
            language: 'typescript' // Could be detected
        };
        return this.mcpRegistry.recommendTools(task, context);
    }
    /**
    * Use MCP tool during workflow
    * NEW: MCP tool invocation
    */
    async useMCPTool(toolId, operation, parameters) {
        if (!this.mcpRegistry) {
            return { success: false, error: 'MCP registry not available' };
        }
        try {
            const response = await this.mcpRegistry.invokeTool(toolId, operation, parameters);
            return {
                success: response.success,
                data: response.data,
                error: response.error?.message
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: errorMessage
            };
        }
    }
    /**
    * Get MCP statistics
    * NEW: MCP statistics
    */
    getMCPStatistics() {
        if (!this.mcpRegistry) {
            return null;
        }
        return this.mcpRegistry.getStatistics();
    }
}
exports.AutonomousWorkflow = AutonomousWorkflow;
//# sourceMappingURL=autonomousWorkflow.js.map