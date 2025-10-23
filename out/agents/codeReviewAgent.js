"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeReviewAgent = exports.ReviewCategory = exports.ReviewSeverity = void 0;
const modelRouter_1 = require("../models/modelRouter");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CodeReviewAgent');
/**
 * Code review issue severity
 */
var ReviewSeverity;
(function (ReviewSeverity) {
    ReviewSeverity["CRITICAL"] = "critical";
    ReviewSeverity["HIGH"] = "high";
    ReviewSeverity["MEDIUM"] = "medium";
    ReviewSeverity["LOW"] = "low";
    ReviewSeverity["INFO"] = "info";
})(ReviewSeverity || (exports.ReviewSeverity = ReviewSeverity = {}));
/**
 * Code review issue category
 */
var ReviewCategory;
(function (ReviewCategory) {
    ReviewCategory["SECURITY"] = "security";
    ReviewCategory["PERFORMANCE"] = "performance";
    ReviewCategory["MAINTAINABILITY"] = "maintainability";
    ReviewCategory["CORRECTNESS"] = "correctness";
    ReviewCategory["STYLE"] = "style";
    ReviewCategory["BEST_PRACTICES"] = "best_practices";
})(ReviewCategory || (exports.ReviewCategory = ReviewCategory = {}));
/**
 * AI-powered code review agent
 * Reviews code for security, performance, maintainability, and best practices
 */
class CodeReviewAgent {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
    * Review code file
    */
    async reviewFile(filePath, content, language) {
        logger.info(`Reviewing ${filePath}...`);
        const prompt = `You are an expert code reviewer. Review this ${language} code for:
- Security vulnerabilities (SQL injection, XSS, auth issues, etc.)
- Performance issues (inefficient algorithms, memory leaks, etc.)
- Maintainability issues (code smells, complexity, duplication, etc.)
- Correctness issues (bugs, edge cases, error handling, etc.)
- Style issues (naming, formatting, conventions, etc.)
- Best practices violations

**File**: ${filePath}

**Code**:
\`\`\`${language}
${content}
\`\`\`

Provide your review in this JSON format:
{
 "issues": [
 {
 "severity": "critical" | "high" | "medium" | "low" | "info",
 "category": "security" | "performance" | "maintainability" | "correctness" | "style" | "best_practices",
 "line": 10,
 "message": "Description of the issue",
 "suggestion": "How to fix it",
 "autoFixable": true,
 "autoFix": "Fixed code snippet"
 }
 ],
 "score": 85,
 "summary": "Overall assessment",
 "recommendations": ["Recommendation 1", "Recommendation 2"]
}

Be thorough but practical. Focus on real issues, not nitpicks.`;
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert code reviewer with deep knowledge of security, performance, and best practices.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3
        }, { complexity: modelRouter_1.TaskComplexity.MODERATE });
        // Parse response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse review from AI response');
        }
        const review = JSON.parse(jsonMatch[0]);
        return {
            filePath,
            issues: review.issues || [],
            score: review.score || 0,
            summary: review.summary || '',
            recommendations: review.recommendations || []
        };
    }
    /**
    * Review multiple files
    */
    async reviewFiles(files) {
        const results = [];
        for (const file of files) {
            try {
                const result = await this.reviewFile(file.path, file.content, file.language);
                results.push(result);
            }
            catch (error) {
                logger.error(`Failed to review ${file.path}:`, error);
                results.push({
                    filePath: file.path,
                    issues: [],
                    score: 0,
                    summary: `Review failed: ${error}`,
                    recommendations: []
                });
            }
        }
        return results;
    }
    /**
    * Apply auto-fixes to code
    */
    async applyAutoFixes(filePath, content, issues) {
        const fixableIssues = issues.filter(i => i.autoFixable && i.autoFix);
        if (fixableIssues.length === 0) {
            return content;
        }
        logger.info(`Applying ${fixableIssues.length} auto-fixes to ${filePath}...`);
        // Sort by line number (descending) to avoid offset issues
        fixableIssues.sort((a, b) => (b.line || 0) - (a.line || 0));
        let fixedContent = content;
        const lines = content.split('\n');
        for (const issue of fixableIssues) {
            if (issue.line && issue.autoFix) {
                // Replace the line with the fix
                lines[issue.line - 1] = issue.autoFix;
            }
        }
        fixedContent = lines.join('\n');
        return fixedContent;
    }
    /**
    * Generate review summary for multiple files
    */
    generateSummary(results) {
        const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
        const criticalIssues = results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === ReviewSeverity.CRITICAL).length, 0);
        const highIssues = results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === ReviewSeverity.HIGH).length, 0);
        const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        const summary = `
# Code Review Summary

**Files Reviewed**: ${results.length}
**Total Issues**: ${totalIssues}
**Critical Issues**: ${criticalIssues}
**High Priority Issues**: ${highIssues}
**Average Score**: ${avgScore.toFixed(1)}/100

## Issues by Category:
${this.getIssuesByCategory(results)}

## Issues by Severity:
${this.getIssuesBySeverity(results)}

## Top Recommendations:
${this.getTopRecommendations(results)}
`;
        return summary;
    }
    /**
    * Get issues grouped by category
    */
    getIssuesByCategory(results) {
        const categories = new Map();
        for (const result of results) {
            for (const issue of result.issues) {
                categories.set(issue.category, (categories.get(issue.category) || 0) + 1);
            }
        }
        return Array.from(categories.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([cat, count]) => `- ${cat}: ${count}`)
            .join('\n');
    }
    /**
    * Get issues grouped by severity
    */
    getIssuesBySeverity(results) {
        const severities = new Map();
        for (const result of results) {
            for (const issue of result.issues) {
                severities.set(issue.severity, (severities.get(issue.severity) || 0) + 1);
            }
        }
        return Array.from(severities.entries())
            .sort((a, b) => {
            const order = [
                ReviewSeverity.CRITICAL,
                ReviewSeverity.HIGH,
                ReviewSeverity.MEDIUM,
                ReviewSeverity.LOW,
                ReviewSeverity.INFO
            ];
            return order.indexOf(a[0]) - order.indexOf(b[0]);
        })
            .map(([sev, count]) => `- ${sev}: ${count}`)
            .join('\n');
    }
    /**
    * Get top recommendations
    */
    getTopRecommendations(results) {
        const allRecommendations = results.flatMap(r => r.recommendations);
        const uniqueRecommendations = Array.from(new Set(allRecommendations));
        return uniqueRecommendations.slice(0, 5).map((rec, i) => `${i + 1}. ${rec}`).join('\n');
    }
    /**
    * Check if code passes review
    */
    passesReview(result, minScore = 70) {
        const hasCritical = result.issues.some(i => i.severity === ReviewSeverity.CRITICAL);
        const hasHighSecurity = result.issues.some(i => i.severity === ReviewSeverity.HIGH && i.category === ReviewCategory.SECURITY);
        return !hasCritical && !hasHighSecurity && result.score >= minScore;
    }
}
exports.CodeReviewAgent = CodeReviewAgent;
//# sourceMappingURL=codeReviewAgent.js.map