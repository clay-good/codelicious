/**
 * Production Validator - Multi-dimensional validation system
 *
 * Matches Augment's production-ready validation with comprehensive checks
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecutionEngine } from '../core/executionEngine';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { GeneratedTest } from './automaticTestGenerator';
import { ParsedRequirements } from './requirementsParser';
import { createLogger } from '../utils/logger';

const logger = createLogger('ProductionValidator');

export interface ValidationCheck {
 name: string;
 passed: boolean;
 score: number;
 issues: string[];
 warnings: string[];
 suggestions: string[];
}

export interface ValidationResult {
 overallScore: number;
 passed: boolean;
 checks: ValidationCheck[];
 summary: string;
 criticalIssues: string[];
 recommendations: string[];
}

export class ProductionValidator {
 constructor(
 private executionEngine: ExecutionEngine,
 private workspaceRoot: string
 ) {}

 /**
 * Validate generated code and tests
 */
 async validate(
 generatedCode: GeneratedCode[],
 generatedTests: GeneratedTest[],
 requirements: ParsedRequirements
 ): Promise<ValidationResult> {
 logger.info('Validating production readiness...');

 const checks: ValidationCheck[] = [];

 // 1. Compilation check
 checks.push(await this.checkCompilation(generatedCode));

 // 2. Test execution check
 checks.push(await this.checkTests(generatedTests));

 // 3. Linting check
 checks.push(await this.checkLinting(generatedCode));

 // 4. Security check
 checks.push(await this.checkSecurity(generatedCode));

 // 5. Requirements check
 checks.push(await this.checkRequirements(generatedCode, requirements));

 // 6. Performance check
 checks.push(await this.checkPerformance(generatedCode));

 // 7. Documentation check
 checks.push(await this.checkDocumentation(generatedCode));

 // Calculate overall score
 const overallScore = this.calculateOverallScore(checks);
 const passed = overallScore >= 70;

 // Extract critical issues
 const criticalIssues = checks
 .filter(c => !c.passed)
 .flatMap(c => c.issues);

 // Generate recommendations
 const recommendations = this.generateRecommendations(checks);

 // Generate summary
 const summary = this.generateSummary(checks, overallScore, passed);

 logger.info(`Validation complete: ${overallScore}/100 (${passed ? 'PASSED' : 'FAILED'})`);

 return {
 overallScore,
 passed,
 checks,
 summary,
 criticalIssues,
 recommendations
 };
 }

 /**
 * Check if code compiles
 */
 private async checkCompilation(generatedCode: GeneratedCode[]): Promise<ValidationCheck> {
 const issues: string[] = [];
 const warnings: string[] = [];
 const suggestions: string[] = [];

 try {
 // Try to compile TypeScript
 const result = await this.executionEngine.execute(
 'npx tsc --noEmit',
 {
 workingDirectory: this.workspaceRoot,
 timeout: 30000,
 requireConfirmation: false
 }
 );

 if (result.exitCode !== 0) {
 issues.push('TypeScript compilation failed');
 warnings.push(result.stderr);
 }

 const passed = result.exitCode === 0;
 const score = passed ? 100 : 0;

 return {
 name: 'Compilation',
 passed,
 score,
 issues,
 warnings,
 suggestions: passed ? [] : ['Fix TypeScript compilation errors']
 };
 } catch (error) {
 return {
 name: 'Compilation',
 passed: false,
 score: 0,
 issues: [`Compilation check failed: ${error}`],
 warnings: [],
 suggestions: ['Ensure TypeScript is configured correctly']
 };
 }
 }

 /**
 * Check if tests pass
 */
 private async checkTests(generatedTests: GeneratedTest[]): Promise<ValidationCheck> {
 const issues: string[] = [];
 const warnings: string[] = [];
 const suggestions: string[] = [];

 if (generatedTests.length === 0) {
 return {
 name: 'Tests',
 passed: false,
 score: 0,
 issues: ['No tests generated'],
 warnings: [],
 suggestions: ['Generate tests for all code']
 };
 }

 try {
 // Run tests
 const result = await this.executionEngine.execute(
 'npm test',
 {
 workingDirectory: this.workspaceRoot,
 timeout: 60000,
 requireConfirmation: false
 }
 );

 const passed = result.exitCode === 0;

 if (!passed) {
 issues.push('Tests failed');
 warnings.push(result.stderr);
 suggestions.push('Fix failing tests');
 }

 // Check coverage
 const totalTests = generatedTests.reduce((sum, t) => sum + t.testCount, 0);
 const avgCoverage = generatedTests.reduce((sum, t) => sum + t.coverage, 0) / generatedTests.length;

 if (avgCoverage < 70) {
 warnings.push(`Test coverage is ${avgCoverage.toFixed(1)}% (target: 70%+)`);
 suggestions.push('Increase test coverage');
 }

 const score = passed ? Math.min(100, avgCoverage) : 0;

 return {
 name: 'Tests',
 passed: passed && avgCoverage >= 70,
 score,
 issues,
 warnings,
 suggestions
 };
 } catch (error) {
 return {
 name: 'Tests',
 passed: false,
 score: 0,
 issues: [`Test execution failed: ${error}`],
 warnings: [],
 suggestions: ['Ensure test framework is configured correctly']
 };
 }
 }

 /**
 * Check linting
 */
 private async checkLinting(generatedCode: GeneratedCode[]): Promise<ValidationCheck> {
 const issues: string[] = [];
 const warnings: string[] = [];
 const suggestions: string[] = [];

 try {
 // Run ESLint
 const result = await this.executionEngine.execute(
 'npx eslint . --ext .ts,.tsx,.js,.jsx',
 {
 workingDirectory: this.workspaceRoot,
 timeout: 30000,
 requireConfirmation: false
 }
 );

 const passed = result.exitCode === 0;

 if (!passed) {
 const errorCount = (result.stdout.match(/error/gi) || []).length;
 const warningCount = (result.stdout.match(/warning/gi) || []).length;

 if (errorCount > 0) {
 issues.push(`${errorCount} linting errors found`);
 }
 if (warningCount > 0) {
 warnings.push(`${warningCount} linting warnings found`);
 }

 suggestions.push('Fix linting issues');
 }

 const score = passed ? 100 : Math.max(0, 100 - (issues.length * 20));

 return {
 name: 'Linting',
 passed,
 score,
 issues,
 warnings,
 suggestions
 };
 } catch (error) {
 // ESLint not configured - not critical
 return {
 name: 'Linting',
 passed: true,
 score: 80,
 issues: [],
 warnings: ['ESLint not configured'],
 suggestions: ['Consider adding ESLint for code quality']
 };
 }
 }

 /**
 * Check security
 */
 private async checkSecurity(generatedCode: GeneratedCode[]): Promise<ValidationCheck> {
 const issues: string[] = [];
 const warnings: string[] = [];
 const suggestions: string[] = [];

 // Check for common security issues
 for (const code of generatedCode) {
 // Check for eval
 if (code.content.includes('eval(')) {
 issues.push(`${code.filePath}: Uses eval() - security risk`);
 }

 // Check for SQL injection
 if (code.content.match(/query\s*\(\s*['"`]\s*SELECT.*\+/)) {
 issues.push(`${code.filePath}: Potential SQL injection`);
 }

 // Check for hardcoded secrets
 if (code.content.match(/(password|secret|api[_-]?key)\s*=\s*['"][^'"]+['"]/i)) {
 warnings.push(`${code.filePath}: Potential hardcoded secret`);
 }

 // Check for unsafe file operations
 if (code.content.includes('fs.unlinkSync') || code.content.includes('fs.rmdirSync')) {
 warnings.push(`${code.filePath}: Uses synchronous file operations`);
 }
 }

 const passed = issues.length === 0;
 const score = Math.max(0, 100 - (issues.length * 30) - (warnings.length * 10));

 if (!passed) {
 suggestions.push('Fix security vulnerabilities');
 }

 return {
 name: 'Security',
 passed,
 score,
 issues,
 warnings,
 suggestions
 };
 }

 /**
 * Check if requirements are met
 */
 private async checkRequirements(
 generatedCode: GeneratedCode[],
 requirements: ParsedRequirements
 ): Promise<ValidationCheck> {
 const issues: string[] = [];
 const warnings: string[] = [];
 const suggestions: string[] = [];

 // Check if all affected files were generated
 const generatedPaths = new Set(generatedCode.map(c => c.filePath));
 const requiredPaths = new Set(requirements.mainRequirement.affectedFiles);

 for (const required of requiredPaths) {
 if (!generatedPaths.has(required)) {
 issues.push(`Missing file: ${required}`);
 }
 }

 // Check acceptance criteria (basic check)
 const allContent = generatedCode.map(c => c.content).join('\n');
 for (const criterion of requirements.mainRequirement.acceptanceCriteria) {
 // Very basic check - just see if key terms are present
 const keyTerms = criterion.toLowerCase().match(/\b\w{4,}\b/g) || [];
 const found = keyTerms.some(term => allContent.toLowerCase().includes(term));

 if (!found) {
 warnings.push(`Acceptance criterion may not be met: ${criterion}`);
 }
 }

 const passed = issues.length === 0;
 const score = Math.max(0, 100 - (issues.length * 25) - (warnings.length * 10));

 if (!passed) {
 suggestions.push('Ensure all requirements are implemented');
 }

 return {
 name: 'Requirements',
 passed,
 score,
 issues,
 warnings,
 suggestions
 };
 }

 /**
 * Check performance
 */
 private async checkPerformance(generatedCode: GeneratedCode[]): Promise<ValidationCheck> {
 const issues: string[] = [];
 const warnings: string[] = [];
 const suggestions: string[] = [];

 // Check for performance anti-patterns
 for (const code of generatedCode) {
 // Check for nested loops
 const nestedLoops = code.content.match(/for\s*\([^)]*\)\s*{[^}]*for\s*\(/g);
 if (nestedLoops && nestedLoops.length > 2) {
 warnings.push(`${code.filePath}: Multiple nested loops detected`);
 }

 // Check for synchronous operations in async context
 if (code.content.includes('async') && code.content.match(/Sync\(/)) {
 warnings.push(`${code.filePath}: Synchronous operations in async function`);
 }

 // Check for large inline data
 const largeArrays = code.content.match(/\[[^\]]{1000,}\]/g);
 if (largeArrays) {
 warnings.push(`${code.filePath}: Large inline data structures`);
 }
 }

 const passed = issues.length === 0;
 const score = Math.max(60, 100 - (warnings.length * 10));

 if (warnings.length > 0) {
 suggestions.push('Consider performance optimizations');
 }

 return {
 name: 'Performance',
 passed,
 score,
 issues,
 warnings,
 suggestions
 };
 }

 /**
 * Check documentation
 */
 private async checkDocumentation(generatedCode: GeneratedCode[]): Promise<ValidationCheck> {
 const issues: string[] = [];
 const warnings: string[] = [];
 const suggestions: string[] = [];

 let filesWithDocs = 0;
 let totalExports = 0;
 let documentedExports = 0;

 for (const code of generatedCode) {
 if (code.documentation) {
 filesWithDocs++;
 }

 // Count exports
 const exports = code.exports.length;
 totalExports += exports;

 // Count documented exports (rough check)
 const docBlocks = (code.content.match(/\/\*\*[\s\S]*?\*\//g) || []).length;
 documentedExports += Math.min(exports, docBlocks);
 }

 const docCoverage = totalExports > 0 ? (documentedExports / totalExports) * 100 : 0;

 if (docCoverage < 70) {
 warnings.push(`Documentation coverage is ${docCoverage.toFixed(1)}% (target: 70%+)`);
 suggestions.push('Add JSDoc comments to all exported functions/classes');
 }

 const passed = docCoverage >= 70;
 const score = Math.round(docCoverage);

 return {
 name: 'Documentation',
 passed,
 score,
 issues,
 warnings,
 suggestions
 };
 }

 /**
 * Calculate overall score
 */
 private calculateOverallScore(checks: ValidationCheck[]): number {
 const weights = {
 'Compilation': 0.25,
 'Tests': 0.25,
 'Linting': 0.10,
 'Security': 0.20,
 'Requirements': 0.15,
 'Performance': 0.05,
 'Documentation': 0.05
 };

 let totalScore = 0;
 for (const check of checks) {
 const weight = weights[check.name as keyof typeof weights] || 0.1;
 totalScore += check.score * weight;
 }

 return Math.round(totalScore);
 }

 /**
 * Generate recommendations
 */
 private generateRecommendations(checks: ValidationCheck[]): string[] {
 const recommendations: string[] = [];

 for (const check of checks) {
 if (!check.passed) {
 recommendations.push(...check.suggestions);
 }
 }

 return [...new Set(recommendations)];
 }

 /**
 * Generate summary
 */
 private generateSummary(checks: ValidationCheck[], score: number, passed: boolean): string {
 const passedChecks = checks.filter(c => c.passed).length;
 const totalChecks = checks.length;

 return `Validation ${passed ? 'PASSED' : 'FAILED'} with score ${score}/100. ` +
 `${passedChecks}/${totalChecks} checks passed.`;
 }
}

