/**
 * Monitoring Dashboard - Real-time monitoring for distributed processing
 *
 * Features:
 * - Real-time worker health monitoring
 * - Throughput and performance metrics
 * - Resource usage tracking (CPU, memory)
 * - Task queue visualization
 * - Historical metrics and trends
 * - Alert system for failures
 * - Export metrics to JSON/CSV
 */
import * as vscode from 'vscode';
import { WorkerPoolMetrics, WorkerInfo } from './workerPool';
import { DistributedProcessor } from './distributedProcessor';
export interface DashboardMetrics {
    timestamp: Date;
    workerMetrics: WorkerPoolMetrics;
    workers: WorkerInfo[];
    systemMetrics: {
        totalMemoryMB: number;
        usedMemoryMB: number;
        cpuUsagePercent: number;
    };
    alerts: Alert[];
}
export interface Alert {
    id: string;
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: Date;
    resolved: boolean;
}
export interface MetricsHistory {
    timestamps: Date[];
    throughput: number[];
    utilization: number[];
    memoryUsage: number[];
    activeWorkers: number[];
}
export declare class MonitoringDashboard {
    private context;
    private panel;
    private processor;
    private metricsHistory;
    private alerts;
    private updateInterval;
    private maxHistorySize;
    constructor(context: vscode.ExtensionContext);
    /**
    * Set distributed processor to monitor
    */
    setProcessor(processor: DistributedProcessor): void;
    /**
    * Show monitoring dashboard
    */
    show(): Promise<void>;
    /**
    * Start real-time monitoring
    */
    private startMonitoring;
    /**
    * Stop monitoring
    */
    private stopMonitoring;
    /**
    * Update metrics and send to webview
    */
    private updateMetrics;
    /**
    * Collect current metrics
    */
    private collectMetrics;
    /**
    * Add metrics to history
    */
    private addToHistory;
    /**
    * Check for alerts
    */
    private checkAlerts;
    /**
    * Add alert
    */
    private addAlert;
    /**
    * Clear alerts
    */
    private clearAlerts;
    /**
    * Export metrics
    */
    private exportMetrics;
    /**
    * Get webview HTML content
    */
    private getWebviewContent;
}
//# sourceMappingURL=monitoringDashboard.d.ts.map