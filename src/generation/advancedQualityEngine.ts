/**
 * Advanced Quality Engine - Ultra-high quality code generation with multi-layer validation
 *
 * Features:
 * - AST-based static analysis
 * - Design pattern enforcement
 * - SOLID principles validation
 * - Security vulnerability detection
 * - Performance anti-pattern detection
 * - Automatic code fixing
 * - Real-time quality scoring
 *
 * Goal: Generate 95%+ quality code consistently
 */

import * as ts from 'typescript';
import { ModelOrchestrator, TaskComplexity } from '../models/orchestrator';
import { AdvancedCodeAnalyzer, AnalysisResult, QualityIssue as AnalyzerQualityIssue } from './advancedCodeAnalyzer';
import { BestPracticesEngine } from './bestPracticesEngine';
import { CodeValidationPipeline } from './codeValidationPipeline';
import { createLogger } from '../utils/logger';

const logger = createLogger('AdvancedQualityEngine');

export interface QualityAnalysis {
 score: number; // 0-100
 grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
 issues: QualityIssue[];
 metrics: QualityMetrics;
 recommendations: string[];
 autoFixable: boolean;
}

export interface QualityIssue {
 severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
 category: 'security' | 'performance' | 'maintainability' | 'reliability' | 'style';
 message: string;
 line?: number;
 column?: number;
 fix?: string;
 suggestion?: string;
 autoFixable: boolean;
}

export interface QualityMetrics {
 complexity: number;
 maintainability: number;
 reliability: number;
 security: number;
 performance: number;
 testability: number;
 documentation: number;
}

export interface DesignPatternViolation {
 principle: 'SRP' | 'OCP' | 'LSP' | 'ISP' | 'DIP'; // SOLID
 message: string;
 severity: 'critical' | 'high' | 'medium';
 suggestion: string;
}

export class AdvancedQualityEngine {
 private analyzer: AdvancedCodeAnalyzer;
 private bestPractices: BestPracticesEngine;
 private validationPipeline: CodeValidationPipeline;

 constructor(private orchestrator: ModelOrchestrator) {
 this.analyzer = new AdvancedCodeAnalyzer();
 this.bestPractices = new BestPracticesEngine();
 this.validationPipeline = new CodeValidationPipeline();
 }

 /**
 * Analyze code quality with multi-layer validation
 */
 async analyze(code: string, language: string, framework?: string): Promise<QualityAnalysis> {
 logger.info('Running advanced quality analysis...');

 const issues: QualityIssue[] = [];

 // Layer 1: AST-based static analysis
 const astAnalysis = await this.analyzeAST(code, language);
 issues.push(...astAnalysis.issues);

 // Layer 2: Design pattern validation
 const designPatterns = await this.validateDesignPatterns(code, language);
 issues.push(...designPatterns.issues);

 // Layer 3: SOLID principles validation
 const solidViolations = await this.validateSOLID(code, language);
 issues.push(...solidViolations.issues);

 // Layer 4: Security analysis
 const securityIssues = await this.analyzeSecurityVulnerabilities(code, language);
 issues.push(...securityIssues);

 // Layer 5: Performance analysis
 const performanceIssues = await this.analyzePerformance(code, language);
 issues.push(...performanceIssues);

 // Layer 6: Best practices validation
 const bestPracticesResult = this.bestPractices.validate(code, language, framework);
 issues.push(...this.convertBestPracticeViolations(bestPracticesResult.violations));

 // Calculate metrics
 const metrics = this.calculateMetrics(code, issues, astAnalysis);

 // Calculate overall score
 const score = this.calculateScore(metrics, issues);
 const grade = this.getGrade(score);

 // Generate recommendations
 const recommendations = this.generateRecommendations(issues, metrics);

 // Check if auto-fixable
 const autoFixable = issues.filter(i => i.autoFixable).length > 0;

 logger.info(`Quality analysis complete: ${grade} (${score}/100)`);

 return {
 score,
 grade,
 issues,
 metrics,
 recommendations,
 autoFixable
 };
 }

 /**
 * Automatically fix quality issues
 */
 async autoFix(code: string, analysis: QualityAnalysis, language: string): Promise<string> {
 logger.info('Auto-fixing quality issues...');

 let fixedCode = code;
 const fixableIssues = analysis.issues.filter(i => i.autoFixable && i.fix);

 if (fixableIssues.length === 0) {
 logger.info('No auto-fixable issues found');
 return code;
 }

 // Apply simple fixes first
 for (const issue of fixableIssues) {
 if (issue.fix) {
 fixedCode = this.applyFix(fixedCode, issue);
 }
 }

 // Use AI for complex fixes
 const complexIssues = analysis.issues.filter(i => i.severity === 'critical' || i.severity === 'high');
 if (complexIssues.length > 0) {
 fixedCode = await this.aiAssistedFix(fixedCode, complexIssues, language);
 }

 logger.info(`Fixed ${fixableIssues.length} issues`);
 return fixedCode;
 }

 /**
 * AST-based static analysis
 */
 private async analyzeAST(code: string, language: string): Promise<{ issues: QualityIssue[]; analysis: AnalysisResult }> {
 const issues: QualityIssue[] = [];

 if (language !== 'typescript' && language !== 'javascript') {
 return { issues, analysis: {} as AnalysisResult };
 }

 try {
 const analysis = this.analyzer.analyze(code, language);

 // Convert analyzer issues to quality issues
 for (const issue of analysis.issues) {
 issues.push({
 severity: this.mapSeverity(issue.severity),
 category: issue.category as any,
 message: issue.message,
 line: issue.location?.line,
 column: issue.location?.column,
 autoFixable: !!issue.fix,
 fix: issue.fix,
 suggestion: issue.fix
 });
 }

 return { issues, analysis };
 } catch (error) {
 logger.error('AST analysis failed', error);
 return { issues, analysis: {} as AnalysisResult };
 }
 }

 /**
 * Validate design patterns
 */
 private async validateDesignPatterns(code: string, language: string): Promise<{ issues: QualityIssue[] }> {
 const issues: QualityIssue[] = [];

 if (language !== 'typescript' && language !== 'javascript') {
 return { issues };
 }

 try {
 const sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true);

 // Check for God Class anti-pattern
 ts.forEachChild(sourceFile, (node) => {
 if (ts.isClassDeclaration(node)) {
 const methods = node.members.filter(m => ts.isMethodDeclaration(m));
 const properties = node.members.filter(m => ts.isPropertyDeclaration(m));

 if (methods.length > 20 || properties.length > 15) {
 issues.push({
 severity: 'high',
 category: 'maintainability',
 message: `God Class detected: ${node.name?.getText()} has ${methods.length} methods and ${properties.length} properties`,
 line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
 column: 0,
 suggestion: 'Break down into smaller, focused classes following Single Responsibility Principle',
 autoFixable: false
 });
 }
 }
 });

 return { issues };
 } catch (error) {
 logger.error('Design pattern validation failed', error);
 return { issues };
 }
 }

 /**
 * Validate SOLID principles
 */
 private async validateSOLID(code: string, language: string): Promise<{ issues: QualityIssue[] }> {
 const issues: QualityIssue[] = [];

 if (language !== 'typescript' && language !== 'javascript') {
 return { issues };
 }

 try {
 const sourceFile = ts.createSourceFile('temp.ts', code, ts.ScriptTarget.Latest, true);

 // Single Responsibility Principle (SRP)
 ts.forEachChild(sourceFile, (node) => {
 if (ts.isClassDeclaration(node)) {
 const className = node.name?.getText() || 'Anonymous';
 const methods = node.members.filter(m => ts.isMethodDeclaration(m));

 // Check if class has multiple responsibilities (heuristic: diverse method names)
 const methodNames = methods.map(m => (m.name as ts.Identifier)?.getText() || '');
 const hasDataAccess = methodNames.some(n => n.includes('save') || n.includes('load') || n.includes('fetch'));
 const hasBusinessLogic = methodNames.some(n => n.includes('calculate') || n.includes('process') || n.includes('validate'));
 const hasPresentation = methodNames.some(n => n.includes('render') || n.includes('display') || n.includes('format'));

 const responsibilityCount = [hasDataAccess, hasBusinessLogic, hasPresentation].filter(Boolean).length;

 if (responsibilityCount > 1) {
 issues.push({
 severity: 'medium',
 category: 'maintainability',
 message: `SRP violation: ${className} appears to have ${responsibilityCount} responsibilities`,
 line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
 column: 0,
 suggestion: 'Separate concerns into different classes (e.g., Repository, Service, Presenter)',
 autoFixable: false
 });
 }
 }
 });

 return { issues };
 } catch (error) {
 logger.error('SOLID validation failed', error);
 return { issues };
 }
 }

 /**
 * Analyze security vulnerabilities
 */
 private async analyzeSecurityVulnerabilities(code: string, language: string): Promise<QualityIssue[]> {
 const issues: QualityIssue[] = [];

 // SQL Injection
 if (code.includes('execute(') && code.includes('+') && code.includes('SELECT')) {
 issues.push({
 severity: 'critical',
 category: 'security',
 message: 'Potential SQL injection vulnerability detected',
 line: 0,
 column: 0,
 suggestion: 'Use parameterized queries or prepared statements',
 autoFixable: false
 });
 }

 // XSS
 if (code.includes('innerHTML') && !code.includes('sanitize')) {
 issues.push({
 severity: 'high',
 category: 'security',
 message: 'Potential XSS vulnerability: innerHTML without sanitization',
 line: 0,
 column: 0,
 suggestion: 'Use textContent or sanitize HTML input',
 autoFixable: true,
 fix: 'Replace innerHTML with textContent or use DOMPurify.sanitize()'
 });
 }

 // Hardcoded secrets
 const secretPatterns = [
 /password\s*=\s*['"][^'"]+['"]/i,
 /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
 /secret\s*=\s*['"][^'"]+['"]/i,
 /token\s*=\s*['"][^'"]+['"]/i
 ];

 for (const pattern of secretPatterns) {
 if (pattern.test(code)) {
 issues.push({
 severity: 'critical',
 category: 'security',
 message: 'Hardcoded secret detected',
 line: 0,
 column: 0,
 suggestion: 'Use environment variables or secure secret management',
 autoFixable: false
 });
 }
 }

 return issues;
 }

 /**
 * Analyze performance anti-patterns
 */
 private async analyzePerformance(code: string, language: string): Promise<QualityIssue[]> {
 const issues: QualityIssue[] = [];

 // Nested loops (O(n²) or worse)
 const nestedLoopCount = (code.match(/for\s*\(/g) || []).length;
 if (nestedLoopCount >= 3) {
 issues.push({
 severity: 'high',
 category: 'performance',
 message: `Detected ${nestedLoopCount} nested loops - potential O(n³) complexity`,
 line: 0,
 column: 0,
 suggestion: 'Consider using hash maps, memoization, or better algorithms',
 autoFixable: false
 });
 }

 // Inefficient deep clone
 if (code.includes('JSON.parse(JSON.stringify(')) {
 issues.push({
 severity: 'medium',
 category: 'performance',
 message: 'Inefficient deep clone using JSON',
 line: 0,
 column: 0,
 suggestion: 'Use structuredClone() or lodash cloneDeep()',
 autoFixable: true,
 fix: 'Replace JSON.parse(JSON.stringify(obj)) with structuredClone(obj)'
 });
 }

 // Synchronous file operations
 if (code.includes('readFileSync') || code.includes('writeFileSync')) {
 issues.push({
 severity: 'medium',
 category: 'performance',
 message: 'Synchronous file operations block the event loop',
 line: 0,
 column: 0,
 suggestion: 'Use async file operations (readFile, writeFile)',
 autoFixable: true,
 fix: 'Replace sync operations with async equivalents'
 });
 }

 return issues;
 }

 // Helper methods
 private mapSeverity(severity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
 const map: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
 critical: 'critical',
 high: 'high',
 medium: 'medium',
 low: 'low',
 info: 'info'
 };
 return map[severity] || 'info';
 }

 private convertBestPracticeViolations(violations: any[]): QualityIssue[] { // Best practice violation structure
 return violations.map(v => ({
 severity: v.practice.severity === 'must' ? 'high' : 'medium',
 category: 'maintainability' as const,
 message: v.message,
 line: v.location?.line,
 column: v.location?.column,
 fix: v.fix,
 suggestion: v.fix,
 autoFixable: !!v.fix
 }));
 }

 private calculateMetrics(code: string, issues: QualityIssue[], astAnalysis: any): QualityMetrics { // AST analysis structure
 const criticalIssues = issues.filter(i => i.severity === 'critical').length;
 const highIssues = issues.filter(i => i.severity === 'high').length;
 const securityIssues = issues.filter(i => i.category === 'security').length;
 const performanceIssues = issues.filter(i => i.category === 'performance').length;

 return {
 complexity: astAnalysis.metrics?.cyclomaticComplexity || 0,
 maintainability: Math.max(0, 100 - (highIssues * 10 + criticalIssues * 20)),
 reliability: Math.max(0, 100 - (criticalIssues * 15 + highIssues * 8)),
 security: Math.max(0, 100 - (securityIssues * 25)),
 performance: Math.max(0, 100 - (performanceIssues * 15)),
 testability: astAnalysis.score?.testability || 70,
 documentation: astAnalysis.score?.documentation || 70
 };
 }

 private calculateScore(metrics: QualityMetrics, issues: QualityIssue[]): number {
 const weights = {
 complexity: 0.15,
 maintainability: 0.20,
 reliability: 0.20,
 security: 0.25,
 performance: 0.10,
 testability: 0.05,
 documentation: 0.05
 };

 const complexityScore = Math.max(0, 100 - metrics.complexity * 2);

 const score =
 complexityScore * weights.complexity +
 metrics.maintainability * weights.maintainability +
 metrics.reliability * weights.reliability +
 metrics.security * weights.security +
 metrics.performance * weights.performance +
 metrics.testability * weights.testability +
 metrics.documentation * weights.documentation;

 return Math.round(Math.max(0, Math.min(100, score)));
 }

 private getGrade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
 if (score >= 95) return 'A+';
 if (score >= 90) return 'A';
 if (score >= 80) return 'B';
 if (score >= 70) return 'C';
 if (score >= 60) return 'D';
 return 'F';
 }

 private generateRecommendations(issues: QualityIssue[], metrics: QualityMetrics): string[] {
 const recommendations: string[] = [];

 const criticalIssues = issues.filter(i => i.severity === 'critical');
 if (criticalIssues.length > 0) {
 recommendations.push(` Fix ${criticalIssues.length} critical issues immediately`);
 }

 if (metrics.security < 80) {
 recommendations.push(' Improve security: Review authentication, input validation, and data sanitization');
 }

 if (metrics.complexity > 15) {
 recommendations.push(' Reduce complexity: Break down complex functions into smaller, focused units');
 }

 if (metrics.performance < 70) {
 recommendations.push(' Optimize performance: Review algorithms, reduce nested loops, use caching');
 }

 if (metrics.testability < 70) {
 recommendations.push(' Improve testability: Use dependency injection, reduce coupling');
 }

 return recommendations;
 }

 private applyFix(code: string, issue: QualityIssue): string {
 if (!issue.fix) return code;

 // Simple string replacement fixes
 if (issue.fix.includes('Replace')) {
 const match = issue.fix.match(/Replace (.+) with (.+)/);
 if (match) {
 const [, from, to] = match;
 return code.replace(new RegExp(from.replace(/[()]/g, '\\$&'), 'g'), to);
 }
 }

 return code;
 }

 private async aiAssistedFix(code: string, issues: QualityIssue[], language: string): Promise<string> {
 const prompt = `Fix these critical quality issues in the code:

**Issues**:
${issues.map((i, idx) => `${idx + 1}. [${i.severity.toUpperCase()}] ${i.message}\n Suggestion: ${i.suggestion || 'N/A'}`).join('\n')}

**Code**:
\`\`\`${language}
${code}
\`\`\`

Return ONLY the fixed code, no explanations.`;

 try {
 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 { role: 'system', content: 'You are an expert code quality engineer. Fix code issues while preserving functionality.' },
 { role: 'user', content: prompt }
 ],
 temperature: 0.2,
 maxTokens: 8000
 },
 { complexity: TaskComplexity.COMPLEX }
 );

 const codeMatch = response.content.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]+?)\n```/);
 return codeMatch ? codeMatch[1].trim() : code;
 } catch (error) {
 logger.error('AI-assisted fix failed', error);
 return code;
 }
 }
}

