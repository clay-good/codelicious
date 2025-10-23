/**
 * Testing Agent
 *
 * Generates and validates tests for generated code.
 * Ensures code functionality matches requirements.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from './baseAgent';
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionEngine } from '../core/executionEngine';
import {
 AgentRole,
 AgentContext,
 AgentTaskResult,
 AgentConfig,
 TestingValidationResult,
 GeneratedTest,
 TestExecutionResult
} from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('TestingAgent');

export class TestingAgent extends BaseAgent {
 constructor(
 orchestrator: ModelOrchestrator,
 private readonly executionEngine: ExecutionEngine,
 config: Partial<AgentConfig> = {}
 ) {
 super(
 AgentRole.TESTING_VALIDATOR,
 orchestrator,
 {
 role: AgentRole.TESTING_VALIDATOR,
 enabled: true,
 temperature: 0.4,
 maxTokens: 4000,
 ...config
 }
 );
 }

 protected getDefaultSystemPrompt(): string {
 return `You are a Testing Agent specialized in generating comprehensive tests for code.

Your responsibilities:
1. Analyze the code and identify test cases
2. Generate unit tests covering edge cases
3. Generate integration tests if needed
4. Ensure tests validate the requirements
5. Use appropriate testing frameworks (Jest, Mocha, etc.)

Output your analysis in JSON format:
{
 "testsGenerated": [
 {
 "name": "test name",
 "description": "what this test validates",
 "code": "complete test code",
 "filePath": "path/to/test/file.test.ts",
 "framework": "jest|mocha|etc"
 }
 ],
 "coverageEstimate": 85,
 "reasoning": "Explanation of test strategy",
 "suggestions": ["Additional test scenarios to consider"]
}

Generate complete, runnable tests. Include imports, setup, and teardown as needed.`;
 }

 protected async buildPrompt(context: AgentContext): Promise<string> {
 let prompt = `Generate comprehensive tests for this code:\n\n`;

 // Add the code to test
 if (context.metadata.code) {
 prompt += `**Code to Test:**\n\`\`\`${context.metadata.language || 'typescript'}\n${context.metadata.code}\n\`\`\`\n\n`;
 }

 // Add file path
 if (context.metadata.filePath) {
 prompt += `**File:** ${context.metadata.filePath}\n`;
 }

 // Add requirements
 if (context.metadata.requirements) {
 prompt += `\n**Requirements:**\n${context.metadata.requirements}\n`;
 }

 // Add existing tests for context
 if (context.metadata.existingTests) {
 prompt += `\n**Existing Tests (for reference):**\n${context.metadata.existingTests.substring(0, 1000)}\n`;
 }

 // Add testing framework preference
 const framework = context.metadata.testFramework || 'jest';
 prompt += `\n**Testing Framework:** ${framework}\n`;

 prompt += `\nGenerate comprehensive tests in JSON format.`;

 return prompt;
 }

 protected async parseResponse(response: string, context: AgentContext): Promise<TestingValidationResult> {
 try {
 const data = this.extractJSON(response) as any; // Testing agent response structure

 // Parse generated tests
 const testsGenerated: GeneratedTest[] = (data.testsGenerated || []).map((t: any) => ({
 name: t.name || 'Unnamed Test',
 description: t.description || '',
 code: t.code || '',
 filePath: t.filePath || this.generateTestFilePath(context.metadata.filePath),
 framework: t.framework || 'jest'
 }));

 // Calculate confidence
 const confidence = this.calculateConfidence(response, [
 'testsGenerated',
 'coverageEstimate',
 'test',
 'expect'
 ]);

 return {
 success: true,
 data: {
 testsGenerated,
 coverageEstimate: data.coverageEstimate || 0,
 approved: testsGenerated.length > 0
 },
 confidence,
 reasoning: data.reasoning,
 suggestions: data.suggestions || []
 };

 } catch (error) {
 logger.error('Testing agent failed to parse response:', error);

 return {
 success: false,
 data: {
 testsGenerated: [],
 approved: false
 },
 confidence: 0,
 errors: [error instanceof Error ? error.message : String(error)]
 };
 }
 }

 /**
 * Execute generated tests
 */
 async executeTests(
 tests: GeneratedTest[],
 workspaceRoot: string
 ): Promise<TestExecutionResult[]> {
 const results: TestExecutionResult[] = [];

 for (const test of tests) {
 try {
 // Write test file
 const testFilePath = path.join(workspaceRoot, test.filePath);
 const testDir = path.dirname(testFilePath);

 if (!fs.existsSync(testDir)) {
 fs.mkdirSync(testDir, { recursive: true });
 }

 fs.writeFileSync(testFilePath, test.code, 'utf8');

 // Run the test
 const command = this.getTestCommand(test.framework, test.filePath);
 const startTime = Date.now();

 const result = await this.executionEngine.execute(command, {
 workingDirectory: workspaceRoot,
 timeout: 60000 // 1 minute timeout
 });

 const duration = Date.now() - startTime;

 results.push({
 testName: test.name,
 passed: result.success,
 duration,
 error: result.success ? undefined : result.stderr,
 output: result.stdout
 });

 } catch (error) {
 results.push({
 testName: test.name,
 passed: false,
 duration: 0,
 error: error instanceof Error ? error.message : String(error)
 });
 }
 }

 return results;
 }

 /**
 * Get test command for framework
 */
 private getTestCommand(framework: string, testFilePath: string): string {
 switch (framework.toLowerCase()) {
 case 'jest':
 return `npm test -- ${testFilePath}`;
 case 'mocha':
 return `npx mocha ${testFilePath}`;
 case 'vitest':
 return `npx vitest run ${testFilePath}`;
 default:
 return `npm test -- ${testFilePath}`;
 }
 }

 /**
 * Generate test file path from source file path
 */
 private generateTestFilePath(sourceFilePath?: string): string {
 if (!sourceFilePath) {
 return 'tests/generated.test.ts';
 }

 const parsed = path.parse(sourceFilePath);
 const testFileName = `${parsed.name}.test${parsed.ext}`;

 // Check if source is in src/ directory
 if (sourceFilePath.includes('/src/')) {
 return sourceFilePath.replace('/src/', '/src/__tests__/').replace(parsed.base, testFileName);
 }

 // Otherwise, put in tests/ directory
 return path.join('tests', testFileName);
 }

 /**
 * Analyze test coverage
 */
 async analyzeCoverage(
 code: string,
 tests: GeneratedTest[]
 ): Promise<number> {
 // Simple heuristic: count functions/methods in code and tests
 const codeFunctions = this.extractFunctions(code);
 const testedFunctions = new Set<string>();

 for (const test of tests) {
 const testCode = test.code;
 for (const func of codeFunctions) {
 if (testCode.includes(func)) {
 testedFunctions.add(func);
 }
 }
 }

 if (codeFunctions.length === 0) {
 return 0;
 }

 return (testedFunctions.size / codeFunctions.length) * 100;
 }

 /**
 * Extract function names from code
 */
 private extractFunctions(code: string): string[] {
 const functions: string[] = [];

 // Match function declarations
 const functionPattern = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
 let match;
 while ((match = functionPattern.exec(code)) !== null) {
 functions.push(match[1]);
 }

 // Match arrow functions assigned to variables
 const arrowPattern = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\([^)]*\)\s*=>/g;
 while ((match = arrowPattern.exec(code)) !== null) {
 functions.push(match[1]);
 }

 // Match class methods
 const methodPattern = /(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*[:{]/g;
 while ((match = methodPattern.exec(code)) !== null) {
 if (!['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
 functions.push(match[1]);
 }
 }

 return [...new Set(functions)];
 }

 /**
 * Generate quick smoke test
 */
 generateSmokeTest(code: string, filePath: string, language: string): GeneratedTest {
 const fileName = path.basename(filePath, path.extname(filePath));
 const functions = this.extractFunctions(code);

 const testCode = `/**
 * Smoke test for ${fileName}
 * Auto-generated by Testing Agent
 */

import { ${functions.join(', ')} } from '../${fileName}';
import { createLogger } from '../utils/logger';

const logger = createLogger('TestingAgent');

describe('${fileName} - Smoke Tests', () => {
 it('should export expected functions', () => {
${functions.map(f => ` expect(typeof ${f}).toBe('function');`).join('\n')}
 });
});
`;

 return {
 name: `${fileName} Smoke Test`,
 description: 'Basic smoke test to verify exports',
 code: testCode,
 filePath: this.generateTestFilePath(filePath),
 framework: 'jest'
 };
 }
}

