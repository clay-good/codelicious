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
export interface StatusBarMetrics {
    circuitBreakerHealth: {
        healthy: number;
        unhealthy: number;
    };
    rateLimiterStats: {
        throttled: number;
        total: number;
    };
    queueStats: {
        queued: number;
        active: number;
    };
    averageLatency: number;
    cacheHitRate: number;
    totalCost: number;
    costLimit: number;
    activeRequests: number;
    totalRequests: number;
}
export declare class EnhancedStatusBar {
    private mainItem;
    private healthItem;
    private performanceItem;
    private costItem;
    private activityItem;
    private updateInterval?;
    private metricsProvider?;
    constructor();
    /**
    * Initialize with metrics provider
    */
    initialize(metricsProvider: () => Promise<StatusBarMetrics>): void;
    /**
    * Update all status bar items
    */
    update(): Promise<void>;
    /**
    * Update health item
    */
    private updateHealthItem;
    /**
    * Update performance item
    */
    private updatePerformanceItem;
    /**
    * Update cost item
    */
    private updateCostItem;
    /**
    * Update activity item
    */
    private updateActivityItem;
    /**
    * Show loading state
    */
    showLoading(message?: string): void;
    /**
    * Show success message
    */
    showSuccess(message: string, duration?: number): void;
    /**
    * Show error message
    */
    showError(message: string, duration?: number): void;
    /**
    * Start auto-update
    */
    private startAutoUpdate;
    /**
    * Stop auto-update
    */
    private stopAutoUpdate;
    /**
    * Hide all items
    */
    hide(): void;
    /**
    * Show all items
    */
    show(): void;
    /**
    * Dispose all items
    */
    dispose(): void;
}
//# sourceMappingURL=enhancedStatusBar.d.ts.map