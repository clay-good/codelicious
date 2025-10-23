"use strict";
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
exports.AdvancedQualityEngine = void 0;
const ts = __importStar(require("typescript"));
const orchestrator_1 = require("../models/orchestrator");
const advancedCodeAnalyzer_1 = require("./advancedCodeAnalyzer");
const bestPracticesEngine_1 = require("./bestPracticesEngine");
const codeValidationPipeline_1 = require("./codeValidationPipeline");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AdvancedQualityEngine');
class AdvancedQualityEngine {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
        this.analyzer = new advancedCodeAnalyzer_1.AdvancedCodeAnalyzer();
        this.bestPractices = new bestPracticesEngine_1.BestPracticesEngine();
        this.validationPipeline = new codeValidationPipeline_1.CodeValidationPipeline();
    }
    /**
    * Analyze code quality with multi-layer validation
    */
    async analyze(code, language, framework) {
        logger.info('Running advanced quality analysis...');
        const issues = [];
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
    async autoFix(code, analysis, language) {
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
    async analyzeAST(code, language) {
        const issues = [];
        if (language !== 'typescript' && language !== 'javascript') {
            return { issues, analysis: {} };
        }
        try {
            const analysis = this.analyzer.analyze(code, language);
            // Convert analyzer issues to quality issues
            for (const issue of analysis.issues) {
                issues.push({
                    severity: this.mapSeverity(issue.severity),
                    category: issue.category,
                    message: issue.message,
                    line: issue.location?.line,
                    column: issue.location?.column,
                    autoFixable: !!issue.fix,
                    fix: issue.fix,
                    suggestion: issue.fix
                });
            }
            return { issues, analysis };
        }
        catch (error) {
            logger.error('AST analysis failed', error);
            return { issues, analysis: {} };
        }
    }
    /**
    * Validate design patterns
    */
    async validateDesignPatterns(code, language) {
        const issues = [];
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
        }
        catch (error) {
            logger.error('Design pattern validation failed', error);
            return { issues };
        }
    }
    /**
    * Validate SOLID principles
    */
    async validateSOLID(code, language) {
        const issues = [];
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
                    const methodNames = methods.map(m => m.name?.getText() || '');
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
        }
        catch (error) {
            logger.error('SOLID validation failed', error);
            return { issues };
        }
    }
    /**
    * Analyze security vulnerabilities
    */
    async analyzeSecurityVulnerabilities(code, language) {
        const issues = [];
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
    async analyzePerformance(code, language) {
        const issues = [];
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
    mapSeverity(severity) {
        const map = {
            critical: 'critical',
            high: 'high',
            medium: 'medium',
            low: 'low',
            info: 'info'
        };
        return map[severity] || 'info';
    }
    convertBestPracticeViolations(violations) {
        return violations.map(v => ({
            severity: v.practice.severity === 'must' ? 'high' : 'medium',
            category: 'maintainability',
            message: v.message,
            line: v.location?.line,
            column: v.location?.column,
            fix: v.fix,
            suggestion: v.fix,
            autoFixable: !!v.fix
        }));
    }
    calculateMetrics(code, issues, astAnalysis) {
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
    calculateScore(metrics, issues) {
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
        const score = complexityScore * weights.complexity +
            metrics.maintainability * weights.maintainability +
            metrics.reliability * weights.reliability +
            metrics.security * weights.security +
            metrics.performance * weights.performance +
            metrics.testability * weights.testability +
            metrics.documentation * weights.documentation;
        return Math.round(Math.max(0, Math.min(100, score)));
    }
    getGrade(score) {
        if (score >= 95)
            return 'A+';
        if (score >= 90)
            return 'A';
        if (score >= 80)
            return 'B';
        if (score >= 70)
            return 'C';
        if (score >= 60)
            return 'D';
        return 'F';
    }
    generateRecommendations(issues, metrics) {
        const recommendations = [];
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
    applyFix(code, issue) {
        if (!issue.fix)
            return code;
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
    async aiAssistedFix(code, issues, language) {
        const prompt = `Fix these critical quality issues in the code:

**Issues**:
${issues.map((i, idx) => `${idx + 1}. [${i.severity.toUpperCase()}] ${i.message}\n Suggestion: ${i.suggestion || 'N/A'}`).join('\n')}

**Code**:
\`\`\`${language}
${code}
\`\`\`

Return ONLY the fixed code, no explanations.`;
        try {
            const response = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are an expert code quality engineer. Fix code issues while preserving functionality.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.2,
                maxTokens: 8000
            }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
            const codeMatch = response.content.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]+?)\n```/);
            return codeMatch ? codeMatch[1].trim() : code;
        }
        catch (error) {
            logger.error('AI-assisted fix failed', error);
            return code;
        }
    }
}
exports.AdvancedQualityEngine = AdvancedQualityEngine;
//# sourceMappingURL=advancedQualityEngine.js.map