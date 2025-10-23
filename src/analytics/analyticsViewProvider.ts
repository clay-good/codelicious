/**
 * Analytics View Provider - Beautiful dashboard for analytics and insights
 */

import * as vscode from 'vscode';
import { AnalyticsManager, AnalyticsSummary } from './analyticsManager';

export class AnalyticsViewProvider implements vscode.WebviewViewProvider {
 public static readonly viewType = 'codelicious.analyticsView';
 private _view?: vscode.WebviewView;

 constructor(
 private readonly _extensionUri: vscode.Uri,
 private readonly analyticsManager: AnalyticsManager
 ) {}

 public resolveWebviewView(
 webviewView: vscode.WebviewView,
 context: vscode.WebviewViewResolveContext,
 _token: vscode.CancellationToken
 ) {
 this._view = webviewView;

 webviewView.webview.options = {
 enableScripts: true,
 localResourceRoots: [this._extensionUri]
 };

 webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

 // Handle messages from the webview
 webviewView.webview.onDidReceiveMessage(async (data) => {
 switch (data.type) {
 case 'refresh':
 this.refresh();
 break;
 case 'export':
 await this.exportData(data.format);
 break;
 case 'clear':
 await this.clearData();
 break;
 }
 });

 // Refresh every 30 seconds
 setInterval(() => this.refresh(), 30000);
 }

 /**
 * Refresh the analytics view
 */
 public refresh() {
 if (this._view) {
 const summary = this.analyticsManager.getSummary();
 this._view.webview.postMessage({ type: 'update', summary });
 }
 }

 /**
 * Export analytics data
 */
 private async exportData(format: 'json' | 'csv') {
 try {
 const data = format === 'json'
 ? this.analyticsManager.exportToJSON()
 : this.analyticsManager.exportToCSV();

 const fileName = `codelicious-analytics-${Date.now()}.${format}`;
 const uri = await vscode.window.showSaveDialog({
 defaultUri: vscode.Uri.file(fileName),
 filters: {
 [format.toUpperCase()]: [format]
 }
 });

 if (uri) {
 await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf8'));
 vscode.window.showInformationMessage(`Analytics exported to ${uri.fsPath}`);
 }
 } catch (error) {
 vscode.window.showErrorMessage(`Failed to export analytics: ${error}`);
 }
 }

 /**
 * Clear analytics data
 */
 private async clearData() {
 const confirm = await vscode.window.showWarningMessage(
 'Are you sure you want to clear all analytics data?',
 { modal: true },
 'Clear'
 );

 if (confirm === 'Clear') {
 await this.analyticsManager.clearMetrics();
 this.refresh();
 vscode.window.showInformationMessage('Analytics data cleared');
 }
 }

 /**
 * Get HTML for webview
 */
 private _getHtmlForWebview(webview: vscode.Webview) {
 const summary = this.analyticsManager.getSummary();

 return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Analytics Dashboard</title>
 <style>
 * {
 margin: 0;
 padding: 0;
 box-sizing: border-box;
 }

 body {
 font-family: var(--vscode-font-family);
 font-size: var(--vscode-font-size);
 color: var(--vscode-foreground);
 background-color: var(--vscode-editor-background);
 padding: 20px;
 }

 h1 {
 font-size: 24px;
 margin-bottom: 10px;
 color: var(--vscode-foreground);
 }

 h2 {
 font-size: 18px;
 margin: 20px 0 10px 0;
 color: var(--vscode-foreground);
 border-bottom: 1px solid var(--vscode-panel-border);
 padding-bottom: 5px;
 }

 .header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 20px;
 }

 .actions {
 display: flex;
 gap: 10px;
 }

 button {
 background-color: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 border: none;
 padding: 8px 16px;
 cursor: pointer;
 border-radius: 4px;
 font-size: 13px;
 }

 button:hover {
 background-color: var(--vscode-button-hoverBackground);
 }

 button.secondary {
 background-color: var(--vscode-button-secondaryBackground);
 color: var(--vscode-button-secondaryForeground);
 }

 button.secondary:hover {
 background-color: var(--vscode-button-secondaryHoverBackground);
 }

 .metrics-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 15px;
 margin-bottom: 20px;
 }

 .metric-card {
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border: 1px solid var(--vscode-panel-border);
 border-radius: 8px;
 padding: 15px;
 }

 .metric-label {
 font-size: 12px;
 color: var(--vscode-descriptionForeground);
 margin-bottom: 5px;
 }

 .metric-value {
 font-size: 24px;
 font-weight: bold;
 color: var(--vscode-foreground);
 }

 .metric-unit {
 font-size: 14px;
 color: var(--vscode-descriptionForeground);
 margin-left: 5px;
 }

 .list {
 list-style: none;
 margin: 10px 0;
 }

 .list-item {
 padding: 8px 12px;
 margin: 5px 0;
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 4px;
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .insight {
 padding: 12px;
 margin: 8px 0;
 background-color: var(--vscode-textBlockQuote-background);
 border-left: 3px solid var(--vscode-textLink-foreground);
 border-radius: 4px;
 }

 .recommendation {
 padding: 12px;
 margin: 8px 0;
 background-color: var(--vscode-inputValidation-warningBackground);
 border-left: 3px solid var(--vscode-inputValidation-warningBorder);
 border-radius: 4px;
 }

 .chart {
 margin: 15px 0;
 padding: 15px;
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 8px;
 }

 .bar {
 display: flex;
 align-items: center;
 margin: 8px 0;
 }

 .bar-label {
 width: 120px;
 font-size: 12px;
 color: var(--vscode-descriptionForeground);
 }

 .bar-fill {
 flex: 1;
 height: 20px;
 background-color: var(--vscode-progressBar-background);
 border-radius: 4px;
 position: relative;
 overflow: hidden;
 }

 .bar-progress {
 height: 100%;
 background-color: var(--vscode-button-background);
 transition: width 0.3s ease;
 }

 .bar-value {
 margin-left: 10px;
 font-size: 12px;
 color: var(--vscode-foreground);
 }

 .empty-state {
 text-align: center;
 padding: 40px;
 color: var(--vscode-descriptionForeground);
 }

 .empty-state-icon {
 font-size: 48px;
 margin-bottom: 10px;
 }
 </style>
</head>
<body>
 <div class="header">
 <h1> Analytics Dashboard</h1>
 <div class="actions">
 <button onclick="refresh()"> Refresh</button>
 <button class="secondary" onclick="exportJSON()"> Export JSON</button>
 <button class="secondary" onclick="exportCSV()"> Export CSV</button>
 <button class="secondary" onclick="clearData()"> Clear</button>
 </div>
 </div>

 <div id="content">
 ${this.renderDashboard(summary)}
 </div>

 <script>
 const vscode = acquireVsCodeApi();

 function refresh() {
 vscode.postMessage({ type: 'refresh' });
 }

 function exportJSON() {
 vscode.postMessage({ type: 'export', format: 'json' });
 }

 function exportCSV() {
 vscode.postMessage({ type: 'export', format: 'csv' });
 }

 function clearData() {
 vscode.postMessage({ type: 'clear' });
 }

 // Listen for updates
 window.addEventListener('message', event => {
 const message = event.data;
 if (message.type === 'update') {
 updateDashboard(message.summary);
 }
 });

 function updateDashboard(summary) {
 document.getElementById('content').innerHTML = renderDashboard(summary);
 }

 function renderDashboard(summary) {
 if (!summary || summary.performance.totalOperations === 0) {
 return \`
 <div class="empty-state">
 <div class="empty-state-icon"></div>
 <h2>No Analytics Data Yet</h2>
 <p>Start using Codelicious to see analytics and insights!</p>
 </div>
 \`;
 }

 return \`
 <h2> Performance</h2>
 <div class="metrics-grid">
 <div class="metric-card">
 <div class="metric-label">Total Operations</div>
 <div class="metric-value">\${summary.performance.totalOperations.toLocaleString()}</div>
 </div>
 <div class="metric-card">
 <div class="metric-label">Average Duration</div>
 <div class="metric-value">\${(summary.performance.averageDuration / 1000).toFixed(2)}<span class="metric-unit">s</span></div>
 </div>
 <div class="metric-card">
 <div class="metric-label">Success Rate</div>
 <div class="metric-value">\${summary.performance.successRate.toFixed(1)}<span class="metric-unit">%</span></div>
 </div>
 </div>

 <h2> Cost Analysis</h2>
 <div class="metrics-grid">
 <div class="metric-card">
 <div class="metric-label">Total Cost</div>
 <div class="metric-value">$\${summary.cost.totalCost.toFixed(4)}</div>
 </div>
 <div class="metric-card">
 <div class="metric-label">Projected Monthly</div>
 <div class="metric-value">$\${summary.cost.projectedMonthlyCost.toFixed(2)}</div>
 </div>
 </div>

 <div class="chart">
 <h3>Cost by Provider</h3>
 \${Object.entries(summary.cost.costByProvider).map(([provider, cost]) => {
 const percentage = (cost / summary.cost.totalCost) * 100;
 return \`
 <div class="bar">
 <div class="bar-label">\${provider}</div>
 <div class="bar-fill">
 <div class="bar-progress" style="width: \${percentage}%"></div>
 </div>
 <div class="bar-value">$\${cost.toFixed(4)}</div>
 </div>
 \`;
 }).join('')}
 </div>

 <h2> Usage Insights</h2>
 <div class="chart">
 <h3>Most Used Features</h3>
 <ul class="list">
 \${summary.usage.mostUsedFeatures.map(f => \`
 <li class="list-item">
 <span>\${f.feature}</span>
 <span>\${f.count} times</span>
 </li>
 \`).join('')}
 </ul>
 </div>

 <h2> Insights</h2>
 \${summary.insights.map(insight => \`
 <div class="insight">\${insight}</div>
 \`).join('')}

 <h2> Recommendations</h2>
 \${summary.recommendations.map(rec => \`
 <div class="recommendation">\${rec}</div>
 \`).join('')}
 \`;
 }
 </script>
</body>
</html>`;
 }

 /**
 * Render dashboard HTML
 */
 private renderDashboard(summary: AnalyticsSummary): string {
 if (summary.performance.totalOperations === 0) {
 return `
 <div class="empty-state">
 <div class="empty-state-icon"></div>
 <h2>No Analytics Data Yet</h2>
 <p>Start using Codelicious to see analytics and insights!</p>
 </div>
 `;
 }

 return `
 <h2> Performance</h2>
 <div class="metrics-grid">
 <div class="metric-card">
 <div class="metric-label">Total Operations</div>
 <div class="metric-value">${summary.performance.totalOperations.toLocaleString()}</div>
 </div>
 <div class="metric-card">
 <div class="metric-label">Average Duration</div>
 <div class="metric-value">${(summary.performance.averageDuration / 1000).toFixed(2)}<span class="metric-unit">s</span></div>
 </div>
 <div class="metric-card">
 <div class="metric-label">Success Rate</div>
 <div class="metric-value">${summary.performance.successRate.toFixed(1)}<span class="metric-unit">%</span></div>
 </div>
 </div>

 <h2> Cost Analysis</h2>
 <div class="metrics-grid">
 <div class="metric-card">
 <div class="metric-label">Total Cost</div>
 <div class="metric-value">$${summary.cost.totalCost.toFixed(4)}</div>
 </div>
 <div class="metric-card">
 <div class="metric-label">Projected Monthly</div>
 <div class="metric-value">$${summary.cost.projectedMonthlyCost.toFixed(2)}</div>
 </div>
 </div>

 <div class="chart">
 <h3>Cost by Provider</h3>
 ${Object.entries(summary.cost.costByProvider).map(([provider, cost]) => {
 const percentage = (cost / summary.cost.totalCost) * 100;
 return `
 <div class="bar">
 <div class="bar-label">${provider}</div>
 <div class="bar-fill">
 <div class="bar-progress" style="width: ${percentage}%"></div>
 </div>
 <div class="bar-value">$${cost.toFixed(4)}</div>
 </div>
 `;
 }).join('')}
 </div>

 <h2> Usage Insights</h2>
 <div class="chart">
 <h3>Most Used Features</h3>
 <ul class="list">
 ${summary.usage.mostUsedFeatures.map(f => `
 <li class="list-item">
 <span>${f.feature}</span>
 <span>${f.count} times</span>
 </li>
 `).join('')}
 </ul>
 </div>

 <h2> Insights</h2>
 ${summary.insights.map(insight => `
 <div class="insight">${insight}</div>
 `).join('')}

 <h2> Recommendations</h2>
 ${summary.recommendations.map(rec => `
 <div class="recommendation">${rec}</div>
 `).join('')}
 `;
 }
}

