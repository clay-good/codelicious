/**
 * Chat Message Handler
 * Handles message processing, streaming, and formatting for chat interface
 */

import * as vscode from 'vscode';
import { Message, ModelProvider } from '../types';
import { StreamChunk } from '../models/baseAdapter';
import { ModelOrchestrator } from '../models/orchestrator';
import { IntelligentRequestRouter, RequestType } from '../core/intelligentRequestRouter';
import { ContextPanelProvider, ContextSource } from './contextPanel';
import { createLogger } from '../utils/logger';

const logger = createLogger('ChatMessageHandler');

export interface MessageHandlerConfig {
 orchestrator: ModelOrchestrator;
 requestRouter?: IntelligentRequestRouter;
 contextPanel?: ContextPanelProvider;
 selectedModel?: string;
 conversationHistory: Message[];
}

export class ChatMessageHandler {
 private orchestrator: ModelOrchestrator;
 private requestRouter?: IntelligentRequestRouter;
 private contextPanel?: ContextPanelProvider;
 private selectedModel?: string;
 private conversationHistory: Message[];
 private lastAIResponse: string = '';

 constructor(config: MessageHandlerConfig) {
 this.orchestrator = config.orchestrator;
 this.requestRouter = config.requestRouter;
 this.contextPanel = config.contextPanel;
 this.selectedModel = config.selectedModel;
 this.conversationHistory = config.conversationHistory;
 }

 /**
 * Update configuration
 */
 public updateConfig(config: Partial<MessageHandlerConfig>): void {
 if (config.orchestrator) {
 this.orchestrator = config.orchestrator;
 }
 if (config.requestRouter) {
 this.requestRouter = config.requestRouter;
 }
 if (config.contextPanel) {
 this.contextPanel = config.contextPanel;
 }
 if (config.selectedModel) {
 this.selectedModel = config.selectedModel;
 }
 if (config.conversationHistory) {
 this.conversationHistory = config.conversationHistory;
 }
 }

 /**
 * Process user message and generate AI response
 */
 public async processMessage(
 message: string,
 attachedFiles: string[],
 onStreamChunk?: (chunk: string) => void,
 onComplete?: (response: string) => void,
 onError?: (error: Error) => void
 ): Promise<void> {
 try {
 // Add user message to history
 this.conversationHistory.push({
 role: 'user',
 content: message
 });

 // Detect request type and route appropriately
 let requestType: RequestType = RequestType.GENERAL_CHAT;
 if (this.requestRouter) {
 const analysis = await this.requestRouter.analyzeIntent(message, this.conversationHistory);
 requestType = analysis.type;
 }

 // Get context if available (simplified - context panel doesn't have getContextForQuery)
 const contextInfo: ContextSource[] = [];
 // Context will be provided by RAG service instead

 // Use streaming if callback is provided
 if (onStreamChunk) {
 await this.handleStreamingResponse(
 message,
 attachedFiles,
 contextInfo,
 requestType,
 onStreamChunk,
 onComplete,
 onError
 );
 } else {
 await this.handleNonStreamingResponse(
 message,
 attachedFiles,
 contextInfo,
 requestType,
 onComplete,
 onError
 );
 }
 } catch (error) {
 logger.error('Error processing message', error);
 if (onError) {
 onError(error as Error);
 }
 }
 }

 /**
 * Handle streaming response
 */
 private async handleStreamingResponse(
 message: string,
 attachedFiles: string[],
 contextInfo: ContextSource[],
 requestType: RequestType,
 onStreamChunk: (chunk: string) => void,
 onComplete?: (response: string) => void,
 onError?: (error: Error) => void
 ): Promise<void> {
 try {
 let fullResponse = '';

 // Build context message
 let contextMessage = message;
 if (attachedFiles.length > 0) {
 contextMessage += `\n\nAttached files:\n${attachedFiles.join('\n')}`;
 }
 if (contextInfo.length > 0) {
 contextMessage += `\n\nRelevant context:\n${contextInfo.map(c => `${c.path}: ${c.preview}`).join('\n\n')}`;
 }

 // Build messages array
 const messages = [
 ...this.conversationHistory.slice(-10), // Keep last 10 messages for context
 { role: 'user' as const, content: contextMessage }
 ];

 // Stream response using ModelOrchestrator API
 const response = await this.orchestrator.sendStreamingRequest(
 {
 messages,
 model: this.selectedModel,
 stream: true
 },
 (chunk: StreamChunk) => {
 if (chunk.content) {
 fullResponse += chunk.content;
 onStreamChunk(chunk.content);
 }
 }
 );

 // Add to history
 this.conversationHistory.push({
 role: 'assistant',
 content: fullResponse
 });

 this.lastAIResponse = fullResponse;

 if (onComplete) {
 onComplete(fullResponse);
 }
 } catch (error) {
 logger.error('Error in streaming response', error);
 if (onError) {
 onError(error as Error);
 }
 }
 }

 /**
 * Handle non-streaming response
 */
 private async handleNonStreamingResponse(
 message: string,
 attachedFiles: string[],
 contextInfo: ContextSource[],
 requestType: RequestType,
 onComplete?: (response: string) => void,
 onError?: (error: Error) => void
 ): Promise<void> {
 try {
 // Build context message
 let contextMessage = message;
 if (attachedFiles.length > 0) {
 contextMessage += `\n\nAttached files:\n${attachedFiles.join('\n')}`;
 }
 if (contextInfo.length > 0) {
 contextMessage += `\n\nRelevant context:\n${contextInfo.map(c => `${c.path}: ${c.preview}`).join('\n\n')}`;
 }

 // Build messages array
 const messages = [
 ...this.conversationHistory.slice(-10),
 { role: 'user' as const, content: contextMessage }
 ];

 // Get response using ModelOrchestrator API
 const response = await this.orchestrator.sendRequest(
 {
 messages,
 model: this.selectedModel,
 stream: false
 }
 );

 const responseText = response.content;

 // Add to history
 this.conversationHistory.push({
 role: 'assistant',
 content: responseText
 });

 this.lastAIResponse = responseText;

 if (onComplete) {
 onComplete(responseText);
 }
 } catch (error) {
 logger.error('Error in non-streaming response', error);
 if (onError) {
 onError(error as Error);
 }
 }
 }

 /**
 * Get last AI response
 */
 public getLastResponse(): string {
 return this.lastAIResponse;
 }

 /**
 * Get conversation history
 */
 public getHistory(): Message[] {
 return this.conversationHistory;
 }

 /**
 * Clear conversation history
 */
 public clearHistory(): void {
 this.conversationHistory = [];
 this.lastAIResponse = '';
 }

 /**
 * Detect message complexity
 */
 public detectComplexity(message: string): {
 isComplex: boolean;
 requiresMultiAgent: boolean;
 requiresAutonomous: boolean;
 confidence: number;
 } {
 const lowerMessage = message.toLowerCase();

 // Keywords that indicate complex operations
 const complexKeywords = [
 'refactor', 'optimize', 'analyze', 'review', 'test',
 'implement', 'create', 'build', 'generate', 'design'
 ];

 // Keywords that indicate multi-agent needs
 const multiAgentKeywords = [
 'test', 'security', 'performance', 'documentation',
 'review', 'analyze', 'optimize'
 ];

 // Keywords that indicate autonomous operations
 const autonomousKeywords = [
 'build', 'create project', 'generate app', 'scaffold',
 'setup', 'initialize', 'bootstrap'
 ];

 const hasComplexKeyword = complexKeywords.some(kw => lowerMessage.includes(kw));
 const hasMultiAgentKeyword = multiAgentKeywords.some(kw => lowerMessage.includes(kw));
 const hasAutonomousKeyword = autonomousKeywords.some(kw => lowerMessage.includes(kw));

 const isComplex = hasComplexKeyword || message.length > 200;
 const requiresMultiAgent = hasMultiAgentKeyword && isComplex;
 const requiresAutonomous = hasAutonomousKeyword;

 // Calculate confidence based on keyword matches
 let confidence = 0.5;
 if (hasComplexKeyword) {
 confidence += 0.2;
 }
 if (hasMultiAgentKeyword) {
 confidence += 0.2;
 }
 if (hasAutonomousKeyword) {
 confidence += 0.1;
 }

 return {
 isComplex,
 requiresMultiAgent,
 requiresAutonomous,
 confidence: Math.min(confidence, 1.0)
 };
 }

 /**
 * Generate unique message ID
 */
 public generateMessageId(): string {
 return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 }
}

