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
export declare class ModelSelector {
    private orchestrator;
    private extensionUri?;
    private comparisonView;
    static readonly MODELS: ModelInfo[];
    constructor(orchestrator: ModelOrchestrator, extensionUri?: vscode.Uri | undefined);
    /**
    * Show model selection quick pick
    */
    showModelPicker(): Promise<ModelInfo | undefined>;
    /**
    * Show detailed model comparison
    */
    showModelComparison(): Promise<void>;
    /**
    * Set default model in configuration
    */
    setDefaultModel(model: ModelInfo): Promise<void>;
    /**
    * Get default model from configuration
    */
    getDefaultModel(): string | undefined;
    /**
    * Get model info by model name
    */
    static getModelInfo(modelName: string): ModelInfo | undefined;
    /**
    * Get all models for a provider
    */
    static getModelsForProvider(provider: ModelProvider): ModelInfo[];
    /**
    * Get provider icon
    */
    private getProviderIcon;
    /**
    * Generate HTML for model comparison webview
    */
    private getComparisonHtml;
}
//# sourceMappingURL=modelSelector.d.ts.map