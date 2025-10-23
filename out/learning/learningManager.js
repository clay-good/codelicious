"use strict";
/**
 * Learning Manager
 *
 * Orchestrates the self-learning system by coordinating:
 * - Feedback collection
 * - Pattern learning
 * - Quality tracking
 * - Continuous improvement
 * - RAG integration
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LearningManager = void 0;
const feedbackManager_1 = require("./feedbackManager");
const patternLearner_1 = require("./patternLearner");
const advancedPatternRecognizer_1 = require("./advancedPatternRecognizer");
const patternCacheManager_1 = require("./patternCacheManager");
const patternEmbeddingService_1 = require("./patternEmbeddingService");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('LearningManager');
class LearningManager {
    constructor(context, analyticsManager, embeddingManager, vectorStore) {
        this.context = context;
        this.analyticsManager = analyticsManager;
        this.embeddingManager = embeddingManager;
        this.vectorStore = vectorStore;
        this.usedPatterns = [];
        this.feedbackManager = new feedbackManager_1.FeedbackManager(context);
        this.patternLearner = new patternLearner_1.PatternLearner(context, this.feedbackManager, embeddingManager, vectorStore);
        // Initialize advanced pattern recognition components if embedding manager is available
        if (embeddingManager) {
            this.initializeAdvancedComponents();
        }
        this.config = this.loadConfig();
        if (this.config.enabled && this.config.autoLearn) {
            this.startAutoLearning();
        }
    }
    /**
    * Initialize advanced pattern recognition components
    */
    initializeAdvancedComponents() {
        if (!this.embeddingManager) {
            logger.warn('Cannot initialize advanced components without embedding manager');
            return;
        }
        try {
            // Initialize advanced pattern recognizer
            this.advancedRecognizer = new advancedPatternRecognizer_1.AdvancedPatternRecognizer();
            logger.info('Advanced pattern recognizer initialized');
            // Initialize pattern cache manager
            this.patternCache = new patternCacheManager_1.PatternCacheManager(this.context, this.embeddingManager, {
                maxMemorySize: 50 * 1024 * 1024, // 50 MB
                maxDiskSize: 500 * 1024 * 1024, // 500 MB
                ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
                semanticThreshold: 0.85,
                enableDiskCache: true,
                enableSemanticCache: true
            });
            logger.info('Pattern cache manager initialized');
            // Initialize pattern embedding service
            this.patternEmbedding = new patternEmbeddingService_1.PatternEmbeddingService(this.embeddingManager, this.patternCache);
            logger.info('Pattern embedding service initialized');
            // Optimize embeddings for existing patterns
            this.optimizeExistingPatterns();
        }
        catch (error) {
            logger.error('Failed to initialize advanced components', error);
        }
    }
    /**
    * Optimize embeddings for existing patterns (background task)
    */
    async optimizeExistingPatterns() {
        if (!this.patternEmbedding)
            return;
        try {
            const patterns = this.patternLearner.getPatterns({ minSuccessRate: 70 });
            if (patterns.length > 0) {
                logger.info(`Optimizing embeddings for ${patterns.length} existing patterns...`);
                await this.patternEmbedding.optimizeEmbeddings(patterns);
                logger.info('Pattern embeddings optimized');
            }
        }
        catch (error) {
            logger.warn('Failed to optimize existing patterns', error);
        }
    }
    /**
    * Enhance code generation context with learned patterns
    */
    async enhanceContext(context) {
        if (!this.config.enabled || !this.config.usePatterns) {
            return {
                ...context,
                recommendedPatterns: { patterns: [], confidence: 0, reasoning: 'Learning disabled' },
                learningGuidance: '',
                qualityExpectations: ''
            };
        }
        // Get pattern recommendations
        const recommendations = await this.patternLearner.getRecommendations(context.prompt, context.language, context.taskType);
        // Track pattern usage
        const timestamp = Date.now();
        for (const match of recommendations.patterns) {
            this.usedPatterns.push({
                patternId: match.pattern.id,
                timestamp
            });
        }
        // Generate learning guidance
        const learningGuidance = this.generateLearningGuidance(recommendations);
        // Generate quality expectations
        const qualityExpectations = this.generateQualityExpectations(context);
        return {
            ...context,
            recommendedPatterns: recommendations,
            learningGuidance,
            qualityExpectations
        };
    }
    /**
    * Record approval of generated code
    */
    async recordApproval(context, generatedCode, timeToApproval, iterationCount = 1, usedPatternIds = []) {
        // Record feedback
        await this.feedbackManager.recordApproval(context.prompt, generatedCode, context.language, context.taskType, timeToApproval, iterationCount);
        // Update pattern metrics if patterns were used
        for (const patternId of usedPatternIds) {
            await this.patternLearner.updatePatternMetrics(patternId, true, 90);
        }
        // Track in analytics
        if (this.analyticsManager) {
            this.analyticsManager.trackUsage('code_approval', timeToApproval);
        }
        // Trigger learning if threshold reached
        await this.checkAndLearn();
    }
    /**
    * Record rejection of generated code
    */
    async recordRejection(context, generatedCode, reason, usedPatternIds = []) {
        // Record feedback
        await this.feedbackManager.recordRejection(context.prompt, generatedCode, context.language, context.taskType, reason);
        // Update pattern metrics if patterns were used
        for (const patternId of usedPatternIds) {
            await this.patternLearner.updatePatternMetrics(patternId, false, 20);
        }
        // Track in analytics
        if (this.analyticsManager) {
            this.analyticsManager.trackUsage('code_rejection', 0);
        }
    }
    /**
    * Record modification of generated code
    */
    async recordModification(context, generatedCode, modifiedCode, usedPatternIds = []) {
        // Detect modifications (simplified - can be enhanced with diff algorithm)
        const modifications = this.detectModifications(generatedCode, modifiedCode);
        // Record feedback
        await this.feedbackManager.recordModification(context.prompt, generatedCode, modifiedCode, context.language, context.taskType, modifications);
        // Calculate quality based on modification count
        const qualityScore = Math.max(100 - (modifications.length * 10), 50);
        // Update pattern metrics
        for (const patternId of usedPatternIds) {
            await this.patternLearner.updatePatternMetrics(patternId, true, qualityScore);
        }
        // Track in analytics
        if (this.analyticsManager) {
            this.analyticsManager.trackUsage('code_modification', 0);
        }
        // Trigger learning
        await this.checkAndLearn();
    }
    /**
    * Record test results
    */
    async recordTestResults(context, generatedCode, testResults, usedPatternIds = []) {
        // Record feedback
        await this.feedbackManager.recordTestResults(context.prompt, generatedCode, context.language, context.taskType, testResults);
        // Calculate quality from test results
        const qualityScore = (testResults.passed / testResults.total) * 100;
        const success = testResults.passed === testResults.total;
        // Update pattern metrics
        for (const patternId of usedPatternIds) {
            await this.patternLearner.updatePatternMetrics(patternId, success, qualityScore);
        }
        // Track in analytics
        if (this.analyticsManager) {
            this.analyticsManager.trackPerformance('test_execution', testResults.duration, success, { passed: testResults.passed, total: testResults.total });
        }
        // Trigger learning
        await this.checkAndLearn();
    }
    /**
    * Get learning statistics
    */
    getStats() {
        const feedbackSummary = this.feedbackManager.getSummary();
        const patternStats = this.patternLearner.getStatistics();
        // Calculate patterns used today
        const todayStart = new Date().setHours(0, 0, 0, 0);
        const patternsUsedToday = this.usedPatterns.filter(p => p.timestamp >= todayStart).length;
        return {
            totalFeedback: feedbackSummary.totalFeedback,
            totalPatterns: patternStats.totalPatterns,
            approvalRate: feedbackSummary.approvalRate,
            averageQualityScore: feedbackSummary.averageQualityScore,
            improvementRate: feedbackSummary.improvementTrend,
            lastLearningRun: this.context.globalState.get('lastLearningRun', 0),
            patternsUsedToday
        };
    }
    /**
    * Manually trigger learning
    */
    async learn(options) {
        logger.info('Starting learning process...');
        const learnedCount = await this.patternLearner.learnFromFeedback(options);
        await this.context.globalState.update('lastLearningRun', Date.now());
        logger.info(`Learning complete: ${learnedCount} new patterns`);
        return learnedCount;
    }
    /**
    * Export learned patterns for RAG
    */
    async exportPatternsForRAG() {
        return this.patternLearner.exportForRAG();
    }
    /**
    * Get configuration
    */
    getConfig() {
        return { ...this.config };
    }
    /**
    * Update configuration
    */
    async updateConfig(config) {
        this.config = { ...this.config, ...config };
        await this.saveConfig();
        // Restart auto-learning if needed
        if (this.config.enabled && this.config.autoLearn) {
            this.startAutoLearning();
        }
        else {
            this.stopAutoLearning();
        }
    }
    /**
    * Get advanced pattern recognizer
    */
    getAdvancedRecognizer() {
        return this.advancedRecognizer;
    }
    /**
    * Get pattern cache manager
    */
    getPatternCache() {
        return this.patternCache;
    }
    /**
    * Get pattern embedding service
    */
    getPatternEmbedding() {
        return this.patternEmbedding;
    }
    /**
    * Extract structural patterns from code using AST
    */
    async extractStructuralPatterns(code, filePath, options) {
        if (!this.advancedRecognizer) {
            logger.warn('Advanced pattern recognizer not available');
            return [];
        }
        return this.advancedRecognizer.extractPatterns(code, filePath, options);
    }
    /**
    * Find similar patterns using cache
    */
    async findSimilarPatterns(query, limit = 5) {
        if (!this.patternCache || !this.embeddingManager) {
            logger.warn('Pattern cache or embedding manager not available');
            return [];
        }
        const embedding = await this.embeddingManager.generateEmbedding(query);
        const results = await this.patternCache.findSimilar(query, embedding, limit);
        return results.map(r => r.pattern);
    }
    /**
    * Get cache statistics
    */
    getCacheStats() {
        if (!this.patternCache) {
            return { available: false };
        }
        return {
            available: true,
            ...this.patternCache.getStats()
        };
    }
    /**
    * Optimize pattern cache
    */
    async optimizeCache() {
        if (this.patternCache) {
            await this.patternCache.optimize();
            logger.info('Pattern cache optimized');
        }
    }
    /**
    * Dispose resources
    */
    dispose() {
        this.stopAutoLearning();
    }
    // Private methods
    generateLearningGuidance(recommendations) {
        if (recommendations.patterns.length === 0) {
            return '';
        }
        const topPattern = recommendations.patterns[0];
        return `Based on ${topPattern.pattern.usageCount} successful examples with ${topPattern.pattern.successRate.toFixed(1)}% success rate, consider using similar patterns.`;
    }
    generateQualityExpectations(context) {
        const summary = this.feedbackManager.getSummary({
            language: context.language,
            taskType: context.taskType
        });
        if (summary.totalFeedback < 5) {
            return 'Generate high-quality, production-ready code with proper error handling and tests.';
        }
        return `Target quality score: ${summary.averageQualityScore.toFixed(0)}+. Common successful patterns: ${summary.commonPatterns.slice(0, 3).map(p => p.pattern).join(', ')}`;
    }
    detectModifications(original, modified) {
        // Simplified modification detection
        // In production, use a proper diff algorithm
        const originalLines = original.split('\n');
        const modifiedLines = modified.split('\n');
        const modifications = [];
        const maxLines = Math.max(originalLines.length, modifiedLines.length);
        for (let i = 0; i < maxLines; i++) {
            const origLine = originalLines[i] || '';
            const modLine = modifiedLines[i] || '';
            if (origLine !== modLine) {
                modifications.push({
                    type: (origLine === '' ? 'addition' : modLine === '' ? 'deletion' : 'change'),
                    lineNumber: i + 1,
                    originalCode: origLine,
                    modifiedCode: modLine
                });
            }
        }
        return modifications;
    }
    async checkAndLearn() {
        if (!this.config.enabled || !this.config.autoLearn) {
            return;
        }
        const stats = this.getStats();
        if (stats.totalFeedback >= this.config.minFeedbackForLearning) {
            const lastRun = this.context.globalState.get('lastLearningRun', 0);
            const timeSinceLastRun = Date.now() - lastRun;
            if (timeSinceLastRun >= this.config.learningInterval) {
                await this.learn();
            }
        }
    }
    startAutoLearning() {
        this.stopAutoLearning();
        this.learningTimer = setInterval(async () => {
            await this.checkAndLearn();
        }, this.config.learningInterval);
        logger.info('Auto-learning enabled');
    }
    stopAutoLearning() {
        if (this.learningTimer) {
            clearInterval(this.learningTimer);
            this.learningTimer = undefined;
            logger.info('Auto-learning disabled');
        }
    }
    loadConfig() {
        return this.context.globalState.get('learningConfig', {
            enabled: true,
            autoLearn: true,
            learningInterval: 3600000, // 1 hour
            minFeedbackForLearning: 10,
            usePatterns: true,
            sharePatterns: false
        });
    }
    async saveConfig() {
        await this.context.globalState.update('learningConfig', this.config);
    }
}
exports.LearningManager = LearningManager;
//# sourceMappingURL=learningManager.js.map