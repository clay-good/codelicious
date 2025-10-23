"use strict";
/**
 * Multi-Pass Code Refinement System
 * Goal: Iteratively improve generated code through multiple passes
 *
 * Features:
 * - Multiple refinement passes
 * - Quality improvement tracking
 * - Automatic issue fixing
 * - Optimization passes
 * - Validation after each pass
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiPassRefinement = void 0;
const advancedCodeAnalyzer_1 = require("./advancedCodeAnalyzer");
const bestPracticesEngine_1 = require("./bestPracticesEngine");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('MultiPassRefinement');
class MultiPassRefinement {
    constructor() {
        this.analyzer = new advancedCodeAnalyzer_1.AdvancedCodeAnalyzer();
        this.bestPractices = new bestPracticesEngine_1.BestPracticesEngine();
        this.passes = this.initializePasses();
    }
    /**
    * Refine code through multiple passes
    */
    async refine(code, context) {
        let currentCode = code;
        const passResults = [];
        const improvements = [];
        // Initial analysis
        let analysis = this.analyzer.analyze(currentCode, context.language);
        let validation = this.bestPractices.validate(currentCode, context.language, context.framework);
        for (let i = 0; i < context.maxPasses; i++) {
            context.currentPass = i + 1;
            context.previousAnalysis = analysis;
            context.previousValidation = validation;
            // Check if we've reached target quality
            const currentQuality = (analysis.score.overall + validation.score) / 2;
            if (currentQuality >= context.targetQuality) {
                improvements.push(`Target quality ${context.targetQuality} reached after ${i} passes`);
                break;
            }
            // Execute passes in priority order
            let passExecuted = false;
            for (const pass of this.passes) {
                const qualityBefore = currentQuality;
                const refinedCode = await pass.execute(currentCode, context);
                if (refinedCode !== currentCode) {
                    // Code changed, analyze again
                    const newAnalysis = this.analyzer.analyze(refinedCode, context.language);
                    const newValidation = this.bestPractices.validate(refinedCode, context.language, context.framework);
                    const qualityAfter = (newAnalysis.score.overall + newValidation.score) / 2;
                    // Only keep changes if quality improved
                    if (qualityAfter >= qualityBefore) {
                        passResults.push({
                            passName: pass.name,
                            changes: this.countChanges(currentCode, refinedCode),
                            qualityBefore,
                            qualityAfter,
                            issues: this.extractIssues(analysis, validation),
                            fixes: this.extractFixes(newAnalysis, newValidation)
                        });
                        currentCode = refinedCode;
                        analysis = newAnalysis;
                        validation = newValidation;
                        passExecuted = true;
                        improvements.push(`${pass.name}: Quality improved from ${qualityBefore.toFixed(1)} to ${qualityAfter.toFixed(1)}`);
                        break; // One pass per iteration
                    }
                }
            }
            if (!passExecuted) {
                improvements.push('No more improvements possible');
                break;
            }
        }
        const finalQuality = (analysis.score.overall + validation.score) / 2;
        return {
            originalCode: code,
            refinedCode: currentCode,
            passes: passResults,
            finalQuality,
            improvements,
            totalPasses: passResults.length
        };
    }
    /**
    * Initialize refinement passes
    */
    initializePasses() {
        return [
            {
                name: 'Complexity Reduction',
                description: 'Reduce cyclomatic complexity',
                priority: 1,
                execute: async (code, context) => {
                    if (!context.previousAnalysis)
                        return code;
                    if (context.previousAnalysis.metrics.cyclomaticComplexity > 10) {
                        // Extract complex conditions
                        code = this.extractComplexConditions(code);
                        // Break down long functions
                        code = this.breakDownLongFunctions(code);
                    }
                    return code;
                }
            },
            {
                name: 'Naming Improvements',
                description: 'Improve variable and function names',
                priority: 2,
                execute: async (code, context) => {
                    if (!context.previousValidation)
                        return code;
                    const namingViolations = context.previousValidation.violations.filter(v => v.practice.category === 'naming');
                    for (const violation of namingViolations) {
                        if (violation.fix) {
                            // Apply naming fix
                            code = this.applyNamingFix(code, violation);
                        }
                    }
                    return code;
                }
            },
            {
                name: 'Documentation Enhancement',
                description: 'Add missing documentation',
                priority: 3,
                execute: async (code, context) => {
                    if (!context.previousValidation)
                        return code;
                    const docViolations = context.previousValidation.violations.filter(v => v.practice.category === 'documentation');
                    if (docViolations.length > 0) {
                        code = this.addMissingDocumentation(code, context.language);
                    }
                    return code;
                }
            },
            {
                name: 'Error Handling',
                description: 'Add comprehensive error handling',
                priority: 4,
                execute: async (code, context) => {
                    if (!code.includes('try') && !code.includes('catch')) {
                        code = this.addErrorHandling(code, context.language);
                    }
                    return code;
                }
            },
            {
                name: 'Performance Optimization',
                description: 'Optimize performance bottlenecks',
                priority: 5,
                execute: async (code, context) => {
                    if (!context.previousValidation)
                        return code;
                    const perfViolations = context.previousValidation.violations.filter(v => v.practice.category === 'performance');
                    for (const violation of perfViolations) {
                        code = this.optimizePerformance(code, violation);
                    }
                    return code;
                }
            },
            {
                name: 'Security Hardening',
                description: 'Fix security vulnerabilities',
                priority: 6,
                execute: async (code, context) => {
                    if (!context.previousValidation)
                        return code;
                    const securityViolations = context.previousValidation.violations.filter(v => v.practice.category === 'security');
                    for (const violation of securityViolations) {
                        if (violation.fix) {
                            code = this.applySecurityFix(code, violation);
                        }
                    }
                    return code;
                }
            },
            {
                name: 'Code Formatting',
                description: 'Apply consistent formatting',
                priority: 7,
                execute: async (code, context) => {
                    return this.formatCode(code, context.language);
                }
            }
        ].sort((a, b) => a.priority - b.priority);
    }
    /**
    * Extract complex conditions into separate functions
    */
    extractComplexConditions(code) {
        // Simplified implementation - would use AST in production
        const lines = code.split('\n');
        const result = [];
        for (const line of lines) {
            if (line.includes('if') && line.length > 80) {
                // Complex condition - could be extracted
                result.push(' // TODO: Extract complex condition to separate function');
            }
            result.push(line);
        }
        return result.join('\n');
    }
    /**
    * Break down long functions
    */
    breakDownLongFunctions(code) {
        // Simplified implementation
        return code;
    }
    /**
    * Apply naming fix
    */
    applyNamingFix(code, violation) {
        // Simplified implementation
        return code;
    }
    /**
    * Add missing documentation
    */
    addMissingDocumentation(code, language) {
        const lines = code.split('\n');
        const result = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check if this is a function/class without documentation
            if ((line.includes('function') || line.includes('class') || line.includes('export')) &&
                (i === 0 || !lines[i - 1].trim().startsWith('/**'))) {
                if (language === 'typescript' || language === 'javascript') {
                    result.push(' /**');
                    result.push(' * TODO: Add description');
                    result.push(' */');
                }
                else if (language === 'python') {
                    result.push(' """');
                    result.push(' TODO: Add description');
                    result.push(' """');
                }
            }
            result.push(line);
        }
        return result.join('\n');
    }
    /**
    * Add error handling
    */
    addErrorHandling(code, language) {
        if (language === 'typescript' || language === 'javascript') {
            // Wrap async functions in try-catch
            if (code.includes('async') && !code.includes('try')) {
                const lines = code.split('\n');
                const result = [];
                let inFunction = false;
                let indent = '';
                for (const line of lines) {
                    if (line.includes('async') && line.includes('{')) {
                        inFunction = true;
                        indent = line.match(/^\s*/)?.[0] || '';
                        result.push(line);
                        result.push(`${indent} try {`);
                    }
                    else if (inFunction && line.trim() === '}') {
                        result.push(`${indent} } catch (error) {`);
                        result.push(`${indent} logger.error('Error:', error);`);
                        result.push(`${indent} throw error;`);
                        result.push(`${indent} }`);
                        result.push(line);
                        inFunction = false;
                    }
                    else {
                        result.push(line);
                    }
                }
                return result.join('\n');
            }
        }
        return code;
    }
    /**
    * Optimize performance
    */
    optimizePerformance(code, violation) {
        // Simplified implementation
        return code;
    }
    /**
    * Apply security fix
    */
    applySecurityFix(code, violation) {
        // Remove eval() usage
        if (code.includes('eval(')) {
            code = code.replace(/eval\(/g, '// SECURITY: eval() removed - use JSON.parse() instead\n// JSON.parse(');
        }
        // Remove hardcoded secrets
        code = code.replace(/(password|apiKey|secret|token)\s*=\s*['"][^'"]+['"]/gi, '$1 = process.env.$1 || ""');
        return code;
    }
    /**
    * Format code
    */
    formatCode(code, language) {
        // Simplified implementation - would use prettier/black in production
        return code;
    }
    /**
    * Count changes between two code versions
    */
    countChanges(oldCode, newCode) {
        const oldLines = oldCode.split('\n');
        const newLines = newCode.split('\n');
        let changes = 0;
        const maxLength = Math.max(oldLines.length, newLines.length);
        for (let i = 0; i < maxLength; i++) {
            if (oldLines[i] !== newLines[i]) {
                changes++;
            }
        }
        return changes;
    }
    /**
    * Extract issues from analysis
    */
    extractIssues(analysis, validation) {
        const issues = [];
        issues.push(...analysis.smells.map(s => s.message));
        issues.push(...analysis.issues.map(i => i.message));
        issues.push(...validation.violations.map(v => v.message));
        return issues;
    }
    /**
    * Extract fixes from analysis
    */
    extractFixes(analysis, validation) {
        const fixes = [];
        fixes.push(...analysis.smells.map(s => s.suggestion));
        fixes.push(...analysis.issues.filter(i => i.fix).map(i => i.fix));
        fixes.push(...validation.violations.filter(v => v.fix).map(v => v.fix));
        return fixes;
    }
}
exports.MultiPassRefinement = MultiPassRefinement;
//# sourceMappingURL=multiPassRefinement.js.map