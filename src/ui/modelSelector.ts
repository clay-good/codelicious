/**
 * Model Selector - UI for selecting AI models and providers
 *
 * Allows users to:
 * - Choose their preferred AI provider (Claude, OpenAI, Gemini)
 * - Select specific models within each provider
 * - View model capabilities and pricing
 * - Set default model for different task types
 */

import * as vscode from 'vscode';
import { ModelProvider } from '../types';
import { ModelOrchestrator } from '../models/orchestrator';
import { TaskComplexity } from '../models/modelRouter';
import { ModelComparisonView } from './modelComparisonView';

export interface ModelInfo {
 provider: ModelProvider;
 model: string;
 displayName: string;
 description: string;
 contextWindow: number;
 costPerMToken: string;
 capabilities: string[];
 recommended?: string;
}

export class ModelSelector {
 private comparisonView: ModelComparisonView | undefined;

 public static readonly MODELS: ModelInfo[] = [
 // Claude Models
 {
 provider: ModelProvider.CLAUDE,
 model: 'claude-3-5-sonnet-20241022',
 displayName: 'Claude 3.5 Sonnet',
 description: 'Best overall model - excellent for complex coding tasks',
 contextWindow: 200000,
 costPerMToken: '$3 / $15',
 capabilities: ['Coding', 'Reasoning', 'Vision', 'Function Calling'],
 recommended: 'Best for: Complex code generation, architecture design, debugging'
 },
 {
 provider: ModelProvider.CLAUDE,
 model: 'claude-3-opus-20240229',
 displayName: 'Claude 3 Opus',
 description: 'Most powerful Claude model - best for complex reasoning',
 contextWindow: 200000,
 costPerMToken: '$15 / $75',
 capabilities: ['Advanced Reasoning', 'Vision', 'Function Calling'],
 recommended: 'Best for: Complex algorithms, system design, deep analysis'
 },
 {
 provider: ModelProvider.CLAUDE,
 model: 'claude-3-haiku-20240307',
 displayName: 'Claude 3 Haiku',
 description: 'Fast and cost-effective - great for simple tasks',
 contextWindow: 200000,
 costPerMToken: '$0.25 / $1.25',
 capabilities: ['Fast', 'Cost-Effective', 'Vision'],
 recommended: 'Best for: Code completion, simple questions, quick fixes'
 },

 // OpenAI Models
 {
 provider: ModelProvider.OPENAI,
 model: 'gpt-4-turbo-preview',
 displayName: 'GPT-4 Turbo',
 description: 'Latest GPT-4 with 128k context - great for large codebases',
 contextWindow: 128000,
 costPerMToken: '$10 / $30',
 capabilities: ['Large Context', 'Vision', 'Function Calling'],
 recommended: 'Best for: Large file analysis, comprehensive refactoring'
 },
 {
 provider: ModelProvider.OPENAI,
 model: 'o1-preview',
 displayName: 'OpenAI o1-preview',
 description: 'Advanced reasoning model - excels at complex problem solving',
 contextWindow: 128000,
 costPerMToken: '$15 / $60',
 capabilities: ['Advanced Reasoning', 'Problem Solving'],
 recommended: 'Best for: Algorithm design, complex debugging, optimization'
 },
 {
 provider: ModelProvider.OPENAI,
 model: 'gpt-3.5-turbo',
 displayName: 'GPT-3.5 Turbo',
 description: 'Fast and affordable - good for simple tasks',
 contextWindow: 16385,
 costPerMToken: '$0.50 / $1.50',
 capabilities: ['Fast', 'Cost-Effective', 'Function Calling'],
 recommended: 'Best for: Code completion, simple explanations, quick answers'
 },

 // Gemini Models
 {
 provider: ModelProvider.GEMINI,
 model: 'gemini-1.5-pro',
 displayName: 'Gemini 1.5 Pro',
 description: 'Massive 2M context window - perfect for entire codebases',
 contextWindow: 2000000,
 costPerMToken: '$1.25 / $5',
 capabilities: ['Huge Context (2M)', 'Vision', 'Function Calling'],
 recommended: 'Best for: Analyzing entire projects, cross-file refactoring'
 },
 {
 provider: ModelProvider.GEMINI,
 model: 'gemini-1.5-flash',
 displayName: 'Gemini 1.5 Flash',
 description: 'Extremely fast and cheap - 1M context window',
 contextWindow: 1000000,
 costPerMToken: '$0.075 / $0.30',
 capabilities: ['Very Fast', 'Very Cheap', 'Large Context (1M)'],
 recommended: 'Best for: Quick tasks, code completion, simple questions'
 }
 ];

 constructor(
 private orchestrator: ModelOrchestrator,
 private extensionUri?: vscode.Uri
 ) {
 if (extensionUri) {
 this.comparisonView = new ModelComparisonView(extensionUri, orchestrator);
 }
 }

 /**
 * Show model selection quick pick
 */
 async showModelPicker(): Promise<ModelInfo | undefined> {
 const availableProviders = this.orchestrator.getAvailableProviders();

 if (availableProviders.length === 0) {
 vscode.window.showErrorMessage(
 'No AI providers configured. Please configure API keys first.',
 'Configure API Keys'
 ).then(selection => {
 if (selection === 'Configure API Keys') {
 vscode.commands.executeCommand('codelicious.configureApiKeys');
 }
 });
 return undefined;
 }

 // Filter models by available providers
 const availableModels = ModelSelector.MODELS.filter(m =>
 availableProviders.includes(m.provider)
 );

 if (availableModels.length === 0) {
 vscode.window.showErrorMessage('No models available');
 return undefined;
 }

 // Create quick pick items
 const items = availableModels.map(model => ({
 label: `$(${this.getProviderIcon(model.provider)}) ${model.displayName}`,
 description: `${model.costPerMToken} per M tokens`,
 detail: `${model.description}\n${model.recommended}`,
 model: model
 }));

 const selected = await vscode.window.showQuickPick(items, {
 placeHolder: 'Select an AI model',
 matchOnDescription: true,
 matchOnDetail: true
 });

 return selected?.model;
 }

 /**
 * Show detailed model comparison
 */
 async showModelComparison(): Promise<void> {
 if (this.comparisonView) {
 this.comparisonView.show();
 } else {
 // Fallback to simple quick pick if no extension URI provided
 const model = await this.showModelPicker();
 if (model) {
 await this.setDefaultModel(model);
 vscode.window.showInformationMessage(`Default model set to ${model.displayName}`);
 }
 }
 }

 /**
 * Set default model in configuration
 */
 async setDefaultModel(model: ModelInfo): Promise<void> {
 const config = vscode.workspace.getConfiguration('codelicious');
 await config.update('models.defaultModel', model.model, vscode.ConfigurationTarget.Global);
 await config.update('models.defaultProvider', model.provider, vscode.ConfigurationTarget.Global);
 }

 /**
 * Get default model from configuration
 */
 getDefaultModel(): string | undefined {
 const config = vscode.workspace.getConfiguration('codelicious');
 return config.get<string>('models.defaultModel');
 }

 /**
 * Get model info by model name
 */
 static getModelInfo(modelName: string): ModelInfo | undefined {
 return ModelSelector.MODELS.find(m => m.model === modelName);
 }

 /**
 * Get all models for a provider
 */
 static getModelsForProvider(provider: ModelProvider): ModelInfo[] {
 return ModelSelector.MODELS.filter(m => m.provider === provider);
 }

 /**
 * Get provider icon
 */
 private getProviderIcon(provider: ModelProvider): string {
 switch (provider) {
 case ModelProvider.CLAUDE: return 'symbol-class';
 case ModelProvider.OPENAI: return 'symbol-method';
 case ModelProvider.GEMINI: return 'symbol-property';
 default: return 'symbol-misc';
 }
 }

 /**
 * Generate HTML for model comparison webview
 */
 private getComparisonHtml(): string {
 const availableProviders = this.orchestrator.getAvailableProviders();
 const availableModels = ModelSelector.MODELS.filter(m =>
 availableProviders.includes(m.provider)
 );

 const modelRows = availableModels.map(model => `
 <tr>
 <td><strong>${model.displayName}</strong></td>
 <td>${model.provider.toUpperCase()}</td>
 <td>${(model.contextWindow / 1000).toFixed(0)}k</td>
 <td>${model.costPerMToken}</td>
 <td>${model.capabilities.join(', ')}</td>
 <td>
 <button onclick="selectModel('${model.model}')">
 Select
 </button>
 </td>
 </tr>
 <tr class="detail-row">
 <td colspan="6">
 <small>${model.recommended}</small>
 </td>
 </tr>
 `).join('');

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
 }

 h1 {
 font-size: 24px;
 margin-bottom: 10px;
 }

 .intro {
 margin-bottom: 30px;
 padding: 15px;
 background-color: var(--vscode-textBlockQuote-background);
 border-left: 4px solid var(--vscode-textLink-foreground);
 }

 table {
 width: 100%;
 border-collapse: collapse;
 margin-top: 20px;
 }

 th, td {
 padding: 12px;
 text-align: left;
 border-bottom: 1px solid var(--vscode-panel-border);
 }

 th {
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 font-weight: 600;
 }

 tr:hover {
 background-color: var(--vscode-list-hoverBackground);
 }

 .detail-row {
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 }

 .detail-row td {
 padding: 8px 12px;
 font-size: 12px;
 color: var(--vscode-descriptionForeground);
 }

 button {
 padding: 6px 12px;
 background-color: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 border: none;
 border-radius: 4px;
 cursor: pointer;
 font-size: 12px;
 }

 button:hover {
 background-color: var(--vscode-button-hoverBackground);
 }

 .legend {
 margin-top: 30px;
 padding: 15px;
 background-color: var(--vscode-textBlockQuote-background);
 }

 .legend h3 {
 margin-top: 0;
 font-size: 16px;
 }

 .legend ul {
 margin: 10px 0;
 padding-left: 20px;
 }
 </style>
</head>
<body>
 <h1> AI Model Comparison</h1>

 <div class="intro">
 <p><strong>Choose the right model for your needs:</strong></p>
 <ul>
 <li><strong>Simple tasks</strong> (code completion, quick questions): Use fast, cheap models</li>
 <li><strong>Complex tasks</strong> (architecture, debugging): Use powerful reasoning models</li>
 <li><strong>Large codebases</strong>: Use models with large context windows</li>
 </ul>
 </div>

 <table>
 <thead>
 <tr>
 <th>Model</th>
 <th>Provider</th>
 <th>Context</th>
 <th>Cost (Input/Output)</th>
 <th>Capabilities</th>
 <th>Action</th>
 </tr>
 </thead>
 <tbody>
 ${modelRows}
 </tbody>
 </table>

 <div class="legend">
 <h3> Tips</h3>
 <ul>
 <li><strong>Cost-Effective:</strong> Gemini Flash ($0.075/$0.30) or GPT-3.5 ($0.50/$1.50)</li>
 <li><strong>Best Overall:</strong> Claude 3.5 Sonnet ($3/$15) - excellent balance</li>
 <li><strong>Most Powerful:</strong> Claude Opus ($15/$75) or o1-preview ($15/$60)</li>
 <li><strong>Largest Context:</strong> Gemini 1.5 Pro (2M tokens) - analyze entire projects</li>
 </ul>
 </div>

 <script>
 const vscode = acquireVsCodeApi();

 function selectModel(model) {
 vscode.postMessage({
 type: 'selectModel',
 model: model
 });
 }
 </script>
</body>
</html>`;
 }
}

