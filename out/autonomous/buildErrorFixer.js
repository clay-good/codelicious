"use strict";
/**
 * Build Error Parser & Fixer
 *
 * Parses build errors from TypeScript, ESLint, Webpack, etc. and automatically fixes them.
 * This is critical for autonomous building - the system needs to understand and fix build errors.
 *
 * Supported error types:
 * - TypeScript compilation errors
 * - ESLint/TSLint errors
 * - Webpack bundling errors
 * - Import/export errors
 * - Type errors
 * - Missing dependencies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildErrorFixer = void 0;
const errorDetector_1 = require("./errorDetector");
const aiFixGenerator_1 = require("./aiFixGenerator");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('BuildErrorFixer');
class BuildErrorFixer {
    constructor(orchestrator, executionEngine, workspaceRoot) {
        this.orchestrator = orchestrator;
        this.executionEngine = executionEngine;
        this.workspaceRoot = workspaceRoot;
        this.errorDetector = new errorDetector_1.ErrorDetector();
        this.aiFixGenerator = new aiFixGenerator_1.AIFixGenerator(orchestrator);
    }
    /**
    * Fix build errors automatically (Enhanced with AI)
    */
    async fixBuildErrors(buildOutput, files) {
        logger.info('Parsing build errors with AI-powered detection...');
        // Use sophisticated error detector
        const detectedErrors = await this.errorDetector.detectErrors(buildOutput, files);
        logger.info(`Found ${detectedErrors.length} errors (with semantic analysis)`);
        if (detectedErrors.length === 0) {
            return {
                success: true,
                fixedFiles: files,
                fixedErrors: [],
                remainingErrors: [],
                appliedFixes: []
            };
        }
        // Generate AI-powered fixes
        const generatedFixes = await this.aiFixGenerator.generateFixes(detectedErrors, files, {
            maxFixes: 3,
            minConfidence: 0.6,
            includeExplanation: true,
            considerHistory: true,
            multiStep: true,
            validateFixes: true
        });
        logger.info(`Generated ${generatedFixes.length} fix sets`);
        // Apply fixes
        const fixedFiles = [...files];
        const appliedFixes = [];
        const fixedErrorsOld = [];
        for (const fixSet of generatedFixes) {
            if (fixSet.fixes.length === 0)
                continue;
            logger.info(`Applying fix: ${fixSet.fixes[0].description} (confidence: ${fixSet.fixes[0].confidence})`);
            // Convert to old format for compatibility
            const fix = {
                error: this.convertToOldError(fixSet.error),
                file: fixSet.error.file,
                description: fixSet.fixes[0].description,
                newCode: fixSet.fixes[0].changes[0]?.newCode || '',
                oldCode: fixSet.fixes[0].changes[0]?.oldCode,
                confidence: fixSet.fixes[0].confidence
            };
            appliedFixes.push(fix);
            fixedErrorsOld.push(fix.error);
            // Apply the fix changes
            for (const change of fixSet.fixes[0].changes) {
                const fileIndex = fixedFiles.findIndex(f => f.filePath === change.file);
                if (fileIndex >= 0) {
                    const file = fixedFiles[fileIndex];
                    let content = file.content;
                    if (change.oldCode && change.newCode) {
                        content = content.replace(change.oldCode, change.newCode);
                    }
                    else if (change.newCode) {
                        // Add new code
                        const lines = content.split('\n');
                        if (change.line && change.line <= lines.length) {
                            lines.splice(change.line - 1, 0, change.newCode);
                            content = lines.join('\n');
                        }
                    }
                    fixedFiles[fileIndex] = { ...file, content };
                }
            }
            // Record fix result for learning
            this.aiFixGenerator.recordFixResult(fixSet.error, fixSet.fixes[0], true, 'Applied successfully');
        }
        // Check remaining errors
        const remainingErrors = detectedErrors
            .filter(e => !fixedErrorsOld.some(fe => fe.message === e.message && fe.file === e.file))
            .map(e => this.convertToOldError(e));
        logger.info(`Fixed ${fixedErrorsOld.length} errors`);
        logger.info(`Remaining: ${remainingErrors.length} errors`);
        return {
            success: remainingErrors.length === 0,
            fixedFiles,
            fixedErrors: fixedErrorsOld,
            remainingErrors,
            appliedFixes
        };
    }
    /**
    * Convert new DetectedError to old BuildError format
    */
    convertToOldError(error) {
        return {
            type: this.mapErrorType(error.type),
            severity: error.severity === 'critical' || error.severity === 'error' ? 'error' : 'warning',
            file: error.file,
            line: error.line,
            column: error.column,
            code: error.code,
            message: error.message,
            suggestion: error.suggestedFixes[0]?.description
        };
    }
    /**
    * Map new error types to old types
    */
    mapErrorType(type) {
        if (type === 'type' || type === 'syntax')
            return 'typescript';
        if (type === 'import' || type === 'export')
            return 'import';
        if (type === 'missing-dependency')
            return 'dependency';
        return 'other';
    }
    /**
    * Parse build errors from output
    */
    parseBuildErrors(buildOutput) {
        const errors = [];
        // Parse TypeScript errors
        errors.push(...this.parseTypeScriptErrors(buildOutput));
        // Parse ESLint errors
        errors.push(...this.parseESLintErrors(buildOutput));
        // Parse Webpack errors
        errors.push(...this.parseWebpackErrors(buildOutput));
        // Parse import errors
        errors.push(...this.parseImportErrors(buildOutput));
        return errors;
    }
    /**
    * Parse TypeScript compilation errors
    */
    parseTypeScriptErrors(output) {
        const errors = [];
        // Pattern: src/file.ts(10,5): error TS2304: Cannot find name 'foo'.
        const tsPattern = /(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)/g;
        let match;
        while ((match = tsPattern.exec(output)) !== null) {
            errors.push({
                type: 'typescript',
                severity: match[4],
                file: match[1],
                line: parseInt(match[2]),
                column: parseInt(match[3]),
                code: match[5],
                message: match[6]
            });
        }
        return errors;
    }
    /**
    * Parse ESLint errors
    */
    parseESLintErrors(output) {
        const errors = [];
        // Pattern: /path/to/file.ts
        // 10:5 error 'foo' is not defined no-undef
        const eslintPattern = /(.+?)\n\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([\w-]+)/g;
        let match;
        while ((match = eslintPattern.exec(output)) !== null) {
            errors.push({
                type: 'eslint',
                severity: match[4],
                file: match[1],
                line: parseInt(match[2]),
                column: parseInt(match[3]),
                message: match[5],
                code: match[6]
            });
        }
        return errors;
    }
    /**
    * Parse Webpack errors
    */
    parseWebpackErrors(output) {
        const errors = [];
        // Pattern: ERROR in ./src/file.ts
        // Module not found: Error: Can't resolve 'module-name'
        const webpackPattern = /ERROR in (.+?)\n(.+)/g;
        let match;
        while ((match = webpackPattern.exec(output)) !== null) {
            errors.push({
                type: 'webpack',
                severity: 'error',
                file: match[1],
                message: match[2]
            });
        }
        return errors;
    }
    /**
    * Parse import/export errors
    */
    parseImportErrors(output) {
        const errors = [];
        // Look for common import error patterns
        const patterns = [
            /Cannot find module ['"](.+?)['"]/g,
            /Module ['"](.+?)['"] has no exported member ['"](.+?)['"]/g,
            /Cannot resolve module ['"](.+?)['"]/g
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(output)) !== null) {
                errors.push({
                    type: 'import',
                    severity: 'error',
                    file: '',
                    message: match[0]
                });
            }
        }
        return errors;
    }
    /**
    * Group errors by type and pattern
    */
    groupErrors(errors) {
        const groups = new Map();
        for (const error of errors) {
            // Group by type and common patterns
            let groupKey = error.type;
            // Special grouping for common patterns
            if (error.message.includes('Cannot find name')) {
                groupKey = 'undefined-variable';
            }
            else if (error.message.includes('Cannot find module')) {
                groupKey = 'missing-import';
            }
            else if (error.message.includes('has no exported member')) {
                groupKey = 'missing-export';
            }
            else if (error.message.includes('Type') && error.message.includes('is not assignable')) {
                groupKey = 'type-mismatch';
            }
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey).push(error);
        }
        return Array.from(groups.entries()).map(([type, errors]) => ({
            type,
            errors,
            commonPattern: this.findCommonPattern(errors)
        }));
    }
    /**
    * Find common pattern in error messages
    */
    findCommonPattern(errors) {
        if (errors.length === 0)
            return undefined;
        // Simple pattern detection - could be more sophisticated
        const messages = errors.map(e => e.message);
        const firstMessage = messages[0];
        // Find common prefix
        let commonPrefix = firstMessage;
        for (const msg of messages.slice(1)) {
            let i = 0;
            while (i < commonPrefix.length && i < msg.length && commonPrefix[i] === msg[i]) {
                i++;
            }
            commonPrefix = commonPrefix.substring(0, i);
        }
        return commonPrefix.trim() || undefined;
    }
    /**
    * Generate fixes for an error group
    */
    async generateFixesForGroup(group, files) {
        const fixes = [];
        // Use specialized fixers for common error types
        switch (group.type) {
            case 'undefined-variable':
                fixes.push(...await this.fixUndefinedVariables(group.errors, files));
                break;
            case 'missing-import':
                fixes.push(...await this.fixMissingImports(group.errors, files));
                break;
            case 'missing-export':
                fixes.push(...await this.fixMissingExports(group.errors, files));
                break;
            case 'type-mismatch':
                fixes.push(...await this.fixTypeMismatches(group.errors, files));
                break;
            default:
                fixes.push(...await this.fixGenericErrors(group.errors, files));
        }
        return fixes;
    }
    /**
    * Fix undefined variable errors
    */
    async fixUndefinedVariables(errors, files) {
        const fixes = [];
        for (const error of errors) {
            // Extract variable name
            const match = error.message.match(/Cannot find name ['"](.+?)['"]/);
            if (!match)
                continue;
            const varName = match[1];
            const file = files.find(f => f.filePath.includes(error.file));
            if (!file)
                continue;
            // Check if it needs to be imported
            const needsImport = await this.checkIfNeedsImport(varName, file);
            if (needsImport) {
                const importStatement = await this.generateImportStatement(varName, file);
                fixes.push({
                    error,
                    file: file.filePath,
                    description: `Add import for ${varName}`,
                    newCode: this.addImport(file.content, importStatement),
                    confidence: 0.8
                });
            }
        }
        return fixes;
    }
    /**
    * Fix missing import errors
    */
    async fixMissingImports(errors, files) {
        // Similar to fixUndefinedVariables
        return [];
    }
    /**
    * Fix missing export errors
    */
    async fixMissingExports(errors, files) {
        return [];
    }
    /**
    * Fix type mismatch errors
    */
    async fixTypeMismatches(errors, files) {
        return [];
    }
    /**
    * Fix generic errors using AI
    */
    async fixGenericErrors(errors, files) {
        return [];
    }
    /**
    * Check if variable needs to be imported
    */
    async checkIfNeedsImport(varName, file) {
        // Check if it's a built-in or already imported
        return !file.content.includes(`import`) || !file.content.includes(varName);
    }
    /**
    * Generate import statement
    */
    async generateImportStatement(varName, file) {
        // Would use AI or static analysis to determine correct import
        return `import { ${varName} } from './${varName}';`;
    }
    /**
    * Add import to file content
    */
    addImport(content, importStatement) {
        // Find the last import statement
        const lines = content.split('\n');
        let lastImportIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ')) {
                lastImportIndex = i;
            }
        }
        // Insert after last import or at beginning
        if (lastImportIndex >= 0) {
            lines.splice(lastImportIndex + 1, 0, importStatement);
        }
        else {
            lines.unshift(importStatement);
        }
        return lines.join('\n');
    }
    /**
    * Apply fixes to files
    */
    async applyFixes(files, fixes) {
        const updatedFiles = [...files];
        for (const fix of fixes) {
            const fileIndex = updatedFiles.findIndex(f => f.filePath === fix.file);
            if (fileIndex >= 0) {
                updatedFiles[fileIndex] = {
                    ...updatedFiles[fileIndex],
                    content: fix.newCode
                };
            }
        }
        return updatedFiles;
    }
}
exports.BuildErrorFixer = BuildErrorFixer;
//# sourceMappingURL=buildErrorFixer.js.map