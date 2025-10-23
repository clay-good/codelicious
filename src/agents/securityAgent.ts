/**
 * Security Review Agent
 *
 * Reviews generated code for security vulnerabilities, correctness, and performance issues.
 * Provides recommendations for improvements.
 */

import { BaseAgent } from './baseAgent';
import { ModelOrchestrator } from '../models/orchestrator';
import {
 AgentRole,
 AgentContext,
 AgentTaskResult,
 AgentConfig,
 SecurityReviewResult,
 SecurityVulnerability,
 QualityReviewResult,
 QualityIssue
} from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('SecurityAgent');

export class SecurityReviewAgent extends BaseAgent {
 constructor(
 orchestrator: ModelOrchestrator,
 config: Partial<AgentConfig> = {}
 ) {
 super(
 AgentRole.SECURITY_REVIEWER,
 orchestrator,
 {
 role: AgentRole.SECURITY_REVIEWER,
 enabled: true,
 temperature: 0.2, // Lower temperature for more consistent security analysis
 maxTokens: 3000,
 ...config
 }
 );
 }

 protected getDefaultSystemPrompt(): string {
 return `You are a Security Review Agent specialized in identifying security vulnerabilities and code quality issues.

Your responsibilities:
1. Analyze code for security vulnerabilities (SQL injection, XSS, CSRF, etc.)
2. Check for common security anti-patterns
3. Identify performance issues
4. Review code correctness and maintainability
5. Provide actionable recommendations

Output your analysis in JSON format:
{
 "vulnerabilities": [
 {
 "severity": "low|medium|high|critical",
 "type": "vulnerability type",
 "description": "detailed description",
 "location": {"file": "path", "line": 10},
 "recommendation": "how to fix",
 "cwe": "CWE-XXX (if applicable)"
 }
 ],
 "qualityIssues": [
 {
 "severity": "low|medium|high",
 "category": "performance|maintainability|correctness|style|complexity",
 "description": "issue description",
 "location": {"file": "path", "line": 10},
 "recommendation": "how to improve"
 }
 ],
 "securityScore": 85,
 "qualityScore": 90,
 "approved": true,
 "reasoning": "Overall assessment",
 "recommendations": ["List of general recommendations"]
}

Be thorough but practical. Focus on real security risks and significant quality issues.`;
 }

 protected async buildPrompt(context: AgentContext): Promise<string> {
 let prompt = `Review this code for security vulnerabilities and quality issues:\n\n`;

 // Add the code to review
 if (context.metadata.code) {
 prompt += `**Code:**\n\`\`\`${context.metadata.language || 'typescript'}\n${context.metadata.code}\n\`\`\`\n\n`;
 }

 // Add file path if available
 if (context.metadata.filePath) {
 prompt += `**File:** ${context.metadata.filePath}\n`;
 }

 // Add context about the codebase
 if (context.codebaseContext) {
 prompt += `\n**Codebase Context:**\n${context.codebaseContext.substring(0, 1000)}\n`;
 }

 // Add dependencies for security analysis
 if (context.dependencies && context.dependencies.length > 0) {
 prompt += `\n**Dependencies:**\n${context.dependencies.join(', ')}\n`;
 }

 prompt += `\nProvide a comprehensive security and quality review in JSON format.`;

 return prompt;
 }

 protected async parseResponse(response: string, context: AgentContext): Promise<SecurityReviewResult> {
 try {
 const data = this.extractJSON(response) as any; // Security agent response structure

 // Parse vulnerabilities
 const vulnerabilities: SecurityVulnerability[] = (data.vulnerabilities || []).map((v: any) => ({
 severity: v.severity || 'medium',
 type: v.type || 'Unknown',
 description: v.description || '',
 location: v.location,
 recommendation: v.recommendation || '',
 cwe: v.cwe
 }));

 // Parse quality issues
 const qualityIssues: QualityIssue[] = (data.qualityIssues || []).map((q: any) => ({
 severity: q.severity || 'medium',
 category: q.category || 'correctness',
 description: q.description || '',
 location: q.location,
 recommendation: q.recommendation || ''
 }));

 // Calculate scores
 const securityScore = data.securityScore || this.calculateSecurityScore(vulnerabilities);
 const qualityScore = data.qualityScore || this.calculateQualityScore(qualityIssues);

 // Determine if approved (no critical vulnerabilities, score > 70)
 const hasCriticalVulnerabilities = vulnerabilities.some(v => v.severity === 'critical');
 const approved = !hasCriticalVulnerabilities && securityScore >= 70 && qualityScore >= 70;

 // Calculate confidence
 const confidence = this.calculateConfidence(response, [
 'vulnerabilities',
 'securityScore',
 'qualityScore',
 'recommendation'
 ]);

 return {
 success: true,
 data: {
 vulnerabilities,
 securityScore,
 recommendations: data.recommendations || [],
 approved
 },
 confidence,
 reasoning: data.reasoning,
 warnings: qualityIssues.filter(q => q.severity === 'high').map(q => q.description)
 };

 } catch (error) {
 logger.error('Security review agent failed to parse response:', error);

 return {
 success: false,
 data: {
 vulnerabilities: [],
 securityScore: 0,
 recommendations: [],
 approved: false
 },
 confidence: 0,
 errors: [error instanceof Error ? error.message : String(error)]
 };
 }
 }

 /**
 * Calculate security score based on vulnerabilities
 */
 private calculateSecurityScore(vulnerabilities: SecurityVulnerability[]): number {
 if (vulnerabilities.length === 0) {
 return 100;
 }

 let score = 100;

 for (const vuln of vulnerabilities) {
 switch (vuln.severity) {
 case 'critical':
 score -= 30;
 break;
 case 'high':
 score -= 20;
 break;
 case 'medium':
 score -= 10;
 break;
 case 'low':
 score -= 5;
 break;
 }
 }

 return Math.max(0, score);
 }

 /**
 * Calculate quality score based on issues
 */
 private calculateQualityScore(issues: QualityIssue[]): number {
 if (issues.length === 0) {
 return 100;
 }

 let score = 100;

 for (const issue of issues) {
 switch (issue.severity) {
 case 'high':
 score -= 15;
 break;
 case 'medium':
 score -= 10;
 break;
 case 'low':
 score -= 5;
 break;
 }
 }

 return Math.max(0, score);
 }

 /**
 * Quick security check without full AI call
 */
 async quickSecurityCheck(code: string, language: string): Promise<string[]> {
 const issues: string[] = [];

 // Basic pattern matching for common vulnerabilities
 const patterns = [
 { pattern: /eval\s*\(/gi, issue: 'Use of eval() is dangerous' },
 { pattern: /innerHTML\s*=/gi, issue: 'Direct innerHTML assignment can lead to XSS' },
 { pattern: /document\.write\s*\(/gi, issue: 'document.write() can be exploited' },
 { pattern: /exec\s*\(/gi, issue: 'Use of exec() can be dangerous' },
 { pattern: /password\s*=\s*["'][^"']+["']/gi, issue: 'Hardcoded password detected' },
 { pattern: /api[_-]?key\s*=\s*["'][^"']+["']/gi, issue: 'Hardcoded API key detected' },
 { pattern: /SELECT\s+\*\s+FROM.*\+/gi, issue: 'Possible SQL injection vulnerability' }
 ];

 for (const { pattern, issue } of patterns) {
 if (pattern.test(code)) {
 issues.push(issue);
 }
 }

 return issues;
 }

 /**
 * Check for common anti-patterns
 */
 checkAntiPatterns(code: string): string[] {
 const antiPatterns: string[] = [];

 // Check for console.log in production code
 if (/console\.log\(/gi.test(code)) {
 antiPatterns.push('logger.info() statements should be removed in production');
 }

 // Check for TODO comments
 if (/\/\/\s*TODO/gi.test(code)) {
 antiPatterns.push('TODO comments indicate incomplete code');
 }

 // Check for empty catch blocks
 if (/catch\s*\([^)]*\)\s*\{\s*\}/gi.test(code)) {
 antiPatterns.push('Empty catch blocks hide errors');
 }

 // Check for magic numbers
 const magicNumberPattern = /[^a-zA-Z_]\d{2,}[^a-zA-Z_]/g;
 if (magicNumberPattern.test(code)) {
 antiPatterns.push('Consider using named constants instead of magic numbers');
 }

 return antiPatterns;
 }
}

