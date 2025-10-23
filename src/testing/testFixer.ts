/**
 * Automatic Test Fixer
 * Analyzes failing tests and automatically fixes them
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionEngine } from '../core/executionEngine';
import { ModelOrchestrator, TaskComplexity } from '../models/orchestrator';
import { ArchitecturalContext } from '../context/persistentContextEngine';
import { createLogger } from '../utils/logger';

const logger = createLogger('TestFixer');

export interface FailingTest {
 file: string;
 testName: string;
 error: string;
 stackTrace: string;
 line: number;
 type: 'assertion' | 'runtime' | 'timeout' | 'setup' | 'teardown';
}

export interface TestFix {
 file: string;
 testName: string;
 originalCode: string;
 fixedCode: string;
 explanation: string;
 confidence: number;
 changes: CodeChange[];
}

export interface CodeChange {
 type: 'add' | 'modify' | 'remove';
 line: number;
 oldCode?: string;
 newCode?: string;
 reason: string;
}

export interface TestFixResult {
 fixes: TestFix[];
 applied: number;
 successful: number;
 failed: number;
 duration: number;
}

export interface TestFixOptions {
 maxRetries?: number;
 autoApply?: boolean;
 requireConfirmation?: boolean;
 focusFiles?: string[];
}

export class TestFixer {
 constructor(
 private executionEngine: ExecutionEngine,
 private orchestrator: ModelOrchestrator,
 private workspaceRoot: string
 ) {}

 /**
 * Fix failing tests
 */
 async fixTests(
 context: ArchitecturalContext,
 options: TestFixOptions = {}
 ): Promise<TestFixResult> {
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
 const fixes: TestFix[] = [];
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
 if (!shouldApply) continue;
 }

 const result = await this.applyFix(fix);
 applied++;

 if (result) {
 successful++;
 } else {
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
 private async findFailingTests(focusFiles?: string[]): Promise<FailingTest[]> {
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
 } catch (error) {
 logger.error('Failed to run tests', error);
 return [];
 }
 }

 /**
 * Get test command
 */
 private getTestCommand(focusFiles?: string[]): string {
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
 private parseTestOutput(output: string): FailingTest[] {
 const failures: FailingTest[] = [];

 // Parse Jest/Vitest output
 const testBlocks = output.split(/|FAIL/);

 for (const block of testBlocks) {
 if (!block.includes('Error:') && !block.includes('Expected')) continue;

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
 private classifyError(error: string): FailingTest['type'] {
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
 private async generateFix(
 failure: FailingTest,
 context: ArchitecturalContext
 ): Promise<TestFix | null> {
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
 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 { role: 'system', content: 'You are an expert test debugger. Analyze failures and generate precise fixes.' },
 { role: 'user', content: prompt }
 ],
 maxTokens: 4000
 },
 { complexity: TaskComplexity.COMPLEX }
 );

 const fix = this.parseFixResponse(response.content, failure);
 if (fix && fix.confidence >= 70) {
 return fix;
 }

 logger.info(`Low confidence fix (${fix?.confidence}%), skipping`);
 return null;
 } catch (error) {
 logger.error('Failed to generate fix', error);
 return null;
 }
 }

 /**
 * Parse fix response
 */
 private parseFixResponse(content: string, failure: FailingTest): TestFix | null {
 try {
 const jsonMatch = content.match(/\{[\s\S]*\}/);
 if (!jsonMatch) return null;

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
 } catch (error) {
 logger.error('Failed to parse fix response', error);
 return null;
 }
 }

 /**
 * Confirm fix with user
 */
 private async confirmFix(fix: TestFix): Promise<boolean> {
 const message = `Fix test "${fix.testName}"?\n\n${fix.explanation}\n\nConfidence: ${fix.confidence}%`;

 const choice = await vscode.window.showInformationMessage(
 message,
 { modal: true },
 'Apply Fix',
 'Skip'
 );

 return choice === 'Apply Fix';
 }

 /**
 * Apply fix
 */
 private async applyFix(fix: TestFix): Promise<boolean> {
 try {
 const testFilePath = path.join(this.workspaceRoot, fix.file);
 let testCode = fs.readFileSync(testFilePath, 'utf-8');

 // Apply changes
 for (const change of fix.changes.sort((a, b) => b.line - a.line)) {
 if (change.type === 'modify' && change.oldCode && change.newCode) {
 testCode = testCode.replace(change.oldCode, change.newCode);
 } else if (change.type === 'add' && change.newCode) {
 const lines = testCode.split('\n');
 lines.splice(change.line, 0, change.newCode);
 testCode = lines.join('\n');
 } else if (change.type === 'remove' && change.oldCode) {
 testCode = testCode.replace(change.oldCode, '');
 }
 }

 // Write fixed code
 fs.writeFileSync(testFilePath, testCode, 'utf-8');

 // Verify fix by running test
 const result = await this.executionEngine.execute(
 `npm test -- ${fix.file}`,
 {
 workingDirectory: this.workspaceRoot,
 timeout: 60000,
 requireConfirmation: false
 }
 );

 if (result.success) {
 logger.info(`Successfully fixed: ${fix.testName}`);
 return true;
 } else {
 logger.info(`Fix didn't work: ${fix.testName}`);
 // Revert changes
 const originalCode = fs.readFileSync(testFilePath, 'utf-8');
 fs.writeFileSync(testFilePath, originalCode, 'utf-8');
 return false;
 }
 } catch (error) {
 logger.error('Failed to apply fix', error);
 return false;
 }
 }

 /**
 * Find source file for test
 */
 private findSourceFile(testFile: string): string | null {
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

