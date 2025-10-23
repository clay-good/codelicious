/**
 * Enhanced Status Bar - Rich status bar with health indicators and quick actions
 * UX: Provides real-time visibility into system health and performance
 *
 * Features:
 * - Multiple status bar items
 * - Health indicators (circuit breaker, rate limiter, queue)
 * - Quick actions menu
 * - Real-time metrics
 * - Color-coded status
 * - Tooltips with detailed info
 */

import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const logger = createLogger('EnhancedStatusBar');

export interface StatusBarMetrics {
 // System health
 circuitBreakerHealth: { healthy: number; unhealthy: number };
 rateLimiterStats: { throttled: number; total: number };
 queueStats: { queued: number; active: number };

 // Performance
 averageLatency: number;
 cacheHitRate: number;

 // Cost
 totalCost: number;
 costLimit: number;

 // Activity
 activeRequests: number;
 totalRequests: number;
}

export class EnhancedStatusBar {
 // Status bar items
 private mainItem: vscode.StatusBarItem;
 private healthItem: vscode.StatusBarItem;
 private performanceItem: vscode.StatusBarItem;
 private costItem: vscode.StatusBarItem;
 private activityItem: vscode.StatusBarItem;

 private updateInterval?: NodeJS.Timeout;
 private metricsProvider?: () => Promise<StatusBarMetrics>;

 constructor() {
 // Main item - Codelicious logo and quick actions
 this.mainItem = vscode.window.createStatusBarItem(
 vscode.StatusBarAlignment.Left,
 1000
 );
 this.mainItem.text = '$(sparkle) Codelicious';
 this.mainItem.tooltip = 'Click for quick actions';
 this.mainItem.command = 'codelicious.showQuickActions';

 // Health item - System health indicators
 this.healthItem = vscode.window.createStatusBarItem(
 vscode.StatusBarAlignment.Left,
 999
 );
 this.healthItem.command = 'codelicious.showHealthStatus';

 // Performance item - Latency and cache hit rate
 this.performanceItem = vscode.window.createStatusBarItem(
 vscode.StatusBarAlignment.Left,
 998
 );
 this.performanceItem.command = 'codelicious.showPerformanceMetrics';

 // Cost item - Current cost and budget
 this.costItem = vscode.window.createStatusBarItem(
 vscode.StatusBarAlignment.Left,
 997
 );
 this.costItem.command = 'codelicious.showCostTracking';

 // Activity item - Active requests
 this.activityItem = vscode.window.createStatusBarItem(
 vscode.StatusBarAlignment.Left,
 996
 );
 this.activityItem.command = 'codelicious.showActivityLog';
 }

 /**
 * Initialize with metrics provider
 */
 initialize(metricsProvider: () => Promise<StatusBarMetrics>): void {
 this.metricsProvider = metricsProvider;

 // Show all items
 this.mainItem.show();
 this.healthItem.show();
 this.performanceItem.show();
 this.costItem.show();
 this.activityItem.show();

 // Start auto-update
 this.startAutoUpdate();

 // Initial update
 this.update();
 }

 /**
 * Update all status bar items
 */
 async update(): Promise<void> {
 if (!this.metricsProvider) {
 return;
 }

 try {
 const metrics = await this.metricsProvider();

 this.updateHealthItem(metrics);
 this.updatePerformanceItem(metrics);
 this.updateCostItem(metrics);
 this.updateActivityItem(metrics);

 } catch (error) {
 logger.error('Failed to update status bar:', error);
 }
 }

 /**
 * Update health item
 */
 private updateHealthItem(metrics: StatusBarMetrics): void {
 const { healthy, unhealthy } = metrics.circuitBreakerHealth;
 const total = healthy + unhealthy;

 if (total === 0) {
 this.healthItem.text = '$(pulse) Ready';
 this.healthItem.tooltip = 'System ready';
 this.healthItem.backgroundColor = undefined;
 return;
 }

 const healthPercentage = (healthy / total) * 100;

 if (healthPercentage === 100) {
 this.healthItem.text = '$(check) Healthy';
 this.healthItem.tooltip = `All ${healthy} services healthy`;
 this.healthItem.backgroundColor = undefined;
 } else if (healthPercentage >= 50) {
 this.healthItem.text = '$(warning) Degraded';
 this.healthItem.tooltip = `${healthy}/${total} services healthy`;
 this.healthItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
 } else {
 this.healthItem.text = '$(error) Unhealthy';
 this.healthItem.tooltip = `${unhealthy}/${total} services down`;
 this.healthItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
 }
 }

 /**
 * Update performance item
 */
 private updatePerformanceItem(metrics: StatusBarMetrics): void {
 const latency = Math.round(metrics.averageLatency);
 const cacheHitRate = Math.round(metrics.cacheHitRate * 100);

 let icon = '$(dashboard)';
 let color: vscode.ThemeColor | undefined;

 if (latency < 500) {
 icon = '$(rocket)';
 } else if (latency < 2000) {
 icon = '$(dashboard)';
 } else {
 icon = '$(watch)';
 color = new vscode.ThemeColor('statusBarItem.warningBackground');
 }

 this.performanceItem.text = `${icon} ${latency}ms`;
 this.performanceItem.tooltip = `Latency: ${latency}ms\nCache Hit Rate: ${cacheHitRate}%`;
 this.performanceItem.backgroundColor = color;
 }

 /**
 * Update cost item
 */
 private updateCostItem(metrics: StatusBarMetrics): void {
 const cost = metrics.totalCost.toFixed(2);
 const limit = metrics.costLimit.toFixed(2);
 const percentage = (metrics.totalCost / metrics.costLimit) * 100;

 let icon = '$(credit-card)';
 let color: vscode.ThemeColor | undefined;

 if (percentage >= 90) {
 icon = '$(alert)';
 color = new vscode.ThemeColor('statusBarItem.errorBackground');
 } else if (percentage >= 70) {
 icon = '$(warning)';
 color = new vscode.ThemeColor('statusBarItem.warningBackground');
 }

 this.costItem.text = `${icon} $${cost}`;
 this.costItem.tooltip = `Cost: $${cost} / $${limit} (${percentage.toFixed(0)}%)`;
 this.costItem.backgroundColor = color;
 }

 /**
 * Update activity item
 */
 private updateActivityItem(metrics: StatusBarMetrics): void {
 const { activeRequests, queued, active } = {
 activeRequests: metrics.activeRequests,
 queued: metrics.queueStats.queued,
 active: metrics.queueStats.active
 };

 if (activeRequests === 0 && queued === 0) {
 this.activityItem.text = '$(circle-outline) Idle';
 this.activityItem.tooltip = 'No active requests';
 this.activityItem.backgroundColor = undefined;
 return;
 }

 let icon = '$(sync)';
 let color: vscode.ThemeColor | undefined;

 if (queued > 50) {
 icon = '$(sync~spin)';
 color = new vscode.ThemeColor('statusBarItem.warningBackground');
 } else if (activeRequests > 0) {
 icon = '$(sync~spin)';
 }

 const parts: string[] = [];
 if (activeRequests > 0) {
 parts.push(`${activeRequests} active`);
 }
 if (queued > 0) {
 parts.push(`${queued} queued`);
 }

 this.activityItem.text = `${icon} ${activeRequests}`;
 this.activityItem.tooltip = parts.join(', ');
 this.activityItem.backgroundColor = color;
 }

 /**
 * Show loading state
 */
 showLoading(message: string = 'Processing...'): void {
 this.activityItem.text = '$(sync~spin) ' + message;
 this.activityItem.tooltip = message;
 }

 /**
 * Show success message
 */
 showSuccess(message: string, duration: number = 3000): void {
 const originalText = this.activityItem.text;
 const originalTooltip = this.activityItem.tooltip;

 this.activityItem.text = '$(check) ' + message;
 this.activityItem.tooltip = message;
 this.activityItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');

 setTimeout(() => {
 this.activityItem.text = originalText;
 this.activityItem.tooltip = originalTooltip;
 this.activityItem.backgroundColor = undefined;
 }, duration);
 }

 /**
 * Show error message
 */
 showError(message: string, duration: number = 5000): void {
 const originalText = this.activityItem.text;
 const originalTooltip = this.activityItem.tooltip;

 this.activityItem.text = '$(error) ' + message;
 this.activityItem.tooltip = message;
 this.activityItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

 setTimeout(() => {
 this.activityItem.text = originalText;
 this.activityItem.tooltip = originalTooltip;
 this.activityItem.backgroundColor = undefined;
 }, duration);
 }

 /**
 * Start auto-update
 */
 private startAutoUpdate(): void {
 // Update every 2 seconds
 this.updateInterval = setInterval(() => {
 this.update();
 }, 2000);

 // Don't keep process alive
 this.updateInterval.unref();
 }

 /**
 * Stop auto-update
 */
 private stopAutoUpdate(): void {
 if (this.updateInterval) {
 clearInterval(this.updateInterval);
 this.updateInterval = undefined;
 }
 }

 /**
 * Hide all items
 */
 hide(): void {
 this.mainItem.hide();
 this.healthItem.hide();
 this.performanceItem.hide();
 this.costItem.hide();
 this.activityItem.hide();
 }

 /**
 * Show all items
 */
 show(): void {
 this.mainItem.show();
 this.healthItem.show();
 this.performanceItem.show();
 this.costItem.show();
 this.activityItem.show();
 }

 /**
 * Dispose all items
 */
 dispose(): void {
 this.stopAutoUpdate();
 this.mainItem.dispose();
 this.healthItem.dispose();
 this.performanceItem.dispose();
 this.costItem.dispose();
 this.activityItem.dispose();
 }
}

