"use strict";
/**
 * Automatic Test Fixer
 * Analyzes failing tests and automatically fixes them
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
exports.TestFixer = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const orchestrator_1 = require("../models/orchestrator");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('TestFixer');
class TestFixer {
    constructor(executionEngine, orchestrator, workspaceRoot) {
        this.executionEngine = executionEngine;
        this.orchestrator = orchestrator;
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Fix failing tests
    */
    async fixTests(context, options = {}) {
        const startTime = Date.now();
        logger.info('Analyzing and fixing failing tests...');
        // Run tests to find failures
        const failures = await this.findFailingTests(options.focusFiles);
        logger.info(`Found ${failures.length} failing tests`);
        if (failures.length === 0) {
            return {
                fixes: [],
                applied: 0,
                successful: 0,
                failed: 0,
                duration: Date.now() - startTime
            };
        }
        // Generate fixes
        const fixes = [];
        for (const failure of failures) {
            const fix = await this.generateFix(failure, context);
            if (fix) {
                fixes.push(fix);
            }
        }
        logger.info(`Generated ${fixes.length} fixes`);
        // Apply fixes
        let applied = 0;
        let successful = 0;
        let failed = 0;
        if (options.autoApply) {
            for (const fix of fixes) {
                if (options.requireConfirmation !== false) {
                    const shouldApply = await this.confirmFix(fix);
                    if (!shouldApply)
                        continue;
                }
                const result = await this.applyFix(fix);
                applied++;
                if (result) {
                    successful++;
                }
                else {
                    failed++;
                }
            }
        }
        return {
            fixes,
            applied,
            successful,
            failed,
            duration: Date.now() - startTime
        };
    }
    /**
    * Find failing tests
    */
    async findFailingTests(focusFiles) {
        try {
            // Run tests
            const command = this.getTestCommand(focusFiles);
            const result = await this.executionEngine.execute(command, {
                workingDirectory: this.workspaceRoot,
                timeout: 120000,
                requireConfirmation: false
            });
            // Parse test output
            return this.parseTestOutput(result.stdout + '\n' + result.stderr);
        }
        catch (error) {
            logger.error('Failed to run tests', error);
            return [];
        }
    }
    /**
    * Get test command
    */
    getTestCommand(focusFiles) {
        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            if (deps.vitest) {
                return focusFiles
                    ? `npm test -- ${focusFiles.join(' ')}`
                    : 'npm test';
            }
            if (deps.jest || deps['@jest/globals']) {
                return focusFiles
                    ? `npm test -- ${focusFiles.join(' ')}`
                    : 'npm test';
            }
        }
        return 'npm test';
    }
    /**
    * Parse test output
    */
    parseTestOutput(output) {
        const failures = [];
        // Parse Jest/Vitest output
        const testBlocks = output.split(/|FAIL/);
        for (const block of testBlocks) {
            if (!block.includes('Error:') && !block.includes('Expected'))
                continue;
            const fileMatch = block.match(/([^\s]+\.test\.(ts|js))/);
            const testNameMatch = block.match(/›\s+(.+)/);
            const errorMatch = block.match(/Error:\s+(.+)/);
            const lineMatch = block.match(/:(\d+):\d+/);
            if (fileMatch && testNameMatch && errorMatch) {
                failures.push({
                    file: fileMatch[1],
                    testName: testNameMatch[1].trim(),
                    error: errorMatch[1].trim(),
                    stackTrace: block,
                    line: lineMatch ? parseInt(lineMatch[1]) : 0,
                    type: this.classifyError(errorMatch[1])
                });
            }
        }
        return failures;
    }
    /**
    * Classify error type
    */
    classifyError(error) {
        if (error.includes('Expected') || error.includes('toBe') || error.includes('toEqual')) {
            return 'assertion';
        }
        if (error.includes('Timeout') || error.includes('exceeded')) {
            return 'timeout';
        }
        if (error.includes('beforeEach') || error.includes('beforeAll')) {
            return 'setup';
        }
        if (error.includes('afterEach') || error.includes('afterAll')) {
            return 'teardown';
        }
        return 'runtime';
    }
    /**
    * Generate fix for failing test
    */
    async generateFix(failure, context) {
        logger.info(`Analyzing failure: ${failure.testName}`);
        // Read test file
        const testFilePath = path.join(this.workspaceRoot, failure.file);
        if (!fs.existsSync(testFilePath)) {
            logger.error(`Test file not found: ${testFilePath}`);
            return null;
        }
        const testCode = fs.readFileSync(testFilePath, 'utf-8');
        // Find source file
        const sourceFile = this.findSourceFile(failure.file);
        const sourceCode = sourceFile && fs.existsSync(sourceFile)
            ? fs.readFileSync(sourceFile, 'utf-8')
            : '';
        const prompt = `Analyze this failing test and generate a fix:

Test File: ${failure.file}
Test Name: ${failure.testName}
Error Type: ${failure.type}
Error: ${failure.error}

Stack Trace:
${failure.stackTrace}

Test Code:
\`\`\`
${testCode}
\`\`\`

${sourceCode ? `Source Code:\n\`\`\`\n${sourceCode.slice(0, 2000)}\n\`\`\`\n` : ''}

Architectural Context:
${context.assembledContext.slice(0, 1000)}

Analyze the failure and provide a fix:
1. Identify the root cause
2. Determine the correct fix
3. Generate the fixed test code
4. Explain the changes

Return as JSON:
{
 "originalCode": "failing test code",
 "fixedCode": "fixed test code",
 "explanation": "why this fixes the issue",
 "confidence": 85,
 "changes": [
 {
 "type": "modify",
 "line": 42,
 "oldCode": "expect(result).toBe(5)",
 "newCode": "expect(result).toBe(10)",
 "reason": "Expected value was incorrect"
 }
 ]
}`;
        try {
            const response = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are an expert test debugger. Analyze failures and generate precise fixes.' },
                    { role: 'user', content: prompt }
                ],
                maxTokens: 4000
            }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
            const fix = this.parseFixResponse(response.content, failure);
            if (fix && fix.confidence >= 70) {
                return fix;
            }
            logger.info(`Low confidence fix (${fix?.confidence}%), skipping`);
            return null;
        }
        catch (error) {
            logger.error('Failed to generate fix', error);
            return null;
        }
    }
    /**
    * Parse fix response
    */
    parseFixResponse(content, failure) {
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch)
                return null;
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                file: failure.file,
                testName: failure.testName,
                originalCode: parsed.originalCode || '',
                fixedCode: parsed.fixedCode || '',
                explanation: parsed.explanation || '',
                confidence: parsed.confidence || 0,
                changes: parsed.changes || []
            };
        }
        catch (error) {
            logger.error('Failed to parse fix response', error);
            return null;
        }
    }
    /**
    * Confirm fix with user
    */
    async confirmFix(fix) {
        const message = `Fix test "${fix.testName}"?\n\n${fix.explanation}\n\nConfidence: ${fix.confidence}%`;
        const choice = await vscode.window.showInformationMessage(message, { modal: true }, 'Apply Fix', 'Skip');
        return choice === 'Apply Fix';
    }
    /**
    * Apply fix
    */
    async applyFix(fix) {
        try {
            const testFilePath = path.join(this.workspaceRoot, fix.file);
            let testCode = fs.readFileSync(testFilePath, 'utf-8');
            // Apply changes
            for (const change of fix.changes.sort((a, b) => b.line - a.line)) {
                if (change.type === 'modify' && change.oldCode && change.newCode) {
                    testCode = testCode.replace(change.oldCode, change.newCode);
                }
                else if (change.type === 'add' && change.newCode) {
                    const lines = testCode.split('\n');
                    lines.splice(change.line, 0, change.newCode);
                    testCode = lines.join('\n');
                }
                else if (change.type === 'remove' && change.oldCode) {
                    testCode = testCode.replace(change.oldCode, '');
                }
            }
            // Write fixed code
            fs.writeFileSync(testFilePath, testCode, 'utf-8');
            // Verify fix by running test
            const result = await this.executionEngine.execute(`npm test -- ${fix.file}`, {
                workingDirectory: this.workspaceRoot,
                timeout: 60000,
                requireConfirmation: false
            });
            if (result.success) {
                logger.info(`Successfully fixed: ${fix.testName}`);
                return true;
            }
            else {
                logger.info(`Fix didn't work: ${fix.testName}`);
                // Revert changes
                const originalCode = fs.readFileSync(testFilePath, 'utf-8');
                fs.writeFileSync(testFilePath, originalCode, 'utf-8');
                return false;
            }
        }
        catch (error) {
            logger.error('Failed to apply fix', error);
            return false;
        }
    }
    /**
    * Find source file for test
    */
    findSourceFile(testFile) {
        const testDir = path.dirname(testFile);
        const testName = path.basename(testFile);
        const sourceName = testName
            .replace(/\.test\.(ts|js)$/, '.$1')
            .replace(/\.spec\.(ts|js)$/, '.$1');
        const possiblePaths = [
            path.join(testDir, sourceName),
            path.join(testDir, '..', sourceName),
            path.join(testDir, '..', 'src', sourceName),
            path.join(this.workspaceRoot, 'src', sourceName)
        ];
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
        return null;
    }
}
exports.TestFixer = TestFixer;
//# sourceMappingURL=testFixer.js.map