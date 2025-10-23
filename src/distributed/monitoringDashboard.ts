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
import { WorkerPool, WorkerPoolMetrics, WorkerInfo } from './workerPool';
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

export class MonitoringDashboard {
 private panel: vscode.WebviewPanel | undefined;
 private processor: DistributedProcessor | undefined;
 private metricsHistory: MetricsHistory = {
 timestamps: [],
 throughput: [],
 utilization: [],
 memoryUsage: [],
 activeWorkers: []
 };
 private alerts: Alert[] = [];
 private updateInterval: NodeJS.Timeout | null = null;
 private maxHistorySize = 100;

 constructor(private context: vscode.ExtensionContext) {}

 /**
 * Set distributed processor to monitor
 */
 setProcessor(processor: DistributedProcessor): void {
 this.processor = processor;
 }

 /**
 * Show monitoring dashboard
 */
 async show(): Promise<void> {
 if (this.panel) {
 this.panel.reveal();
 return;
 }

 this.panel = vscode.window.createWebviewPanel(
 'codeliciousMonitoring',
 'Codelicious - Distributed Processing Monitor',
 vscode.ViewColumn.Two,
 {
 enableScripts: true,
 retainContextWhenHidden: true
 }
 );

 this.panel.webview.html = this.getWebviewContent();

 // Handle messages from webview
 this.panel.webview.onDidReceiveMessage(
 async (message) => {
 switch (message.command) {
 case 'refresh':
 await this.updateMetrics();
 break;
 case 'clearAlerts':
 this.clearAlerts();
 break;
 case 'exportMetrics':
 await this.exportMetrics(message.format);
 break;
 }
 },
 undefined,
 this.context.subscriptions
 );

 // Handle panel disposal
 this.panel.onDidDispose(
 () => {
 this.stopMonitoring();
 this.panel = undefined;
 },
 undefined,
 this.context.subscriptions
 );

 // Start monitoring
 this.startMonitoring();
 }

 /**
 * Start real-time monitoring
 */
 private startMonitoring(): void {
 if (this.updateInterval) return;

 this.updateInterval = setInterval(() => {
 this.updateMetrics();
 }, 1000); // Update every second
 }

 /**
 * Stop monitoring
 */
 private stopMonitoring(): void {
 if (this.updateInterval) {
 clearInterval(this.updateInterval);
 this.updateInterval = null;
 }
 }

 /**
 * Update metrics and send to webview
 */
 private async updateMetrics(): Promise<void> {
 if (!this.processor || !this.panel) return;

 const metrics = this.collectMetrics();
 this.addToHistory(metrics);
 this.checkAlerts(metrics);

 this.panel.webview.postMessage({
 command: 'updateMetrics',
 data: {
 current: metrics,
 history: this.metricsHistory,
 alerts: this.alerts
 }
 });
 }

 /**
 * Collect current metrics
 */
 private collectMetrics(): DashboardMetrics {
 const workerMetrics = this.processor!.getMetrics();
 const workers = this.processor!.getWorkerInfo();
 const memUsage = process.memoryUsage();

 return {
 timestamp: new Date(),
 workerMetrics,
 workers,
 systemMetrics: {
 totalMemoryMB: memUsage.heapTotal / 1024 / 1024,
 usedMemoryMB: memUsage.heapUsed / 1024 / 1024,
 cpuUsagePercent: 0 // Would need actual CPU monitoring
 },
 alerts: this.alerts
 };
 }

 /**
 * Add metrics to history
 */
 private addToHistory(metrics: DashboardMetrics): void {
 this.metricsHistory.timestamps.push(metrics.timestamp);
 this.metricsHistory.throughput.push(metrics.workerMetrics.throughput);
 this.metricsHistory.utilization.push(metrics.workerMetrics.utilization);
 this.metricsHistory.memoryUsage.push(metrics.systemMetrics.usedMemoryMB);
 this.metricsHistory.activeWorkers.push(metrics.workerMetrics.busyWorkers);

 // Limit history size
 if (this.metricsHistory.timestamps.length > this.maxHistorySize) {
 this.metricsHistory.timestamps.shift();
 this.metricsHistory.throughput.shift();
 this.metricsHistory.utilization.shift();
 this.metricsHistory.memoryUsage.shift();
 this.metricsHistory.activeWorkers.shift();
 }
 }

 /**
 * Check for alerts
 */
 private checkAlerts(metrics: DashboardMetrics): void {
 // High utilization alert
 if (metrics.workerMetrics.utilization > 0.9) {
 this.addAlert('warning', 'High worker utilization (>90%)');
 }

 // Unhealthy workers alert
 if (metrics.workerMetrics.unhealthyWorkers > 0) {
 this.addAlert('error', `${metrics.workerMetrics.unhealthyWorkers} unhealthy workers detected`);
 }

 // High memory usage alert
 if (metrics.systemMetrics.usedMemoryMB > 4096) {
 this.addAlert('warning', `High memory usage (${metrics.systemMetrics.usedMemoryMB.toFixed(0)}MB)`);
 }

 // Large queue alert
 if (metrics.workerMetrics.queueSize > 1000) {
 this.addAlert('warning', `Large task queue (${metrics.workerMetrics.queueSize} tasks)`);
 }

 // High failure rate alert
 const totalTasks = metrics.workerMetrics.totalTasksCompleted + metrics.workerMetrics.totalTasksFailed;
 if (totalTasks > 0) {
 const failureRate = metrics.workerMetrics.totalTasksFailed / totalTasks;
 if (failureRate > 0.1) {
 this.addAlert('error', `High failure rate (${(failureRate * 100).toFixed(1)}%)`);
 }
 }
 }

 /**
 * Add alert
 */
 private addAlert(severity: Alert['severity'], message: string): void {
 // Check if alert already exists
 const existing = this.alerts.find(a => a.message === message && !a.resolved);
 if (existing) return;

 const alert: Alert = {
 id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
 severity,
 message,
 timestamp: new Date(),
 resolved: false
 };

 this.alerts.push(alert);

 // Limit alerts
 if (this.alerts.length > 50) {
 this.alerts = this.alerts.slice(-50);
 }
 }

 /**
 * Clear alerts
 */
 private clearAlerts(): void {
 this.alerts = this.alerts.map(a => ({ ...a, resolved: true }));
 }

 /**
 * Export metrics
 */
 private async exportMetrics(format: 'json' | 'csv'): Promise<void> {
 const data = {
 exportDate: new Date().toISOString(),
 history: this.metricsHistory,
 alerts: this.alerts
 };

 let content: string;
 let extension: string;

 if (format === 'json') {
 content = JSON.stringify(data, null, 2);
 extension = 'json';
 } else {
 // CSV format
 const lines = ['Timestamp,Throughput,Utilization,Memory(MB),ActiveWorkers'];
 for (let i = 0; i < this.metricsHistory.timestamps.length; i++) {
 lines.push([
 this.metricsHistory.timestamps[i].toISOString(),
 this.metricsHistory.throughput[i].toFixed(2),
 this.metricsHistory.utilization[i].toFixed(4),
 this.metricsHistory.memoryUsage[i].toFixed(2),
 this.metricsHistory.activeWorkers[i]
 ].join(','));
 }
 content = lines.join('\n');
 extension = 'csv';
 }

 const uri = await vscode.window.showSaveDialog({
 defaultUri: vscode.Uri.file(`codelicious-metrics-${Date.now()}.${extension}`),
 filters: {
 [format.toUpperCase()]: [extension]
 }
 });

 if (uri) {
 await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
 vscode.window.showInformationMessage(`Metrics exported to ${uri.fsPath}`);
 }
 }

 /**
 * Get webview HTML content
 */
 private getWebviewContent(): string {
 return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Distributed Processing Monitor</title>
 <style>
 body {
 font-family: var(--vscode-font-family);
 padding: 20px;
 background: var(--vscode-editor-background);
 color: var(--vscode-editor-foreground);
 }
 .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
 .header h1 { margin: 0; font-size: 24px; }
 .buttons button {
 margin-left: 10px;
 padding: 8px 16px;
 background: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 border: none;
 cursor: pointer;
 border-radius: 4px;
 }
 .buttons button:hover { background: var(--vscode-button-hoverBackground); }
 .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
 .metric-card {
 background: var(--vscode-editor-inactiveSelectionBackground);
 padding: 20px;
 border-radius: 8px;
 border: 1px solid var(--vscode-panel-border);
 }
 .metric-card h3 { margin: 0 0 10px 0; font-size: 14px; opacity: 0.8; }
 .metric-card .value { font-size: 32px; font-weight: bold; }
 .metric-card .label { font-size: 12px; opacity: 0.6; margin-top: 5px; }
 .workers-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
 .workers-table th, .workers-table td { padding: 12px; text-align: left; border-bottom: 1px solid var(--vscode-panel-border); }
 .workers-table th { font-weight: bold; opacity: 0.8; }
 .status-badge {
 padding: 4px 8px;
 border-radius: 4px;
 font-size: 11px;
 font-weight: bold;
 }
 .status-idle { background: #28a745; color: white; }
 .status-busy { background: #ffc107; color: black; }
 .status-unhealthy { background: #dc3545; color: white; }
 .alerts { margin-top: 30px; }
 .alert {
 padding: 12px;
 margin-bottom: 10px;
 border-radius: 4px;
 border-left: 4px solid;
 }
 .alert-info { background: rgba(23, 162, 184, 0.1); border-color: #17a2b8; }
 .alert-warning { background: rgba(255, 193, 7, 0.1); border-color: #ffc107; }
 .alert-error { background: rgba(220, 53, 69, 0.1); border-color: #dc3545; }
 .alert-critical { background: rgba(220, 53, 69, 0.2); border-color: #dc3545; }
 </style>
</head>
<body>
 <div class="header">
 <h1> Distributed Processing Monitor</h1>
 <div class="buttons">
 <button onclick="refresh()"> Refresh</button>
 <button onclick="clearAlerts()"> Clear Alerts</button>
 <button onclick="exportMetrics('json')"> Export JSON</button>
 <button onclick="exportMetrics('csv')"> Export CSV</button>
 </div>
 </div>

 <div class="metrics-grid" id="metrics"></div>

 <h2> Workers</h2>
 <table class="workers-table" id="workers"></table>

 <div class="alerts">
 <h2> Alerts</h2>
 <div id="alerts"></div>
 </div>

 <script>
 const vscode = acquireVsCodeApi();

 function refresh() {
 vscode.postMessage({ command: 'refresh' });
 }

 function clearAlerts() {
 vscode.postMessage({ command: 'clearAlerts' });
 }

 function exportMetrics(format) {
 vscode.postMessage({ command: 'exportMetrics', format });
 }

 window.addEventListener('message', event => {
 const message = event.data;
 if (message.command === 'updateMetrics') {
 updateDashboard(message.data);
 }
 });

 function updateDashboard(data) {
 const { current, alerts } = data;

 // Update metrics
 document.getElementById('metrics').innerHTML = \`
 <div class="metric-card">
 <h3>Total Workers</h3>
 <div class="value">\${current.workerMetrics.totalWorkers}</div>
 <div class="label">Idle: \${current.workerMetrics.idleWorkers} | Busy: \${current.workerMetrics.busyWorkers}</div>
 </div>
 <div class="metric-card">
 <h3>Throughput</h3>
 <div class="value">\${current.workerMetrics.throughput.toFixed(1)}</div>
 <div class="label">tasks/sec</div>
 </div>
 <div class="metric-card">
 <h3>Utilization</h3>
 <div class="value">\${(current.workerMetrics.utilization * 100).toFixed(1)}%</div>
 <div class="label">Worker capacity used</div>
 </div>
 <div class="metric-card">
 <h3>Queue Size</h3>
 <div class="value">\${current.workerMetrics.queueSize}</div>
 <div class="label">Pending tasks</div>
 </div>
 <div class="metric-card">
 <h3>Tasks Completed</h3>
 <div class="value">\${current.workerMetrics.totalTasksCompleted}</div>
 <div class="label">Failed: \${current.workerMetrics.totalTasksFailed}</div>
 </div>
 <div class="metric-card">
 <h3>Memory Usage</h3>
 <div class="value">\${current.systemMetrics.usedMemoryMB.toFixed(0)}</div>
 <div class="label">MB</div>
 </div>
 \`;

 // Update workers table
 const workersHtml = \`
 <tr>
 <th>Worker ID</th>
 <th>Status</th>
 <th>Active Tasks</th>
 <th>Completed</th>
 <th>Failed</th>
 <th>Avg Duration</th>
 <th>Memory</th>
 </tr>
 \${current.workers.map(w => \`
 <tr>
 <td>\${w.id}</td>
 <td><span class="status-badge status-\${w.status}">\${w.status.toUpperCase()}</span></td>
 <td>\${w.activeTasks}</td>
 <td>\${w.totalTasksCompleted}</td>
 <td>\${w.totalTasksFailed}</td>
 <td>\${w.averageTaskDuration.toFixed(0)}ms</td>
 <td>\${w.memoryUsage.toFixed(0)}MB</td>
 </tr>
 \`).join('')}
 \`;
 document.getElementById('workers').innerHTML = workersHtml;

 // Update alerts
 const unresolvedAlerts = alerts.filter(a => !a.resolved);
 if (unresolvedAlerts.length === 0) {
 document.getElementById('alerts').innerHTML = '<p>No active alerts</p>';
 } else {
 document.getElementById('alerts').innerHTML = unresolvedAlerts.map(a => \`
 <div class="alert alert-\${a.severity}">
 <strong>\${a.severity.toUpperCase()}:</strong> \${a.message}
 <span style="float: right; opacity: 0.6;">\${new Date(a.timestamp).toLocaleTimeString()}</span>
 </div>
 \`).join('');
 }
 }

 // Request initial update
 refresh();
 </script>
</body>
</html>`;
 }
}

