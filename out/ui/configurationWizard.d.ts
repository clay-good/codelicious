/**
 * Smart Configuration Wizard - Intelligent setup assistant
 * UX: Guides users through optimal configuration based on their project
 *
 * Features:
 * - Project type detection
 * - Optimal settings recommendations
 * - Budget-based model selection
 * - Framework-specific configuration
 * - One-click setup
 */
import * as vscode from 'vscode';
export interface ProjectAnalysis {
    type: 'web' | 'mobile' | 'backend' | 'library' | 'unknown';
    languages: string[];
    frameworks: string[];
    hasTests: boolean;
    hasCI: boolean;
    packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'go';
    estimatedSize: 'small' | 'medium' | 'large';
}
export interface ConfigurationRecommendation {
    provider: string;
    model: string;
    reasoning: string;
    estimatedMonthlyCost: number;
}
export declare class ConfigurationWizard {
    private context;
    private workspaceRoot;
    constructor(context: vscode.ExtensionContext, workspaceRoot: string);
    /**
    * Start the configuration wizard
    */
    start(): Promise<void>;
    /**
    * Analyze the project
    */
    private analyzeProject;
    /**
    * Show analysis results
    */
    private showAnalysisResults;
    /**
    * Configure API keys
    */
    private configureApiKeys;
    /**
    * Get model recommendation
    */
    private getModelRecommendation;
    /**
    * Show provider selection
    */
    private showProviderSelection;
    /**
    * Configure model preferences
    */
    private configureModelPreferences;
    /**
    * Configure features
    */
    private configureFeatures;
    /**
    * Complete setup
    */
    private complete;
    /**
    * Check if wizard should run
    */
    static shouldRun(context: vscode.ExtensionContext): boolean;
    /**
    * Delay helper
    */
    private delay;
}
//# sourceMappingURL=configurationWizard.d.ts.map