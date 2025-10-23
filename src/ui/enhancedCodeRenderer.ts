/**
 * Enhanced Code Renderer for Chat Interface
 * Provides better code rendering, diff preview, and one-click apply
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface CodeBlock {
 id: string;
 code: string;
 language: string;
 filePath?: string;
 operation?: 'create' | 'modify' | 'delete';
 lineNumbers?: boolean;
}

export interface DiffPreview {
 filePath: string;
 original: string;
 modified: string;
 language: string;
}

export class EnhancedCodeRenderer {
 private workspaceRoot: string;

 constructor(workspaceRoot: string) {
 this.workspaceRoot = workspaceRoot;
 }

 /**
 * Render code block with enhanced features
 */
 renderCodeBlock(block: CodeBlock): string {
 const codeId = block.id || this.generateId();
 const language = block.language || 'plaintext';
 const hasFilePath = !!block.filePath;

 return `
 <div class="enhanced-code-block" data-code-id="${codeId}">
 <div class="code-header">
 <div class="code-info">
 <span class="code-language">${language}</span>
 ${hasFilePath ? `<span class="code-file-path">${block.filePath}</span>` : ''}
 ${block.operation ? `<span class="code-operation">${block.operation}</span>` : ''}
 </div>
 <div class="code-actions">
 ${hasFilePath ? `
 <button class="action-btn" onclick="previewDiff('${codeId}')">
 <span class="icon"></span> Preview
 </button>
 <button class="action-btn primary" onclick="applyCodeEnhanced('${codeId}')">
 <span class="icon"></span> Apply
 </button>
 ` : `
 <button class="action-btn" onclick="saveAsNew('${codeId}')">
 <span class="icon"></span> Save As...
 </button>
 `}
 <button class="action-btn" onclick="copyCode('${codeId}')">
 <span class="icon"></span> Copy
 </button>
 </div>
 </div>
 <div class="code-content">
 ${block.lineNumbers ? this.renderWithLineNumbers(block.code) : `<pre><code class="language-${language}">${this.escapeHtml(block.code)}</code></pre>`}
 </div>
 </div>
 `;
 }

 /**
 * Render code with line numbers
 */
 private renderWithLineNumbers(code: string): string {
 const lines = code.split('\n');
 const lineNumbersHtml = lines.map((_, i) => `<span class="line-number">${i + 1}</span>`).join('\n');
 const codeHtml = this.escapeHtml(code);

 return `
 <div class="code-with-line-numbers">
 <div class="line-numbers">${lineNumbersHtml}</div>
 <pre><code>${codeHtml}</code></pre>
 </div>
 `;
 }

 /**
 * Generate diff preview HTML
 */
 async generateDiffPreview(diff: DiffPreview): Promise<string> {
 const originalLines = diff.original.split('\n');
 const modifiedLines = diff.modified.split('\n');

 // Simple line-by-line diff
 const diffLines = this.computeDiff(originalLines, modifiedLines);

 return `
 <div class="diff-preview">
 <div class="diff-header">
 <h3>Preview Changes: ${diff.filePath}</h3>
 <div class="diff-actions">
 <button class="action-btn" onclick="acceptChanges('${diff.filePath}')">
 <span class="icon"></span> Accept
 </button>
 <button class="action-btn" onclick="rejectChanges('${diff.filePath}')">
 <span class="icon"></span> Reject
 </button>
 </div>
 </div>
 <div class="diff-content">
 ${diffLines.map(line => this.renderDiffLine(line)).join('\n')}
 </div>
 </div>
 `;
 }

 /**
 * Compute simple diff between two arrays of lines
 */
 private computeDiff(original: string[], modified: string[]): DiffLine[] {
 const result: DiffLine[] = [];
 const maxLen = Math.max(original.length, modified.length);

 for (let i = 0; i < maxLen; i++) {
 const origLine = original[i];
 const modLine = modified[i];

 if (origLine === modLine) {
 result.push({ type: 'unchanged', content: origLine, lineNumber: i + 1 });
 } else if (origLine && !modLine) {
 result.push({ type: 'removed', content: origLine, lineNumber: i + 1 });
 } else if (!origLine && modLine) {
 result.push({ type: 'added', content: modLine, lineNumber: i + 1 });
 } else {
 result.push({ type: 'removed', content: origLine, lineNumber: i + 1 });
 result.push({ type: 'added', content: modLine, lineNumber: i + 1 });
 }
 }

 return result;
 }

 /**
 * Render a single diff line
 */
 private renderDiffLine(line: DiffLine): string {
 const className = `diff-line diff-${line.type}`;
 const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

 return `
 <div class="${className}">
 <span class="diff-line-number">${line.lineNumber}</span>
 <span class="diff-prefix">${prefix}</span>
 <span class="diff-content">${this.escapeHtml(line.content || '')}</span>
 </div>
 `;
 }

 /**
 * Extract code blocks from AI response
 */
 extractCodeBlocks(content: string): CodeBlock[] {
 const blocks: CodeBlock[] = [];
 const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
 let match;

 while ((match = codeBlockRegex.exec(content)) !== null) {
 const language = match[1] || 'plaintext';
 const code = match[2].trim();
 const filePath = this.extractFilePath(code);

 blocks.push({
 id: this.generateId(),
 code,
 language,
 filePath,
 operation: filePath ? 'modify' : undefined,
 lineNumbers: true
 });
 }

 return blocks;
 }

 /**
 * Extract file path from code comments
 */
 private extractFilePath(code: string): string | undefined {
 // Look for file path in first line comment
 const firstLine = code.split('\n')[0];

 // Match patterns like: // src/file.ts or # src/file.py or /* src/file.js */
 const patterns = [
 /^\/\/\s*(.+\.\w+)/, // // src/file.ts
 /^#\s*(.+\.\w+)/, // # src/file.py
 /^\/\*\s*(.+\.\w+)/ // /* src/file.js
 ];

 for (const pattern of patterns) {
 const match = firstLine.match(pattern);
 if (match) {
 return match[1].trim();
 }
 }

 return undefined;
 }

 /**
 * Smart file detection - detect file path from context
 */
 async detectFilePath(code: string, language: string): Promise<string | undefined> {
 // Try to detect from imports/requires
 const importPatterns = [
 /import\s+.*\s+from\s+['"](.+)['"]/, // ES6 imports
 /require\(['"](.+)['"]\)/, // CommonJS
 /from\s+(\w+)\s+import/, // Python
 /package\s+([\w.]+)/ // Java/Go
 ];

 for (const pattern of importPatterns) {
 const match = code.match(pattern);
 if (match) {
 // Try to find similar files in workspace
 const similarFiles = await this.findSimilarFiles(match[1]);
 if (similarFiles.length > 0) {
 return similarFiles[0];
 }
 }
 }

 // Try to detect from class/function names
 const namePatterns = [
 /class\s+(\w+)/, // Class definition
 /function\s+(\w+)/, // Function definition
 /def\s+(\w+)/, // Python function
 /interface\s+(\w+)/ // Interface definition
 ];

 for (const pattern of namePatterns) {
 const match = code.match(pattern);
 if (match) {
 const name = match[1];
 const extension = this.getExtensionForLanguage(language);
 return `src/${name}${extension}`;
 }
 }

 return undefined;
 }

 /**
 * Find similar files in workspace
 */
 private async findSimilarFiles(query: string): Promise<string[]> {
 try {
 const files = await vscode.workspace.findFiles(`**/*${query}*`, '**/node_modules/**', 10);
 return files.map(f => vscode.workspace.asRelativePath(f));
 } catch {
 return [];
 }
 }

 /**
 * Get file extension for language
 */
 private getExtensionForLanguage(language: string): string {
 const extensions: Record<string, string> = {
 typescript: '.ts',
 javascript: '.js',
 python: '.py',
 java: '.java',
 go: '.go',
 rust: '.rs',
 cpp: '.cpp',
 csharp: '.cs',
 ruby: '.rb',
 php: '.php'
 };

 return extensions[language] || '.txt';
 }

 /**
 * Generate unique ID
 */
 private generateId(): string {
 return `code_${Math.random().toString(36).substr(2, 9)}`;
 }

 /**
 * Escape HTML
 */
 private escapeHtml(text: string): string {
 return text
 .replace(/&/g, '&amp;')
 .replace(/</g, '&lt;')
 .replace(/>/g, '&gt;')
 .replace(/"/g, '&quot;')
 .replace(/'/g, '&#039;');
 }
}

interface DiffLine {
 type: 'added' | 'removed' | 'unchanged';
 content: string;
 lineNumber: number;
}

