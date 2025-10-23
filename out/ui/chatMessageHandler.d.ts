/**
 * Chat Message Handler
 * Handles message processing, streaming, and formatting for chat interface
 */
import { Message } from '../types';
import { ModelOrchestrator } from '../models/orchestrator';
import { IntelligentRequestRouter } from '../core/intelligentRequestRouter';
import { ContextPanelProvider } from './contextPanel';
export interface MessageHandlerConfig {
    orchestrator: ModelOrchestrator;
    requestRouter?: IntelligentRequestRouter;
    contextPanel?: ContextPanelProvider;
    selectedModel?: string;
    conversationHistory: Message[];
}
export declare class ChatMessageHandler {
    private orchestrator;
    private requestRouter?;
    private contextPanel?;
    private selectedModel?;
    private conversationHistory;
    private lastAIResponse;
    constructor(config: MessageHandlerConfig);
    /**
    * Update configuration
    */
    updateConfig(config: Partial<MessageHandlerConfig>): void;
    /**
    * Process user message and generate AI response
    */
    processMessage(message: string, attachedFiles: string[], onStreamChunk?: (chunk: string) => void, onComplete?: (response: string) => void, onError?: (error: Error) => void): Promise<void>;
    /**
    * Handle streaming response
    */
    private handleStreamingResponse;
    /**
    * Handle non-streaming response
    */
    private handleNonStreamingResponse;
    /**
    * Get last AI response
    */
    getLastResponse(): string;
    /**
    * Get conversation history
    */
    getHistory(): Message[];
    /**
    * Clear conversation history
    */
    clearHistory(): void;
    /**
    * Detect message complexity
    */
    detectComplexity(message: string): {
        isComplex: boolean;
        requiresMultiAgent: boolean;
        requiresAutonomous: boolean;
        confidence: number;
    };
    /**
    * Generate unique message ID
    */
    generateMessageId(): string;
}
//# sourceMappingURL=chatMessageHandler.d.ts.map