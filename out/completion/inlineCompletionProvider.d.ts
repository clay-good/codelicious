import * as vscode from 'vscode';
import { ModelOrchestrator } from '../models/orchestrator';
import { RAGService } from '../rag/ragService';
/**
 * Inline completion provider for real-time code suggestions
 * Provides GitHub Copilot-like inline suggestions as you type
 */
export declare class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private readonly orchestrator;
    private readonly ragService;
    private debounceTimer;
    private readonly debounceDelay;
    private lastCompletionTime;
    private readonly minTimeBetweenCompletions;
    private cache;
    private readonly cacheExpiry;
    private pendingRequest;
    private lastCacheKey;
    constructor(orchestrator: ModelOrchestrator, ragService: RAGService | null);
    /**
    * Provide inline completion items
    */
    provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position, context: vscode.InlineCompletionContext, token: vscode.CancellationToken): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null>;
    /**
    * Check if we should provide completion
    */
    private shouldProvideCompletion;
    /**
    * Get RAG context asynchronously
    */
    private getRagContext;
    /**
    * Determine if we should generate multi-line completion
    */
    private shouldGenerateMultiLine;
    /**
    * Generate completion using AI
    */
    private generateCompletion;
    /**
    * Build completion prompt
    */
    private buildCompletionPrompt;
    /**
    * Create completion items
    */
    private createCompletionItems;
    /**
    * Get cache key
    */
    private getCacheKey;
    /**
    * Clean old cache entries
    */
    private cleanCache;
    /**
    * Clear cache
    */
    clearCache(): void;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=inlineCompletionProvider.d.ts.map