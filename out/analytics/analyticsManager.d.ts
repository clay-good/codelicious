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
import * as vscode from 'vscode';
export interface PerformanceMetric {
    operation: string;
    duration: number;
    timestamp: number;
    success: boolean;
    metadata?: Record<string, any>;
}
export interface CostMetric {
    provider: string;
    model: string;
    cost: number;
    tokens: number;
    timestamp: number;
    operation: string;
}
export interface UsageMetric {
    feature: string;
    count: number;
    lastUsed: number;
    averageDuration: number;
}
export interface AnalyticsSummary {
    performance: {
        totalOperations: number;
        averageDuration: number;
        successRate: number;
        slowestOperations: Array<{
            operation: string;
            duration: number;
        }>;
        fastestOperations: Array<{
            operation: string;
            duration: number;
        }>;
    };
    cost: {
        totalCost: number;
        costByProvider: Record<string, number>;
        costByModel: Record<string, number>;
        costTrend: Array<{
            date: string;
            cost: number;
        }>;
        projectedMonthlyCost: number;
    };
    usage: {
        mostUsedFeatures: Array<{
            feature: string;
            count: number;
        }>;
        leastUsedFeatures: Array<{
            feature: string;
            count: number;
        }>;
        usageByHour: Record<number, number>;
        usageByDay: Record<string, number>;
    };
    insights: string[];
    recommendations: string[];
}
export declare class AnalyticsManager {
    private readonly context;
    private performanceMetrics;
    private costMetrics;
    private usageMetrics;
    private readonly MAX_METRICS;
    private readonly STORAGE_KEY;
    constructor(context: vscode.ExtensionContext);
    /**
    * Track a performance metric
    */
    trackPerformance(operation: string, duration: number, success?: boolean, metadata?: Record<string, any>): void;
    /**
    * Track a cost metric
    */
    trackCost(provider: string, model: string, cost: number, tokens: number, operation?: string): void;
    /**
    * Track feature usage
    */
    trackUsage(feature: string, duration?: number): void;
    /**
    * Get comprehensive analytics summary
    */
    getSummary(): AnalyticsSummary;
    /**
    * Get performance summary
    */
    private getPerformanceSummary;
    /**
    * Get cost summary
    */
    private getCostSummary;
    /**
    * Get usage summary
    */
    private getUsageSummary;
    /**
    * Calculate cost trend
    */
    private calculateCostTrend;
    /**
    * Calculate projected monthly cost
    */
    private calculateProjectedMonthlyCost;
    /**
    * Calculate usage by hour
    */
    private calculateUsageByHour;
    /**
    * Calculate usage by day
    */
    private calculateUsageByDay;
    /**
    * Generate insights
    */
    private generateInsights;
    /**
    * Generate recommendations
    */
    private generateRecommendations;
    /**
    * Export analytics data
    */
    exportToJSON(): string;
    /**
    * Export analytics to CSV
    */
    exportToCSV(): string;
    /**
    * Clear all metrics
    */
    clearMetrics(): Promise<void>;
    /**
    * Trim metrics to max size
    */
    private trimMetrics;
    /**
    * Save metrics to storage
    */
    private saveMetrics;
    /**
    * Load metrics from storage
    */
    private loadMetrics;
}
//# sourceMappingURL=analyticsManager.d.ts.map