/**
 * Analytics View Provider - Beautiful dashboard for analytics and insights
 */
import * as vscode from 'vscode';
import { AnalyticsManager } from './analyticsManager';
export declare class AnalyticsViewProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    private readonly analyticsManager;
    static readonly viewType = "codelicious.analyticsView";
    private _view?;
    constructor(_extensionUri: vscode.Uri, analyticsManager: AnalyticsManager);
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    /**
    * Refresh the analytics view
    */
    refresh(): void;
    /**
    * Export analytics data
    */
    private exportData;
    /**
    * Clear analytics data
    */
    private clearData;
    /**
    * Get HTML for webview
    */
    private _getHtmlForWebview;
    /**
    * Render dashboard HTML
    */
    private renderDashboard;
}
//# sourceMappingURL=analyticsViewProvider.d.ts.map