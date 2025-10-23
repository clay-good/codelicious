"use strict";
/**
 * Chat Message Handler
 * Handles message processing, streaming, and formatting for chat interface
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatMessageHandler = void 0;
const intelligentRequestRouter_1 = require("../core/intelligentRequestRouter");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ChatMessageHandler');
class ChatMessageHandler {
    constructor(config) {
        this.lastAIResponse = '';
        this.orchestrator = config.orchestrator;
        this.requestRouter = config.requestRouter;
        this.contextPanel = config.contextPanel;
        this.selectedModel = config.selectedModel;
        this.conversationHistory = config.conversationHistory;
    }
    /**
    * Update configuration
    */
    updateConfig(config) {
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
    async processMessage(message, attachedFiles, onStreamChunk, onComplete, onError) {
        try {
            // Add user message to history
            this.conversationHistory.push({
                role: 'user',
                content: message
            });
            // Detect request type and route appropriately
            let requestType = intelligentRequestRouter_1.RequestType.GENERAL_CHAT;
            if (this.requestRouter) {
                const analysis = await this.requestRouter.analyzeIntent(message, this.conversationHistory);
                requestType = analysis.type;
            }
            // Get context if available (simplified - context panel doesn't have getContextForQuery)
            const contextInfo = [];
            // Context will be provided by RAG service instead
            // Use streaming if callback is provided
            if (onStreamChunk) {
                await this.handleStreamingResponse(message, attachedFiles, contextInfo, requestType, onStreamChunk, onComplete, onError);
            }
            else {
                await this.handleNonStreamingResponse(message, attachedFiles, contextInfo, requestType, onComplete, onError);
            }
        }
        catch (error) {
            logger.error('Error processing message', error);
            if (onError) {
                onError(error);
            }
        }
    }
    /**
    * Handle streaming response
    */
    async handleStreamingResponse(message, attachedFiles, contextInfo, requestType, onStreamChunk, onComplete, onError) {
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
                { role: 'user', content: contextMessage }
            ];
            // Stream response using ModelOrchestrator API
            const response = await this.orchestrator.sendStreamingRequest({
                messages,
                model: this.selectedModel,
                stream: true
            }, (chunk) => {
                if (chunk.content) {
                    fullResponse += chunk.content;
                    onStreamChunk(chunk.content);
                }
            });
            // Add to history
            this.conversationHistory.push({
                role: 'assistant',
                content: fullResponse
            });
            this.lastAIResponse = fullResponse;
            if (onComplete) {
                onComplete(fullResponse);
            }
        }
        catch (error) {
            logger.error('Error in streaming response', error);
            if (onError) {
                onError(error);
            }
        }
    }
    /**
    * Handle non-streaming response
    */
    async handleNonStreamingResponse(message, attachedFiles, contextInfo, requestType, onComplete, onError) {
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
                { role: 'user', content: contextMessage }
            ];
            // Get response using ModelOrchestrator API
            const response = await this.orchestrator.sendRequest({
                messages,
                model: this.selectedModel,
                stream: false
            });
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
        }
        catch (error) {
            logger.error('Error in non-streaming response', error);
            if (onError) {
                onError(error);
            }
        }
    }
    /**
    * Get last AI response
    */
    getLastResponse() {
        return this.lastAIResponse;
    }
    /**
    * Get conversation history
    */
    getHistory() {
        return this.conversationHistory;
    }
    /**
    * Clear conversation history
    */
    clearHistory() {
        this.conversationHistory = [];
        this.lastAIResponse = '';
    }
    /**
    * Detect message complexity
    */
    detectComplexity(message) {
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
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.ChatMessageHandler = ChatMessageHandler;
//# sourceMappingURL=chatMessageHandler.js.map