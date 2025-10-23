"use strict";
/**
 * Analytics Manager - Comprehensive performance monitoring and analytics
 *
 * Features:
 * - Performance tracking for all operations
 * - Cost analytics with trends and breakdowns
 * - Usage insights and patterns
 * - Budget alerts and recommendations
 * - Export functionality
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsManager = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AnalyticsManager');
class AnalyticsManager {
    constructor(context) {
        this.context = context;
        this.performanceMetrics = [];
        this.costMetrics = [];
        this.usageMetrics = new Map();
        this.MAX_METRICS = 10000; // Keep last 10k metrics
        this.STORAGE_KEY = 'codelicious.analytics';
        this.loadMetrics();
    }
    /**
    * Track a performance metric
    */
    trackPerformance(operation, duration, success = true, metadata) {
        const metric = {
            operation,
            duration,
            timestamp: Date.now(),
            success,
            metadata
        };
        this.performanceMetrics.push(metric);
        this.trimMetrics();
        this.saveMetrics();
    }
    /**
    * Track a cost metric
    */
    trackCost(provider, model, cost, tokens, operation = 'ai_request') {
        const metric = {
            provider,
            model,
            cost,
            tokens,
            timestamp: Date.now(),
            operation
        };
        this.costMetrics.push(metric);
        this.trimMetrics();
        this.saveMetrics();
    }
    /**
    * Track feature usage
    */
    trackUsage(feature, duration = 0) {
        const existing = this.usageMetrics.get(feature);
        if (existing) {
            const totalDuration = existing.averageDuration * existing.count + duration;
            existing.count++;
            existing.lastUsed = Date.now();
            existing.averageDuration = totalDuration / existing.count;
        }
        else {
            this.usageMetrics.set(feature, {
                feature,
                count: 1,
                lastUsed: Date.now(),
                averageDuration: duration
            });
        }
        this.saveMetrics();
    }
    /**
    * Get comprehensive analytics summary
    */
    getSummary() {
        return {
            performance: this.getPerformanceSummary(),
            cost: this.getCostSummary(),
            usage: this.getUsageSummary(),
            insights: this.generateInsights(),
            recommendations: this.generateRecommendations()
        };
    }
    /**
    * Get performance summary
    */
    getPerformanceSummary() {
        if (this.performanceMetrics.length === 0) {
            return {
                totalOperations: 0,
                averageDuration: 0,
                successRate: 0,
                slowestOperations: [],
                fastestOperations: []
            };
        }
        const totalOperations = this.performanceMetrics.length;
        const successfulOps = this.performanceMetrics.filter(m => m.success).length;
        const successRate = (successfulOps / totalOperations) * 100;
        const totalDuration = this.performanceMetrics.reduce((sum, m) => sum + m.duration, 0);
        const averageDuration = totalDuration / totalOperations;
        // Get slowest and fastest operations
        const sorted = [...this.performanceMetrics].sort((a, b) => b.duration - a.duration);
        const slowestOperations = sorted.slice(0, 5).map(m => ({
            operation: m.operation,
            duration: m.duration
        }));
        const fastestOperations = sorted.slice(-5).reverse().map(m => ({
            operation: m.operation,
            duration: m.duration
        }));
        return {
            totalOperations,
            averageDuration,
            successRate,
            slowestOperations,
            fastestOperations
        };
    }
    /**
    * Get cost summary
    */
    getCostSummary() {
        if (this.costMetrics.length === 0) {
            return {
                totalCost: 0,
                costByProvider: {},
                costByModel: {},
                costTrend: [],
                projectedMonthlyCost: 0
            };
        }
        const totalCost = this.costMetrics.reduce((sum, m) => sum + m.cost, 0);
        // Cost by provider
        const costByProvider = {};
        this.costMetrics.forEach(m => {
            costByProvider[m.provider] = (costByProvider[m.provider] || 0) + m.cost;
        });
        // Cost by model
        const costByModel = {};
        this.costMetrics.forEach(m => {
            costByModel[m.model] = (costByModel[m.model] || 0) + m.cost;
        });
        // Cost trend (last 30 days)
        const costTrend = this.calculateCostTrend();
        // Projected monthly cost
        const projectedMonthlyCost = this.calculateProjectedMonthlyCost();
        return {
            totalCost,
            costByProvider,
            costByModel,
            costTrend,
            projectedMonthlyCost
        };
    }
    /**
    * Get usage summary
    */
    getUsageSummary() {
        const features = Array.from(this.usageMetrics.values());
        if (features.length === 0) {
            return {
                mostUsedFeatures: [],
                leastUsedFeatures: [],
                usageByHour: {},
                usageByDay: {}
            };
        }
        // Most and least used features
        const sorted = features.sort((a, b) => b.count - a.count);
        const mostUsedFeatures = sorted.slice(0, 5).map(f => ({
            feature: f.feature,
            count: f.count
        }));
        const leastUsedFeatures = sorted.slice(-5).reverse().map(f => ({
            feature: f.feature,
            count: f.count
        }));
        // Usage by hour and day
        const usageByHour = this.calculateUsageByHour();
        const usageByDay = this.calculateUsageByDay();
        return {
            mostUsedFeatures,
            leastUsedFeatures,
            usageByHour,
            usageByDay
        };
    }
    /**
    * Calculate cost trend
    */
    calculateCostTrend() {
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
        const recentMetrics = this.costMetrics.filter(m => m.timestamp >= thirtyDaysAgo);
        // Group by date
        const costByDate = {};
        recentMetrics.forEach(m => {
            const date = new Date(m.timestamp).toISOString().split('T')[0];
            costByDate[date] = (costByDate[date] || 0) + m.cost;
        });
        return Object.entries(costByDate)
            .map(([date, cost]) => ({ date, cost }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }
    /**
    * Calculate projected monthly cost
    */
    calculateProjectedMonthlyCost() {
        const now = Date.now();
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
        const recentMetrics = this.costMetrics.filter(m => m.timestamp >= sevenDaysAgo);
        const weekCost = recentMetrics.reduce((sum, m) => sum + m.cost, 0);
        // Project to monthly (4.3 weeks per month)
        return weekCost * 4.3;
    }
    /**
    * Calculate usage by hour
    */
    calculateUsageByHour() {
        const usageByHour = {};
        this.performanceMetrics.forEach(m => {
            const hour = new Date(m.timestamp).getHours();
            usageByHour[hour] = (usageByHour[hour] || 0) + 1;
        });
        return usageByHour;
    }
    /**
    * Calculate usage by day
    */
    calculateUsageByDay() {
        const usageByDay = {};
        this.performanceMetrics.forEach(m => {
            const date = new Date(m.timestamp).toISOString().split('T')[0];
            usageByDay[date] = (usageByDay[date] || 0) + 1;
        });
        return usageByDay;
    }
    /**
    * Generate insights
    */
    generateInsights() {
        const insights = [];
        const summary = {
            performance: this.getPerformanceSummary(),
            cost: this.getCostSummary(),
            usage: this.getUsageSummary()
        };
        // Performance insights
        if (summary.performance.successRate < 90) {
            insights.push(`Success rate is ${summary.performance.successRate.toFixed(1)}% - consider investigating failures`);
        }
        else if (summary.performance.successRate > 95) {
            insights.push(`Excellent success rate: ${summary.performance.successRate.toFixed(1)}%`);
        }
        if (summary.performance.averageDuration > 5000) {
            insights.push(`⏱ Average operation takes ${(summary.performance.averageDuration / 1000).toFixed(1)}s - consider optimization`);
        }
        // Cost insights
        if (summary.cost.projectedMonthlyCost > 50) {
            insights.push(` Projected monthly cost: $${summary.cost.projectedMonthlyCost.toFixed(2)} - consider cost optimization`);
        }
        const mostExpensiveProvider = Object.entries(summary.cost.costByProvider)
            .sort(([, a], [, b]) => b - a)[0];
        if (mostExpensiveProvider) {
            const [provider, cost] = mostExpensiveProvider;
            const percentage = (cost / summary.cost.totalCost) * 100;
            insights.push(`${provider} accounts for ${percentage.toFixed(1)}% of total cost ($${cost.toFixed(4)})`);
        }
        // Usage insights
        if (summary.usage.mostUsedFeatures.length > 0) {
            const topFeature = summary.usage.mostUsedFeatures[0];
            insights.push(` Most used feature: ${topFeature.feature} (${topFeature.count} times)`);
        }
        // Peak usage time
        const peakHour = Object.entries(summary.usage.usageByHour)
            .sort(([, a], [, b]) => b - a)[0];
        if (peakHour) {
            const [hour, count] = peakHour;
            insights.push(`⏰ Peak usage hour: ${hour}:00 (${count} operations)`);
        }
        return insights;
    }
    /**
    * Generate recommendations
    */
    generateRecommendations() {
        const recommendations = [];
        const summary = {
            performance: this.getPerformanceSummary(),
            cost: this.getCostSummary()
        };
        // Performance recommendations
        if (summary.performance.slowestOperations.length > 0) {
            const slowest = summary.performance.slowestOperations[0];
            if (slowest.duration > 10000) {
                recommendations.push(`Optimize ${slowest.operation} - currently takes ${(slowest.duration / 1000).toFixed(1)}s`);
            }
        }
        // Cost recommendations
        const mostExpensiveModel = Object.entries(summary.cost.costByModel)
            .sort(([, a], [, b]) => b - a)[0];
        if (mostExpensiveModel) {
            const [model, cost] = mostExpensiveModel;
            const percentage = (cost / summary.cost.totalCost) * 100;
            if (percentage > 50) {
                recommendations.push(`Consider using cheaper models for simple tasks - ${model} accounts for ${percentage.toFixed(1)}% of costs`);
            }
        }
        if (summary.cost.projectedMonthlyCost > 100) {
            recommendations.push(` Set a budget limit to control costs - projected monthly: $${summary.cost.projectedMonthlyCost.toFixed(2)}`);
        }
        // Cache recommendations
        const cacheableOps = this.performanceMetrics.filter(m => m.operation.includes('ai_request') || m.operation.includes('embedding')).length;
        if (cacheableOps > 100) {
            recommendations.push(`Enable caching to reduce costs and improve performance`);
        }
        return recommendations;
    }
    /**
    * Export analytics data
    */
    exportToJSON() {
        return JSON.stringify({
            performance: this.performanceMetrics,
            cost: this.costMetrics,
            usage: Array.from(this.usageMetrics.values()),
            summary: this.getSummary(),
            exportedAt: new Date().toISOString()
        }, null, 2);
    }
    /**
    * Export analytics to CSV
    */
    exportToCSV() {
        const lines = [];
        // Performance metrics
        lines.push('Performance Metrics');
        lines.push('Operation,Duration (ms),Success,Timestamp');
        this.performanceMetrics.forEach(m => {
            lines.push(`${m.operation},${m.duration},${m.success},${new Date(m.timestamp).toISOString()}`);
        });
        lines.push('');
        // Cost metrics
        lines.push('Cost Metrics');
        lines.push('Provider,Model,Cost,Tokens,Operation,Timestamp');
        this.costMetrics.forEach(m => {
            lines.push(`${m.provider},${m.model},${m.cost},${m.tokens},${m.operation},${new Date(m.timestamp).toISOString()}`);
        });
        lines.push('');
        // Usage metrics
        lines.push('Usage Metrics');
        lines.push('Feature,Count,Average Duration (ms),Last Used');
        Array.from(this.usageMetrics.values()).forEach(m => {
            lines.push(`${m.feature},${m.count},${m.averageDuration},${new Date(m.lastUsed).toISOString()}`);
        });
        return lines.join('\n');
    }
    /**
    * Clear all metrics
    */
    async clearMetrics() {
        this.performanceMetrics = [];
        this.costMetrics = [];
        this.usageMetrics.clear();
        await this.saveMetrics();
    }
    /**
    * Trim metrics to max size
    */
    trimMetrics() {
        if (this.performanceMetrics.length > this.MAX_METRICS) {
            this.performanceMetrics = this.performanceMetrics.slice(-this.MAX_METRICS);
        }
        if (this.costMetrics.length > this.MAX_METRICS) {
            this.costMetrics = this.costMetrics.slice(-this.MAX_METRICS);
        }
    }
    /**
    * Save metrics to storage
    */
    async saveMetrics() {
        try {
            await this.context.globalState.update(this.STORAGE_KEY, {
                performance: this.performanceMetrics,
                cost: this.costMetrics,
                usage: Array.from(this.usageMetrics.entries())
            });
        }
        catch (error) {
            logger.error('Failed to save analytics metrics:', error);
        }
    }
    /**
    * Load metrics from storage
    */
    async loadMetrics() {
        try {
            const data = this.context.globalState.get(this.STORAGE_KEY);
            if (data) {
                this.performanceMetrics = data.performance || [];
                this.costMetrics = data.cost || [];
                this.usageMetrics = new Map(data.usage || []);
            }
        }
        catch (error) {
            logger.error('Failed to load analytics metrics:', error);
        }
    }
}
exports.AnalyticsManager = AnalyticsManager;
//# sourceMappingURL=analyticsManager.js.map