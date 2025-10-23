"use strict";
/**
 * Pattern Learner
 *
 * Extracts, stores, and retrieves successful code patterns from user feedback.
 * Uses these patterns to improve future code generation through RAG integration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatternLearner = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('PatternLearner');
class PatternLearner {
    constructor(context, feedbackManager, embeddingManager, vectorStore) {
        this.context = context;
        this.feedbackManager = feedbackManager;
        this.embeddingManager = embeddingManager;
        this.vectorStore = vectorStore;
        this.patterns = new Map();
        this.STORAGE_KEY = 'codelicious.patterns';
        this.MIN_SUCCESS_RATE = 70;
        this.MIN_USAGE_COUNT = 3;
        this.SIMILARITY_THRESHOLD = 0.75;
        this.loadPatterns();
    }
    /**
    * Learn patterns from recent feedback
    */
    async learnFromFeedback(options = {}) {
        logger.info(' Learning patterns from feedback...');
        const insights = this.feedbackManager.generateInsights({
            ...options,
            minConfidence: 0.7
        });
        let learnedCount = 0;
        for (const insight of insights) {
            if (insight.type === 'pattern' && insight.impact !== 'low') {
                const pattern = await this.createPatternFromInsight(insight, options);
                if (pattern) {
                    await this.addPattern(pattern);
                    learnedCount++;
                }
            }
        }
        logger.info(`Learned ${learnedCount} new patterns`);
        return learnedCount;
    }
    /**
    * Find patterns similar to a prompt
    */
    async findSimilarPatterns(prompt, language, taskType, limit = 5) {
        // Filter by language and task type
        const candidates = Array.from(this.patterns.values())
            .filter(p => p.language === language && p.taskType === taskType)
            .filter(p => p.successRate >= this.MIN_SUCCESS_RATE)
            .filter(p => p.usageCount >= this.MIN_USAGE_COUNT);
        if (candidates.length === 0) {
            return [];
        }
        // Generate embedding for prompt
        if (!this.embeddingManager) {
            // Fallback to keyword matching
            return this.findPatternsByKeywords(prompt, candidates, limit);
        }
        const promptEmbedding = await this.embeddingManager.generateEmbedding(prompt);
        // Calculate similarity scores
        const matches = [];
        for (const pattern of candidates) {
            const similarity = this.cosineSimilarity(promptEmbedding, pattern.embedding);
            if (similarity >= this.SIMILARITY_THRESHOLD) {
                const relevance = this.calculateRelevance(pattern, prompt);
                matches.push({ pattern, similarity, relevance });
            }
        }
        // Sort by relevance (combination of similarity and quality)
        matches.sort((a, b) => b.relevance - a.relevance);
        return matches.slice(0, limit);
    }
    /**
    * Get pattern recommendations for a prompt
    */
    async getRecommendations(prompt, language, taskType) {
        const matches = await this.findSimilarPatterns(prompt, language, taskType);
        if (matches.length === 0) {
            return {
                patterns: [],
                confidence: 0,
                reasoning: 'No similar patterns found'
            };
        }
        const avgConfidence = matches.reduce((sum, m) => sum + m.pattern.confidence, 0) / matches.length;
        const reasoning = this.generateRecommendationReasoning(matches);
        return {
            patterns: matches,
            confidence: avgConfidence,
            reasoning
        };
    }
    /**
    * Update pattern metrics after usage
    */
    async updatePatternMetrics(patternId, success, qualityScore) {
        const pattern = this.patterns.get(patternId);
        if (!pattern)
            return;
        // Update usage count
        pattern.usageCount++;
        pattern.lastUsed = Date.now();
        // Update success rate
        const totalScore = pattern.successRate * (pattern.usageCount - 1) + (success ? 100 : 0);
        pattern.successRate = totalScore / pattern.usageCount;
        // Update average quality score
        const totalQuality = pattern.averageQualityScore * (pattern.usageCount - 1) + qualityScore;
        pattern.averageQualityScore = totalQuality / pattern.usageCount;
        // Update confidence based on usage and success
        pattern.confidence = Math.min((pattern.usageCount / 10) * (pattern.successRate / 100), 1);
        // Update impact
        if (pattern.confidence > 0.8 && pattern.successRate > 85) {
            pattern.impact = 'high';
        }
        else if (pattern.confidence > 0.6 && pattern.successRate > 70) {
            pattern.impact = 'medium';
        }
        else {
            pattern.impact = 'low';
        }
        pattern.updatedAt = Date.now();
        await this.savePatterns();
    }
    /**
    * Get all patterns
    */
    getPatterns(filter) {
        let patterns = Array.from(this.patterns.values());
        if (filter) {
            if (filter.language) {
                patterns = patterns.filter(p => p.language === filter.language);
            }
            if (filter.taskType) {
                patterns = patterns.filter(p => p.taskType === filter.taskType);
            }
            if (filter.minSuccessRate !== undefined) {
                patterns = patterns.filter(p => p.successRate >= filter.minSuccessRate);
            }
        }
        return patterns.sort((a, b) => b.successRate - a.successRate);
    }
    /**
    * Get pattern statistics
    */
    getStatistics() {
        const patterns = Array.from(this.patterns.values());
        const byLanguage = {};
        const byTaskType = {};
        patterns.forEach(p => {
            byLanguage[p.language] = (byLanguage[p.language] || 0) + 1;
            byTaskType[p.taskType] = (byTaskType[p.taskType] || 0) + 1;
        });
        const averageSuccessRate = patterns.length > 0
            ? patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length
            : 0;
        const highImpactPatterns = patterns.filter(p => p.impact === 'high').length;
        return {
            totalPatterns: patterns.length,
            byLanguage,
            byTaskType,
            averageSuccessRate,
            highImpactPatterns
        };
    }
    /**
    * Export patterns for RAG integration
    */
    async exportForRAG() {
        const patterns = this.getPatterns({ minSuccessRate: this.MIN_SUCCESS_RATE });
        return patterns.map(p => ({
            id: p.id,
            content: `# ${p.name}\n\n${p.description}\n\n\`\`\`${p.language}\n${p.code}\n\`\`\``,
            metadata: {
                type: 'learned_pattern',
                language: p.language,
                taskType: p.taskType,
                successRate: p.successRate,
                confidence: p.confidence,
                tags: p.tags
            }
        }));
    }
    // Private helper methods
    async createPatternFromInsight(insight, options) {
        if (insight.examples.length === 0)
            return null;
        const code = insight.examples[0];
        const embedding = this.embeddingManager
            ? await this.embeddingManager.generateEmbedding(code)
            : new Array(384).fill(0);
        const opts = options && typeof options === 'object' ? options : {};
        const pattern = {
            id: this.generateId(),
            name: insight.description,
            description: insight.description,
            language: opts.language || 'typescript',
            taskType: opts.taskType || 'code_generation',
            code,
            codeHash: this.hashContent(code),
            embedding,
            successRate: insight.confidence * 100,
            usageCount: insight.frequency,
            averageQualityScore: 85,
            lastUsed: Date.now(),
            tags: [],
            relatedPrompts: [],
            examples: [],
            confidence: insight.confidence,
            impact: insight.impact,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        return pattern;
    }
    async addPattern(pattern) {
        this.patterns.set(pattern.id, pattern);
        await this.savePatterns();
    }
    calculateRelevance(pattern, prompt) {
        // Combine similarity, success rate, and usage count
        const qualityScore = (pattern.successRate / 100) * 0.4;
        const usageScore = Math.min(pattern.usageCount / 20, 1) * 0.3;
        const confidenceScore = pattern.confidence * 0.3;
        return qualityScore + usageScore + confidenceScore;
    }
    generateRecommendationReasoning(matches) {
        if (matches.length === 0)
            return 'No patterns found';
        const topMatch = matches[0];
        const avgSuccess = matches.reduce((sum, m) => sum + m.pattern.successRate, 0) / matches.length;
        return `Found ${matches.length} similar pattern(s). Top match has ${topMatch.pattern.successRate.toFixed(1)}% success rate with ${topMatch.pattern.usageCount} uses. Average success rate: ${avgSuccess.toFixed(1)}%`;
    }
    findPatternsByKeywords(prompt, candidates, limit) {
        const keywords = prompt.toLowerCase().split(/\s+/);
        const matches = [];
        for (const pattern of candidates) {
            const patternText = `${pattern.name} ${pattern.description} ${pattern.code}`.toLowerCase();
            const matchCount = keywords.filter(k => patternText.includes(k)).length;
            const similarity = matchCount / keywords.length;
            if (similarity > 0.3) {
                const relevance = this.calculateRelevance(pattern, prompt);
                matches.push({ pattern, similarity, relevance });
            }
        }
        return matches.sort((a, b) => b.relevance - a.relevance).slice(0, limit);
    }
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            return 0;
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        if (normA === 0 || normB === 0)
            return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    generateId() {
        return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    hashContent(content) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }
    async loadPatterns() {
        const stored = this.context.globalState.get(this.STORAGE_KEY);
        if (stored) {
            this.patterns = new Map(stored);
            logger.info(` Loaded ${this.patterns.size} learned patterns`);
        }
    }
    async savePatterns() {
        await this.context.globalState.update(this.STORAGE_KEY, Array.from(this.patterns.entries()));
    }
}
exports.PatternLearner = PatternLearner;
//# sourceMappingURL=patternLearner.js.map