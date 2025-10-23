/**
 * Advanced Pattern-Matching Test Generator
 * Learns from existing test patterns and generates high-quality tests
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ModelOrchestrator, TaskComplexity } from '../models/orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('PatternMatchingTestGenerator');
import { ArchitecturalContext } from '../context/persistentContextEngine';

export interface TestPattern {
 framework: 'jest' | 'mocha' | 'vitest' | 'pytest' | 'junit';
 patterns: {
 describePattern: string;
 itPattern: string;
 beforeEachPattern: string;
 afterEachPattern: string;
 mockPattern: string;
 assertionPattern: string;
 };
 conventions: {
 fileNaming: string;
 testLocation: string;
 importStyle: string;
 mockingStyle: string;
 };
 examples: TestExample[];
 quality: {
 averageCoverage: number;
 averageAssertions: number;
 edgeCaseHandling: boolean;
 errorHandling: boolean;
 };
}

export interface TestExample {
 sourceFile: string;
 testFile: string;
 sourceCode: string;
 testCode: string;
 coverage: number;
 assertions: number;
}

export interface GeneratedTest {
 filePath: string;
 content: string;
 framework: string;
 coverage: {
 estimated: number;
 lines: number;
 branches: number;
 functions: number;
 };
 quality: {
 score: number;
 assertions: number;
 edgeCases: number;
 errorHandling: boolean;
 mocking: boolean;
 };
 patterns: string[];
}

export interface TestGenerationOptions {
 framework?: 'jest' | 'mocha' | 'vitest' | 'pytest' | 'junit';
 coverageTarget?: number;
 includeEdgeCases?: boolean;
 includeErrorHandling?: boolean;
 includeMocking?: boolean;
 includeIntegration?: boolean;
 includeE2E?: boolean;
}

export class PatternMatchingTestGenerator {
 private patterns: Map<string, TestPattern> = new Map();
 private learnedPatterns: TestPattern[] = [];

 constructor(
 private orchestrator: ModelOrchestrator,
 private workspaceRoot: string
 ) {}

 /**
 * Learn patterns from existing tests
 */
 async learnPatterns(): Promise<void> {
 logger.info('Learning test patterns from existing tests...');

 const testFiles = await this.findTestFiles();
 logger.info(`Found ${testFiles.length} test files`);

 if (testFiles.length === 0) {
 logger.info('No existing tests found, using default patterns');
 return;
 }

 // Analyze test files to extract patterns
 const examples: TestExample[] = [];

 for (const testFile of testFiles.slice(0, 10)) { // Analyze up to 10 files
 const sourceFile = this.findSourceFile(testFile);
 if (!sourceFile) continue;

 const testCode = fs.readFileSync(testFile, 'utf-8');
 const sourceCode = fs.readFileSync(sourceFile, 'utf-8');

 examples.push({
 sourceFile,
 testFile,
 sourceCode,
 testCode,
 coverage: 0, // Will be calculated later
 assertions: this.countAssertions(testCode)
 });
 }

 if (examples.length === 0) {
 logger.info('No valid test examples found');
 return;
 }

 // Use AI to extract patterns
 const prompt = `Analyze these test examples and extract common patterns:

${examples.map((ex, i) => `
Example ${i + 1}:
Source: ${path.basename(ex.sourceFile)}
Test: ${path.basename(ex.testFile)}

Test Code:
\`\`\`
${ex.testCode.slice(0, 1000)}
\`\`\`
`).join('\n')}

Extract:
1. Test framework used
2. Describe/it patterns
3. Setup/teardown patterns
4. Mocking patterns
5. Assertion patterns
6. File naming conventions
7. Import styles

Return as JSON.`;

 try {
 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 { role: 'system', content: 'You are a test pattern analysis expert. Extract patterns from test code.' },
 { role: 'user', content: prompt }
 ],
 maxTokens: 4000
 },
 { complexity: TaskComplexity.MODERATE }
 );

 const pattern = this.parsePatternResponse(response.content, examples);
 if (pattern) {
 this.learnedPatterns.push(pattern);
 this.patterns.set(pattern.framework, pattern);
 logger.info(`Learned ${pattern.framework} patterns`);
 }
 } catch (error) {
 logger.error('Failed to learn patterns', error);
 }
 }

 /**
 * Generate tests using learned patterns
 */
 async generateTests(
 sourceFile: string,
 sourceCode: string,
 context: ArchitecturalContext,
 options: TestGenerationOptions = {}
 ): Promise<GeneratedTest[]> {
 logger.info(`Generating tests for ${sourceFile} using learned patterns...`);

 // Determine framework
 const framework = options.framework || this.detectFramework();
 const pattern = this.patterns.get(framework);

 if (!pattern) {
 logger.info(`No learned patterns for ${framework}, using basic generation`);
 return this.generateBasicTests(sourceFile, sourceCode, framework, options);
 }

 // Generate tests using learned patterns
 const prompt = `Generate comprehensive tests for this code using the learned patterns:

Source File: ${sourceFile}
Framework: ${framework}

Source Code:
\`\`\`
${sourceCode}
\`\`\`

Learned Patterns:
- Describe pattern: ${pattern.patterns.describePattern}
- It pattern: ${pattern.patterns.itPattern}
- Mock pattern: ${pattern.patterns.mockPattern}
- Assertion pattern: ${pattern.patterns.assertionPattern}

File naming: ${pattern.conventions.fileNaming}
Import style: ${pattern.conventions.importStyle}

Example tests from codebase:
${pattern.examples.slice(0, 2).map(ex => `
\`\`\`
${ex.testCode.slice(0, 500)}
\`\`\`
`).join('\n')}

Requirements:
- Coverage target: ${options.coverageTarget || 80}%
- Include edge cases: ${options.includeEdgeCases !== false}
- Include error handling: ${options.includeErrorHandling !== false}
- Include mocking: ${options.includeMocking !== false}

Generate tests that:
1. Follow the exact patterns from existing tests
2. Match the naming conventions
3. Use the same import style
4. Use the same assertion style
5. Cover all functions and branches
6. Include edge cases and error scenarios
7. Use appropriate mocking

Return as JSON:
{
 "tests": [
 {
 "filePath": "path/to/test.ts",
 "content": "test code",
 "coverage": { "estimated": 85, "lines": 100, "branches": 20, "functions": 10 },
 "quality": { "score": 90, "assertions": 15, "edgeCases": 5, "errorHandling": true, "mocking": true },
 "patterns": ["pattern1", "pattern2"]
 }
 ]
}`;

 try {
 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 { role: 'system', content: 'You are an expert test generator. Generate high-quality tests matching existing patterns.' },
 { role: 'user', content: prompt }
 ],
 maxTokens: 8000
 },
 { complexity: TaskComplexity.COMPLEX }
 );

 return this.parseTestResponse(response.content);
 } catch (error) {
 logger.error('Failed to generate tests', error);
 return [];
 }
 }

 /**
 * Find all test files in workspace
 */
 private async findTestFiles(): Promise<string[]> {
 const testFiles: string[] = [];
 const patterns = [
 '**/*.test.ts',
 '**/*.test.js',
 '**/*.spec.ts',
 '**/*.spec.js',
 '**/test_*.py',
 '**/*Test.java'
 ];

 for (const pattern of patterns) {
 const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
 testFiles.push(...files.map(f => f.fsPath));
 }

 return testFiles;
 }

 /**
 * Find source file for test file
 */
 private findSourceFile(testFile: string): string | null {
 const testDir = path.dirname(testFile);
 const testName = path.basename(testFile);

 // Remove test suffix
 const sourceName = testName
 .replace(/\.test\.(ts|js)$/, '.$1')
 .replace(/\.spec\.(ts|js)$/, '.$1')
 .replace(/^test_/, '')
 .replace(/Test\.java$/, '.java');

 // Try different locations
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

 /**
 * Count assertions in test code
 */
 private countAssertions(testCode: string): number {
 const assertionPatterns = [
 /expect\(/g,
 /assert\./g,
 /should\./g,
 /\.to\./g,
 /assertEquals/g,
 /assertTrue/g,
 /assertFalse/g
 ];

 let count = 0;
 for (const pattern of assertionPatterns) {
 const matches = testCode.match(pattern);
 if (matches) {
 count += matches.length;
 }
 }

 return count;
 }

 /**
 * Detect test framework
 */
 private detectFramework(): 'jest' | 'mocha' | 'vitest' | 'pytest' | 'junit' {
 // Check package.json
 const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
 if (fs.existsSync(packageJsonPath)) {
 const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
 const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

 if (deps.vitest) return 'vitest';
 if (deps.jest || deps['@jest/globals']) return 'jest';
 if (deps.mocha) return 'mocha';
 }

 // Check for Python
 if (fs.existsSync(path.join(this.workspaceRoot, 'pytest.ini')) ||
 fs.existsSync(path.join(this.workspaceRoot, 'setup.py'))) {
 return 'pytest';
 }

 // Default to Jest
 return 'jest';
 }

 /**
 * Parse pattern response from AI
 */
 private parsePatternResponse(content: string, examples: TestExample[]): TestPattern | null {
 try {
 const jsonMatch = content.match(/\{[\s\S]*\}/);
 if (!jsonMatch) return null;

 const parsed = JSON.parse(jsonMatch[0]);

 return {
 framework: parsed.framework || 'jest',
 patterns: parsed.patterns || {},
 conventions: parsed.conventions || {},
 examples,
 quality: parsed.quality || {
 averageCoverage: 80,
 averageAssertions: 5,
 edgeCaseHandling: true,
 errorHandling: true
 }
 };
 } catch (error) {
 logger.error('Failed to parse pattern response', error);
 return null;
 }
 }

 /**
 * Parse test response from AI
 */
 private parseTestResponse(content: string): GeneratedTest[] {
 try {
 const jsonMatch = content.match(/\{[\s\S]*\}/);
 if (!jsonMatch) return [];

 const parsed = JSON.parse(jsonMatch[0]);
 return parsed.tests || [];
 } catch (error) {
 logger.error('Failed to parse test response', error);
 return [];
 }
 }

 /**
 * Generate basic tests without learned patterns
 */
 private async generateBasicTests(
 sourceFile: string,
 sourceCode: string,
 framework: string,
 options: TestGenerationOptions
 ): Promise<GeneratedTest[]> {
 // Fallback to basic generation
 return [];
 }

 /**
 * Get learned patterns
 */
 getLearnedPatterns(): TestPattern[] {
 return this.learnedPatterns;
 }
}

