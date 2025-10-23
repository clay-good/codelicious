/**
 * Chat View Provider - Webview-based chat interface
 */

import * as vscode from 'vscode';
import { ExtensionManager } from '../core/extensionManager';
import { ModelSelector } from './modelSelector';
import { CodeActionHandler } from './codeActionHandler';
import { FileAttachmentManager } from './fileAttachmentManager';
import { AutonomousExecutor } from '../core/autonomousExecutor';
import { AutonomousBuilder } from '../autonomous/autonomousBuilder';
import { AgentOrchestrator } from '../agents/agentOrchestrator';
import { ModelProvider, Message } from '../types';
import { StreamChunk } from '../models/baseAdapter';
import { IntelligentRequestRouter, RequestType } from '../core/intelligentRequestRouter';
import { ContextPanelProvider, ContextSource } from './contextPanel';
import { getChatViewHtml } from './chatViewTemplate';
import { ChatMessageHandler } from './chatMessageHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('ChatViewProvider');

export class ChatViewProvider implements vscode.WebviewViewProvider {
 public static readonly viewType = 'codelicious.chatView';
 private _view?: vscode.WebviewView;
 private modelSelector?: ModelSelector;
 private codeActionHandler?: CodeActionHandler;
 private fileAttachmentManager?: FileAttachmentManager;
 private autonomousExecutor?: AutonomousExecutor;
 private autonomousBuilder?: AutonomousBuilder;
 private agentOrchestrator?: AgentOrchestrator;
 private requestRouter?: IntelligentRequestRouter;
 private messageHandler?: ChatMessageHandler;
 private selectedModel?: string;
 private conversationHistory: Message[] = [];
 private lastAIResponse: string = '';
 private sessionInitialized: boolean = false;
 private multiAgentEnabled: boolean = true; // Enable multi-agent by default
 private autoBuildEnabled: boolean = true; // Enable automatic build detection by default
 // AUGMENT PARITY: Context panel for transparency
 private contextPanel?: ContextPanelProvider;

 constructor(
 private readonly _extensionUri: vscode.Uri,
 private readonly extensionManager: ExtensionManager
 ) {}

 /**
 * Set the context panel provider
 * AUGMENT PARITY: Enable context visibility
 */
 public setContextPanel(panel: ContextPanelProvider): void {
 this.contextPanel = panel;
 }

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

 // Initialize model selector
 const orchestrator = this.extensionManager.getModelOrchestrator();
 if (orchestrator) {
 this.modelSelector = new ModelSelector(orchestrator);
 this.selectedModel = this.modelSelector.getDefaultModel();

 // Initialize intelligent request router
 this.requestRouter = new IntelligentRequestRouter(orchestrator);

 // Initialize message handler
 this.messageHandler = new ChatMessageHandler({
 orchestrator,
 requestRouter: this.requestRouter,
 contextPanel: this.contextPanel,
 selectedModel: this.selectedModel || 'claude-sonnet-4',
 conversationHistory: this.conversationHistory
 });
 }

 // Initialize code action handler, file attachment manager, autonomous executor, and agent orchestrator
 const workspaceFolders = vscode.workspace.workspaceFolders;
 if (workspaceFolders && workspaceFolders.length > 0) {
 const workspaceRoot = workspaceFolders[0].uri.fsPath;
 this.codeActionHandler = new CodeActionHandler(workspaceRoot);
 this.fileAttachmentManager = new FileAttachmentManager(workspaceRoot);
 this.autonomousExecutor = new AutonomousExecutor(workspaceRoot);

 // Initialize agent orchestrator if orchestrator and execution engine are available
 if (orchestrator) {
 const executionEngine = this.extensionManager.getExecutionEngine();
 if (executionEngine) {
 this.agentOrchestrator = new AgentOrchestrator(orchestrator, executionEngine, workspaceRoot);
 }
 }
 }

 webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

 // Send initial model info
 this.updateModelInfo();

 // Handle messages from the webview
 webviewView.webview.onDidReceiveMessage(async (data) => {
 switch (data.type) {
 case 'sendMessage':
 await this.handleUserMessage(data.message);
 break;
 case 'clearChat':
 await this.clearChat();
 break;
 case 'selectModel':
 await this.handleModelSelection();
 break;
 case 'compareModels':
 await this.handleModelComparison();
 break;
 case 'applyCode':
 await this.handleApplyCode(data.code, data.language);
 break;
 case 'explainCode':
 await this.handleExplainCode(data.code, data.language);
 break;
 case 'runCode':
 await this.handleRunCode(data.code, data.language);
 break;
 case 'attachFiles':
 await this.handleAttachFiles();
 break;
 case 'attachCurrentFile':
 await this.handleAttachCurrentFile();
 break;
 case 'removeAttachment':
 await this.handleRemoveAttachment(data.filePath);
 break;
 case 'clearAttachments':
 await this.handleClearAttachments();
 break;
 case 'executeAutonomous':
 await this.handleExecuteAutonomous();
 break;
 case 'undoExecution':
 await this.handleUndoExecution();
 break;
 case 'startAutonomousBuild':
 await this.handleStartAutonomousBuild(data.specification, data.projectName);
 break;
 case 'cancelAutonomousBuild':
 await this.handleCancelAutonomousBuild();
 break;
 }
 });
 }

 /**
 * Handle user message from the chat
 * NEW: Uses intelligent request router to automatically detect build requests!
 */
 private async handleUserMessage(message: string): Promise<void> {
 if (!this._view) {
 return;
 }

 // Include attached files in message if any
 let fullMessage = message;
 if (this.fileAttachmentManager && this.fileAttachmentManager.getCount() > 0) {
 const attachmentContext = this.fileAttachmentManager.formatForContext();
 fullMessage = message + attachmentContext;
 }

 // Add to conversation history
 this.conversationHistory.push({ role: 'user', content: fullMessage });

 // Track in session
 await this.trackMessageInSession({ role: 'user', content: fullMessage });

 // Show user message in chat
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'user',
 content: message
 });

 // Clear attachments after sending
 if (this.fileAttachmentManager) {
 this.fileAttachmentManager.clearAll();
 this._view.webview.postMessage({ type: 'clearAttachments' });
 }

 // Show typing indicator
 this._view.webview.postMessage({ type: 'showTyping' });

 // BUILDER MODE: EVERYTHING gets built and saved to files!
 // No manual code output - we're a BUILDER ENGINEER, not a chat assistant!
 if (this.requestRouter && this.autoBuildEnabled) {
 try {
 const intent = await this.requestRouter.analyzeIntent(message, this.conversationHistory);

 logger.info(`Intent Analysis: ${intent.type} (confidence: ${intent.confidence})`);
 logger.info(` Reasoning: ${intent.reasoning}`);

 // NEW: ALWAYS trigger autonomous build for ANY code-related request
 // Even examples, fixes, explanations - EVERYTHING gets saved to files!
 const shouldBuild =
 intent.type === RequestType.BUILD_REQUEST ||
 intent.type === RequestType.CODE_QUESTION ||
 intent.type === RequestType.CODE_EXPLANATION ||
 intent.type === RequestType.CODE_REVIEW ||
 intent.type === RequestType.DEBUGGING;

 if (shouldBuild) {
 // Show builder mode message
 const modeMessage = this.getBuilderModeMessage(intent);
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: modeMessage
 });

 // Hide typing indicator before starting build
 this._view.webview.postMessage({ type: 'hideTyping' });

 // Trigger autonomous build - EVERYTHING gets saved to files!
 await this.handleAutonomousBuildRequest(intent.specification);
 return;
 }
 } catch (error) {
 logger.error('Intent analysis failed', error);
 // Fall through to regular chat
 }
 }

 try {
 // Get model orchestrator
 const orchestrator = this.extensionManager.getModelOrchestrator();

 if (!orchestrator) {
 throw new Error('Model orchestrator not initialized');
 }

 // Check if this is a code generation request and multi-agent is enabled
 if (this.multiAgentEnabled && this.agentOrchestrator && this.isCodeGenerationRequest(message)) {
 await this.handleMultiAgentCodeGeneration(message);
 return;
 }

 // Get RAG service for context
 const ragService = this.extensionManager.getRAGService();
 let systemPrompt = 'You are Codelicious, an AI coding assistant. You help developers write, understand, and improve code.';

 // If RAG is available, get relevant context
 // AUGMENT PARITY: Use 200k+ token context with commit history (Context Lineage)
 if (ragService && ragService.isReady()) {
 try {
 const ragResponse = await ragService.queryWithHistory(message, {
 maxTokens: 200000
 });
 if (ragResponse && ragResponse.assembledContext) {
 systemPrompt += '\n\nRelevant code context:\n' + ragResponse.assembledContext;

 // AUGMENT PARITY: Update context panel with sources
 if (this.contextPanel) {
 const contextSources = this.extractContextSources(ragResponse);
 this.contextPanel.updateContext(message, contextSources);
 }
 }
 } catch (error) {
 logger.warn('Failed to get RAG context', error);
 }
 }

 // Build messages with conversation history
 // AUGMENT PARITY: Keep more conversation history for better context
 const messages = [
 { role: 'system' as const, content: systemPrompt },
 ...this.conversationHistory.slice(-50) // Keep last 50 messages for context
 ];

 // Check if streaming is enabled
 const config = vscode.workspace.getConfiguration('codelicious');
 const enableStreaming = config.get<boolean>('chat.enableStreaming', true);

 if (enableStreaming) {
 // Use streaming for real-time response
 await this.handleStreamingResponse(orchestrator, messages, message);
 } else {
 // Use non-streaming for complete response
 await this.handleNonStreamingResponse(orchestrator, messages, message);
 }

 } catch (error) {
 logger.error('Error handling message', error);

 // Hide typing indicator
 this._view.webview.postMessage({ type: 'hideTyping' });

 // Show error with retry button
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'error',
 content: ` **Error**: ${errorMessage}\n\n` +
 `The request failed after automatic retries. This could be due to:\n` +
 `- API rate limits\n` +
 `- Network issues\n` +
 `- Invalid API key\n` +
 `- Model unavailability\n\n` +
 ` **Tip**: Check your API key and try again. You can also try a different model.`,
 metadata: {
 canRetry: true,
 originalMessage: message
 }
 });
 }
 }

 /**
 * Handle streaming response
 */
 private async handleStreamingResponse(
 orchestrator: any, // ModelOrchestrator - using any due to complex generic types
 messages: Message[],
 userMessage: string
 ): Promise<void> {
 if (!this._view) {
 return;
 }

 let fullContent = '';
 let messageId: string | undefined;
 const startTime = Date.now();

 try {
 // Hide typing indicator and start streaming
 this._view.webview.postMessage({ type: 'hideTyping' });

 // Create streaming message placeholder
 messageId = this.generateMessageId();
 this._view.webview.postMessage({
 type: 'startStreamingMessage',
 messageId,
 role: 'assistant'
 });

 // Send streaming request
 const response = await orchestrator.sendStreamingRequest(
 {
 messages,
 model: this.selectedModel,
 stream: true
 },
 (chunk: StreamChunk) => {
 if (!chunk.done && chunk.content) {
 fullContent += chunk.content;

 // Send chunk to webview
 this._view?.webview.postMessage({
 type: 'streamChunk',
 messageId,
 content: chunk.content
 });
 }
 }
 );

 // Add to conversation history
 this.conversationHistory.push({ role: 'assistant', content: fullContent });

 // Track in session
 await this.trackMessageInSession({ role: 'assistant', content: fullContent });

 // Store last AI response for autonomous execution
 this.lastAIResponse = fullContent;

 // Check for autonomous operations
 await this.checkForAutonomousOperations(fullContent);

 // Finalize streaming message with metadata
 const latency = Date.now() - startTime;
 this._view.webview.postMessage({
 type: 'finalizeStreamingMessage',
 messageId,
 metadata: {
 model: response.model,
 cost: response.cost,
 tokens: response.usage.totalTokens,
 latency
 }
 });

 } catch (error) {
 logger.error('Error in streaming response', error);

 // Remove failed streaming message
 if (messageId) {
 this._view.webview.postMessage({
 type: 'removeMessage',
 messageId
 });
 }

 throw error;
 }
 }

 /**
 * Handle non-streaming response
 */
 private async handleNonStreamingResponse(
 orchestrator: any, // ModelOrchestrator - using any due to complex generic types
 messages: Message[],
 userMessage: string
 ): Promise<void> {
 if (!this._view) {
 return;
 }

 const response = await orchestrator.sendRequest(
 {
 messages,
 model: this.selectedModel,
 stream: false
 },
 {
 complexity: this.detectComplexity(userMessage)
 }
 );

 // Add to conversation history
 this.conversationHistory.push({ role: 'assistant', content: response.content });

 // Track in session
 await this.trackMessageInSession({ role: 'assistant', content: response.content });

 // Store last AI response for autonomous execution
 this.lastAIResponse = response.content;

 // Check for autonomous operations
 await this.checkForAutonomousOperations(response.content);

 // Hide typing indicator
 this._view.webview.postMessage({ type: 'hideTyping' });

 // Show assistant response in chat
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: response.content,
 metadata: {
 model: response.model,
 cost: response.cost,
 tokens: response.usage.totalTokens,
 latency: response.latency
 }
 });
 }

 /**
 * Generate unique message ID
 */
 private generateMessageId(): string {
 return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 }

 /**
 * Detect message complexity for routing
 */
 private detectComplexity(message: string): 'simple' | 'moderate' | 'complex' {
 const lower = message.toLowerCase();

 if (lower.includes('explain') || lower.includes('why') || lower.includes('how does')) {
 return 'complex';
 }
 if (lower.includes('refactor') || lower.includes('improve') || lower.includes('optimize')) {
 return 'moderate';
 }
 return 'simple';
 }

 /**
 * Handle model selection
 */
 private async handleModelSelection(): Promise<void> {
 if (!this.modelSelector) {
 return;
 }

 const selected = await this.modelSelector.showModelPicker();
 if (selected) {
 this.selectedModel = selected.model;
 await this.modelSelector.setDefaultModel(selected);
 this.updateModelInfo();

 vscode.window.showInformationMessage(
 `Switched to ${selected.displayName}`
 );
 }
 }

 /**
 * Handle model comparison
 */
 private async handleModelComparison(): Promise<void> {
 if (!this.modelSelector) {
 return;
 }

 await this.modelSelector.showModelComparison();
 }

 /**
 * Update model info in webview
 */
 private updateModelInfo(): void {
 if (!this._view || !this.selectedModel) {
 return;
 }

 const modelInfo = ModelSelector.getModelInfo(this.selectedModel);
 if (modelInfo) {
 this._view.webview.postMessage({
 type: 'updateModel',
 model: {
 name: modelInfo.displayName,
 provider: modelInfo.provider,
 description: modelInfo.description
 }
 });
 }
 }

 /**
 * Clear the chat history
 */
 private async clearChat(): Promise<void> {
 if (this._view) {
 this.conversationHistory = [];
 this._view.webview.postMessage({ type: 'clearMessages' });
 }
 }

 /**
 * Generate HTML for the webview
 */
 private _getHtmlForWebview(webview: vscode.Webview): string {
 return getChatViewHtml(webview);
 }

 /**
 * DEPRECATED: Old HTML template - now extracted to chatViewTemplate.ts
 * Keeping this comment for reference during migration
 */
 private _getHtmlForWebview_OLD(webview: vscode.Webview): string {
 return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Codelicious Chat</title>
 <style>
 body {
 padding: 0;
 margin: 0;
 font-family: var(--vscode-font-family);
 color: var(--vscode-foreground);
 background-color: var(--vscode-editor-background);
 display: flex;
 flex-direction: column;
 height: 100vh;
 }

 #chat-container {
 flex: 1;
 overflow-y: auto;
 padding: 16px;
 display: flex;
 flex-direction: column;
 gap: 12px;
 }

 .message {
 padding: 12px;
 border-radius: 8px;
 max-width: 85%;
 word-wrap: break-word;
 }

 .message.user {
 background-color: var(--vscode-input-background);
 align-self: flex-end;
 border: 1px solid var(--vscode-input-border);
 }

 .message.assistant {
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 align-self: flex-start;
 }

 .message.error {
 background-color: var(--vscode-inputValidation-errorBackground);
 border: 1px solid var(--vscode-inputValidation-errorBorder);
 align-self: flex-start;
 }

 #input-container {
 padding: 16px;
 border-top: 1px solid var(--vscode-panel-border);
 }

 #attachments-container {
 display: none;
 padding: 8px;
 background-color: var(--vscode-editor-background);
 border-radius: 4px;
 margin-bottom: 8px;
 max-height: 150px;
 overflow-y: auto;
 }

 #attachments-container.has-attachments {
 display: block;
 }

 .attachment-item {
 display: flex;
 align-items: center;
 justify-content: space-between;
 padding: 6px 8px;
 background-color: var(--vscode-list-hoverBackground);
 border-radius: 3px;
 margin-bottom: 4px;
 }

 .attachment-info {
 display: flex;
 align-items: center;
 gap: 8px;
 flex: 1;
 min-width: 0;
 }

 .attachment-icon {
 font-size: 16px;
 }

 .attachment-name {
 font-weight: 500;
 white-space: nowrap;
 overflow: hidden;
 text-overflow: ellipsis;
 }

 .attachment-size {
 font-size: 11px;
 color: var(--vscode-descriptionForeground);
 margin-left: 8px;
 }

 .attachment-remove {
 padding: 2px 6px;
 font-size: 11px;
 background-color: var(--vscode-button-secondaryBackground);
 color: var(--vscode-button-secondaryForeground);
 border: none;
 border-radius: 3px;
 cursor: pointer;
 }

 .attachment-remove:hover {
 background-color: var(--vscode-button-secondaryHoverBackground);
 }

 #input-area {
 display: flex;
 gap: 8px;
 }

 #message-input {
 flex: 1;
 padding: 8px 12px;
 background-color: var(--vscode-input-background);
 color: var(--vscode-input-foreground);
 border: 1px solid var(--vscode-input-border);
 border-radius: 4px;
 font-family: var(--vscode-font-family);
 font-size: 14px;
 resize: none;
 min-height: 60px;
 }

 #message-input:focus {
 outline: 1px solid var(--vscode-focusBorder);
 }

 .attach-button {
 padding: 8px 12px;
 background-color: var(--vscode-button-secondaryBackground);
 color: var(--vscode-button-secondaryForeground);
 border: none;
 border-radius: 4px;
 cursor: pointer;
 font-size: 14px;
 display: flex;
 align-items: center;
 gap: 4px;
 }

 .attach-button:hover {
 background-color: var(--vscode-button-secondaryHoverBackground);
 }

 button {
 padding: 8px 16px;
 background-color: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 border: none;
 border-radius: 4px;
 cursor: pointer;
 font-family: var(--vscode-font-family);
 font-size: 14px;
 }

 button:hover {
 background-color: var(--vscode-button-hoverBackground);
 }

 button:disabled {
 opacity: 0.5;
 cursor: not-allowed;
 }

 .header {
 padding: 16px;
 border-bottom: 1px solid var(--vscode-panel-border);
 }

 .header-top {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 8px;
 }

 .header h2 {
 margin: 0;
 font-size: 16px;
 font-weight: 600;
 }

 .model-selector {
 display: flex;
 align-items: center;
 gap: 8px;
 padding: 8px 12px;
 background-color: var(--vscode-input-background);
 border: 1px solid var(--vscode-input-border);
 border-radius: 4px;
 font-size: 12px;
 cursor: pointer;
 }

 .model-selector:hover {
 background-color: var(--vscode-list-hoverBackground);
 }

 .model-name {
 font-weight: 600;
 }

 .model-provider {
 color: var(--vscode-descriptionForeground);
 font-size: 11px;
 }

 .header-buttons {
 display: flex;
 gap: 8px;
 }

 .clear-button, .compare-button {
 background-color: transparent;
 color: var(--vscode-foreground);
 padding: 4px 8px;
 font-size: 12px;
 }

 .typing-indicator {
 display: none;
 padding: 12px;
 align-self: flex-start;
 color: var(--vscode-descriptionForeground);
 font-style: italic;
 }

 .typing-indicator.visible {
 display: block;
 }

 .message-metadata {
 font-size: 10px;
 color: var(--vscode-descriptionForeground);
 margin-top: 4px;
 display: flex;
 gap: 12px;
 }

 .message-content {
 white-space: pre-wrap;
 word-wrap: break-word;
 }

 .streaming-cursor {
 display: inline-block;
 animation: blink 1s infinite;
 color: var(--vscode-textLink-foreground);
 font-weight: bold;
 }

 @keyframes blink {
 0%, 49% { opacity: 1; }
 50%, 100% { opacity: 0; }
 }

 .message.streaming {
 opacity: 0.95;
 }

 /* Code block styles */
 .code-block-container {
 position: relative;
 margin: 8px 0;
 }

 .code-block-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 4px 8px;
 background-color: var(--vscode-editor-background);
 border: 1px solid var(--vscode-panel-border);
 border-bottom: none;
 border-radius: 4px 4px 0 0;
 font-size: 11px;
 color: var(--vscode-descriptionForeground);
 }

 .code-language {
 font-weight: 600;
 text-transform: uppercase;
 }

 .code-actions {
 display: flex;
 gap: 4px;
 align-items: center;
 }

 .action-button {
 padding: 2px 8px;
 font-size: 11px;
 background-color: var(--vscode-button-secondaryBackground);
 color: var(--vscode-button-secondaryForeground);
 border: none;
 border-radius: 3px;
 cursor: pointer;
 transition: background-color 0.2s;
 }

 .action-button:hover {
 background-color: var(--vscode-button-secondaryHoverBackground);
 }

 .copy-button {
 padding: 2px 8px;
 font-size: 11px;
 background-color: var(--vscode-button-secondaryBackground);
 color: var(--vscode-button-secondaryForeground);
 border: none;
 border-radius: 3px;
 cursor: pointer;
 }

 .copy-button:hover {
 background-color: var(--vscode-button-secondaryHoverBackground);
 }

 .copy-button.copied {
 background-color: var(--vscode-testing-iconPassed);
 color: white;
 }

 pre {
 margin: 0;
 padding: 12px;
 background-color: var(--vscode-textCodeBlock-background);
 border: 1px solid var(--vscode-panel-border);
 border-radius: 0 0 4px 4px;
 overflow-x: auto;
 font-family: var(--vscode-editor-font-family);
 font-size: 13px;
 line-height: 1.5;
 }

 pre code {
 font-family: var(--vscode-editor-font-family);
 background: none;
 padding: 0;
 }

 code {
 background-color: var(--vscode-textCodeBlock-background);
 padding: 2px 6px;
 border-radius: 3px;
 font-family: var(--vscode-editor-font-family);
 font-size: 13px;
 }

 /* Syntax highlighting - VS Code theme colors */
 .hljs {
 color: var(--vscode-editor-foreground);
 background: var(--vscode-textCodeBlock-background);
 }

 .hljs-keyword,
 .hljs-selector-tag,
 .hljs-literal,
 .hljs-section,
 .hljs-link {
 color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
 }

 .hljs-function,
 .hljs-class,
 .hljs-title {
 color: var(--vscode-symbolIcon-functionForeground, #dcdcaa);
 }

 .hljs-string,
 .hljs-title.class_,
 .hljs-title.function_ {
 color: var(--vscode-symbolIcon-stringForeground, #ce9178);
 }

 .hljs-comment,
 .hljs-quote {
 color: var(--vscode-symbolIcon-colorForeground, #6a9955);
 font-style: italic;
 }

 .hljs-number,
 .hljs-regexp,
 .hljs-literal {
 color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
 }

 .hljs-variable,
 .hljs-template-variable,
 .hljs-attribute {
 color: var(--vscode-symbolIcon-variableForeground, #9cdcfe);
 }

 .hljs-meta {
 color: var(--vscode-symbolIcon-keywordForeground, #569cd6);
 }

 .hljs-type,
 .hljs-built_in {
 color: var(--vscode-symbolIcon-classForeground, #4ec9b0);
 }

 /* Markdown styles */
 .message-content h1,
 .message-content h2,
 .message-content h3 {
 margin: 12px 0 8px 0;
 font-weight: 600;
 }

 .message-content h1 { font-size: 18px; }
 .message-content h2 { font-size: 16px; }
 .message-content h3 { font-size: 14px; }

 .message-content ul,
 .message-content ol {
 margin: 8px 0;
 padding-left: 24px;
 }

 .message-content li {
 margin: 4px 0;
 }

 .message-content p {
 margin: 8px 0;
 }

 .message-content strong {
 font-weight: 600;
 }

 .message-content em {
 font-style: italic;
 }

 .message-content blockquote {
 margin: 8px 0;
 padding: 8px 12px;
 border-left: 4px solid var(--vscode-textLink-foreground);
 background-color: var(--vscode-textBlockQuote-background);
 }

 .message-content a {
 color: var(--vscode-textLink-foreground);
 text-decoration: none;
 }

 .message-content a:hover {
 text-decoration: underline;
 }
 </style>
 <!-- Highlight.js for syntax highlighting -->
 <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/javascript.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/python.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/java.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/cpp.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/csharp.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/go.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/rust.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/ruby.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/php.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/swift.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/kotlin.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/bash.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/json.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/yaml.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/xml.min.js"></script>
 <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/markdown.min.js"></script>
</head>
<body>
 <div class="header">
 <div class="header-top">
 <h2> Codelicious</h2>
 <div class="header-buttons">
 <button class="compare-button" onclick="compareModels()" title="Compare Models">
 Compare
 </button>
 <button class="clear-button" onclick="clearChat()" title="Clear Chat">
 Clear
 </button>
 </div>
 </div>
 <div class="model-selector" onclick="selectModel()" title="Click to change model">
 <span></span>
 <div>
 <div class="model-name" id="model-name">Loading...</div>
 <div class="model-provider" id="model-provider"></div>
 </div>
 </div>
 </div>

 <div id="chat-container">
 <div class="typing-indicator" id="typing-indicator">AI is thinking...</div>
 </div>

 <div id="input-container">
 <div id="attachments-container"></div>
 <div id="input-area">
 <button class="attach-button" onclick="attachFiles()" title="Attach files">

 </button>
 <button class="attach-button" onclick="attachCurrentFile()" title="Attach current file">

 </button>
 <textarea
 id="message-input"
 placeholder="Ask Codelicious anything..."
 onkeydown="handleKeyDown(event)"
 ></textarea>
 <button onclick="sendMessage()">Send</button>
 </div>
 </div>

 <script>
 const vscode = acquireVsCodeApi();
 const chatContainer = document.getElementById('chat-container');
 const messageInput = document.getElementById('message-input');
 const typingIndicator = document.getElementById('typing-indicator');
 const modelName = document.getElementById('model-name');
 const modelProvider = document.getElementById('model-provider');

 /**
 * Parse markdown and apply syntax highlighting
 */
 function parseMarkdown(content) {
 // Escape HTML
 const escapeHtml = (text) => {
 const div = document.createElement('div');
 div.textContent = text;
 return div.innerHTML;
 };

 // Parse code blocks with language
 content = content.replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, function(match, lang, code) {
 const language = lang || 'plaintext';
 const codeId = 'code_' + Math.random().toString(36).substr(2, 9);

 // Highlight code
 let highlightedCode;
 try {
 if (lang && hljs.getLanguage(lang)) {
 highlightedCode = hljs.highlight(code.trim(), { language: lang }).value;
 } else {
 highlightedCode = hljs.highlightAuto(code.trim()).value;
 }
 } catch (e) {
 highlightedCode = escapeHtml(code.trim());
 }

 return '<div class="code-block-container">' +
 '<div class="code-block-header">' +
 '<span class="code-language">' + language + '</span>' +
 '<div class="code-actions">' +
 '<button class="action-button" onclick="applyCode(\\'' + codeId + '\\', \\'' + language + '\\')">Apply</button>' +
 '<button class="action-button" onclick="explainCode(\\'' + codeId + '\\', \\'' + language + '\\')">Explain</button>' +
 '<button class="action-button" onclick="runCode(\\'' + codeId + '\\', \\'' + language + '\\')">Run</button>' +
 '<button class="copy-button" onclick="copyCode(\\'' + codeId + '\\')">Copy</button>' +
 '</div>' +
 '</div>' +
 '<pre><code id="' + codeId + '" class="hljs">' + highlightedCode + '</code></pre>' +
 '</div>';
 });

 // Parse inline code
 content = content.replace(/\`([^\`]+)\`/g, function(match, code) {
 return '<code>' + escapeHtml(code) + '</code>';
 });

 // Parse headers
 content = content.replace(/^### (.*$)/gim, '<h3>$1</h3>');
 content = content.replace(/^## (.*$)/gim, '<h2>$1</h2>');
 content = content.replace(/^# (.*$)/gim, '<h1>$1</h1>');

 // Parse bold
 content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
 content = content.replace(/__([^_]+)__/g, '<strong>$1</strong>');

 // Parse italic
 content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
 content = content.replace(/_([^_]+)_/g, '<em>$1</em>');

 // Parse links
 content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

 // Parse blockquotes
 content = content.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>');

 // Parse unordered lists
 content = content.replace(/^\* (.*$)/gim, '<li>$1</li>');
 content = content.replace(/^- (.*$)/gim, '<li>$1</li>');
 content = content.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

 // Parse ordered lists
 content = content.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

 // Parse line breaks
 content = content.replace(/\n\n/g, '</p><p>');
 content = content.replace(/\n/g, '<br>');

 return content;
 }

 /**
 * Copy code to clipboard
 */
 function copyCode(codeId) {
 const codeElement = document.getElementById(codeId);
 if (!codeElement) return;

 const code = codeElement.textContent;
 navigator.clipboard.writeText(code).then(() => {
 // Find the copy button
 const button = codeElement.closest('.code-block-container').querySelector('.copy-button');
 if (button) {
 const originalText = button.textContent;
 button.textContent = 'Copied!';
 button.classList.add('copied');

 setTimeout(() => {
 button.textContent = originalText;
 button.classList.remove('copied');
 }, 2000);
 }
 }).catch(err => {
 logger.error('Failed to copy code', err);
 });
 }

 /**
 * Apply code to file
 */
 function applyCode(codeId, language) {
 const codeElement = document.getElementById(codeId);
 if (!codeElement) return;

 const code = codeElement.textContent;
 vscode.postMessage({
 type: 'applyCode',
 code: code,
 language: language
 });
 }

 /**
 * Explain code
 */
 function explainCode(codeId, language) {
 const codeElement = document.getElementById(codeId);
 if (!codeElement) return;

 const code = codeElement.textContent;
 vscode.postMessage({
 type: 'explainCode',
 code: code,
 language: language
 });
 }

 /**
 * Run code
 */
 function runCode(codeId, language) {
 const codeElement = document.getElementById(codeId);
 if (!codeElement) return;

 const code = codeElement.textContent;
 vscode.postMessage({
 type: 'runCode',
 code: code,
 language: language
 });
 }

 function sendMessage() {
 const message = messageInput.value.trim();
 if (!message) return;

 vscode.postMessage({
 type: 'sendMessage',
 message: message
 });

 messageInput.value = '';
 messageInput.focus();
 }

 function clearChat() {
 vscode.postMessage({ type: 'clearChat' });
 }

 function selectModel() {
 vscode.postMessage({ type: 'selectModel' });
 }

 function compareModels() {
 vscode.postMessage({ type: 'compareModels' });
 }

 /**
 * Attach files
 */
 function attachFiles() {
 vscode.postMessage({ type: 'attachFiles' });
 }

 /**
 * Attach current file
 */
 function attachCurrentFile() {
 vscode.postMessage({ type: 'attachCurrentFile' });
 }

 /**
 * Remove attachment
 */
 function removeAttachment(filePath) {
 vscode.postMessage({
 type: 'removeAttachment',
 filePath: filePath
 });
 }

 /**
 * Clear all attachments
 */
 function clearAttachments() {
 vscode.postMessage({ type: 'clearAttachments' });
 }

 /**
 * Display attached files
 */
 function displayAttachments(files) {
 const container = document.getElementById('attachments-container');
 if (!container) return;

 if (files.length === 0) {
 container.classList.remove('has-attachments');
 container.innerHTML = '';
 return;
 }

 container.classList.add('has-attachments');
 container.innerHTML = files.map(file => {
 const sizeKB = (file.size / 1024).toFixed(1);
 return '<div class="attachment-item">' +
 '<div class="attachment-info">' +
 '<span class="attachment-icon"></span>' +
 '<span class="attachment-name" title="' + file.relativePath + '">' + file.name + '</span>' +
 '<span class="attachment-size">' + sizeKB + ' KB</span>' +
 '</div>' +
 '<button class="attachment-remove" onclick="removeAttachment(\\'' + file.path + '\\')"></button>' +
 '</div>';
 }).join('');
 }

 function handleKeyDown(event) {
 if (event.key === 'Enter' && !event.shiftKey) {
 event.preventDefault();
 sendMessage();
 }
 }

 function showTyping() {
 typingIndicator.classList.add('visible');
 chatContainer.scrollTop = chatContainer.scrollHeight;
 }

 function hideTyping() {
 typingIndicator.classList.remove('visible');
 }

 // Store streaming messages
 const streamingMessages = new Map();

 function addMessage(role, content, metadata) {
 const messageDiv = document.createElement('div');
 messageDiv.className = \`message \${role}\`;

 // Create content container
 const contentDiv = document.createElement('div');
 contentDiv.className = 'message-content';

 // Parse markdown for assistant messages
 if (role === 'assistant') {
 contentDiv.innerHTML = parseMarkdown(content);
 } else {
 contentDiv.textContent = content;
 }

 messageDiv.appendChild(contentDiv);

 // Add metadata if available
 if (metadata) {
 const metadataDiv = document.createElement('div');
 metadataDiv.className = 'message-metadata';
 metadataDiv.innerHTML = \`
 <span>Model: \${metadata.model}</span>
 <span>Cost: $\${metadata.cost.toFixed(4)}</span>
 <span>Tokens: \${metadata.tokens}</span>
 <span>Time: \${(metadata.latency / 1000).toFixed(1)}s</span>
 \`;
 messageDiv.appendChild(metadataDiv);
 }

 chatContainer.appendChild(messageDiv);
 chatContainer.scrollTop = chatContainer.scrollHeight;
 return messageDiv;
 }

 function startStreamingMessage(messageId, role) {
 const messageDiv = document.createElement('div');
 messageDiv.className = \`message \${role} streaming\`;
 messageDiv.id = messageId;

 const contentDiv = document.createElement('div');
 contentDiv.className = 'message-content';
 contentDiv.textContent = '';
 messageDiv.appendChild(contentDiv);

 // Add streaming indicator
 const streamingIndicator = document.createElement('span');
 streamingIndicator.className = 'streaming-cursor';
 streamingIndicator.textContent = '';
 contentDiv.appendChild(streamingIndicator);

 chatContainer.appendChild(messageDiv);
 streamingMessages.set(messageId, { div: messageDiv, content: contentDiv });
 chatContainer.scrollTop = chatContainer.scrollHeight;
 }

 function appendStreamChunk(messageId, chunk) {
 const message = streamingMessages.get(messageId);
 if (!message) return;

 const contentDiv = message.content;
 const cursor = contentDiv.querySelector('.streaming-cursor');

 // Insert chunk before cursor
 const textNode = document.createTextNode(chunk);
 if (cursor) {
 contentDiv.insertBefore(textNode, cursor);
 } else {
 contentDiv.appendChild(textNode);
 }

 chatContainer.scrollTop = chatContainer.scrollHeight;
 }

 function finalizeStreamingMessage(messageId, metadata) {
 const message = streamingMessages.get(messageId);
 if (!message) return;

 const messageDiv = message.div;
 const contentDiv = message.content;

 // Remove streaming cursor
 const cursor = contentDiv.querySelector('.streaming-cursor');
 if (cursor) {
 cursor.remove();
 }

 // Get the text content and parse markdown
 const textContent = contentDiv.textContent;
 contentDiv.innerHTML = parseMarkdown(textContent);

 // Remove streaming class
 messageDiv.classList.remove('streaming');

 // Add metadata
 if (metadata) {
 const metadataDiv = document.createElement('div');
 metadataDiv.className = 'message-metadata';
 metadataDiv.innerHTML = \`
 <span>Model: \${metadata.model}</span>
 <span>Cost: $\${metadata.cost.toFixed(4)}</span>
 <span>Tokens: \${metadata.tokens}</span>
 <span>Time: \${(metadata.latency / 1000).toFixed(1)}s</span>
 \`;
 messageDiv.appendChild(metadataDiv);
 }

 streamingMessages.delete(messageId);
 }

 function removeMessage(messageId) {
 const message = streamingMessages.get(messageId);
 if (message) {
 message.div.remove();
 streamingMessages.delete(messageId);
 }
 }

 function updateModel(model) {
 modelName.textContent = model.name;
 modelProvider.textContent = model.provider.toUpperCase();
 }

 // Track attached files
 let attachedFiles = [];

 // Handle messages from the extension
 window.addEventListener('message', event => {
 const message = event.data;
 switch (message.type) {
 case 'addMessage':
 addMessage(message.role, message.content, message.metadata);
 break;
 case 'startStreamingMessage':
 startStreamingMessage(message.messageId, message.role);
 break;
 case 'streamChunk':
 appendStreamChunk(message.messageId, message.content);
 break;
 case 'finalizeStreamingMessage':
 finalizeStreamingMessage(message.messageId, message.metadata);
 break;
 case 'removeMessage':
 removeMessage(message.messageId);
 break;
 case 'clearMessages':
 chatContainer.innerHTML = '<div class="typing-indicator" id="typing-indicator">AI is thinking...</div>';
 streamingMessages.clear();
 break;
 case 'showTyping':
 showTyping();
 break;
 case 'hideTyping':
 hideTyping();
 break;
 case 'updateModel':
 updateModel(message.model);
 break;
 case 'filesAttached':
 attachedFiles = attachedFiles.concat(message.files);
 displayAttachments(attachedFiles);
 break;
 case 'attachmentRemoved':
 attachedFiles = attachedFiles.filter(f => f.path !== message.filePath);
 displayAttachments(attachedFiles);
 break;
 case 'clearAttachments':
 attachedFiles = [];
 displayAttachments(attachedFiles);
 break;
 }
 });

 // Focus input on load
 messageInput.focus();
 </script>
</body>
</html>`;
 }

 /**
 * Handle apply code action
 */
 private async handleApplyCode(code: string, language: string): Promise<void> {
 if (!this.codeActionHandler) {
 vscode.window.showErrorMessage('Code action handler not initialized');
 return;
 }

 await this.codeActionHandler.applyCode(code, language);
 }

 /**
 * Handle explain code action
 */
 private async handleExplainCode(code: string, language: string): Promise<void> {
 if (!this.codeActionHandler) {
 vscode.window.showErrorMessage('Code action handler not initialized');
 return;
 }

 // Generate explanation prompt
 const prompt = await this.codeActionHandler.explainCode(code, language);

 // Send to AI
 await this.handleUserMessage(prompt);
 }

 /**
 * Handle run code action
 */
 private async handleRunCode(code: string, language: string): Promise<void> {
 if (!this.codeActionHandler) {
 vscode.window.showErrorMessage('Code action handler not initialized');
 return;
 }

 await this.codeActionHandler.runCode(code, language);
 }

 /**
 * Handle attach files action
 */
 private async handleAttachFiles(): Promise<void> {
 if (!this.fileAttachmentManager || !this._view) {
 return;
 }

 const files = await this.fileAttachmentManager.showFilePicker();

 if (files.length > 0) {
 // Send attached files to webview
 this._view.webview.postMessage({
 type: 'filesAttached',
 files: files.map(f => ({
 path: f.path,
 name: f.name,
 relativePath: f.relativePath,
 language: f.language,
 size: f.size,
 preview: f.preview
 }))
 });

 vscode.window.showInformationMessage(`Attached ${files.length} file(s)`);
 }
 }

 /**
 * Handle attach current file action
 */
 private async handleAttachCurrentFile(): Promise<void> {
 if (!this.fileAttachmentManager || !this._view) {
 return;
 }

 const file = await this.fileAttachmentManager.attachCurrentFile();

 if (file) {
 // Send attached file to webview
 this._view.webview.postMessage({
 type: 'filesAttached',
 files: [{
 path: file.path,
 name: file.name,
 relativePath: file.relativePath,
 language: file.language,
 size: file.size,
 preview: file.preview
 }]
 });

 vscode.window.showInformationMessage(`Attached: ${file.name}`);
 }
 }

 /**
 * Handle remove attachment action
 */
 private async handleRemoveAttachment(filePath: string): Promise<void> {
 if (!this.fileAttachmentManager || !this._view) {
 return;
 }

 const removed = this.fileAttachmentManager.removeFile(filePath);

 if (removed) {
 this._view.webview.postMessage({
 type: 'attachmentRemoved',
 filePath
 });
 }
 }

 /**
 * Handle clear attachments action
 */
 private async handleClearAttachments(): Promise<void> {
 if (!this.fileAttachmentManager || !this._view) {
 return;
 }

 this.fileAttachmentManager.clearAll();

 this._view.webview.postMessage({
 type: 'clearAttachments'
 });
 }

 /**
 * Check for autonomous operations in AI response
 */
 private async checkForAutonomousOperations(aiResponse: string): Promise<void> {
 if (!this.autonomousExecutor || !this._view) {
 return;
 }

 // Parse AI response for file operations
 const plan = this.autonomousExecutor.parseFileOperations(aiResponse);

 if (plan && plan.operations.length > 0) {
 // Notify webview that autonomous operations are available
 this._view.webview.postMessage({
 type: 'autonomousOperationsDetected',
 plan: {
 description: plan.description,
 operationCount: plan.operations.length,
 estimatedImpact: plan.estimatedImpact
 }
 });
 }
 }

 /**
 * Handle execute autonomous action
 */
 private async handleExecuteAutonomous(): Promise<void> {
 if (!this.autonomousExecutor || !this._view) {
 vscode.window.showErrorMessage('Autonomous executor not initialized');
 return;
 }

 try {
 // Parse last AI response
 const plan = this.autonomousExecutor.parseFileOperations(this.lastAIResponse);

 if (!plan || plan.operations.length === 0) {
 vscode.window.showInformationMessage('No file operations detected in the last response');
 return;
 }

 // Show execution plan and get user approval
 const approved = await this.autonomousExecutor.showExecutionPlan(plan);

 if (!approved) {
 vscode.window.showInformationMessage('Execution cancelled');
 return;
 }

 // Execute the plan
 const result = await this.autonomousExecutor.executePlan(plan);

 // Show result
 if (result.success) {
 vscode.window.showInformationMessage(
 ` Successfully applied ${result.appliedOperations.length} operation(s)!`
 );

 // Notify webview
 this._view.webview.postMessage({
 type: 'autonomousExecutionComplete',
 success: true,
 appliedCount: result.appliedOperations.length
 });
 } else {
 vscode.window.showWarningMessage(
 ` Applied ${result.appliedOperations.length} operation(s), ${result.failedOperations.length} failed`
 );

 // Show errors
 if (result.errors.length > 0) {
 vscode.window.showErrorMessage(`Errors:\n${result.errors.join('\n')}`);
 }

 // Notify webview
 this._view.webview.postMessage({
 type: 'autonomousExecutionComplete',
 success: false,
 appliedCount: result.appliedOperations.length,
 failedCount: result.failedOperations.length,
 errors: result.errors
 });
 }

 } catch (error) {
 vscode.window.showErrorMessage(
 `Failed to execute autonomous operations: ${error instanceof Error ? error.message : 'Unknown error'}`
 );
 }
 }

 /**
 * Get builder mode message based on intent type
 * BUILDER MODE: We ALWAYS build and save to files!
 */
 private getBuilderModeMessage(intent: {
 type: string;
 projectType?: string;
 languages?: string[];
 complexity: string;
 estimatedTasks?: string | number;
 }): string {
 const baseInfo = `- Project Type: ${intent.projectType || 'auto-detect'}\n` +
 `- Languages: ${intent.languages?.join(', ') || 'auto-detect'}\n` +
 `- Complexity: ${intent.complexity}`;

 switch (intent.type) {
 case RequestType.BUILD_REQUEST:
 return ` **BUILDER MODE: Full Product Build**\n\n` +
 `I'll build this complete product for you:\n${baseInfo}\n` +
 `- Estimated Tasks: ${intent.estimatedTasks || 'calculating...'}\n\n` +
 `Building and saving all files... `;

 case RequestType.CODE_QUESTION:
 return ` **BUILDER MODE: Example + Explanation**\n\n` +
 `I'll create working example files to answer your question:\n${baseInfo}\n\n` +
 `Creating example files... `;

 case RequestType.CODE_EXPLANATION:
 return ` **BUILDER MODE: Documented Examples**\n\n` +
 `I'll create documented example files with explanations:\n${baseInfo}\n\n` +
 `Creating documented examples... `;

 case RequestType.CODE_REVIEW:
 return ` **BUILDER MODE: Review + Improvements**\n\n` +
 `I'll review your code and save improved versions:\n${baseInfo}\n\n` +
 `Creating improved versions... `;

 case RequestType.DEBUGGING:
 return ` **BUILDER MODE: Debug + Fix**\n\n` +
 `I'll debug the issue and save fixed versions:\n${baseInfo}\n\n` +
 `Creating fixed versions... `;

 default:
 return ` **BUILDER MODE: Active**\n\n` +
 `I'll create files for your request:\n${baseInfo}\n\n` +
 `Building... `;
 }
 }

 /**
 * Handle undo execution action
 */
 private async handleUndoExecution(): Promise<void> {
 if (!this.autonomousExecutor) {
 vscode.window.showErrorMessage('Autonomous executor not initialized');
 return;
 }

 const success = await this.autonomousExecutor.undo();

 if (success && this._view) {
 this._view.webview.postMessage({
 type: 'undoComplete'
 });
 }
 }

 /**
 * Check if message is an autonomous build request
 */
 private isAutonomousBuildRequest(message: string): boolean {
 const lowerMessage = message.toLowerCase();
 const triggers = [
 'build this product start to finish',
 'build this project start to finish',
 'build this app start to finish',
 'build the entire app',
 'build the entire project',
 'build the complete app',
 'build autonomously',
 'autonomous build',
 'build everything'
 ];

 return triggers.some(trigger => lowerMessage.includes(trigger));
 }

 /**
 * Handle autonomous build request
 */
 private async handleAutonomousBuildRequest(message: string): Promise<void> {
 if (!this._view) {
 return;
 }

 // Show user message
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'user',
 content: message
 });

 // Check for attached specification file
 let specification = '';
 let projectName = 'NewProject';

 if (this.fileAttachmentManager && this.fileAttachmentManager.getCount() > 0) {
 // Get specification from attached files
 const attachments = this.fileAttachmentManager.getAttachedFiles();
 const specFile = attachments.find((a: { path: string; content: string }) => a.path.endsWith('.txt') || a.path.endsWith('.md'));

 if (specFile) {
 specification = specFile.content;
 projectName = specFile.path.split('/').pop()?.replace(/\.(txt|md)$/, '') || 'NewProject';
 }
 }

 if (!specification) {
 // Ask user to provide specification
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: ' To build your project autonomously, I need a specification file. Please attach a .txt or .md file with your project requirements, or describe what you want to build.'
 });
 return;
 }

 // Show confirmation dialog
 const proceed = await vscode.window.showInformationMessage(
 ` Start Autonomous Build?\n\nProject: ${projectName}\n\nThis will run autonomously until the project is complete. You can cancel at any time.`,
 { modal: true },
 'Start Build',
 'Cancel'
 );

 if (proceed !== 'Start Build') {
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: ' Autonomous build cancelled.'
 });
 return;
 }

 // Start autonomous build
 await this.handleStartAutonomousBuild(specification, projectName);
 }

 /**
 * Handle start autonomous build
 */
 private async handleStartAutonomousBuild(specification: string, projectName: string): Promise<void> {
 if (!this._view) {
 return;
 }

 const workspaceFolders = vscode.workspace.workspaceFolders;
 if (!workspaceFolders || workspaceFolders.length === 0) {
 vscode.window.showErrorMessage('No workspace folder open');
 return;
 }

 const workspaceRoot = workspaceFolders[0].uri.fsPath;
 const orchestrator = this.extensionManager.getModelOrchestrator();
 const executionEngine = this.extensionManager.getExecutionEngine();

 if (!orchestrator || !this.autonomousExecutor || !executionEngine) {
 vscode.window.showErrorMessage('Required services not initialized');
 return;
 }

 // Create output channel for autonomous build
 const outputChannel = vscode.window.createOutputChannel(`Codelicious: ${projectName}`);
 outputChannel.show();

 // Get RAG service and learning manager for cost optimization
 const ragService = this.extensionManager.getRAGService() || null;
 const learningManager = this.extensionManager.getLearningManager() || null;

 // Initialize autonomous builder with RAG and learning for cost optimization
 this.autonomousBuilder = new AutonomousBuilder(
 workspaceRoot,
 orchestrator,
 this.autonomousExecutor,
 executionEngine,
 ragService,
 learningManager,
 {
 maxIterations: 100,
 requireUserApproval: false,
 autoFixErrors: true,
 enableTests: true,
 saveStateInterval: 30,
 outputChannel
 }
 );

 // Show starting message
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: ` Starting autonomous build for **${projectName}**...\n\nI'll work through the specification step by step. You can monitor progress in the output channel and cancel at any time.`
 });

 try {
 // Run autonomous build
 const result = await this.autonomousBuilder.buildFromSpecification(specification, projectName);

 // Show completion message
 const summary = this.autonomousBuilder.getSummary();
 const completionMessage = result.success
 ? ` **Autonomous Build Complete!**\n\n${summary}\n\nYour project is ready!`
 : ` **Autonomous Build Incomplete**\n\n${summary}\n\nThe build stopped before completion. Check the output channel for details.`;

 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: completionMessage
 });

 if (result.success) {
 vscode.window.showInformationMessage(` ${projectName} built successfully!`);
 } else {
 vscode.window.showWarningMessage(` ${projectName} build incomplete. Check output for details.`);
 }

 } catch (error) {
 logger.error('Autonomous build error', error);

 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: ` **Autonomous Build Failed**\n\nError: ${error instanceof Error ? error.message : String(error)}\n\nCheck the output channel for details.`
 });

 vscode.window.showErrorMessage(`Autonomous build failed: ${error instanceof Error ? error.message : String(error)}`);
 } finally {
 this.autonomousBuilder?.dispose();
 this.autonomousBuilder = undefined;
 }
 }

 /**
 * Handle cancel autonomous build
 */
 private async handleCancelAutonomousBuild(): Promise<void> {
 if (this.autonomousBuilder) {
 this.autonomousBuilder.cancel();

 if (this._view) {
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: ' Autonomous build cancelled. Progress has been saved.'
 });
 }

 vscode.window.showInformationMessage('Autonomous build cancelled');
 }
 }

 /**
 * Check if message is a code generation request
 */
 private isCodeGenerationRequest(message: string): boolean {
 const lowerMessage = message.toLowerCase();
 const codeKeywords = [
 'create',
 'generate',
 'write',
 'build',
 'implement',
 'add',
 'make',
 'function',
 'class',
 'component',
 'api',
 'endpoint',
 'service',
 'fix',
 'refactor'
 ];

 return codeKeywords.some(keyword => lowerMessage.includes(keyword));
 }

 /**
 * Handle multi-agent code generation
 */
 private async handleMultiAgentCodeGeneration(message: string): Promise<void> {
 if (!this._view || !this.agentOrchestrator) {
 return;
 }

 try {
 // Get codebase context from RAG
 let codebaseContext = '';
 const ragService = this.extensionManager.getRAGService();
 if (ragService && ragService.isReady()) {
 try {
 const ragResponse = await ragService.queryOptimized(message, { limit: 5 });
 if (ragResponse.results.length > 0) {
 codebaseContext = ragResponse.assembledContext.context;
 }
 } catch (error) {
 logger.warn('Failed to get RAG context', error);
 }
 }

 // Get current file
 const currentFile = vscode.window.activeTextEditor?.document.fileName;

 // Show progress message
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: ' **Multi-Agent System Activated**\n\nCoordinating specialized AI agents:\n- Pre-Filter Agent: Optimizing your request\n- Code Generator: Creating code\n- Security Agent: Reviewing for vulnerabilities\n- Testing Agent: Generating tests\n- File Writer: Writing code to disk\n- Test Executor: Running tests\n\nPlease wait...'
 });

 // Get configuration settings
 const config = vscode.workspace.getConfiguration('codelicious.agents');
 const autoWriteFiles = config.get<boolean>('autoWriteFiles', true);
 const autoExecuteTests = config.get<boolean>('autoExecuteTests', true);
 const requireApproval = config.get<boolean>('requireApproval', true);

 // Execute multi-agent workflow
 const result = await this.agentOrchestrator.executeCodeGenerationWorkflow(
 message,
 this.conversationHistory,
 {
 codebaseContext,
 currentFile,
 autoWriteFiles,
 autoExecuteTests,
 requireApproval
 }
 );

 // Build response message
 let responseMessage = '';

 if (result.success) {
 responseMessage = ' **Multi-Agent Code Generation Complete!**\n\n';

 const finalOutput = result.finalOutput as any; // Complex workflow output structure
 // Add generated code
 if (finalOutput.code) {
 responseMessage += `**Generated Code:**\n\`\`\`${finalOutput.language}\n${finalOutput.code}\n\`\`\`\n\n`;
 }

 // Add explanation
 if (finalOutput.explanation) {
 responseMessage += `**Explanation:**\n${finalOutput.explanation}\n\n`;
 }

 // Add security review results
 const securityResult = result.agentResults.get('security_reviewer' as any);
 if (securityResult && securityResult.data && typeof securityResult.data === 'object') {
 const secData = securityResult.data as { securityScore: number; vulnerabilities: unknown[] };
 const score = secData.securityScore;
 responseMessage += `**Security Score:** ${score}/100 ${score >= 90 ? '' : score >= 70 ? '' : ''}\n`;

 if (secData.vulnerabilities.length > 0) {
 responseMessage += `**Security Issues Found:** ${secData.vulnerabilities.length}\n`;
 }
 }

 // Add testing results
 if (finalOutput.tests && finalOutput.tests.length > 0) {
 responseMessage += `\n**Tests Generated:** ${finalOutput.tests.length} test(s)\n`;
 }

 // Add file write results
 if (finalOutput.filesWritten && finalOutput.filesWritten.length > 0) {
 responseMessage += `\n** Files Written:**\n`;
 for (const file of finalOutput.filesWritten) {
 responseMessage += `- ${file}\n`;
 }
 }

 // Add test execution results
 if (finalOutput.testExecution) {
 responseMessage += `\n** Test Execution:**\n`;
 if (finalOutput.testExecution.success) {
 responseMessage += ' **Tests Passed**\n';
 } else {
 responseMessage += ' **Tests Failed**\n';
 }
 responseMessage += `Exit Code: ${finalOutput.testExecution.exitCode}\n`;

 // Show abbreviated output (first 500 chars)
 if (finalOutput.testExecution.output) {
 const output = finalOutput.testExecution.output;
 const abbreviated = output.length > 500 ? output.substring(0, 500) + '...\n\n(See Output channel for full results)' : output;
 responseMessage += `\n\`\`\`\n${abbreviated}\n\`\`\`\n`;
 }
 }

 // Add metrics
 responseMessage += `\n**Workflow Duration:** ${Math.round(result.duration / 1000)}s\n`;
 responseMessage += `**Total Cost:** $${result.totalCost.toFixed(4)}\n`;

 } else {
 responseMessage = ' **Multi-Agent Code Generation Failed**\n\n';
 responseMessage += `${result.summary}\n\n`;

 // Show partial results if available
 if (result.finalOutput && typeof result.finalOutput === 'object' && 'code' in result.finalOutput) {
 const output = result.finalOutput as { code: string; language: string; securityIssues?: Array<{ severity: string; description: string }> };
 responseMessage += `**Partial Code Generated:**\n\`\`\`${output.language}\n${output.code}\n\`\`\`\n\n`;

 if (output.securityIssues) {
 responseMessage += `**Security Issues Detected:**\n`;
 for (const issue of output.securityIssues) {
 responseMessage += `- [${issue.severity.toUpperCase()}] ${issue.description}\n`;
 }
 }
 }
 }

 // Send response
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: responseMessage
 });

 // Add to conversation history
 this.conversationHistory.push({ role: 'assistant', content: responseMessage });
 this.lastAIResponse = responseMessage;

 // Check for autonomous operations
 await this.checkForAutonomousOperations(responseMessage);

 } catch (error) {
 logger.error('Multi-agent code generation error', error);

 if (this._view) {
 this._view.webview.postMessage({
 type: 'addMessage',
 role: 'assistant',
 content: ` Multi-agent system error: ${error instanceof Error ? error.message : String(error)}`
 });
 }
 } finally {
 // Hide typing indicator
 if (this._view) {
 this._view.webview.postMessage({ type: 'hideTyping' });
 }
 }
 }

 /**
 * Track message in session manager
 */
 private async trackMessageInSession(message: Message): Promise<void> {
 const sessionManager = this.extensionManager.getSessionManager();
 if (!sessionManager) {
 return;
 }

 // Initialize session on first message
 if (!this.sessionInitialized) {
 const workspaceFolders = vscode.workspace.workspaceFolders;
 const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
 ? workspaceFolders[0].uri.fsPath
 : '';

 await sessionManager.createSession(undefined, workspaceRoot);
 this.sessionInitialized = true;
 }

 // Add message to session
 sessionManager.addMessage(message);
 }

 /**
 * Extract context sources from RAG response for display in context panel
 * AUGMENT PARITY: Provide transparency about what context is being used
 */
 private extractContextSources(ragResponse: {
 patterns?: Array<{ file?: string; content?: string; filePath?: string; name?: string; confidence?: number; description?: string }>;
 chunks?: Array<{ metadata?: { filePath?: string; startLine?: number; endLine?: number }; text?: string }>;
 gitHistory?: Array<{ commit?: string; message?: string; files?: string[] }>;
 assembledContext?: string;
 dependencies?: Array<{ name?: string; version?: string; path?: string; type?: string; usedBy?: string[] }>;
 symbols?: Array<{ name?: string; kind?: string; file?: string; filePath?: string; signature?: string; range?: { start: { line: number }; end: { line: number } } }>;
 }): ContextSource[] {
 const sources: ContextSource[] = [];

 // Extract file sources from patterns
 if (ragResponse.patterns && Array.isArray(ragResponse.patterns)) {
 for (const pattern of ragResponse.patterns) {
 if (pattern.filePath) {
 sources.push({
 type: 'pattern',
 path: pattern.filePath,
 reason: `Architectural pattern: ${pattern.name || 'Unknown'}`,
 score: pattern.confidence || 0.8,
 preview: pattern.description || 'Pattern detected in codebase'
 });
 }
 }
 }

 // Extract dependency sources
 if (ragResponse.dependencies && Array.isArray(ragResponse.dependencies)) {
 for (const dep of ragResponse.dependencies.slice(0, 5)) {
 sources.push({
 type: 'dependency',
 path: dep.name || dep.path || 'Unknown',
 reason: `Dependency relationship: ${dep.type || 'related'}`,
 score: 0.7,
 preview: `Used by: ${dep.usedBy?.join(', ') || 'multiple files'}`
 });
 }
 }

 // Extract symbol sources
 if (ragResponse.symbols && Array.isArray(ragResponse.symbols)) {
 for (const symbol of ragResponse.symbols.slice(0, 5)) {
 sources.push({
 type: 'symbol',
 path: symbol.filePath || 'Unknown',
 reason: `Symbol: ${symbol.name} (${symbol.kind})`,
 score: 0.75,
 preview: symbol.signature || symbol.name || '',
 metadata: {
 lineNumbers: symbol.range ? `${symbol.range.start.line}-${symbol.range.end.line}` : undefined
 }
 });
 }
 }

 // Extract commit history from context (if present)
 if (ragResponse.assembledContext && typeof ragResponse.assembledContext === 'string') {
 const commitMatches = ragResponse.assembledContext.matchAll(/### Commit ([a-f0-9]+) by (.+?)\n\*\*Date\*\*: (.+?)\n\*\*Message\*\*: (.+?)\n\*\*Summary\*\*: (.+?)\n/g);
 for (const match of commitMatches) {
 const [, hash, author, date, message, summary] = match;
 sources.push({
 type: 'commit',
 path: `Commit ${hash}`,
 reason: `Historical context: ${message}`,
 score: 0.85,
 preview: summary,
 metadata: {
 author,
 date
 }
 });
 }
 }

 // If no sources extracted, create a generic one
 if (sources.length === 0 && ragResponse.assembledContext) {
 sources.push({
 type: 'file',
 path: 'Codebase Context',
 reason: 'General codebase context retrieved',
 score: 0.8,
 preview: ragResponse.assembledContext.substring(0, 200) + '...'
 });
 }

 return sources;
 }
}

