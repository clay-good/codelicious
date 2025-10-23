/**
 * Test Quality Analyzer
 * Analyzes test quality and suggests improvements
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ModelOrchestrator, TaskComplexity } from '../models/orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('TestQualityAnalyzer');

export interface TestQualityReport {
 overall: {
 score: number;
 grade: 'A' | 'B' | 'C' | 'D' | 'F';
 totalTests: number;
 totalFiles: number;
 };
 files: FileQuality[];
 issues: QualityIssue[];
 recommendations: string[];
 bestPractices: BestPractice[];
}

export interface FileQuality {
 path: string;
 score: number;
 metrics: {
 testCount: number;
 assertionCount: number;
 averageAssertionsPerTest: number;
 hasSetup: boolean;
 hasTeardown: boolean;
 hasMocking: boolean;
 hasEdgeCases: boolean;
 hasErrorHandling: boolean;
 };
 issues: QualityIssue[];
}

export interface QualityIssue {
 file: string;
 line: number;
 type: 'smell' | 'antipattern' | 'missing' | 'redundant';
 severity: 'critical' | 'high' | 'medium' | 'low';
 description: string;
 suggestion: string;
 example?: string;
}

export interface BestPractice {
 category: string;
 practice: string;
 reason: string;
 example: string;
 adopted: boolean;
}

export interface TestQualityOptions {
 includeRecommendations?: boolean;
 includeBestPractices?: boolean;
 focusFiles?: string[];
}

export class TestQualityAnalyzer {
 constructor(
 private orchestrator: ModelOrchestrator,
 private workspaceRoot: string
 ) {}

 /**
 * Analyze test quality
 */
 async analyze(options: TestQualityOptions = {}): Promise<TestQualityReport> {
 logger.info('Analyzing test quality...');

 // Find test files
 const testFiles = await this.findTestFiles(options.focusFiles);
 logger.info(`Analyzing ${testFiles.length} test files`);

 // Analyze each file
 const fileQualities: FileQuality[] = [];
 for (const file of testFiles) {
 const quality = await this.analyzeFile(file);
 if (quality) {
 fileQualities.push(quality);
 }
 }

 // Collect all issues
 const allIssues = fileQualities.flatMap(f => f.issues);

 // Calculate overall score
 const overallScore = this.calculateOverallScore(fileQualities);

 // Generate recommendations
 const recommendations = options.includeRecommendations !== false
 ? await this.generateRecommendations(fileQualities, allIssues)
 : [];

 // Identify best practices
 const bestPractices = options.includeBestPractices !== false
 ? await this.identifyBestPractices(fileQualities)
 : [];

 return {
 overall: {
 score: overallScore,
 grade: this.scoreToGrade(overallScore),
 totalTests: fileQualities.reduce((sum, f) => sum + f.metrics.testCount, 0),
 totalFiles: fileQualities.length
 },
 files: fileQualities,
 issues: allIssues.sort((a, b) => {
 const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
 return severityOrder[a.severity] - severityOrder[b.severity];
 }),
 recommendations,
 bestPractices
 };
 }

 /**
 * Find test files
 */
 private async findTestFiles(focusFiles?: string[]): Promise<string[]> {
 const testFiles: string[] = [];
 const patterns = [
 '**/*.test.ts',
 '**/*.test.js',
 '**/*.spec.ts',
 '**/*.spec.js'
 ];

 for (const pattern of patterns) {
 const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 100);
 testFiles.push(...files.map(f => f.fsPath));
 }

 if (focusFiles) {
 return testFiles.filter(f => focusFiles.some(focus => f.includes(focus)));
 }

 return testFiles;
 }

 /**
 * Analyze single test file
 */
 private async analyzeFile(filePath: string): Promise<FileQuality | null> {
 try {
 const content = fs.readFileSync(filePath, 'utf-8');

 // Calculate metrics
 const metrics = {
 testCount: this.countTests(content),
 assertionCount: this.countAssertions(content),
 averageAssertionsPerTest: 0,
 hasSetup: this.hasSetup(content),
 hasTeardown: this.hasTeardown(content),
 hasMocking: this.hasMocking(content),
 hasEdgeCases: this.hasEdgeCases(content),
 hasErrorHandling: this.hasErrorHandling(content)
 };

 metrics.averageAssertionsPerTest = metrics.testCount > 0
 ? metrics.assertionCount / metrics.testCount
 : 0;

 // Detect issues
 const issues = this.detectIssues(filePath, content, metrics);

 // Calculate score
 const score = this.calculateFileScore(metrics, issues);

 return {
 path: filePath,
 score,
 metrics,
 issues
 };
 } catch (error) {
 logger.error(`Failed to analyze ${filePath}:`, error);
 return null;
 }
 }

 /**
 * Count tests
 */
 private countTests(content: string): number {
 const patterns = [
 /\bit\s*\(/g,
 /\btest\s*\(/g,
 /\bdef\s+test_/g
 ];

 let count = 0;
 for (const pattern of patterns) {
 const matches = content.match(pattern);
 if (matches) {
 count += matches.length;
 }
 }

 return count;
 }

 /**
 * Count assertions
 */
 private countAssertions(content: string): number {
 const patterns = [
 /expect\(/g,
 /assert\./g,
 /should\./g,
 /\.to\./g,
 /assertEquals/g,
 /assertTrue/g,
 /assertFalse/g
 ];

 let count = 0;
 for (const pattern of patterns) {
 const matches = content.match(pattern);
 if (matches) {
 count += matches.length;
 }
 }

 return count;
 }

 /**
 * Check for setup
 */
 private hasSetup(content: string): boolean {
 return /beforeEach|beforeAll|setUp|@Before/.test(content);
 }

 /**
 * Check for teardown
 */
 private hasTeardown(content: string): boolean {
 return /afterEach|afterAll|tearDown|@After/.test(content);
 }

 /**
 * Check for mocking
 */
 private hasMocking(content: string): boolean {
 return /jest\.mock|sinon|mock\(|spy\(|stub\(|@Mock/.test(content);
 }

 /**
 * Check for edge cases
 */
 private hasEdgeCases(content: string): boolean {
 return /edge case|boundary|null|undefined|empty|zero|negative|maximum|minimum/i.test(content);
 }

 /**
 * Check for error handling
 */
 private hasErrorHandling(content: string): boolean {
 return /toThrow|throws|error|exception|catch|reject/i.test(content);
 }

 /**
 * Detect quality issues
 */
 private detectIssues(filePath: string, content: string, metrics: FileQuality['metrics']): QualityIssue[] {
 const issues: QualityIssue[] = [];

 // Too few assertions
 if (metrics.averageAssertionsPerTest < 1) {
 issues.push({
 file: filePath,
 line: 1,
 type: 'smell',
 severity: 'high',
 description: 'Tests have too few assertions',
 suggestion: 'Add more assertions to verify behavior thoroughly'
 });
 }

 // No setup/teardown
 if (metrics.testCount > 5 && !metrics.hasSetup) {
 issues.push({
 file: filePath,
 line: 1,
 type: 'missing',
 severity: 'medium',
 description: 'Missing setup/teardown hooks',
 suggestion: 'Add beforeEach/afterEach for test isolation'
 });
 }

 // No mocking
 if (metrics.testCount > 3 && !metrics.hasMocking) {
 issues.push({
 file: filePath,
 line: 1,
 type: 'missing',
 severity: 'medium',
 description: 'No mocking detected',
 suggestion: 'Consider mocking external dependencies'
 });
 }

 // No edge cases
 if (!metrics.hasEdgeCases) {
 issues.push({
 file: filePath,
 line: 1,
 type: 'missing',
 severity: 'high',
 description: 'No edge case testing',
 suggestion: 'Add tests for edge cases (null, empty, boundaries)'
 });
 }

 // No error handling
 if (!metrics.hasErrorHandling) {
 issues.push({
 file: filePath,
 line: 1,
 type: 'missing',
 severity: 'high',
 description: 'No error handling tests',
 suggestion: 'Add tests for error scenarios'
 });
 }

 // Test smells
 if (/\.only\(/.test(content)) {
 issues.push({
 file: filePath,
 line: 1,
 type: 'smell',
 severity: 'critical',
 description: 'Test isolation with .only()',
 suggestion: 'Remove .only() before committing'
 });
 }

 if (/\.skip\(/.test(content)) {
 issues.push({
 file: filePath,
 line: 1,
 type: 'smell',
 severity: 'high',
 description: 'Skipped tests detected',
 suggestion: 'Fix or remove skipped tests'
 });
 }

 return issues;
 }

 /**
 * Calculate file score
 */
 private calculateFileScore(metrics: FileQuality['metrics'], issues: QualityIssue[]): number {
 let score = 100;

 // Deduct for issues
 for (const issue of issues) {
 switch (issue.severity) {
 case 'critical': score -= 20; break;
 case 'high': score -= 10; break;
 case 'medium': score -= 5; break;
 case 'low': score -= 2; break;
 }
 }

 // Bonus for good practices
 if (metrics.averageAssertionsPerTest >= 2) score += 5;
 if (metrics.hasSetup && metrics.hasTeardown) score += 5;
 if (metrics.hasMocking) score += 5;
 if (metrics.hasEdgeCases) score += 5;
 if (metrics.hasErrorHandling) score += 5;

 return Math.max(0, Math.min(100, score));
 }

 /**
 * Calculate overall score
 */
 private calculateOverallScore(files: FileQuality[]): number {
 if (files.length === 0) return 0;
 return Math.round(files.reduce((sum, f) => sum + f.score, 0) / files.length);
 }

 /**
 * Convert score to grade
 */
 private scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
 if (score >= 90) return 'A';
 if (score >= 80) return 'B';
 if (score >= 70) return 'C';
 if (score >= 60) return 'D';
 return 'F';
 }

 /**
 * Generate recommendations
 */
 private async generateRecommendations(
 files: FileQuality[],
 issues: QualityIssue[]
 ): Promise<string[]> {
 const criticalIssues = issues.filter(i => i.severity === 'critical').length;
 const highIssues = issues.filter(i => i.severity === 'high').length;
 const avgScore = this.calculateOverallScore(files);

 return [
 criticalIssues > 0 ? `Fix ${criticalIssues} critical issues immediately` : null,
 highIssues > 0 ? `Address ${highIssues} high-priority issues` : null,
 avgScore < 80 ? 'Improve overall test quality to at least 80%' : null,
 'Add more edge case testing',
 'Increase assertion coverage',
 'Implement proper setup/teardown',
 'Add error handling tests',
 'Use mocking for external dependencies'
 ].filter(Boolean) as string[];
 }

 /**
 * Identify best practices
 */
 private async identifyBestPractices(files: FileQuality[]): Promise<BestPractice[]> {
 const practices: BestPractice[] = [
 {
 category: 'Assertions',
 practice: 'Multiple assertions per test',
 reason: 'Thoroughly verifies behavior',
 example: 'expect(result).toBeDefined(); expect(result.value).toBe(10);',
 adopted: files.some(f => f.metrics.averageAssertionsPerTest >= 2)
 },
 {
 category: 'Setup',
 practice: 'Use beforeEach/afterEach',
 reason: 'Ensures test isolation',
 example: 'beforeEach(() => { setup(); });',
 adopted: files.some(f => f.metrics.hasSetup)
 },
 {
 category: 'Mocking',
 practice: 'Mock external dependencies',
 reason: 'Isolates unit under test',
 example: 'jest.mock("./service");',
 adopted: files.some(f => f.metrics.hasMocking)
 },
 {
 category: 'Edge Cases',
 practice: 'Test edge cases',
 reason: 'Catches boundary errors',
 example: 'it("handles null input", ...)',
 adopted: files.some(f => f.metrics.hasEdgeCases)
 },
 {
 category: 'Error Handling',
 practice: 'Test error scenarios',
 reason: 'Ensures robust error handling',
 example: 'expect(() => fn()).toThrow();',
 adopted: files.some(f => f.metrics.hasErrorHandling)
 }
 ];

 return practices;
 }
}

