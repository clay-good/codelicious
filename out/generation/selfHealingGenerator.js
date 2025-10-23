"use strict";
/**
 * Self-Healing Code Generator - Automatically fixes issues during generation
 *
 * Features:
 * - Real-time quality monitoring
 * - Automatic issue detection
 * - Self-correction during generation
 * - Multi-iteration refinement
 * - Learning from fixes
 *
 * Goal: Generate perfect code on first try (99%+ success rate)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SelfHealingGenerator = void 0;
const orchestrator_1 = require("../models/orchestrator");
const advancedQualityEngine_1 = require("./advancedQualityEngine");
const enhancedCodeGenerator_1 = require("./enhancedCodeGenerator");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('SelfHealingGenerator');
class SelfHealingGenerator {
    constructor(orchestrator, executionEngine) {
        this.orchestrator = orchestrator;
        this.executionEngine = executionEngine;
        this.qualityEngine = new advancedQualityEngine_1.AdvancedQualityEngine(orchestrator);
        this.enhancedGenerator = new enhancedCodeGenerator_1.EnhancedCodeGenerator(orchestrator);
    }
    /**
    * Generate code with self-healing
    */
    async generate(request) {
        logger.info('Starting self-healing code generation...');
        const maxIterations = request.maxIterations || 5;
        const targetQuality = request.targetQuality || 95;
        const autoFix = request.autoFix !== false;
        const healingHistory = [];
        let currentCode = '';
        let currentQuality = 0;
        let iteration = 0;
        // Iteration 1: Initial generation
        iteration++;
        logger.info(`Iteration ${iteration}: Initial generation...`);
        const initialResult = await this.enhancedGenerator.generate(request);
        currentCode = initialResult.code;
        healingHistory.push({
            iteration,
            quality: initialResult.quality,
            issuesFound: initialResult.issues.length,
            issuesFixed: 0,
            action: 'generated',
            details: `Generated ${currentCode.split('\n').length} lines of code`
        });
        // Iteration 2+: Analyze and heal
        while (iteration < maxIterations) {
            iteration++;
            logger.info(`Iteration ${iteration}: Analyzing quality...`);
            // Analyze quality
            const analysis = await this.qualityEngine.analyze(currentCode, request.language, request.framework);
            currentQuality = analysis.score;
            healingHistory.push({
                iteration,
                quality: analysis.score,
                issuesFound: analysis.issues.length,
                issuesFixed: 0,
                action: 'analyzed',
                details: `Quality: ${analysis.grade} (${analysis.score}/100), Issues: ${analysis.issues.length}`
            });
            logger.info(`Quality: ${analysis.grade} (${analysis.score}/100)`);
            // Check if target quality reached
            if (analysis.score >= targetQuality) {
                logger.info(`Target quality ${targetQuality} reached!`);
                break;
            }
            // Check if auto-fix is enabled
            if (!autoFix) {
                logger.warn('Auto-fix disabled, stopping');
                break;
            }
            // Auto-fix issues
            logger.info(`Iteration ${iteration}: Auto-fixing ${analysis.issues.length} issues...`);
            const fixedCode = await this.healCode(currentCode, analysis, request);
            if (fixedCode === currentCode) {
                logger.warn('No changes made, stopping');
                break;
            }
            const issuesFixed = analysis.issues.filter(i => i.autoFixable).length;
            healingHistory.push({
                iteration,
                quality: analysis.score,
                issuesFound: analysis.issues.length,
                issuesFixed,
                action: 'fixed',
                details: `Fixed ${issuesFixed} issues`
            });
            currentCode = fixedCode;
            // Refine with AI if quality still low
            if (analysis.score < targetQuality - 10) {
                logger.info(`Iteration ${iteration}: AI refinement...`);
                const refinedCode = await this.aiRefine(currentCode, analysis, request);
                healingHistory.push({
                    iteration,
                    quality: analysis.score,
                    issuesFound: analysis.issues.length,
                    issuesFixed: 0,
                    action: 'refined',
                    details: 'AI-assisted refinement'
                });
                currentCode = refinedCode;
            }
        }
        // Final quality check
        const finalAnalysis = await this.qualityEngine.analyze(currentCode, request.language, request.framework);
        const success = finalAnalysis.score >= targetQuality;
        logger.info(`Self-healing complete: ${finalAnalysis.grade} (${finalAnalysis.score}/100) in ${iteration} iterations`);
        return {
            code: currentCode,
            quality: finalAnalysis.score,
            issues: finalAnalysis.issues.map(i => i.message),
            improvements: finalAnalysis.recommendations,
            iterations: iteration,
            finalQuality: finalAnalysis.score,
            grade: finalAnalysis.grade,
            healingHistory,
            success
        };
    }
    /**
    * Heal code by fixing issues
    */
    async healCode(code, analysis, request) {
        // Step 1: Apply automatic fixes
        let healedCode = await this.qualityEngine.autoFix(code, analysis, request.language);
        // Step 2: Fix critical security issues
        const securityIssues = analysis.issues.filter(i => i.category === 'security' && i.severity === 'critical');
        if (securityIssues.length > 0) {
            healedCode = await this.fixSecurityIssues(healedCode, securityIssues, request);
        }
        // Step 3: Fix performance issues
        const performanceIssues = analysis.issues.filter(i => i.category === 'performance');
        if (performanceIssues.length > 0) {
            healedCode = await this.fixPerformanceIssues(healedCode, performanceIssues, request);
        }
        // Step 4: Improve maintainability
        if (analysis.metrics.maintainability < 70) {
            healedCode = await this.improveMaintainability(healedCode, analysis, request);
        }
        return healedCode;
    }
    /**
    * Fix security issues
    */
    async fixSecurityIssues(code, issues, // Security issue structure from analyzer
    request) {
        const prompt = `Fix these critical security issues:

${issues.map((i, idx) => `${idx + 1}. ${i.message}\n Suggestion: ${i.suggestion || 'N/A'}`).join('\n')}

**Code**:
\`\`\`${request.language}
${code}
\`\`\`

Return ONLY the fixed code with security issues resolved.`;
        try {
            const response = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are a security expert. Fix security vulnerabilities while preserving functionality.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                maxTokens: 8000
            }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
            const codeMatch = response.content.match(/```(?:typescript|javascript|ts|js|python|java)?\n([\s\S]+?)\n```/);
            return codeMatch ? codeMatch[1].trim() : code;
        }
        catch (error) {
            logger.error('Failed to fix security issues', error);
            return code;
        }
    }
    /**
    * Fix performance issues
    */
    async fixPerformanceIssues(code, issues, // Performance issue structure from analyzer
    request) {
        const prompt = `Optimize this code to fix performance issues:

${issues.map((i, idx) => `${idx + 1}. ${i.message}\n Suggestion: ${i.suggestion || 'N/A'}`).join('\n')}

**Code**:
\`\`\`${request.language}
${code}
\`\`\`

Return ONLY the optimized code.`;
        try {
            const response = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are a performance optimization expert. Optimize code while preserving functionality.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.2,
                maxTokens: 8000
            }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
            const codeMatch = response.content.match(/```(?:typescript|javascript|ts|js|python|java)?\n([\s\S]+?)\n```/);
            return codeMatch ? codeMatch[1].trim() : code;
        }
        catch (error) {
            logger.error('Failed to fix performance issues', error);
            return code;
        }
    }
    /**
    * Improve maintainability
    */
    async improveMaintainability(code, analysis, request) {
        const prompt = `Improve the maintainability of this code:

**Current Issues**:
- Maintainability score: ${analysis.metrics.maintainability}/100
- Complexity: ${analysis.metrics.complexity}

**Recommendations**:
${analysis.recommendations.join('\n')}

**Code**:
\`\`\`${request.language}
${code}
\`\`\`

Refactor to improve maintainability:
1. Break down complex functions
2. Add clear documentation
3. Follow SOLID principles
4. Improve naming

Return ONLY the refactored code.`;
        try {
            const response = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are a code quality expert. Refactor code to improve maintainability.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.2,
                maxTokens: 8000
            }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
            const codeMatch = response.content.match(/```(?:typescript|javascript|ts|js|python|java)?\n([\s\S]+?)\n```/);
            return codeMatch ? codeMatch[1].trim() : code;
        }
        catch (error) {
            logger.error('Failed to improve maintainability', error);
            return code;
        }
    }
    /**
    * AI-assisted refinement
    */
    async aiRefine(code, analysis, request) {
        const prompt = `Refine this code to achieve higher quality:

**Current Quality**: ${analysis.grade} (${analysis.score}/100)
**Target Quality**: ${request.targetQuality || 95}/100

**Issues**:
${analysis.issues.slice(0, 10).map((i, idx) => `${idx + 1}. [${i.severity}] ${i.message}`).join('\n')}

**Recommendations**:
${analysis.recommendations.join('\n')}

**Code**:
\`\`\`${request.language}
${code}
\`\`\`

Refine the code to:
1. Fix all critical and high severity issues
2. Improve code quality metrics
3. Follow best practices
4. Maintain functionality

Return ONLY the refined code.`;
        try {
            const response = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are a world-class software engineer. Refine code to achieve the highest quality.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.2,
                maxTokens: 8000
            }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
            const codeMatch = response.content.match(/```(?:typescript|javascript|ts|js|python|java)?\n([\s\S]+?)\n```/);
            return codeMatch ? codeMatch[1].trim() : code;
        }
        catch (error) {
            logger.error('Failed to refine code', error);
            return code;
        }
    }
}
exports.SelfHealingGenerator = SelfHealingGenerator;
//# sourceMappingURL=selfHealingGenerator.js.map