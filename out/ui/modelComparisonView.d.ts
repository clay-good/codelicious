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
import { ModelOrchestrator } from '../models/orchestrator';
export declare class ModelComparisonView {
    private panel;
    private readonly extensionUri;
    private readonly orchestrator;
    constructor(extensionUri: vscode.Uri, orchestrator: ModelOrchestrator);
    /**
    * Show the model comparison view
    */
    show(): void;
    /**
    * Select a model and update configuration
    */
    private selectModel;
    /**
    * Send initial data to webview
    */
    private sendInitialData;
    /**
    * Send current stats to webview
    */
    private sendStats;
    /**
    * Calculate cost for a model
    */
    private calculateCost;
    /**
    * Get models data for webview
    */
    private getModelsData;
    /**
    * Get HTML content for the webview
    */
    private getHtmlContent;
}
//# sourceMappingURL=modelComparisonView.d.ts.map