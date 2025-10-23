"use strict";
/**
 * Code Analyzer - Analyze code for quality, complexity, and issues
 *
 * Features:
 * - Complexity analysis (cyclomatic, cognitive)
 * - Code smell detection
 * - Maintainability index calculation
 * - Duplication detection
 * - Security vulnerability scanning
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
exports.CodeAnalyzer = void 0;
const fs = __importStar(require("fs"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CodeAnalyzer');
class CodeAnalyzer {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Analyze a file
    */
    async analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const metrics = this.calculateMetrics(content);
            const issues = this.detectIssues(content, metrics);
            const suggestions = this.generateSuggestions(content, metrics, issues);
            const score = this.calculateScore(metrics, issues);
            return {
                file: filePath,
                metrics,
                issues,
                suggestions,
                score
            };
        }
        catch (error) {
            logger.error(`Error analyzing file ${filePath}`, error);
            // Return default analysis result on error
            return {
                file: filePath,
                metrics: {
                    lines: 0,
                    linesOfCode: 0,
                    comments: 0,
                    complexity: 0,
                    cognitiveComplexity: 0,
                    maintainabilityIndex: 0,
                    functions: 0,
                    classes: 0,
                    dependencies: 0
                },
                issues: [{
                        type: 'error',
                        category: 'analysis',
                        message: `Failed to analyze file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        line: 1,
                        column: 1,
                        severity: 'high'
                    }],
                suggestions: [],
                score: 0
            };
        }
    }
    /**
    * Calculate code metrics
    */
    calculateMetrics(content) {
        const lines = content.split('\n');
        const linesOfCode = this.countLinesOfCode(lines);
        const comments = this.countComments(lines);
        const complexity = this.calculateCyclomaticComplexity(content);
        const cognitiveComplexity = this.calculateCognitiveComplexity(content);
        const maintainabilityIndex = this.calculateMaintainabilityIndex(linesOfCode, complexity, comments);
        const functions = this.countFunctions(content);
        const classes = this.countClasses(content);
        const dependencies = this.countDependencies(content);
        return {
            lines: lines.length,
            linesOfCode,
            comments,
            complexity,
            cognitiveComplexity,
            maintainabilityIndex,
            functions,
            classes,
            dependencies
        };
    }
    /**
    * Count lines of code (excluding comments and blank lines)
    */
    countLinesOfCode(lines) {
        let count = 0;
        let inBlockComment = false;
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip blank lines
            if (trimmed === '')
                continue;
            // Handle block comments
            if (trimmed.startsWith('/*')) {
                inBlockComment = true;
            }
            if (inBlockComment) {
                if (trimmed.includes('*/')) {
                    inBlockComment = false;
                }
                continue;
            }
            // Skip single-line comments
            if (trimmed.startsWith('//'))
                continue;
            count++;
        }
        return count;
    }
    /**
    * Count comment lines
    */
    countComments(lines) {
        let count = 0;
        let inBlockComment = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('/*')) {
                inBlockComment = true;
                count++;
                continue;
            }
            if (inBlockComment) {
                count++;
                if (trimmed.includes('*/')) {
                    inBlockComment = false;
                }
                continue;
            }
            if (trimmed.startsWith('//')) {
                count++;
            }
        }
        return count;
    }
    /**
    * Calculate cyclomatic complexity
    */
    calculateCyclomaticComplexity(content) {
        let complexity = 1; // Base complexity
        // Count decision points
        const patterns = [
            /\bif\b/g,
            /\belse\s+if\b/g,
            /\bwhile\b/g,
            /\bfor\b/g,
            /\bcase\b/g,
            /\bcatch\b/g,
            /\b\?\s*:/g, // Ternary operator
            /\&\&/g,
            /\|\|/g
        ];
        for (const pattern of patterns) {
            const matches = content.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        }
        return complexity;
    }
    /**
    * Calculate cognitive complexity
    */
    calculateCognitiveComplexity(content) {
        let complexity = 0;
        let nestingLevel = 0;
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            // Increase nesting level
            if (trimmed.includes('{')) {
                nestingLevel++;
            }
            // Decrease nesting level
            if (trimmed.includes('}')) {
                nestingLevel = Math.max(0, nestingLevel - 1);
            }
            // Add complexity for control structures
            if (/\b(if|while|for|switch)\b/.test(trimmed)) {
                complexity += 1 + nestingLevel;
            }
            // Add complexity for logical operators
            const logicalOps = (trimmed.match(/(\&\&|\|\|)/g) || []).length;
            complexity += logicalOps;
        }
        return complexity;
    }
    /**
    * Calculate maintainability index
    * Formula: 171 - 5.2 * ln(V) - 0.23 * G - 16.2 * ln(LOC)
    * Where V = Halstead Volume, G = Cyclomatic Complexity, LOC = Lines of Code
    */
    calculateMaintainabilityIndex(linesOfCode, complexity, comments) {
        // Simplified formula (without Halstead volume)
        const commentRatio = linesOfCode > 0 ? comments / linesOfCode : 0;
        const mi = Math.max(0, 100 - (complexity * 2) - (linesOfCode / 10) + (commentRatio * 20));
        return Math.round(mi);
    }
    /**
    * Count functions
    */
    countFunctions(content) {
        const functionPattern = /\b(function|async\s+function|\w+\s*\([^)]*\)\s*=>|\w+\s*\([^)]*\)\s*{)/g;
        const matches = content.match(functionPattern);
        return matches ? matches.length : 0;
    }
    /**
    * Count classes
    */
    countClasses(content) {
        const classPattern = /\bclass\s+\w+/g;
        const matches = content.match(classPattern);
        return matches ? matches.length : 0;
    }
    /**
    * Count dependencies
    */
    countDependencies(content) {
        const importPattern = /\bimport\s+.*\bfrom\b/g;
        const requirePattern = /\brequire\s*\(/g;
        const imports = content.match(importPattern) || [];
        const requires = content.match(requirePattern) || [];
        return imports.length + requires.length;
    }
    /**
    * Detect code issues
    */
    detectIssues(content, metrics) {
        const issues = [];
        // High complexity
        if (metrics.complexity > 20) {
            issues.push({
                type: 'warning',
                category: 'complexity',
                message: `High cyclomatic complexity (${metrics.complexity}). Consider refactoring.`,
                line: 1,
                column: 1,
                severity: 'high'
            });
        }
        // High cognitive complexity
        if (metrics.cognitiveComplexity > 15) {
            issues.push({
                type: 'warning',
                category: 'complexity',
                message: `High cognitive complexity (${metrics.cognitiveComplexity}). Code is hard to understand.`,
                line: 1,
                column: 1,
                severity: 'high'
            });
        }
        // Low maintainability
        if (metrics.maintainabilityIndex < 40) {
            issues.push({
                type: 'warning',
                category: 'smell',
                message: `Low maintainability index (${metrics.maintainabilityIndex}). Code needs improvement.`,
                line: 1,
                column: 1,
                severity: 'medium'
            });
        }
        // Too many dependencies
        if (metrics.dependencies > 20) {
            issues.push({
                type: 'info',
                category: 'smell',
                message: `High number of dependencies (${metrics.dependencies}). Consider reducing coupling.`,
                line: 1,
                column: 1,
                severity: 'low'
            });
        }
        // Long file
        if (metrics.linesOfCode > 500) {
            issues.push({
                type: 'info',
                category: 'smell',
                message: `File is too long (${metrics.linesOfCode} lines). Consider splitting.`,
                line: 1,
                column: 1,
                severity: 'low'
            });
        }
        // Detect specific code smells
        issues.push(...this.detectCodeSmells(content));
        return issues;
    }
    /**
    * Detect code smells
    */
    detectCodeSmells(content) {
        const issues = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;
            // Long line
            if (line.length > 120) {
                issues.push({
                    type: 'info',
                    category: 'smell',
                    message: 'Line is too long (> 120 characters)',
                    line: lineNumber,
                    column: 120,
                    severity: 'low'
                });
            }
            // Magic numbers
            if (/\b\d{3,}\b/.test(line) && !line.includes('//')) {
                issues.push({
                    type: 'info',
                    category: 'smell',
                    message: 'Magic number detected. Consider using a named constant.',
                    line: lineNumber,
                    column: 1,
                    severity: 'low'
                });
            }
            // TODO comments
            if (/\/\/\s*TODO/i.test(line)) {
                issues.push({
                    type: 'info',
                    category: 'smell',
                    message: 'TODO comment found',
                    line: lineNumber,
                    column: 1,
                    severity: 'low'
                });
            }
        }
        return issues;
    }
    /**
    * Generate suggestions
    */
    generateSuggestions(content, metrics, issues) {
        const suggestions = [];
        // Suggest refactoring for high complexity
        if (metrics.complexity > 15) {
            suggestions.push({
                type: 'refactor',
                message: 'Extract complex logic into smaller functions',
                line: 1,
                column: 1,
                priority: 'high',
                effort: 'medium'
            });
        }
        // Suggest adding comments
        const commentRatio = metrics.comments / metrics.linesOfCode;
        if (commentRatio < 0.1) {
            suggestions.push({
                type: 'simplify',
                message: 'Add more comments to improve code documentation',
                line: 1,
                column: 1,
                priority: 'medium',
                effort: 'small'
            });
        }
        // Suggest splitting large files
        if (metrics.linesOfCode > 500) {
            suggestions.push({
                type: 'refactor',
                message: 'Split file into smaller modules',
                line: 1,
                column: 1,
                priority: 'medium',
                effort: 'large'
            });
        }
        return suggestions;
    }
    /**
    * Calculate overall quality score (0-100)
    */
    calculateScore(metrics, issues) {
        let score = 100;
        // Deduct for complexity
        score -= Math.min(20, metrics.complexity);
        score -= Math.min(15, metrics.cognitiveComplexity);
        // Deduct for issues
        for (const issue of issues) {
            switch (issue.severity) {
                case 'critical':
                    score -= 10;
                    break;
                case 'high':
                    score -= 5;
                    break;
                case 'medium':
                    score -= 2;
                    break;
                case 'low':
                    score -= 1;
                    break;
            }
        }
        // Add for maintainability
        score += Math.min(20, metrics.maintainabilityIndex / 5);
        return Math.max(0, Math.min(100, Math.round(score)));
    }
}
exports.CodeAnalyzer = CodeAnalyzer;
//# sourceMappingURL=codeAnalyzer.js.map