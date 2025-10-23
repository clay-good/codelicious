"use strict";
/**
 * Context Assembler - Assembles retrieved context into optimal format for AI models
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextAssembler = void 0;
class ContextAssembler {
    constructor() {
        this.CHARS_PER_TOKEN = 4; // Rough estimate
    }
    /**
    * Assemble context from retrieval results
    */
    assemble(query, results, options = {}) {
        // AUGMENT PARITY: Support 200k+ token context windows
        const maxTokens = options.maxTokens || 200000;
        const format = options.format || 'markdown';
        const includeMetadata = options.includeMetadata !== false;
        // Calculate available tokens
        const systemPromptTokens = 500; // Reserve for system prompt
        const queryTokens = this.estimateTokens(query);
        const availableTokens = maxTokens - systemPromptTokens - queryTokens - 100; // Buffer
        // Build context sections
        const contextSections = [];
        let currentTokens = 0;
        let truncated = false;
        for (const result of results) {
            const section = this.formatResult(result, format, includeMetadata);
            const sectionTokens = this.estimateTokens(section);
            if (currentTokens + sectionTokens > availableTokens) {
                truncated = true;
                break;
            }
            contextSections.push(section);
            currentTokens += sectionTokens;
        }
        // Assemble final context
        const context = this.formatContext(contextSections, format);
        const systemPrompt = this.buildSystemPrompt(results.length, truncated);
        const userMessage = this.buildUserMessage(query, context, format);
        return {
            systemPrompt,
            userMessage,
            context,
            metadata: {
                totalTokens: currentTokens + systemPromptTokens + queryTokens,
                sourceCount: contextSections.length,
                truncated
            }
        };
    }
    /**
    * Format a single retrieval result
    */
    formatResult(result, format, includeMetadata) {
        switch (format) {
            case 'markdown':
                return this.formatMarkdown(result, includeMetadata);
            case 'xml':
                return this.formatXML(result, includeMetadata);
            case 'plain':
                return this.formatPlain(result, includeMetadata);
            default:
                return this.formatMarkdown(result, includeMetadata);
        }
    }
    /**
    * Format result as Markdown
    */
    formatMarkdown(result, includeMetadata) {
        const parts = [];
        // Header with metadata
        if (includeMetadata && result.metadata.filePath) {
            parts.push(`### ${result.metadata.filePath}`);
            if (result.metadata.symbolName) {
                parts.push(`**Symbol:** \`${result.metadata.symbolName}\``);
            }
            if (result.metadata.startLine !== undefined) {
                parts.push(`**Lines:** ${result.metadata.startLine}-${result.metadata.endLine}`);
            }
            parts.push(`**Relevance:** ${(result.score * 100).toFixed(1)}%`);
            parts.push('');
        }
        // Code block
        const language = result.metadata.language || 'text';
        parts.push('```' + language);
        parts.push(result.content);
        parts.push('```');
        parts.push('');
        return parts.join('\n');
    }
    /**
    * Format result as XML
    */
    formatXML(result, includeMetadata) {
        const parts = ['<code_snippet>'];
        if (includeMetadata) {
            parts.push(' <metadata>');
            if (result.metadata.filePath) {
                parts.push(` <file>${this.escapeXML(result.metadata.filePath)}</file>`);
            }
            if (result.metadata.symbolName) {
                parts.push(` <symbol>${this.escapeXML(result.metadata.symbolName)}</symbol>`);
            }
            if (result.metadata.startLine !== undefined) {
                parts.push(` <lines>${result.metadata.startLine}-${result.metadata.endLine}</lines>`);
            }
            parts.push(` <relevance>${(result.score * 100).toFixed(1)}%</relevance>`);
            parts.push(' </metadata>');
        }
        parts.push(' <content>');
        parts.push(this.escapeXML(result.content));
        parts.push(' </content>');
        parts.push('</code_snippet>');
        return parts.join('\n');
    }
    /**
    * Format result as plain text
    */
    formatPlain(result, includeMetadata) {
        const parts = [];
        if (includeMetadata && result.metadata.filePath) {
            parts.push(`File: ${result.metadata.filePath}`);
            if (result.metadata.symbolName) {
                parts.push(`Symbol: ${result.metadata.symbolName}`);
            }
            parts.push('---');
        }
        parts.push(result.content);
        parts.push('');
        return parts.join('\n');
    }
    /**
    * Format complete context
    */
    formatContext(sections, format) {
        if (format === 'xml') {
            return '<relevant_code>\n' + sections.join('\n') + '\n</relevant_code>';
        }
        else if (format === 'markdown') {
            return '## Relevant Code Context\n\n' + sections.join('\n---\n\n');
        }
        else {
            return sections.join('\n---\n\n');
        }
    }
    /**
    * Build system prompt
    */
    buildSystemPrompt(resultCount, truncated) {
        const parts = [
            'You are an expert software engineer with deep knowledge of multiple programming languages and frameworks.',
            'You have been provided with relevant code context from the user\'s codebase.',
            `The context includes ${resultCount} code snippet${resultCount !== 1 ? 's' : ''} that are most relevant to the user's query.`,
        ];
        if (truncated) {
            parts.push('Note: The context has been truncated to fit within token limits. Focus on the most relevant information provided.');
        }
        parts.push('');
        parts.push('When answering:');
        parts.push('1. **ALWAYS cite sources** with file paths and line numbers when referencing code');
        parts.push('2. Use this format for citations: `filepath:startLine-endLine`');
        parts.push('3. Include code snippets with their file paths and line numbers');
        parts.push('4. Explain your reasoning clearly with specific references');
        parts.push('5. Provide concrete examples from the codebase');
        parts.push('6. Consider the existing codebase patterns and conventions');
        parts.push('7. Be concise but thorough');
        return parts.join('\n');
    }
    /**
    * Build user message with context
    */
    buildUserMessage(query, context, format) {
        if (format === 'xml') {
            return `<user_query>\n${query}\n</user_query>\n\n${context}`;
        }
        else {
            return `${context}\n\n## User Query\n\n${query}`;
        }
    }
    /**
    * Estimate token count
    */
    estimateTokens(text) {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }
    /**
    * Escape XML special characters
    */
    escapeXML(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
    /**
    * Optimize context for specific model
    */
    optimizeForModel(context, modelName) {
        // Adjust format based on model preferences
        if (modelName.includes('claude')) {
            // Claude prefers XML format
            // Already handled in assembly
        }
        else if (modelName.includes('gpt')) {
            // GPT prefers markdown
            // Already handled in assembly
        }
        return context;
    }
    /**
    * Add specialized context for specific query types
    */
    addSpecializedContext(context, queryType) {
        const additionalPrompts = {
            error: '\n\nFocus on identifying the root cause of the error and providing a clear fix.',
            test: '\n\nProvide comprehensive test cases that cover edge cases and follow testing best practices.',
            documentation: '\n\nGenerate clear, concise documentation with examples.',
            refactor: '\n\nSuggest improvements while maintaining existing functionality and following SOLID principles.'
        };
        return {
            ...context,
            systemPrompt: context.systemPrompt + (additionalPrompts[queryType] || '')
        };
    }
    /**
    * Calculate context quality score
    */
    calculateQualityScore(context) {
        let score = 1.0;
        // Penalize truncation
        if (context.metadata.truncated) {
            score *= 0.8;
        }
        // Penalize low source count
        if (context.metadata.sourceCount < 3) {
            score *= 0.9;
        }
        // Penalize high token usage
        const tokenRatio = context.metadata.totalTokens / 8000;
        if (tokenRatio > 0.9) {
            score *= 0.95;
        }
        return score;
    }
}
exports.ContextAssembler = ContextAssembler;
//# sourceMappingURL=contextAssembler.js.map