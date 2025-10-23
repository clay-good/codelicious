"use strict";
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
exports.EnhancedStatusBar = void 0;
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('EnhancedStatusBar');
class EnhancedStatusBar {
    constructor() {
        // Main item - Codelicious logo and quick actions
        this.mainItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
        this.mainItem.text = '$(sparkle) Codelicious';
        this.mainItem.tooltip = 'Click for quick actions';
        this.mainItem.command = 'codelicious.showQuickActions';
        // Health item - System health indicators
        this.healthItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 999);
        this.healthItem.command = 'codelicious.showHealthStatus';
        // Performance item - Latency and cache hit rate
        this.performanceItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 998);
        this.performanceItem.command = 'codelicious.showPerformanceMetrics';
        // Cost item - Current cost and budget
        this.costItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 997);
        this.costItem.command = 'codelicious.showCostTracking';
        // Activity item - Active requests
        this.activityItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 996);
        this.activityItem.command = 'codelicious.showActivityLog';
    }
    /**
    * Initialize with metrics provider
    */
    initialize(metricsProvider) {
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
    async update() {
        if (!this.metricsProvider) {
            return;
        }
        try {
            const metrics = await this.metricsProvider();
            this.updateHealthItem(metrics);
            this.updatePerformanceItem(metrics);
            this.updateCostItem(metrics);
            this.updateActivityItem(metrics);
        }
        catch (error) {
            logger.error('Failed to update status bar:', error);
        }
    }
    /**
    * Update health item
    */
    updateHealthItem(metrics) {
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
        }
        else if (healthPercentage >= 50) {
            this.healthItem.text = '$(warning) Degraded';
            this.healthItem.tooltip = `${healthy}/${total} services healthy`;
            this.healthItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        else {
            this.healthItem.text = '$(error) Unhealthy';
            this.healthItem.tooltip = `${unhealthy}/${total} services down`;
            this.healthItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }
    /**
    * Update performance item
    */
    updatePerformanceItem(metrics) {
        const latency = Math.round(metrics.averageLatency);
        const cacheHitRate = Math.round(metrics.cacheHitRate * 100);
        let icon = '$(dashboard)';
        let color;
        if (latency < 500) {
            icon = '$(rocket)';
        }
        else if (latency < 2000) {
            icon = '$(dashboard)';
        }
        else {
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
    updateCostItem(metrics) {
        const cost = metrics.totalCost.toFixed(2);
        const limit = metrics.costLimit.toFixed(2);
        const percentage = (metrics.totalCost / metrics.costLimit) * 100;
        let icon = '$(credit-card)';
        let color;
        if (percentage >= 90) {
            icon = '$(alert)';
            color = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
        else if (percentage >= 70) {
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
    updateActivityItem(metrics) {
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
        let color;
        if (queued > 50) {
            icon = '$(sync~spin)';
            color = new vscode.ThemeColor('statusBarItem.warningBackground');
        }
        else if (activeRequests > 0) {
            icon = '$(sync~spin)';
        }
        const parts = [];
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
    showLoading(message = 'Processing...') {
        this.activityItem.text = '$(sync~spin) ' + message;
        this.activityItem.tooltip = message;
    }
    /**
    * Show success message
    */
    showSuccess(message, duration = 3000) {
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
    showError(message, duration = 5000) {
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
    startAutoUpdate() {
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
    stopAutoUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }
    }
    /**
    * Hide all items
    */
    hide() {
        this.mainItem.hide();
        this.healthItem.hide();
        this.performanceItem.hide();
        this.costItem.hide();
        this.activityItem.hide();
    }
    /**
    * Show all items
    */
    show() {
        this.mainItem.show();
        this.healthItem.show();
        this.performanceItem.show();
        this.costItem.show();
        this.activityItem.show();
    }
    /**
    * Dispose all items
    */
    dispose() {
        this.stopAutoUpdate();
        this.mainItem.dispose();
        this.healthItem.dispose();
        this.performanceItem.dispose();
        this.costItem.dispose();
        this.activityItem.dispose();
    }
}
exports.EnhancedStatusBar = EnhancedStatusBar;
//# sourceMappingURL=enhancedStatusBar.js.map