"use strict";
/**
 * Feedback Manager
 *
 * Captures and processes user feedback on generated code to enable
 * continuous learning and improvement. Tracks:
 * - User approvals/rejections
 * - Code corrections and modifications
 * - Test results and quality metrics
 * - Usage patterns and preferences
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
exports.FeedbackManager = exports.FeedbackSentiment = exports.FeedbackType = void 0;
const crypto = __importStar(require("crypto"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('FeedbackManager');
var FeedbackType;
(function (FeedbackType) {
    FeedbackType["APPROVAL"] = "approval";
    FeedbackType["REJECTION"] = "rejection";
    FeedbackType["MODIFICATION"] = "modification";
    FeedbackType["TEST_PASS"] = "test_pass";
    FeedbackType["TEST_FAIL"] = "test_fail";
    FeedbackType["ERROR"] = "error";
    FeedbackType["MANUAL_FIX"] = "manual_fix";
})(FeedbackType || (exports.FeedbackType = FeedbackType = {}));
var FeedbackSentiment;
(function (FeedbackSentiment) {
    FeedbackSentiment["POSITIVE"] = "positive";
    FeedbackSentiment["NEUTRAL"] = "neutral";
    FeedbackSentiment["NEGATIVE"] = "negative";
})(FeedbackSentiment || (exports.FeedbackSentiment = FeedbackSentiment = {}));
class FeedbackManager {
    constructor(context) {
        this.context = context;
        this.feedback = new Map();
        this.STORAGE_KEY = 'codelicious.feedback';
        this.MAX_FEEDBACK_ENTRIES = 10000;
        this.loadFeedback();
    }
    /**
    * Record user feedback on generated code
    */
    async recordFeedback(feedback) {
        const id = this.generateId();
        const timestamp = Date.now();
        const promptHash = this.hashContent(feedback.prompt);
        const codeHash = this.hashContent(feedback.generatedCode);
        const completeFeedback = {
            id,
            timestamp,
            promptHash,
            codeHash,
            ...feedback
        };
        this.feedback.set(id, completeFeedback);
        // Trim if too large
        if (this.feedback.size > this.MAX_FEEDBACK_ENTRIES) {
            this.trimOldFeedback();
        }
        await this.saveFeedback();
        logger.info(`Recorded ${feedback.type} feedback: ${feedback.sentiment} (quality: ${feedback.qualityScore})`);
        return id;
    }
    /**
    * Record approval
    */
    async recordApproval(prompt, generatedCode, language, taskType, timeToApproval, iterationCount = 1) {
        return this.recordFeedback({
            type: FeedbackType.APPROVAL,
            sentiment: FeedbackSentiment.POSITIVE,
            prompt,
            generatedCode,
            language,
            taskType,
            approved: true,
            qualityScore: 90,
            timeToApproval,
            iterationCount,
            tags: this.extractTags(prompt, generatedCode),
            patterns: this.extractPatterns(generatedCode, language),
            antiPatterns: []
        });
    }
    /**
    * Record rejection
    */
    async recordRejection(prompt, generatedCode, language, taskType, reason) {
        return this.recordFeedback({
            type: FeedbackType.REJECTION,
            sentiment: FeedbackSentiment.NEGATIVE,
            prompt,
            generatedCode,
            language,
            taskType,
            approved: false,
            qualityScore: 20,
            userComment: reason,
            iterationCount: 1,
            tags: this.extractTags(prompt, generatedCode),
            patterns: [],
            antiPatterns: this.extractPatterns(generatedCode, language)
        });
    }
    /**
    * Record modification (user edited the generated code)
    */
    async recordModification(prompt, generatedCode, modifiedCode, language, taskType, modifications) {
        const qualityScore = this.calculateModificationQuality(modifications);
        return this.recordFeedback({
            type: FeedbackType.MODIFICATION,
            sentiment: qualityScore > 70 ? FeedbackSentiment.POSITIVE : FeedbackSentiment.NEUTRAL,
            prompt,
            generatedCode,
            modifiedCode,
            modifications,
            language,
            taskType,
            approved: true,
            qualityScore,
            iterationCount: 1,
            tags: this.extractTags(prompt, modifiedCode),
            patterns: this.extractPatterns(modifiedCode, language),
            antiPatterns: this.extractAntiPatternsFromModifications(modifications)
        });
    }
    /**
    * Record test results
    */
    async recordTestResults(prompt, generatedCode, language, taskType, testResults) {
        const passed = testResults.passed === testResults.total;
        const qualityScore = (testResults.passed / testResults.total) * 100;
        return this.recordFeedback({
            type: passed ? FeedbackType.TEST_PASS : FeedbackType.TEST_FAIL,
            sentiment: passed ? FeedbackSentiment.POSITIVE : FeedbackSentiment.NEGATIVE,
            prompt,
            generatedCode,
            language,
            taskType,
            approved: passed,
            testResults,
            qualityScore,
            iterationCount: 1,
            tags: this.extractTags(prompt, generatedCode),
            patterns: passed ? this.extractPatterns(generatedCode, language) : [],
            antiPatterns: passed ? [] : this.extractPatterns(generatedCode, language)
        });
    }
    /**
    * Get feedback summary
    */
    getSummary(options = {}) {
        let feedbackList = Array.from(this.feedback.values());
        // Apply filters
        if (options.language) {
            feedbackList = feedbackList.filter(f => f.language === options.language);
        }
        if (options.taskType) {
            feedbackList = feedbackList.filter(f => f.taskType === options.taskType);
        }
        if (options.days) {
            const cutoff = Date.now() - (options.days * 24 * 60 * 60 * 1000);
            feedbackList = feedbackList.filter(f => f.timestamp > cutoff);
        }
        if (feedbackList.length === 0) {
            return {
                totalFeedback: 0,
                approvalRate: 0,
                averageQualityScore: 0,
                averageIterations: 0,
                commonPatterns: [],
                commonIssues: [],
                improvementTrend: 0
            };
        }
        // Calculate metrics
        const approvals = feedbackList.filter(f => f.approved).length;
        const approvalRate = (approvals / feedbackList.length) * 100;
        const averageQualityScore = feedbackList.reduce((sum, f) => sum + f.qualityScore, 0) / feedbackList.length;
        const averageIterations = feedbackList.reduce((sum, f) => sum + f.iterationCount, 0) / feedbackList.length;
        // Extract common patterns
        const patternCounts = new Map();
        feedbackList.forEach(f => {
            f.patterns.forEach(p => {
                patternCounts.set(p, (patternCounts.get(p) || 0) + 1);
            });
        });
        const commonPatterns = Array.from(patternCounts.entries())
            .map(([pattern, count]) => ({ pattern, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        // Extract common issues
        const issueCounts = new Map();
        feedbackList.forEach(f => {
            f.antiPatterns.forEach(p => {
                issueCounts.set(p, (issueCounts.get(p) || 0) + 1);
            });
        });
        const commonIssues = Array.from(issueCounts.entries())
            .map(([issue, count]) => ({ issue, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        // Calculate improvement trend
        const improvementTrend = this.calculateImprovementTrend(feedbackList);
        return {
            totalFeedback: feedbackList.length,
            approvalRate,
            averageQualityScore,
            averageIterations,
            commonPatterns,
            commonIssues,
            improvementTrend
        };
    }
    /**
    * Generate learning insights from feedback
    */
    generateInsights(options = {}) {
        const summary = this.getSummary(options);
        const insights = [];
        const minConfidence = options.minConfidence || 0.7;
        // Pattern insights
        summary.commonPatterns.forEach(({ pattern, count }) => {
            const confidence = Math.min(count / summary.totalFeedback, 1);
            if (confidence >= minConfidence) {
                insights.push({
                    type: 'pattern',
                    description: `Successful pattern: ${pattern}`,
                    confidence,
                    examples: this.getExamplesForPattern(pattern, true),
                    frequency: count,
                    impact: confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low'
                });
            }
        });
        // Anti-pattern insights
        summary.commonIssues.forEach(({ issue, count }) => {
            const confidence = Math.min(count / summary.totalFeedback, 1);
            if (confidence >= minConfidence) {
                insights.push({
                    type: 'anti_pattern',
                    description: `Avoid: ${issue}`,
                    confidence,
                    examples: this.getExamplesForPattern(issue, false),
                    frequency: count,
                    impact: confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low'
                });
            }
        });
        return insights.sort((a, b) => b.confidence - a.confidence);
    }
    // Helper methods
    generateId() {
        return `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }
    extractTags(prompt, code) {
        const tags = [];
        // Extract from prompt
        if (prompt.toLowerCase().includes('test'))
            tags.push('testing');
        if (prompt.toLowerCase().includes('api'))
            tags.push('api');
        if (prompt.toLowerCase().includes('database'))
            tags.push('database');
        if (prompt.toLowerCase().includes('async'))
            tags.push('async');
        return [...new Set(tags)];
    }
    extractPatterns(code, language) {
        // Simple pattern extraction - can be enhanced with AST parsing
        const patterns = [];
        if (code.includes('async') && code.includes('await'))
            patterns.push('async_await');
        if (code.includes('try') && code.includes('catch'))
            patterns.push('error_handling');
        if (code.includes('class'))
            patterns.push('oop');
        if (code.includes('interface') || code.includes('type'))
            patterns.push('type_safety');
        return patterns;
    }
    extractAntiPatternsFromModifications(modifications) {
        // Analyze what user changed to identify anti-patterns
        return [];
    }
    calculateModificationQuality(modifications) {
        // Fewer modifications = higher quality
        const modCount = modifications.length;
        if (modCount === 0)
            return 100;
        if (modCount <= 2)
            return 85;
        if (modCount <= 5)
            return 70;
        if (modCount <= 10)
            return 50;
        return 30;
    }
    calculateImprovementTrend(feedbackList) {
        if (feedbackList.length < 10)
            return 0;
        // Sort by timestamp
        const sorted = feedbackList.sort((a, b) => a.timestamp - b.timestamp);
        // Compare first half vs second half
        const midpoint = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, midpoint);
        const secondHalf = sorted.slice(midpoint);
        const firstAvg = firstHalf.reduce((sum, f) => sum + f.qualityScore, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, f) => sum + f.qualityScore, 0) / secondHalf.length;
        return secondAvg - firstAvg;
    }
    getExamplesForPattern(pattern, positive) {
        return Array.from(this.feedback.values())
            .filter(f => positive ? f.patterns.includes(pattern) : f.antiPatterns.includes(pattern))
            .slice(0, 3)
            .map(f => f.generatedCode.substring(0, 200));
    }
    trimOldFeedback() {
        const sorted = Array.from(this.feedback.entries())
            .sort((a, b) => b[1].timestamp - a[1].timestamp);
        const toKeep = sorted.slice(0, this.MAX_FEEDBACK_ENTRIES);
        this.feedback = new Map(toKeep);
    }
    async loadFeedback() {
        const stored = this.context.globalState.get(this.STORAGE_KEY);
        if (stored) {
            this.feedback = new Map(stored);
            logger.info(` Loaded ${this.feedback.size} feedback entries`);
        }
    }
    async saveFeedback() {
        await this.context.globalState.update(this.STORAGE_KEY, Array.from(this.feedback.entries()));
    }
}
exports.FeedbackManager = FeedbackManager;
//# sourceMappingURL=feedbackManager.js.map