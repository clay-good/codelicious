"use strict";
/**
 * End-to-End Product Builder - Build complete products from instructions
 *
 * Features:
 * - Read instructions from .md/.txt files
 * - Parse requirements and specifications
 * - Generate complete product architecture
 * - Generate all code files
 * - Generate comprehensive tests
 * - Compile and fix errors
 * - Validate production readiness
 * - Zero manual intervention required
 *
 * Goal: Build production-ready products automatically
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
exports.EndToEndProductBuilder = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const autonomousWorkflow_1 = require("./autonomousWorkflow");
const selfHealingGenerator_1 = require("../generation/selfHealingGenerator");
const instructionFileReader_1 = require("./instructionFileReader");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('EndToEndProductBuilder');
class EndToEndProductBuilder {
    constructor(orchestrator, ragService, executionEngine, workspaceRoot, specificationManager) {
        this.orchestrator = orchestrator;
        this.ragService = ragService;
        this.executionEngine = executionEngine;
        this.workspaceRoot = workspaceRoot;
        this.specificationManager = specificationManager;
        this.selfHealingGenerator = new selfHealingGenerator_1.SelfHealingGenerator(orchestrator, executionEngine);
        this.instructionReader = new instructionFileReader_1.InstructionFileReader();
    }
    /**
    * Build product from instruction file
    */
    async buildFromInstructionFile(instructionFilePath, options) {
        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`Building Product from Instruction File`);
        logger.info(`${'='.repeat(80)}`);
        logger.info(`File: ${instructionFilePath}`);
        // Read instruction file
        const instruction = await this.instructionReader.readInstructionFile(instructionFilePath);
        logger.info(`Format: ${instruction.format}`);
        logger.info(`Sections: ${instruction.sections.length}`);
        if (instruction.metadata.projectName) {
            logger.info(`Project: ${instruction.metadata.projectName}`);
        }
        // Convert to workflow input
        const instructions = this.instructionReader.convertToWorkflowInput(instruction);
        // Build product
        const request = {
            instructionFile: instructionFilePath,
            outputDirectory: instruction.metadata.targetDirectory || this.workspaceRoot,
            options: {
                includeTests: true,
                autoFix: true,
                maxIterations: 5,
                language: instruction.metadata.language,
                framework: instruction.metadata.framework,
                ...options
            }
        };
        return this.build(request);
    }
    /**
    * Find and build from instruction files in workspace
    */
    async buildFromWorkspaceInstructions(options) {
        logger.info(`\n${'='.repeat(80)}`);
        logger.info(`Searching for Instruction Files`);
        logger.info(`${'='.repeat(80)}`);
        const instructionFiles = await this.instructionReader.findInstructionFiles(this.workspaceRoot);
        if (instructionFiles.length === 0) {
            throw new Error('No instruction files found in workspace. Create INSTRUCTIONS.md or BUILD.md to get started.');
        }
        logger.info(`Found ${instructionFiles.length} instruction file(s):`);
        instructionFiles.forEach(f => logger.info(`- ${f}`));
        const results = [];
        for (const filePath of instructionFiles) {
            try {
                const result = await this.buildFromInstructionFile(filePath, options);
                results.push(result);
            }
            catch (error) {
                logger.error(`Failed to build from ${filePath}`, error);
                results.push({
                    success: false,
                    filesGenerated: 0,
                    testsGenerated: 0,
                    compilationStatus: 'not_applicable',
                    testStatus: 'not_run',
                    qualityScore: 0,
                    errors: [error instanceof Error ? error.message : String(error)],
                    warnings: [],
                    buildTime: 0,
                    summary: `Failed to build from ${filePath}`
                });
            }
        }
        return results;
    }
    /**
    * Build a complete product from instructions
    */
    async build(request) {
        const startTime = Date.now();
        logger.info('Starting end-to-end product build...');
        logger.info(`Instructions: ${request.instructionFile}`);
        try {
            // Step 1: Read and parse instructions
            logger.info('\nStep 1: Reading instructions...');
            const instructions = await this.readInstructions(request.instructionFile);
            const specification = await this.specificationManager.parseSpecification(instructions);
            logger.info(`Parsed ${specification.requirements.length} requirements`);
            // Step 2: Create autonomous workflow
            logger.info('\nStep 2: Creating autonomous workflow...');
            const workflow = new autonomousWorkflow_1.AutonomousWorkflow(this.orchestrator, this.ragService, this.executionEngine, this.workspaceRoot);
            // Step 3: Execute workflow with self-healing
            logger.info('\nStep 3: Executing autonomous workflow with self-healing...');
            const workflowResult = await workflow.execute(instructions, {
                autoWriteFiles: true,
                autoRunTests: request.options?.includeTests !== false,
                requireApproval: false,
                maxRetries: request.options?.maxIterations || 5,
                enableIterativeRefinement: request.options?.autoFix !== false,
                enableRealtimeCompilation: true,
                enableDependencyResolution: true,
                targetQualityScore: 95, // Higher target with self-healing
                maxRefinementIterations: 5
            });
            // Step 4: Validate production readiness (validation is already done in workflow)
            logger.info('\nStep 4: Workflow complete');
            const validationResult = workflowResult.validation;
            // Calculate build time
            const buildTime = Date.now() - startTime;
            // Determine success
            const success = workflowResult.success && workflowResult.errors.length === 0;
            // Build summary
            const summary = this.buildSummary(workflowResult, buildTime);
            logger.info('\n' + summary);
            return {
                success,
                filesGenerated: workflowResult.filesWritten.length,
                testsGenerated: workflowResult.generatedTests?.totalTests || 0,
                compilationStatus: workflowResult.errors.length === 0 ? 'success' : 'failed',
                testStatus: 'not_run',
                qualityScore: workflowResult.qualityScore || 0,
                errors: workflowResult.errors,
                warnings: [],
                buildTime,
                summary
            };
        }
        catch (error) {
            const buildTime = Date.now() - startTime;
            logger.error('Product build failed', error);
            return {
                success: false,
                filesGenerated: 0,
                testsGenerated: 0,
                compilationStatus: 'failed',
                testStatus: 'not_run',
                qualityScore: 0,
                errors: [error instanceof Error ? error.message : String(error)],
                warnings: [],
                buildTime,
                summary: ` Build failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    /**
    * Read instructions from file
    */
    async readInstructions(filePath) {
        const fullPath = path.isAbsolute(filePath)
            ? filePath
            : path.join(this.workspaceRoot, filePath);
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            return content;
        }
        catch (error) {
            throw new Error(`Failed to read instructions from ${filePath}: ${error}`);
        }
    }
    /**
    * Build summary report
    */
    buildSummary(workflowResult, buildTime) {
        const validationResult = workflowResult.validation;
        const lines = [];
        lines.push('');
        lines.push(' END-TO-END PRODUCT BUILD REPORT ');
        lines.push('');
        lines.push('');
        // Build Status
        const success = workflowResult.success && workflowResult.errors.length === 0;
        lines.push(`Status: ${success ? ' SUCCESS' : ' FAILED'}`);
        lines.push(`Build Time: ${(buildTime / 1000).toFixed(2)}s`);
        lines.push('');
        // Code Generation
        lines.push(' Code Generation:');
        lines.push(` Files Generated: ${workflowResult.filesWritten.length}`);
        lines.push(` Tests Generated: ${workflowResult.generatedTests?.totalTests || 0}`);
        lines.push(` Test Coverage: ${workflowResult.generatedTests?.estimatedCoverage || 0}%`);
        lines.push('');
        // Compilation
        lines.push(' Compilation:');
        if (workflowResult.errors.length === 0) {
            lines.push(' No errors');
        }
        else {
            lines.push(` ${workflowResult.errors.length} errors`);
            workflowResult.errors.slice(0, 3).forEach((err) => {
                lines.push(` - ${err}`);
            });
            if (workflowResult.errors.length > 3) {
                lines.push(` ... and ${workflowResult.errors.length - 3} more`);
            }
        }
        lines.push('');
        // Validation
        lines.push(' Production Validation:');
        lines.push(` Overall Score: ${workflowResult.qualityScore || 0}/100`);
        lines.push(` Grade: ${this.getGrade(workflowResult.qualityScore || 0)}`);
        lines.push(` Duration: ${workflowResult.duration}ms`);
        lines.push('');
        // Quality Breakdown
        if (validationResult && typeof validationResult === 'object') {
            lines.push(' Quality Breakdown:');
            if ('dimensions' in validationResult && validationResult.dimensions) {
                for (const [dimension, score] of Object.entries(validationResult.dimensions)) {
                    const emoji = score >= 80 ? '' : score >= 60 ? '' : '';
                    lines.push(` ${emoji} ${dimension}: ${score}/100`);
                }
            }
            lines.push('');
            // Recommendations
            if ('recommendations' in validationResult && Array.isArray(validationResult.recommendations) && validationResult.recommendations.length > 0) {
                lines.push(' Recommendations:');
                validationResult.recommendations.slice(0, 5).forEach((rec) => {
                    lines.push(` - ${rec}`);
                });
                lines.push('');
            }
        }
        lines.push('');
        return lines.join('\n');
    }
    /**
    * Get letter grade from score
    */
    getGrade(score) {
        if (score >= 90)
            return 'A (Excellent)';
        if (score >= 80)
            return 'B (Good)';
        if (score >= 70)
            return 'C (Acceptable)';
        if (score >= 60)
            return 'D (Needs Improvement)';
        return 'F (Failed)';
    }
    /**
    * Build a product from a specification file (VS Code command)
    */
    static async buildFromFile(context, orchestrator, specificationManager) {
        // Prompt user for instruction file
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Instructions': ['md', 'txt']
            },
            title: 'Select Product Specification File'
        });
        if (!fileUri || fileUri.length === 0) {
            return;
        }
        const instructionFile = fileUri[0].fsPath;
        // Prompt user for output directory
        const outputUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            title: 'Select Output Directory'
        });
        if (!outputUri || outputUri.length === 0) {
            return;
        }
        const outputDirectory = outputUri[0].fsPath;
        // Get workspace root
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }
        // Get RAG service and execution engine from context
        const ragService = context.globalState.get('ragService');
        const executionEngine = context.globalState.get('executionEngine');
        if (!ragService || !executionEngine) {
            vscode.window.showErrorMessage('Required services not initialized');
            return;
        }
        // Create builder
        const builder = new EndToEndProductBuilder(orchestrator, ragService, executionEngine, workspaceRoot, specificationManager);
        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Building Product',
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Reading instructions...' });
            // Build product
            const result = await builder.build({
                instructionFile,
                outputDirectory,
                options: {
                    includeTests: true,
                    includeDocs: true,
                    autoFix: true,
                    maxIterations: 3
                }
            });
            // Show result
            if (result.success) {
                vscode.window.showInformationMessage(` Product built successfully! ${result.filesGenerated} files, ${result.testsGenerated} tests, Quality: ${result.qualityScore}/100`);
            }
            else {
                vscode.window.showErrorMessage(` Product build failed: ${result.errors.join(', ')}`);
            }
            // Show detailed report
            const doc = await vscode.workspace.openTextDocument({
                content: result.summary,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
        });
    }
}
exports.EndToEndProductBuilder = EndToEndProductBuilder;
//# sourceMappingURL=endToEndProductBuilder.js.map