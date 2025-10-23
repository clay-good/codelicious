/**
 * Context Panel Provider
 * AUGMENT PARITY: Show users what context sources are being used
 *
 * This panel provides transparency by displaying:
 * - Files included in context
 * - Commits referenced
 * - Symbols and dependencies
 * - Relevance scores
 */
import * as vscode from 'vscode';
export interface ContextSource {
    type: 'file' | 'commit' | 'symbol' | 'dependency' | 'pattern';
    path: string;
    reason: string;
    score: number;
    preview: string;
    metadata?: {
        author?: string;
        date?: string;
        lineNumbers?: string;
    };
}
export declare class ContextPanelProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri;
    static readonly viewType = "codelicious.contextPanel";
    private view?;
    private currentContext;
    private currentQuery;
    constructor(extensionUri: vscode.Uri);
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    /**
    * Update context display
    */
    updateContext(query: string, sources: ContextSource[]): void;
    /**
    * Clear context display
    */
    clearContext(): void;
    private updateView;
    private openFile;
    private getHtmlContent;
    private getEmptyStateHtml;
    private renderMetadata;
    private getTypeIcon;
    private getScoreColor;
    private escapeHtml;
}
//# sourceMappingURL=contextPanel.d.ts.map