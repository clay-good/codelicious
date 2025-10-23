/**
 * Model Comparison View - Interactive UI for comparing and selecting AI models
 *
 * Features:
 * - Side-by-side model comparison
 * - Real-time pricing calculator
 * - Performance metrics
 * - Recommended models for different tasks
 * - Quick model switching
 */

import * as vscode from 'vscode';
import { ModelProvider } from '../types';
import { ModelOrchestrator } from '../models/orchestrator';
import { ModelInfo, ModelSelector } from './modelSelector';

export class ModelComparisonView {
 private panel: vscode.WebviewPanel | undefined;
 private readonly extensionUri: vscode.Uri;
 private readonly orchestrator: ModelOrchestrator;

 constructor(extensionUri: vscode.Uri, orchestrator: ModelOrchestrator) {
 this.extensionUri = extensionUri;
 this.orchestrator = orchestrator;
 }

 /**
 * Show the model comparison view
 */
 public show(): void {
 if (this.panel) {
 this.panel.reveal(vscode.ViewColumn.One);
 return;
 }

 this.panel = vscode.window.createWebviewPanel(
 'codeliciousModelComparison',
 'AI Model Comparison',
 vscode.ViewColumn.One,
 {
 enableScripts: true,
 retainContextWhenHidden: true
 }
 );

 this.panel.webview.html = this.getHtmlContent();

 // Handle messages from the webview
 this.panel.webview.onDidReceiveMessage(
 async (message) => {
 switch (message.command) {
 case 'selectModel':
 await this.selectModel(message.model);
 break;
 case 'getStats':
 await this.sendStats();
 break;
 case 'calculateCost':
 await this.calculateCost(message.model, message.tokens);
 break;
 }
 }
 );

 this.panel.onDidDispose(() => {
 this.panel = undefined;
 });

 // Send initial data
 this.sendInitialData();
 }

 /**
 * Select a model and update configuration
 */
 private async selectModel(modelName: string): Promise<void> {
 const modelInfo = ModelSelector.getModelInfo(modelName);
 if (!modelInfo) {
 vscode.window.showErrorMessage(`Model not found: ${modelName}`);
 return;
 }

 const selector = new ModelSelector(this.orchestrator);
 await selector.setDefaultModel(modelInfo);

 vscode.window.showInformationMessage(
 ` Default model set to ${modelInfo.displayName}`,
 'View Settings'
 ).then(selection => {
 if (selection === 'View Settings') {
 vscode.commands.executeCommand('workbench.action.openSettings', 'codelicious.models');
 }
 });

 // Update the webview
 this.sendInitialData();
 }

 /**
 * Send initial data to webview
 */
 private async sendInitialData(): Promise<void> {
 if (!this.panel) return;

 const selector = new ModelSelector(this.orchestrator);
 const currentModel = selector.getDefaultModel();
 const availableProviders = this.orchestrator.getAvailableProviders();
 const stats = this.orchestrator.getCostStats();

 this.panel.webview.postMessage({
 command: 'init',
 data: {
 currentModel,
 availableProviders,
 stats,
 models: this.getModelsData()
 }
 });
 }

 /**
 * Send current stats to webview
 */
 private async sendStats(): Promise<void> {
 if (!this.panel) return;

 const stats = this.orchestrator.getCostStats();
 this.panel.webview.postMessage({
 command: 'stats',
 data: stats
 });
 }

 /**
 * Calculate cost for a model
 */
 private async calculateCost(modelName: string, tokens: number): Promise<void> {
 if (!this.panel) return;

 const modelInfo = ModelSelector.getModelInfo(modelName);
 if (!modelInfo) return;

 // Parse cost string (e.g., "$3 / $15" -> input: 3, output: 15)
 const costs = modelInfo.costPerMToken.match(/\$(\d+\.?\d*)/g);
 if (!costs || costs.length < 2) return;

 const inputCost = parseFloat(costs[0].replace('$', ''));
 const outputCost = parseFloat(costs[1].replace('$', ''));

 // Assume 70% input, 30% output
 const inputTokens = tokens * 0.7;
 const outputTokens = tokens * 0.3;

 const totalCost = (inputTokens / 1000000 * inputCost) + (outputTokens / 1000000 * outputCost);

 this.panel.webview.postMessage({
 command: 'costCalculated',
 data: {
 model: modelName,
 tokens,
 cost: totalCost.toFixed(4)
 }
 });
 }

 /**
 * Get models data for webview
 */
 private getModelsData(): unknown[] {
 const selector = new ModelSelector(this.orchestrator);
 const availableProviders = this.orchestrator.getAvailableProviders();

 return ModelSelector['MODELS']
 .filter(m => availableProviders.includes(m.provider))
 .map(m => ({
 ...m,
 available: true
 }));
 }

 /**
 * Get HTML content for the webview
 */
 private getHtmlContent(): string {
 return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>AI Model Comparison</title>
 <style>
 body {
 font-family: var(--vscode-font-family);
 color: var(--vscode-foreground);
 background-color: var(--vscode-editor-background);
 padding: 20px;
 margin: 0;
 }

 h1 {
 color: var(--vscode-foreground);
 border-bottom: 1px solid var(--vscode-panel-border);
 padding-bottom: 10px;
 }

 .header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 20px;
 }

 .stats {
 display: flex;
 gap: 20px;
 margin-bottom: 20px;
 padding: 15px;
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 5px;
 }

 .stat {
 flex: 1;
 }

 .stat-label {
 font-size: 12px;
 color: var(--vscode-descriptionForeground);
 margin-bottom: 5px;
 }

 .stat-value {
 font-size: 24px;
 font-weight: bold;
 color: var(--vscode-textLink-foreground);
 }

 .cost-calculator {
 margin-bottom: 30px;
 padding: 15px;
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 5px;
 }

 .calculator-input {
 display: flex;
 gap: 10px;
 align-items: center;
 margin-top: 10px;
 }

 .calculator-input input {
 flex: 1;
 padding: 8px;
 background-color: var(--vscode-input-background);
 color: var(--vscode-input-foreground);
 border: 1px solid var(--vscode-input-border);
 border-radius: 3px;
 }

 .calculator-result {
 margin-top: 10px;
 font-size: 18px;
 font-weight: bold;
 color: var(--vscode-textLink-foreground);
 }

 .models-grid {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
 gap: 20px;
 }

 .model-card {
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border: 2px solid transparent;
 border-radius: 8px;
 padding: 20px;
 cursor: pointer;
 transition: all 0.2s;
 }

 .model-card:hover {
 border-color: var(--vscode-textLink-foreground);
 transform: translateY(-2px);
 }

 .model-card.selected {
 border-color: var(--vscode-textLink-activeForeground);
 background-color: var(--vscode-list-activeSelectionBackground);
 }

 .model-card.recommended {
 border-color: var(--vscode-editorWarning-foreground);
 }

 .model-header {
 display: flex;
 justify-content: space-between;
 align-items: start;
 margin-bottom: 10px;
 }

 .model-name {
 font-size: 18px;
 font-weight: bold;
 color: var(--vscode-foreground);
 }

 .model-badge {
 padding: 3px 8px;
 border-radius: 3px;
 font-size: 11px;
 font-weight: bold;
 text-transform: uppercase;
 }

 .badge-recommended {
 background-color: var(--vscode-editorWarning-background);
 color: var(--vscode-editorWarning-foreground);
 }

 .badge-selected {
 background-color: var(--vscode-textLink-activeForeground);
 color: white;
 }

 .model-description {
 color: var(--vscode-descriptionForeground);
 margin-bottom: 15px;
 font-size: 13px;
 }

 .model-cost {
 font-size: 16px;
 font-weight: bold;
 color: var(--vscode-textLink-foreground);
 margin-bottom: 10px;
 }

 .model-context {
 font-size: 12px;
 color: var(--vscode-descriptionForeground);
 margin-bottom: 10px;
 }

 .model-capabilities {
 display: flex;
 flex-wrap: wrap;
 gap: 5px;
 margin-bottom: 10px;
 }

 .capability {
 padding: 3px 8px;
 background-color: var(--vscode-badge-background);
 color: var(--vscode-badge-foreground);
 border-radius: 3px;
 font-size: 11px;
 }

 .model-recommended-for {
 font-size: 12px;
 color: var(--vscode-textLink-foreground);
 font-style: italic;
 margin-top: 10px;
 }

 button {
 padding: 8px 16px;
 background-color: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 border: none;
 border-radius: 3px;
 cursor: pointer;
 font-size: 13px;
 }

 button:hover {
 background-color: var(--vscode-button-hoverBackground);
 }

 .filter-bar {
 display: flex;
 gap: 10px;
 margin-bottom: 20px;
 }

 .filter-button {
 padding: 6px 12px;
 background-color: var(--vscode-button-secondaryBackground);
 color: var(--vscode-button-secondaryForeground);
 border: 1px solid var(--vscode-button-border);
 border-radius: 3px;
 cursor: pointer;
 font-size: 12px;
 }

 .filter-button.active {
 background-color: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 }
 </style>
</head>
<body>
 <div class="header">
 <h1> AI Model Comparison</h1>
 </div>

 <div class="stats">
 <div class="stat">
 <div class="stat-label">Total Requests</div>
 <div class="stat-value" id="totalRequests">0</div>
 </div>
 <div class="stat">
 <div class="stat-label">Total Cost</div>
 <div class="stat-value" id="totalCost">$0.00</div>
 </div>
 <div class="stat">
 <div class="stat-label">Cache Hit Rate</div>
 <div class="stat-value" id="cacheHitRate">0%</div>
 </div>
 </div>

 <div class="cost-calculator">
 <h3> Cost Calculator</h3>
 <div class="calculator-input">
 <label>Tokens:</label>
 <input type="number" id="tokenInput" value="10000" min="1000" step="1000" />
 <button onclick="calculateCost()">Calculate</button>
 </div>
 <div class="calculator-result" id="calculatorResult"></div>
 </div>

 <div class="filter-bar">
 <button class="filter-button active" onclick="filterModels('all')">All Models</button>
 <button class="filter-button" onclick="filterModels('claude')">Claude</button>
 <button class="filter-button" onclick="filterModels('openai')">OpenAI</button>
 <button class="filter-button" onclick="filterModels('gemini')">Gemini</button>
 <button class="filter-button" onclick="filterModels('recommended')">Recommended</button>
 </div>

 <div class="models-grid" id="modelsGrid"></div>

 <script>
 const vscode = acquireVsCodeApi();
 let currentModel = null;
 let allModels = [];
 let currentFilter = 'all';

 // Listen for messages from the extension
 window.addEventListener('message', event => {
 const message = event.data;
 switch (message.command) {
 case 'init':
 currentModel = message.data.currentModel;
 allModels = message.data.models;
 updateStats(message.data.stats);
 renderModels();
 break;
 case 'stats':
 updateStats(message.data);
 break;
 case 'costCalculated':
 document.getElementById('calculatorResult').textContent =
 \`Estimated cost: $\${message.data.cost} for \${message.data.tokens.toLocaleString()} tokens\`;
 break;
 }
 });

 function updateStats(stats) {
 document.getElementById('totalRequests').textContent = stats.totalRequests || 0;
 document.getElementById('totalCost').textContent = \`$\${(stats.totalCost || 0).toFixed(2)}\`;
 const cacheHitRate = stats.totalRequests > 0
 ? ((stats.cacheHits || 0) / stats.totalRequests * 100).toFixed(1)
 : 0;
 document.getElementById('cacheHitRate').textContent = \`\${cacheHitRate}%\`;
 }

 function renderModels() {
 const grid = document.getElementById('modelsGrid');
 grid.innerHTML = '';

 const filteredModels = allModels.filter(model => {
 if (currentFilter === 'all') return true;
 if (currentFilter === 'recommended') return model.model === 'claude-3-5-sonnet-20241022';
 return model.provider.toLowerCase() === currentFilter;
 });

 filteredModels.forEach(model => {
 const card = document.createElement('div');
 card.className = 'model-card';
 if (model.model === currentModel) card.classList.add('selected');
 if (model.model === 'claude-3-5-sonnet-20241022') card.classList.add('recommended');

 card.innerHTML = \`
 <div class="model-header">
 <div class="model-name">\${model.displayName}</div>
 <div>
 \${model.model === 'claude-3-5-sonnet-20241022' ? '<span class="model-badge badge-recommended">Recommended</span>' : ''}
 \${model.model === currentModel ? '<span class="model-badge badge-selected">Current</span>' : ''}
 </div>
 </div>
 <div class="model-description">\${model.description}</div>
 <div class="model-cost">\${model.costPerMToken} per M tokens</div>
 <div class="model-context">Context: \${(model.contextWindow / 1000).toLocaleString()}k tokens</div>
 <div class="model-capabilities">
 \${model.capabilities.map(cap => \`<span class="capability">\${cap}</span>\`).join('')}
 </div>
 <div class="model-recommended-for">\${model.recommended}</div>
 \`;

 card.onclick = () => selectModel(model.model);
 grid.appendChild(card);
 });
 }

 function selectModel(modelName) {
 vscode.postMessage({
 command: 'selectModel',
 model: modelName
 });
 }

 function filterModels(filter) {
 currentFilter = filter;
 document.querySelectorAll('.filter-button').forEach(btn => btn.classList.remove('active'));
 event.target.classList.add('active');
 renderModels();
 }

 function calculateCost() {
 const tokens = parseInt(document.getElementById('tokenInput').value);
 allModels.forEach(model => {
 vscode.postMessage({
 command: 'calculateCost',
 model: model.model,
 tokens: tokens
 });
 });
 }

 // Request initial stats
 vscode.postMessage({ command: 'getStats' });
 </script>
</body>
</html>`;
 }
}

