"use strict";
/**
 * Complexity Analyzer Utility
 * Consolidates duplicated complexity analysis code from multiple files
 *
 * This utility provides a single source of truth for:
 * - Cyclomatic complexity calculation
 * - Cognitive complexity calculation
 * - Code quality scoring
 * - Complexity thresholds
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STANDARD_THRESHOLDS = void 0;
exports.calculateCyclomaticComplexity = calculateCyclomaticComplexity;
exports.calculateCognitiveComplexity = calculateCognitiveComplexity;
exports.calculateNestingDepth = calculateNestingDepth;
exports.calculateCommentRatio = calculateCommentRatio;
exports.analyzeComplexity = analyzeComplexity;
exports.detectComplexityIssues = detectComplexityIssues;
exports.calculateQualityScore = calculateQualityScore;
exports.getComplexityLevel = getComplexityLevel;
/**
 * Standard complexity thresholds based on industry best practices
 */
exports.STANDARD_THRESHOLDS = {
    cyclomatic: {
        low: 5,
        medium: 10,
        high: 15,
        critical: 20
    },
    cognitive: {
        low: 5,
        medium: 10,
        high: 15,
        critical: 20
    },
    nesting: {
        low: 2,
        medium: 3,
        high: 4,
        critical: 5
    }
};
/**
 * Calculate cyclomatic complexity from code string
 *
 * Cyclomatic complexity = number of decision points + 1
 * Decision points: if, else if, while, for, case, catch, &&, ||, ?:
 */
function calculateCyclomaticComplexity(code) {
    let complexity = 1; // Base complexity
    // Count decision points
    const patterns = [
        /\bif\b/g,
        /\belse\s+if\b/g,
        /\bwhile\b/g,
        /\bfor\b/g,
        /\bcase\b/g,
        /\bcatch\b/g,
        /\?\s*:/g, // Ternary operator
        /&&/g, // Logical AND
        /\|\|/g // Logical OR
    ];
    for (const pattern of patterns) {
        const matches = code.match(pattern);
        if (matches) {
            complexity += matches.length;
        }
    }
    return complexity;
}
/**
 * Calculate cognitive complexity from code string
 *
 * Cognitive complexity considers nesting depth and control flow breaks
 * More complex than cyclomatic as it accounts for human understanding
 */
function calculateCognitiveComplexity(code) {
    let complexity = 0;
    let nestingLevel = 0;
    const lines = code.split('\n');
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
        // Add complexity for control structures (weighted by nesting)
        if (/\b(if|while|for|switch)\b/.test(trimmed)) {
            complexity += 1 + nestingLevel;
        }
        // Add complexity for logical operators
        const logicalOps = (trimmed.match(/(&&|\|\|)/g) || []).length;
        complexity += logicalOps;
        // Add complexity for breaks in linear flow
        if (/\b(break|continue|return|throw)\b/.test(trimmed)) {
            complexity += 1;
        }
    }
    return complexity;
}
/**
 * Calculate maximum nesting depth
 */
function calculateNestingDepth(code) {
    let maxDepth = 0;
    let currentDepth = 0;
    const lines = code.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        // Increase depth
        if (trimmed.includes('{')) {
            currentDepth++;
            maxDepth = Math.max(maxDepth, currentDepth);
        }
        // Decrease depth
        if (trimmed.includes('}')) {
            currentDepth = Math.max(0, currentDepth - 1);
        }
    }
    return maxDepth;
}
/**
 * Calculate comment ratio
 */
function calculateCommentRatio(code) {
    const lines = code.split('\n');
    const totalLines = lines.length;
    if (totalLines === 0)
        return 0;
    // Count comment lines
    const commentLines = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('//') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('#'); // Python, shell
    }).length;
    return commentLines / totalLines;
}
/**
 * Calculate all complexity metrics
 */
function analyzeComplexity(code) {
    const lines = code.split('\n');
    const linesOfCode = lines.filter(line => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
    }).length;
    return {
        cyclomatic: calculateCyclomaticComplexity(code),
        cognitive: calculateCognitiveComplexity(code),
        nestingDepth: calculateNestingDepth(code),
        linesOfCode,
        commentRatio: calculateCommentRatio(code)
    };
}
/**
 * Detect complexity issues
 */
function detectComplexityIssues(metrics, thresholds = exports.STANDARD_THRESHOLDS) {
    const issues = [];
    // Check cyclomatic complexity
    if (metrics.cyclomatic > thresholds.cyclomatic.critical) {
        issues.push({
            type: 'cyclomatic',
            severity: 'critical',
            message: `Critical cyclomatic complexity: ${metrics.cyclomatic}`,
            suggestion: 'Urgently refactor into smaller functions. Extract complex logic.',
            value: metrics.cyclomatic,
            threshold: thresholds.cyclomatic.critical
        });
    }
    else if (metrics.cyclomatic > thresholds.cyclomatic.high) {
        issues.push({
            type: 'cyclomatic',
            severity: 'high',
            message: `High cyclomatic complexity: ${metrics.cyclomatic}`,
            suggestion: 'Consider refactoring. Break down complex logic into smaller functions.',
            value: metrics.cyclomatic,
            threshold: thresholds.cyclomatic.high
        });
    }
    else if (metrics.cyclomatic > thresholds.cyclomatic.medium) {
        issues.push({
            type: 'cyclomatic',
            severity: 'medium',
            message: `Moderate cyclomatic complexity: ${metrics.cyclomatic}`,
            suggestion: 'Monitor complexity. Consider simplifying if adding more logic.',
            value: metrics.cyclomatic,
            threshold: thresholds.cyclomatic.medium
        });
    }
    // Check cognitive complexity
    if (metrics.cognitive > thresholds.cognitive.critical) {
        issues.push({
            type: 'cognitive',
            severity: 'critical',
            message: `Critical cognitive complexity: ${metrics.cognitive}`,
            suggestion: 'Code is very hard to understand. Simplify logic and reduce nesting.',
            value: metrics.cognitive,
            threshold: thresholds.cognitive.critical
        });
    }
    else if (metrics.cognitive > thresholds.cognitive.high) {
        issues.push({
            type: 'cognitive',
            severity: 'high',
            message: `High cognitive complexity: ${metrics.cognitive}`,
            suggestion: 'Code is hard to understand. Simplify logic and reduce nesting.',
            value: metrics.cognitive,
            threshold: thresholds.cognitive.high
        });
    }
    // Check nesting depth
    if (metrics.nestingDepth > thresholds.nesting.critical) {
        issues.push({
            type: 'nesting',
            severity: 'critical',
            message: `Critical nesting depth: ${metrics.nestingDepth}`,
            suggestion: 'Use early returns, extract nested logic to functions, flatten structure.',
            value: metrics.nestingDepth,
            threshold: thresholds.nesting.critical
        });
    }
    else if (metrics.nestingDepth > thresholds.nesting.high) {
        issues.push({
            type: 'nesting',
            severity: 'high',
            message: `High nesting depth: ${metrics.nestingDepth}`,
            suggestion: 'Consider using early returns or extracting nested logic.',
            value: metrics.nestingDepth,
            threshold: thresholds.nesting.high
        });
    }
    // Check comment ratio
    if (metrics.commentRatio < 0.1 && metrics.linesOfCode > 20) {
        issues.push({
            type: 'comments',
            severity: 'medium',
            message: `Low comment ratio: ${(metrics.commentRatio * 100).toFixed(1)}%`,
            suggestion: 'Add comments to explain complex logic and public APIs.',
            value: metrics.commentRatio * 100,
            threshold: 10
        });
    }
    return issues;
}
/**
 * Calculate quality score based on complexity metrics
 * Returns a score from 0-100
 */
function calculateQualityScore(metrics, thresholds = exports.STANDARD_THRESHOLDS) {
    let score = 100;
    // Penalize high cyclomatic complexity
    if (metrics.cyclomatic > thresholds.cyclomatic.medium) {
        const excess = metrics.cyclomatic - thresholds.cyclomatic.medium;
        score -= excess * 2;
    }
    // Penalize high cognitive complexity
    if (metrics.cognitive > thresholds.cognitive.medium) {
        const excess = metrics.cognitive - thresholds.cognitive.medium;
        score -= excess * 1.5;
    }
    // Penalize deep nesting
    if (metrics.nestingDepth > thresholds.nesting.medium) {
        const excess = metrics.nestingDepth - thresholds.nesting.medium;
        score -= excess * 5;
    }
    // Penalize low comment ratio
    if (metrics.commentRatio < 0.1 && metrics.linesOfCode > 20) {
        score -= 10;
    }
    return Math.max(0, Math.min(100, score));
}
/**
 * Get complexity level as string
 */
function getComplexityLevel(complexity, type) {
    const thresholds = exports.STANDARD_THRESHOLDS[type];
    if (complexity <= thresholds.low)
        return 'low';
    if (complexity <= thresholds.medium)
        return 'medium';
    if (complexity <= thresholds.high)
        return 'high';
    return 'critical';
}
//# sourceMappingURL=complexityAnalyzer.js.map