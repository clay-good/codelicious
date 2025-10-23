import * as vscode from 'vscode';
import { ModelOrchestrator } from '../models/orchestrator';
import { RAGService } from '../rag/ragService';
import { TaskComplexity } from '../models/modelRouter';
import { createLogger } from '../utils/logger';

const logger = createLogger('InlineCompletionProvider');

/**
 * Inline completion provider for real-time code suggestions
 * Provides GitHub Copilot-like inline suggestions as you type
 */
export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
 private readonly orchestrator: ModelOrchestrator;
 private readonly ragService: RAGService | null;
 private debounceTimer: NodeJS.Timeout | null = null;
 private readonly debounceDelay = 100; // ms - Reduced from 300ms to match Copilot
 private lastCompletionTime = 0;
 private readonly minTimeBetweenCompletions = 200; // ms - Reduced from 500ms for faster suggestions
 private cache = new Map<string, { completion: string; timestamp: number; multiLine?: boolean }>();
 private readonly cacheExpiry = 60000; // 1 minute
 private pendingRequest: Promise<string | null> | null = null;
 private lastCacheKey: string = '';

 constructor(orchestrator: ModelOrchestrator, ragService: RAGService | null) {
 this.orchestrator = orchestrator;
 this.ragService = ragService;
 }

 /**
 * Provide inline completion items
 */
 async provideInlineCompletionItems(
 document: vscode.TextDocument,
 position: vscode.Position,
 context: vscode.InlineCompletionContext,
 token: vscode.CancellationToken
 ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | null> {
 // Check if we should provide completions
 if (!this.shouldProvideCompletion(document, position, context)) {
 return null;
 }

 // Rate limiting
 const now = Date.now();
 if (now - this.lastCompletionTime < this.minTimeBetweenCompletions) {
 return null;
 }

 try {
 // Get context
 const textBeforeCursor = document.getText(
 new vscode.Range(new vscode.Position(0, 0), position)
 );
 const textAfterCursor = document.getText(
 new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end)
 );
 const currentLine = document.lineAt(position.line).text;
 const language = document.languageId;

 // Check cache
 const cacheKey = this.getCacheKey(textBeforeCursor, language);
 const cached = this.cache.get(cacheKey);
 if (cached && now - cached.timestamp < this.cacheExpiry) {
 logger.info(' Using cached inline completion');
 this.lastCompletionTime = now;
 return this.createCompletionItems(cached.completion, position, cached.multiLine);
 }

 // Reuse pending request if same cache key
 if (this.pendingRequest && this.lastCacheKey === cacheKey) {
 logger.info('⏳ Reusing pending completion request');
 const completion = await this.pendingRequest;
 if (completion && !token.isCancellationRequested) {
 return this.createCompletionItems(completion, position);
 }
 return null;
 }

 // Get RAG context for better suggestions (async, don't wait)
 let ragContext = '';
 const ragPromise = this.getRagContext(language, currentLine);

 // Determine if we should generate multi-line completion
 const shouldGenerateMultiLine = this.shouldGenerateMultiLine(textBeforeCursor, currentLine);

 // Generate completion (start immediately, don't wait for RAG)
 this.lastCacheKey = cacheKey;
 this.pendingRequest = this.generateCompletion(
 textBeforeCursor,
 textAfterCursor,
 currentLine,
 language,
 '', // Start without RAG context for speed
 token,
 shouldGenerateMultiLine
 );

 // Try to get RAG context quickly (with timeout)
 try {
 ragContext = await Promise.race([
 ragPromise,
 new Promise<string>((resolve) => setTimeout(() => resolve(''), 100)) // 100ms timeout
 ]);
 } catch (error) {
 // Ignore RAG errors, continue without context
 }

 const completion = await this.pendingRequest;
 this.pendingRequest = null;

 if (!completion || token.isCancellationRequested) {
 return null;
 }

 // Cache the result
 this.cache.set(cacheKey, { completion, timestamp: now, multiLine: shouldGenerateMultiLine });
 this.lastCompletionTime = now;

 // Clean old cache entries
 this.cleanCache();

 return this.createCompletionItems(completion, position, shouldGenerateMultiLine);
 } catch (error) {
 logger.error('Error providing inline completion:', error);
 return null;
 }
 }

 /**
 * Check if we should provide completion
 */
 private shouldProvideCompletion(
 document: vscode.TextDocument,
 position: vscode.Position,
 context: vscode.InlineCompletionContext
 ): boolean {
 // Don't provide completions in certain contexts
 if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
 const line = document.lineAt(position.line);
 const textBeforeCursor = line.text.substring(0, position.character);

 // Don't complete in comments (simple heuristic)
 if (textBeforeCursor.trim().startsWith('//') || textBeforeCursor.trim().startsWith('#')) {
 return false;
 }

 // Don't complete if line is empty or only whitespace
 if (textBeforeCursor.trim().length === 0) {
 return false;
 }

 // Don't complete if cursor is at the beginning of the line
 if (position.character === 0) {
 return false;
 }
 }

 return true;
 }

 /**
 * Get RAG context asynchronously
 */
 private async getRagContext(language: string, currentLine: string): Promise<string> {
 if (!this.ragService || !this.ragService.isReady()) {
 return '';
 }

 try {
 const ragResponse = await this.ragService.queryOptimized(
 `${language} code completion: ${currentLine}`,
 {
 limit: 2, // Reduced from 3 for speed
 maxTokens: 300, // Reduced from 500 for speed
 queryType: 'general'
 }
 );
 if (ragResponse.results.length > 0) {
 return ragResponse.assembledContext.context;
 }
 } catch (error) {
 logger.warn('Failed to get RAG context for completion:', error);
 }
 return '';
 }

 /**
 * Determine if we should generate multi-line completion
 */
 private shouldGenerateMultiLine(textBeforeCursor: string, currentLine: string): boolean {
 // Generate multi-line for function definitions, class definitions, etc.
 const multiLinePatterns = [
 /function\s+\w+\s*\([^)]*\)\s*\{?\s*$/, // function definition
 /\w+\s*\([^)]*\)\s*\{?\s*$/, // method call with opening brace
 /class\s+\w+.*\{?\s*$/, // class definition
 /if\s*\([^)]*\)\s*\{?\s*$/, // if statement
 /for\s*\([^)]*\)\s*\{?\s*$/, // for loop
 /while\s*\([^)]*\)\s*\{?\s*$/, // while loop
 /=>\s*\{?\s*$/, // arrow function
 /try\s*\{?\s*$/, // try block
 /catch\s*\([^)]*\)\s*\{?\s*$/ // catch block
 ];

 return multiLinePatterns.some(pattern => pattern.test(currentLine));
 }

 /**
 * Generate completion using AI
 */
 private async generateCompletion(
 textBeforeCursor: string,
 textAfterCursor: string,
 currentLine: string,
 language: string,
 ragContext: string,
 token: vscode.CancellationToken,
 multiLine: boolean = false
 ): Promise<string | null> {
 // Build prompt for fill-in-the-middle style completion
 const prompt = this.buildCompletionPrompt(
 textBeforeCursor,
 textAfterCursor,
 currentLine,
 language,
 ragContext,
 multiLine
 );

 try {
 const maxTokens = multiLine ? 300 : 100; // More tokens for multi-line
 const systemPrompt = multiLine
 ? 'You are an expert code completion assistant. Provide multi-line code to complete the current block. Include only the necessary code, no explanations or comments. Be concise and accurate.'
 : 'You are an expert code completion assistant. Provide only the code to complete the current line. Do not include explanations, comments, or the existing code. Be concise and accurate.';

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: systemPrompt
 },
 {
 role: 'user',
 content: prompt
 }
 ],
 temperature: 0.2, // Low temperature for more deterministic completions
 maxTokens
 },
 {
 complexity: TaskComplexity.SIMPLE, // Use fast, cheap models for completions
 requiresStreaming: false
 }
 );

 if (token.isCancellationRequested) {
 return null;
 }

 // Extract and clean the completion
 let completion = response.content.trim();

 // Remove markdown code blocks if present
 completion = completion.replace(/```[\w]*\n?/g, '').replace(/```$/g, '');

 // For single-line completions, take only the first line if it looks like code
 if (!multiLine) {
 const lines = completion.split('\n');
 if (lines.length > 1 && !lines[0].includes('//') && !lines[0].includes('#')) {
 completion = lines[0];
 }
 }

 return completion;
 } catch (error) {
 logger.error('Error generating completion:', error);
 return null;
 }
 }

 /**
 * Build completion prompt
 */
 private buildCompletionPrompt(
 textBeforeCursor: string,
 textAfterCursor: string,
 currentLine: string,
 language: string,
 ragContext: string,
 multiLine: boolean = false
 ): string {
 // Limit context size
 const maxContextLines = multiLine ? 30 : 20; // More context for multi-line
 const beforeLines = textBeforeCursor.split('\n').slice(-maxContextLines);
 const afterLines = textAfterCursor.split('\n').slice(0, multiLine ? 15 : 5);

 let prompt = `Language: ${language}\n\n`;

 if (ragContext) {
 prompt += `Relevant code examples:\n${ragContext}\n\n`;
 }

 prompt += `Code before cursor:\n${beforeLines.join('\n')}\n\n`;

 if (afterLines.length > 0 && afterLines.join('').trim()) {
 prompt += `Code after cursor:\n${afterLines.join('\n')}\n\n`;
 }

 if (multiLine) {
 prompt += `Complete the code block at the cursor position. Provide multiple lines if needed. Only the completion text, no explanations.`;
 } else {
 prompt += `Complete the code at the cursor position. Provide only the completion text, no explanations.`;
 }

 return prompt;
 }

 /**
 * Create completion items
 */
 private createCompletionItems(
 completion: string,
 position: vscode.Position,
 multiLine: boolean = false
 ): vscode.InlineCompletionItem[] {
 if (!completion) {
 return [];
 }

 const item = new vscode.InlineCompletionItem(completion);
 item.range = new vscode.Range(position, position);

 // Add command to track acceptance
 item.command = {
 command: 'codelicious.trackCompletionAccepted',
 title: 'Track Completion',
 arguments: [{ multiLine, length: completion.length }]
 };

 return [item];
 }

 /**
 * Get cache key
 */
 private getCacheKey(textBeforeCursor: string, language: string): string {
 // Use last 200 characters as cache key
 const context = textBeforeCursor.slice(-200);
 return `${language}:${context}`;
 }

 /**
 * Clean old cache entries
 */
 private cleanCache(): void {
 const now = Date.now();
 for (const [key, value] of this.cache.entries()) {
 if (now - value.timestamp > this.cacheExpiry) {
 this.cache.delete(key);
 }
 }
 }

 /**
 * Clear cache
 */
 public clearCache(): void {
 this.cache.clear();
 }

 /**
 * Dispose resources
 */
 public dispose(): void {
 if (this.debounceTimer) {
 clearTimeout(this.debounceTimer);
 }
 this.cache.clear();
 }
}

