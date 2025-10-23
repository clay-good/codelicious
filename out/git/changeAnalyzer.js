"use strict";
/**
 * Change Analyzer - Analyze code changes for impact and risk
 * Provides insights about changes before committing or creating PRs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeAnalyzer = exports.RiskLevel = exports.ImpactLevel = void 0;
const gitService_1 = require("./gitService");
var ImpactLevel;
(function (ImpactLevel) {
    ImpactLevel["MINIMAL"] = "minimal";
    ImpactLevel["LOW"] = "low";
    ImpactLevel["MEDIUM"] = "medium";
    ImpactLevel["HIGH"] = "high";
    ImpactLevel["CRITICAL"] = "critical";
})(ImpactLevel || (exports.ImpactLevel = ImpactLevel = {}));
var RiskLevel;
(function (RiskLevel) {
    RiskLevel["SAFE"] = "safe";
    RiskLevel["LOW"] = "low";
    RiskLevel["MEDIUM"] = "medium";
    RiskLevel["HIGH"] = "high";
    RiskLevel["CRITICAL"] = "critical";
})(RiskLevel || (exports.RiskLevel = RiskLevel = {}));
class ChangeAnalyzer {
    constructor(gitService, modelOrchestrator) {
        this.gitService = gitService;
        this.modelOrchestrator = modelOrchestrator;
    }
    /**
    * Analyze staged changes
    */
    async analyzeStagedChanges() {
        const status = await this.gitService.getStatus();
        if (status.staged.length === 0) {
            throw new Error('No staged changes to analyze');
        }
        const diffs = await this.gitService.getStagedDiff();
        return this.analyzeChanges(status.staged, diffs);
    }
    /**
    * Analyze unstaged changes
    */
    async analyzeUnstagedChanges() {
        const status = await this.gitService.getStatus();
        if (status.unstaged.length === 0) {
            throw new Error('No unstaged changes to analyze');
        }
        const diffs = await this.gitService.getUnstagedDiff();
        return this.analyzeChanges(status.unstaged, diffs);
    }
    /**
    * Analyze all changes (staged + unstaged)
    */
    async analyzeAllChanges() {
        const status = await this.gitService.getStatus();
        if (!status.hasChanges) {
            throw new Error('No changes to analyze');
        }
        const [stagedDiffs, unstagedDiffs] = await Promise.all([
            this.gitService.getStagedDiff(),
            this.gitService.getUnstagedDiff()
        ]);
        const allFiles = [...status.staged, ...status.unstaged];
        const allDiffs = [...stagedDiffs, ...unstagedDiffs];
        return this.analyzeChanges(allFiles, allDiffs);
    }
    /**
    * Analyze changes and provide insights
    */
    async analyzeChanges(files, diffs) {
        // Calculate metrics
        const metrics = this.calculateMetrics(files, diffs);
        // Determine impact and risk
        const impact = this.determineImpact(metrics, files);
        const risk = this.determineRisk(metrics, files);
        // Get affected areas
        const affectedAreas = this.getAffectedAreas(files);
        // Generate suggestions and warnings
        const suggestions = this.generateSuggestions(metrics, files, diffs);
        const warnings = this.generateWarnings(metrics, files, risk);
        // Generate AI-powered summary
        const summary = await this.generateSummary(files, diffs, metrics, impact, risk);
        return {
            impact,
            risk,
            affectedAreas,
            suggestions,
            warnings,
            metrics,
            summary
        };
    }
    /**
    * Calculate change metrics
    */
    calculateMetrics(files, diffs) {
        let linesAdded = 0;
        let linesDeleted = 0;
        for (const diff of diffs) {
            linesAdded += diff.additions;
            linesDeleted += diff.deletions;
        }
        const linesModified = linesAdded + linesDeleted;
        // Calculate complexity based on changes
        const complexity = this.calculateComplexity(files, diffs);
        // Check for test coverage
        const testCoverage = files.some(f => f.path.includes('test') ||
            f.path.includes('spec') ||
            f.path.includes('__tests__'));
        // Check for breaking changes (heuristic)
        const hasBreakingChanges = this.detectBreakingChanges(files, diffs);
        return {
            filesChanged: files.length,
            linesAdded,
            linesDeleted,
            linesModified,
            complexity,
            testCoverage,
            hasBreakingChanges
        };
    }
    /**
    * Calculate complexity score (0-100)
    */
    calculateComplexity(files, diffs) {
        let score = 0;
        // File count factor (0-30 points)
        score += Math.min(files.length * 3, 30);
        // Lines changed factor (0-30 points)
        const totalLines = diffs.reduce((sum, d) => sum + d.additions + d.deletions, 0);
        score += Math.min(totalLines / 10, 30);
        // File type factor (0-20 points)
        const hasCoreFiles = files.some(f => f.path.includes('core') ||
            f.path.includes('engine') ||
            f.path.includes('service'));
        if (hasCoreFiles)
            score += 20;
        // Deletion factor (0-20 points)
        const deletionRatio = diffs.reduce((sum, d) => sum + d.deletions, 0) /
            Math.max(diffs.reduce((sum, d) => sum + d.additions, 0), 1);
        if (deletionRatio > 0.5)
            score += 20;
        return Math.min(Math.round(score), 100);
    }
    /**
    * Detect potential breaking changes
    */
    detectBreakingChanges(files, diffs) {
        // Check for deleted files
        if (files.some(f => f.status === gitService_1.GitFileStatus.DELETED)) {
            return true;
        }
        // Check for changes to public APIs (heuristic)
        const hasAPIChanges = files.some(f => f.path.includes('api') ||
            f.path.includes('interface') ||
            f.path.includes('types'));
        // Check for significant deletions
        const totalDeletions = diffs.reduce((sum, d) => sum + d.deletions, 0);
        const totalAdditions = diffs.reduce((sum, d) => sum + d.additions, 0);
        return hasAPIChanges && totalDeletions > totalAdditions * 0.3;
    }
    /**
    * Determine impact level
    */
    determineImpact(metrics, files) {
        if (metrics.filesChanged === 1 && metrics.linesModified < 10) {
            return ImpactLevel.MINIMAL;
        }
        if (metrics.filesChanged <= 3 && metrics.linesModified < 50) {
            return ImpactLevel.LOW;
        }
        if (metrics.filesChanged <= 10 && metrics.linesModified < 200) {
            return ImpactLevel.MEDIUM;
        }
        if (metrics.filesChanged <= 20 && metrics.linesModified < 500) {
            return ImpactLevel.HIGH;
        }
        return ImpactLevel.CRITICAL;
    }
    /**
    * Determine risk level
    */
    determineRisk(metrics, files) {
        let riskScore = 0;
        // Complexity factor
        riskScore += metrics.complexity * 0.3;
        // No tests factor
        if (!metrics.testCoverage) {
            riskScore += 20;
        }
        // Breaking changes factor
        if (metrics.hasBreakingChanges) {
            riskScore += 30;
        }
        // Core files factor
        const hasCoreFiles = files.some(f => f.path.includes('core') ||
            f.path.includes('engine'));
        if (hasCoreFiles) {
            riskScore += 20;
        }
        if (riskScore < 20)
            return RiskLevel.SAFE;
        if (riskScore < 40)
            return RiskLevel.LOW;
        if (riskScore < 60)
            return RiskLevel.MEDIUM;
        if (riskScore < 80)
            return RiskLevel.HIGH;
        return RiskLevel.CRITICAL;
    }
    /**
    * Get affected areas
    */
    getAffectedAreas(files) {
        const areas = new Set();
        for (const file of files) {
            const parts = file.path.split('/');
            if (parts.length > 1) {
                areas.add(parts[0]);
            }
        }
        return Array.from(areas);
    }
    /**
    * Generate suggestions
    */
    generateSuggestions(metrics, files, diffs) {
        const suggestions = [];
        if (!metrics.testCoverage) {
            suggestions.push('Consider adding tests for these changes');
        }
        if (metrics.complexity > 70) {
            suggestions.push('Consider breaking this into smaller commits');
        }
        if (metrics.hasBreakingChanges) {
            suggestions.push('Document breaking changes in commit message');
            suggestions.push('Update version number appropriately');
        }
        if (metrics.filesChanged > 15) {
            suggestions.push('Large changeset - consider splitting into multiple PRs');
        }
        const hasDocs = files.some(f => f.path.endsWith('.md'));
        if (!hasDocs && metrics.filesChanged > 5) {
            suggestions.push('Consider updating documentation');
        }
        return suggestions;
    }
    /**
    * Generate warnings
    */
    generateWarnings(metrics, files, risk) {
        const warnings = [];
        if (risk === RiskLevel.HIGH || risk === RiskLevel.CRITICAL) {
            warnings.push(`High risk changes detected (${risk})`);
        }
        if (metrics.hasBreakingChanges) {
            warnings.push('Potential breaking changes detected');
        }
        const hasDeletedFiles = files.some(f => f.status === gitService_1.GitFileStatus.DELETED);
        if (hasDeletedFiles) {
            warnings.push('Files will be deleted');
        }
        if (metrics.linesDeleted > metrics.linesAdded * 2) {
            warnings.push('Significant code deletion detected');
        }
        return warnings;
    }
    /**
    * Generate AI-powered summary
    */
    async generateSummary(files, diffs, metrics, impact, risk) {
        const prompt = `Analyze these code changes and provide a brief summary:\n\n` +
            `Files changed: ${metrics.filesChanged}\n` +
            `Lines added: ${metrics.linesAdded}\n` +
            `Lines deleted: ${metrics.linesDeleted}\n` +
            `Impact: ${impact}\n` +
            `Risk: ${risk}\n` +
            `Has tests: ${metrics.testCoverage}\n` +
            `Breaking changes: ${metrics.hasBreakingChanges}\n\n` +
            `Files: ${files.map(f => f.path).join(', ')}\n\n` +
            `Provide a 2-3 sentence summary of what these changes do and their significance.`;
        try {
            const modelResponse = await this.modelOrchestrator.sendRequest({
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                maxTokens: 200
            });
            return modelResponse.content.trim();
        }
        catch (error) {
            return `${metrics.filesChanged} files changed with ${metrics.linesModified} lines modified. Impact: ${impact}, Risk: ${risk}.`;
        }
    }
}
exports.ChangeAnalyzer = ChangeAnalyzer;
//# sourceMappingURL=changeAnalyzer.js.map