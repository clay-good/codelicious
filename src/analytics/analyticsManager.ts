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
import { createLogger } from '../utils/logger';

const logger = createLogger('AnalyticsManager');

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
 slowestOperations: Array<{ operation: string; duration: number }>;
 fastestOperations: Array<{ operation: string; duration: number }>;
 };
 cost: {
 totalCost: number;
 costByProvider: Record<string, number>;
 costByModel: Record<string, number>;
 costTrend: Array<{ date: string; cost: number }>;
 projectedMonthlyCost: number;
 };
 usage: {
 mostUsedFeatures: Array<{ feature: string; count: number }>;
 leastUsedFeatures: Array<{ feature: string; count: number }>;
 usageByHour: Record<number, number>;
 usageByDay: Record<string, number>;
 };
 insights: string[];
 recommendations: string[];
}

export class AnalyticsManager {
 private performanceMetrics: PerformanceMetric[] = [];
 private costMetrics: CostMetric[] = [];
 private usageMetrics: Map<string, UsageMetric> = new Map();

 private readonly MAX_METRICS = 10000; // Keep last 10k metrics
 private readonly STORAGE_KEY = 'codelicious.analytics';

 constructor(
 private readonly context: vscode.ExtensionContext
 ) {
 this.loadMetrics();
 }

 /**
 * Track a performance metric
 */
 trackPerformance(
 operation: string,
 duration: number,
 success: boolean = true,
 metadata?: Record<string, any>
 ): void {
 const metric: PerformanceMetric = {
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
 trackCost(
 provider: string,
 model: string,
 cost: number,
 tokens: number,
 operation: string = 'ai_request'
 ): void {
 const metric: CostMetric = {
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
 trackUsage(feature: string, duration: number = 0): void {
 const existing = this.usageMetrics.get(feature);

 if (existing) {
 const totalDuration = existing.averageDuration * existing.count + duration;
 existing.count++;
 existing.lastUsed = Date.now();
 existing.averageDuration = totalDuration / existing.count;
 } else {
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
 getSummary(): AnalyticsSummary {
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
 private getPerformanceSummary() {
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
 private getCostSummary() {
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
 const costByProvider: Record<string, number> = {};
 this.costMetrics.forEach(m => {
 costByProvider[m.provider] = (costByProvider[m.provider] || 0) + m.cost;
 });

 // Cost by model
 const costByModel: Record<string, number> = {};
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
 private getUsageSummary() {
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
 private calculateCostTrend(): Array<{ date: string; cost: number }> {
 const now = Date.now();
 const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

 const recentMetrics = this.costMetrics.filter(m => m.timestamp >= thirtyDaysAgo);

 // Group by date
 const costByDate: Record<string, number> = {};
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
 private calculateProjectedMonthlyCost(): number {
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
 private calculateUsageByHour(): Record<number, number> {
 const usageByHour: Record<number, number> = {};

 this.performanceMetrics.forEach(m => {
 const hour = new Date(m.timestamp).getHours();
 usageByHour[hour] = (usageByHour[hour] || 0) + 1;
 });

 return usageByHour;
 }

 /**
 * Calculate usage by day
 */
 private calculateUsageByDay(): Record<string, number> {
 const usageByDay: Record<string, number> = {};

 this.performanceMetrics.forEach(m => {
 const date = new Date(m.timestamp).toISOString().split('T')[0];
 usageByDay[date] = (usageByDay[date] || 0) + 1;
 });

 return usageByDay;
 }

 /**
 * Generate insights
 */
 private generateInsights(): string[] {
 const insights: string[] = [];
 const summary = {
 performance: this.getPerformanceSummary(),
 cost: this.getCostSummary(),
 usage: this.getUsageSummary()
 };

 // Performance insights
 if (summary.performance.successRate < 90) {
 insights.push(`Success rate is ${summary.performance.successRate.toFixed(1)}% - consider investigating failures`);
 } else if (summary.performance.successRate > 95) {
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
 private generateRecommendations(): string[] {
 const recommendations: string[] = [];
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
 const cacheableOps = this.performanceMetrics.filter(m =>
 m.operation.includes('ai_request') || m.operation.includes('embedding')
 ).length;
 if (cacheableOps > 100) {
 recommendations.push(`Enable caching to reduce costs and improve performance`);
 }

 return recommendations;
 }

 /**
 * Export analytics data
 */
 exportToJSON(): string {
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
 exportToCSV(): string {
 const lines: string[] = [];

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
 async clearMetrics(): Promise<void> {
 this.performanceMetrics = [];
 this.costMetrics = [];
 this.usageMetrics.clear();
 await this.saveMetrics();
 }

 /**
 * Trim metrics to max size
 */
 private trimMetrics(): void {
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
 private async saveMetrics(): Promise<void> {
 try {
 await this.context.globalState.update(this.STORAGE_KEY, {
 performance: this.performanceMetrics,
 cost: this.costMetrics,
 usage: Array.from(this.usageMetrics.entries())
 });
 } catch (error) {
 logger.error('Failed to save analytics metrics:', error);
 }
 }

 /**
 * Load metrics from storage
 */
 private async loadMetrics(): Promise<void> {
 try {
 const data = this.context.globalState.get<any>(this.STORAGE_KEY);
 if (data) {
 this.performanceMetrics = data.performance || [];
 this.costMetrics = data.cost || [];
 this.usageMetrics = new Map(data.usage || []);
 }
 } catch (error) {
 logger.error('Failed to load analytics metrics:', error);
 }
 }
}

