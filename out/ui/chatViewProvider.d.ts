/**
 * Chat View Provider - Webview-based chat interface
 */
import * as vscode from 'vscode';
import { ExtensionManager } from '../core/extensionManager';
import { ContextPanelProvider } from './contextPanel';
export declare class ChatViewProvider implements vscode.WebviewViewProvider {
    private readonly _extensionUri;
    private readonly extensionManager;
    static readonly viewType = "codelicious.chatView";
    private _view?;
    private modelSelector?;
    private codeActionHandler?;
    private fileAttachmentManager?;
    private autonomousExecutor?;
    private autonomousBuilder?;
    private agentOrchestrator?;
    private requestRouter?;
    private messageHandler?;
    private selectedModel?;
    private conversationHistory;
    private lastAIResponse;
    private sessionInitialized;
    private multiAgentEnabled;
    private autoBuildEnabled;
    private contextPanel?;
    constructor(_extensionUri: vscode.Uri, extensionManager: ExtensionManager);
    /**
    * Set the context panel provider
    * AUGMENT PARITY: Enable context visibility
    */
    setContextPanel(panel: ContextPanelProvider): void;
    resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    /**
    * Handle user message from the chat
    * NEW: Uses intelligent request router to automatically detect build requests!
    */
    private handleUserMessage;
    /**
    * Handle streaming response
    */
    private handleStreamingResponse;
    /**
    * Handle non-streaming response
    */
    private handleNonStreamingResponse;
    /**
    * Generate unique message ID
    */
    private generateMessageId;
    /**
    * Detect message complexity for routing
    */
    private detectComplexity;
    /**
    * Handle model selection
    */
    private handleModelSelection;
    /**
    * Handle model comparison
    */
    private handleModelComparison;
    /**
    * Update model info in webview
    */
    private updateModelInfo;
    /**
    * Clear the chat history
    */
    private clearChat;
    /**
    * Generate HTML for the webview
    */
    private _getHtmlForWebview;
    /**
    * DEPRECATED: Old HTML template - now extracted to chatViewTemplate.ts
    * Keeping this comment for reference during migration
    */
    private _getHtmlForWebview_OLD;
    /**
    * Handle apply code action
    */
    private handleApplyCode;
    /**
    * Handle explain code action
    */
    private handleExplainCode;
    /**
    * Handle run code action
    */
    private handleRunCode;
    /**
    * Handle attach files action
    */
    private handleAttachFiles;
    /**
    * Handle attach current file action
    */
    private handleAttachCurrentFile;
    /**
    * Handle remove attachment action
    */
    private handleRemoveAttachment;
    /**
    * Handle clear attachments action
    */
    private handleClearAttachments;
    /**
    * Check for autonomous operations in AI response
    */
    private checkForAutonomousOperations;
    /**
    * Handle execute autonomous action
    */
    private handleExecuteAutonomous;
    /**
    * Get builder mode message based on intent type
    * BUILDER MODE: We ALWAYS build and save to files!
    */
    private getBuilderModeMessage;
    /**
    * Handle undo execution action
    */
    private handleUndoExecution;
    /**
    * Check if message is an autonomous build request
    */
    private isAutonomousBuildRequest;
    /**
    * Handle autonomous build request
    */
    private handleAutonomousBuildRequest;
    /**
    * Handle start autonomous build
    */
    private handleStartAutonomousBuild;
    /**
    * Handle cancel autonomous build
    */
    private handleCancelAutonomousBuild;
    /**
    * Check if message is a code generation request
    */
    private isCodeGenerationRequest;
    /**
    * Handle multi-agent code generation
    */
    private handleMultiAgentCodeGeneration;
    /**
    * Track message in session manager
    */
    private trackMessageInSession;
    /**
    * Extract context sources from RAG response for display in context panel
    * AUGMENT PARITY: Provide transparency about what context is being used
    */
    private extractContextSources;
}
//# sourceMappingURL=chatViewProvider.d.ts.map