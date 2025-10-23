"use strict";
/**
 * Specification Executor
 *
 * Executes planned tasks in the correct order with error handling,
 * progress tracking, and rollback capabilities.
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
exports.SpecificationExecutor = exports.ArtifactType = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const specificationParser_1 = require("./specificationParser");
var ArtifactType;
(function (ArtifactType) {
    ArtifactType["FILE"] = "file";
    ArtifactType["DIRECTORY"] = "directory";
    ArtifactType["TEST"] = "test";
    ArtifactType["DOCUMENTATION"] = "documentation";
})(ArtifactType || (exports.ArtifactType = ArtifactType = {}));
class SpecificationExecutor {
    constructor(workspaceRoot, outputChannel) {
        this.completedTasks = new Set();
        this.artifacts = [];
        this.backups = new Map();
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = outputChannel;
    }
    /**
    * Execute an execution plan
    */
    async execute(plan, options = {}) {
        const startTime = Date.now();
        const completedTasks = [];
        const failedTasks = [];
        const skippedTasks = [];
        const errors = [];
        this.outputChannel.appendLine('='.repeat(80));
        this.outputChannel.appendLine('Starting Specification Execution');
        this.outputChannel.appendLine('='.repeat(80));
        this.outputChannel.appendLine(`Total Phases: ${plan.phases.length}`);
        this.outputChannel.appendLine(`Estimated Time: ${Math.round(plan.totalTime / 60)} hours`);
        this.outputChannel.appendLine(`Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
        this.outputChannel.appendLine('');
        try {
            // Execute phases sequentially
            for (const phase of plan.phases) {
                this.outputChannel.appendLine(`\n--- Phase: ${phase.name} ---`);
                this.outputChannel.appendLine(`Tasks: ${phase.tasks.length}`);
                this.outputChannel.appendLine(`Estimated Time: ${Math.round(phase.estimatedTime / 60)} hours`);
                this.outputChannel.appendLine('');
                const phaseResult = await this.executePhase(phase, options);
                completedTasks.push(...phaseResult.completed);
                failedTasks.push(...phaseResult.failed);
                skippedTasks.push(...phaseResult.skipped);
                errors.push(...phaseResult.errors);
                // Stop on error if requested
                if (options.stopOnError && phaseResult.failed.length > 0) {
                    this.outputChannel.appendLine('\n Stopping execution due to errors');
                    // Rollback if requested
                    if (options.rollbackOnError) {
                        await this.rollback();
                    }
                    break;
                }
            }
            const duration = Date.now() - startTime;
            const success = failedTasks.length === 0;
            this.outputChannel.appendLine('\n' + '='.repeat(80));
            this.outputChannel.appendLine('Execution Complete');
            this.outputChannel.appendLine('='.repeat(80));
            this.outputChannel.appendLine(`Status: ${success ? ' SUCCESS' : ' FAILED'}`);
            this.outputChannel.appendLine(`Completed: ${completedTasks.length}`);
            this.outputChannel.appendLine(`Failed: ${failedTasks.length}`);
            this.outputChannel.appendLine(`Skipped: ${skippedTasks.length}`);
            this.outputChannel.appendLine(`Duration: ${(duration / 1000).toFixed(2)}s`);
            this.outputChannel.appendLine('');
            return {
                success,
                completedTasks,
                failedTasks,
                skippedTasks,
                errors,
                duration,
                artifacts: this.artifacts
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.outputChannel.appendLine(`\n Fatal Error: ${error}`);
            if (options.rollbackOnError) {
                await this.rollback();
            }
            return {
                success: false,
                completedTasks,
                failedTasks,
                skippedTasks,
                errors: [{
                        taskId: 'executor',
                        message: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                        timestamp: Date.now()
                    }],
                duration,
                artifacts: this.artifacts
            };
        }
    }
    /**
    * Execute a single phase
    */
    async executePhase(phase, options) {
        const completed = [];
        const failed = [];
        const skipped = [];
        const errors = [];
        // Execute tasks in order
        for (const task of phase.tasks) {
            // Check if dependencies are met
            const depsComplete = task.dependencies.every(depId => this.completedTasks.has(depId));
            if (!depsComplete) {
                this.outputChannel.appendLine(`⏭ Skipping ${task.name} (dependencies not met)`);
                skipped.push(task.id);
                continue;
            }
            try {
                this.outputChannel.appendLine(`\n Executing: ${task.name}`);
                this.outputChannel.appendLine(` Type: ${task.type}`);
                this.outputChannel.appendLine(` Priority: ${task.priority}`);
                this.outputChannel.appendLine(` Estimated Time: ${task.estimatedTime} minutes`);
                if (!options.dryRun) {
                    await this.executeTask(task);
                }
                else {
                    this.outputChannel.appendLine(` [DRY RUN] Would execute task`);
                }
                this.completedTasks.add(task.id);
                completed.push(task.id);
                this.outputChannel.appendLine(` Completed: ${task.name}`);
            }
            catch (error) {
                const errorObj = {
                    taskId: task.id,
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    timestamp: Date.now()
                };
                errors.push(errorObj);
                failed.push(task.id);
                this.outputChannel.appendLine(` Failed: ${task.name}`);
                this.outputChannel.appendLine(` Error: ${errorObj.message}`);
                if (options.stopOnError) {
                    break;
                }
            }
        }
        return { completed, failed, skipped, errors };
    }
    /**
    * Execute a single task
    */
    async executeTask(task) {
        switch (task.type) {
            case specificationParser_1.TaskType.CREATE:
                await this.executeCreateTask(task);
                break;
            case specificationParser_1.TaskType.MODIFY:
                await this.executeModifyTask(task);
                break;
            case specificationParser_1.TaskType.DELETE:
                await this.executeDeleteTask(task);
                break;
            case specificationParser_1.TaskType.REFACTOR:
                await this.executeRefactorTask(task);
                break;
            case specificationParser_1.TaskType.TEST:
                await this.executeTestTask(task);
                break;
            case specificationParser_1.TaskType.DOCUMENT:
                await this.executeDocumentTask(task);
                break;
            default:
                throw new Error(`Unknown task type: ${task.type}`);
        }
    }
    /**
    * Execute a create task
    */
    async executeCreateTask(task) {
        for (const file of task.files) {
            const filePath = path.join(this.workspaceRoot, file);
            const dir = path.dirname(filePath);
            // Create directory if needed
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Create file with placeholder content
            const content = this.generateFileContent(file, task);
            fs.writeFileSync(filePath, content, 'utf8');
            this.artifacts.push({
                type: ArtifactType.FILE,
                path: file,
                content,
                size: content.length,
                created: Date.now()
            });
            this.outputChannel.appendLine(` Created: ${file}`);
        }
    }
    /**
    * Execute a modify task
    */
    async executeModifyTask(task) {
        for (const file of task.files) {
            const filePath = path.join(this.workspaceRoot, file);
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${file}`);
            }
            // Backup original content
            const originalContent = fs.readFileSync(filePath, 'utf8');
            this.backups.set(filePath, originalContent);
            // For now, just log that we would modify
            // In a real implementation, this would use the AI to generate modifications
            this.outputChannel.appendLine(` Would modify: ${file}`);
        }
    }
    /**
    * Execute a delete task
    */
    async executeDeleteTask(task) {
        for (const file of task.files) {
            const filePath = path.join(this.workspaceRoot, file);
            if (fs.existsSync(filePath)) {
                // Backup before deleting
                const content = fs.readFileSync(filePath, 'utf8');
                this.backups.set(filePath, content);
                fs.unlinkSync(filePath);
                this.outputChannel.appendLine(` Deleted: ${file}`);
            }
        }
    }
    /**
    * Execute a refactor task
    */
    async executeRefactorTask(task) {
        // Placeholder for refactoring logic
        this.outputChannel.appendLine(` Would refactor files: ${task.files.join(', ')}`);
    }
    /**
    * Execute a test task
    */
    async executeTestTask(task) {
        // Placeholder for test execution logic
        this.outputChannel.appendLine(` Would run tests: ${task.tests.join(', ')}`);
    }
    /**
    * Execute a document task
    */
    async executeDocumentTask(task) {
        // Placeholder for documentation generation
        this.outputChannel.appendLine(` Would generate documentation`);
    }
    /**
    * Rollback all changes
    */
    async rollback() {
        this.outputChannel.appendLine('\n Rolling back changes...');
        for (const [filePath, content] of this.backups) {
            try {
                fs.writeFileSync(filePath, content, 'utf8');
                this.outputChannel.appendLine(` Restored: ${filePath}`);
            }
            catch (error) {
                this.outputChannel.appendLine(` Failed to restore: ${filePath}`);
            }
        }
        this.backups.clear();
        this.outputChannel.appendLine(' Rollback complete');
    }
    /**
    * Generate file content based on file type
    */
    generateFileContent(file, task) {
        const ext = path.extname(file);
        const fileName = path.basename(file, ext);
        const isTest = fileName.includes('.test') || fileName.includes('.spec');
        switch (ext) {
            case '.ts':
            case '.tsx':
                if (isTest) {
                    return this.generateTestTemplate(fileName, task, 'typescript');
                }
                return this.generateTypeScriptTemplate(fileName, task);
            case '.js':
            case '.jsx':
                if (isTest) {
                    return this.generateTestTemplate(fileName, task, 'javascript');
                }
                return this.generateJavaScriptTemplate(fileName, task);
            case '.py':
                return this.generatePythonTemplate(fileName, task);
            case '.md':
                return this.generateMarkdownTemplate(task);
            default:
                return `// ${task.name}\n// ${task.description}\n\n// TODO: Implement\n`;
        }
    }
    /**
    * Generate TypeScript template
    */
    generateTypeScriptTemplate(fileName, task) {
        const className = this.toPascalCase(fileName);
        return `/**
 * ${task.name}
 *
 * ${task.description}
 */

export class ${className} {
 constructor() {
 // TODO: Initialize
 }

 // TODO: Add methods
}
`;
    }
    /**
    * Generate JavaScript template
    */
    generateJavaScriptTemplate(fileName, task) {
        const className = this.toPascalCase(fileName);
        return `/**
 * ${task.name}
 *
 * ${task.description}
 */

class ${className} {
 constructor() {
 // TODO: Initialize
 }

 // TODO: Add methods
}

module.exports = ${className};
`;
    }
    /**
    * Generate Python template
    */
    generatePythonTemplate(fileName, task) {
        const className = this.toPascalCase(fileName);
        return `"""
${task.name}

${task.description}
"""

class ${className}:
 def __init__(self):
 """Initialize ${className}"""
 # TODO: Initialize
 pass

 # TODO: Add methods
`;
    }
    /**
    * Generate test template
    */
    generateTestTemplate(fileName, task, lang) {
        const testName = fileName.replace(/\.(test|spec)$/, '');
        const className = this.toPascalCase(testName);
        return `/**
 * Tests for ${task.name}
 */

describe('${className}', () => {
 it('should be defined', () => {
 // TODO: Add test
 expect(true).toBe(true);
 });

 // TODO: Add more tests
});
`;
    }
    /**
    * Generate Markdown template
    */
    generateMarkdownTemplate(task) {
        return `# ${task.name}

${task.description}

## Overview

TODO: Add overview

## Usage

TODO: Add usage examples

## API

TODO: Document API
`;
    }
    /**
    * Convert string to PascalCase
    */
    toPascalCase(str) {
        return str
            .replace(/[-_.](.)/g, (_, c) => c.toUpperCase())
            .replace(/^(.)/, (_, c) => c.toUpperCase());
    }
}
exports.SpecificationExecutor = SpecificationExecutor;
//# sourceMappingURL=specificationExecutor.js.map