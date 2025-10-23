/**
 * Context Assembler - Assembles retrieved context into optimal format for AI models
 */
import { RetrievalResult } from './retriever';
export interface AssembledContext {
    systemPrompt: string;
    userMessage: string;
    context: string;
    metadata: {
        totalTokens: number;
        sourceCount: number;
        truncated: boolean;
    };
}
export interface AssemblyOptions {
    maxTokens?: number;
    includeMetadata?: boolean;
    format?: 'markdown' | 'xml' | 'plain';
    prioritizeRecent?: boolean;
}
export declare class ContextAssembler {
    private readonly CHARS_PER_TOKEN;
    /**
    * Assemble context from retrieval results
    */
    assemble(query: string, results: RetrievalResult[], options?: AssemblyOptions): AssembledContext;
    /**
    * Format a single retrieval result
    */
    private formatResult;
    /**
    * Format result as Markdown
    */
    private formatMarkdown;
    /**
    * Format result as XML
    */
    private formatXML;
    /**
    * Format result as plain text
    */
    private formatPlain;
    /**
    * Format complete context
    */
    private formatContext;
    /**
    * Build system prompt
    */
    private buildSystemPrompt;
    /**
    * Build user message with context
    */
    private buildUserMessage;
    /**
    * Estimate token count
    */
    private estimateTokens;
    /**
    * Escape XML special characters
    */
    private escapeXML;
    /**
    * Optimize context for specific model
    */
    optimizeForModel(context: AssembledContext, modelName: string): AssembledContext;
    /**
    * Add specialized context for specific query types
    */
    addSpecializedContext(context: AssembledContext, queryType: 'error' | 'test' | 'documentation' | 'refactor'): AssembledContext;
    /**
    * Calculate context quality score
    */
    calculateQualityScore(context: AssembledContext): number;
}
//# sourceMappingURL=contextAssembler.d.ts.map