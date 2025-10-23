/**
 * Diff Viewer - Side-by-side diff preview with syntax highlighting
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { FileOperation } from './autonomousExecutor';

export interface DiffViewerOptions {
 showLineNumbers?: boolean;
 contextLines?: number;
 highlightChanges?: boolean;
}

export interface DiffLine {
 type: 'unchanged' | 'added' | 'removed' | 'modified';
 oldLineNumber?: number;
 newLineNumber?: number;
 oldContent?: string;
 newContent?: string;
}

export interface FileDiff {
 filePath: string;
 operation: 'create' | 'modify' | 'delete';
 language: string;
 oldContent?: string;
 newContent?: string;
 lines: DiffLine[];
}

/**
 * Generates and displays side-by-side diffs for file operations
 */
export class DiffViewer {
 private panel: vscode.WebviewPanel | undefined;
 private diffs: FileDiff[] = [];
 private options: Required<DiffViewerOptions>;

 constructor(
 private readonly context: vscode.ExtensionContext,
 options: DiffViewerOptions = {}
 ) {
 this.options = {
 showLineNumbers: options.showLineNumbers ?? true,
 contextLines: options.contextLines ?? 3,
 highlightChanges: options.highlightChanges ?? true
 };
 }

 /**
 * Generate diff for file operations
 */
 generateDiffs(operations: FileOperation[]): FileDiff[] {
 this.diffs = operations.map(op => this.generateFileDiff(op));
 return this.diffs;
 }

 /**
 * Generate diff for a single file operation
 */
 private generateFileDiff(operation: FileOperation): FileDiff {
 const language = operation.language || this.detectLanguage(operation.filePath);

 if (operation.type === 'create') {
 return {
 filePath: operation.filePath,
 operation: 'create',
 language,
 newContent: operation.content || '',
 lines: this.generateCreateDiff(operation.content || '')
 };
 } else if (operation.type === 'delete') {
 return {
 filePath: operation.filePath,
 operation: 'delete',
 language,
 oldContent: operation.originalContent || '',
 lines: this.generateDeleteDiff(operation.originalContent || '')
 };
 } else {
 // modify
 return {
 filePath: operation.filePath,
 operation: 'modify',
 language,
 oldContent: operation.originalContent || '',
 newContent: operation.content || '',
 lines: this.generateModifyDiff(
 operation.originalContent || '',
 operation.content || ''
 )
 };
 }
 }

 /**
 * Generate diff lines for create operation
 */
 private generateCreateDiff(content: string): DiffLine[] {
 const lines = content.split('\n');
 return lines.map((line, index) => ({
 type: 'added' as const,
 newLineNumber: index + 1,
 newContent: line
 }));
 }

 /**
 * Generate diff lines for delete operation
 */
 private generateDeleteDiff(content: string): DiffLine[] {
 const lines = content.split('\n');
 return lines.map((line, index) => ({
 type: 'removed' as const,
 oldLineNumber: index + 1,
 oldContent: line
 }));
 }

 /**
 * Generate diff lines for modify operation using simple line-by-line comparison
 */
 private generateModifyDiff(oldContent: string, newContent: string): DiffLine[] {
 const oldLines = oldContent.split('\n');
 const newLines = newContent.split('\n');
 const lines: DiffLine[] = [];

 // Simple line-by-line diff (can be enhanced with proper diff algorithm)
 const maxLength = Math.max(oldLines.length, newLines.length);

 for (let i = 0; i < maxLength; i++) {
 const oldLine = i < oldLines.length ? oldLines[i] : undefined;
 const newLine = i < newLines.length ? newLines[i] : undefined;

 if (oldLine === undefined && newLine !== undefined) {
 // Line added
 lines.push({
 type: 'added',
 newLineNumber: i + 1,
 newContent: newLine
 });
 } else if (oldLine !== undefined && newLine === undefined) {
 // Line removed
 lines.push({
 type: 'removed',
 oldLineNumber: i + 1,
 oldContent: oldLine
 });
 } else if (oldLine !== newLine) {
 // Line modified
 lines.push({
 type: 'modified',
 oldLineNumber: i + 1,
 newLineNumber: i + 1,
 oldContent: oldLine,
 newContent: newLine
 });
 } else {
 // Line unchanged
 lines.push({
 type: 'unchanged',
 oldLineNumber: i + 1,
 newLineNumber: i + 1,
 oldContent: oldLine,
 newContent: newLine
 });
 }
 }

 return lines;
 }

 /**
 * Detect language from file path
 */
 private detectLanguage(filePath: string): string {
 const ext = path.extname(filePath).toLowerCase();
 const languageMap: Record<string, string> = {
 '.ts': 'typescript',
 '.tsx': 'typescript',
 '.js': 'javascript',
 '.jsx': 'javascript',
 '.py': 'python',
 '.java': 'java',
 '.cpp': 'cpp',
 '.c': 'c',
 '.cs': 'csharp',
 '.go': 'go',
 '.rs': 'rust',
 '.rb': 'ruby',
 '.php': 'php',
 '.swift': 'swift',
 '.kt': 'kotlin',
 '.scala': 'scala',
 '.sh': 'shell',
 '.bash': 'shell',
 '.json': 'json',
 '.xml': 'xml',
 '.html': 'html',
 '.css': 'css',
 '.scss': 'scss',
 '.md': 'markdown',
 '.yaml': 'yaml',
 '.yml': 'yaml',
 '.sql': 'sql'
 };

 return languageMap[ext] || 'plaintext';
 }

 /**
 * Show diff preview in webview
 */
 async show(): Promise<boolean> {
 return new Promise((resolve) => {
 if (this.panel) {
 this.panel.reveal();
 return;
 }

 this.panel = vscode.window.createWebviewPanel(
 'codeliciousDiff',
 'Codelicious - File Changes Preview',
 vscode.ViewColumn.One,
 {
 enableScripts: true,
 retainContextWhenHidden: true
 }
 );

 this.panel.webview.html = this.getWebviewContent();

 // Handle messages from webview
 this.panel.webview.onDidReceiveMessage(
 message => {
 if (message.type === 'approve') {
 resolve(true);
 this.panel?.dispose();
 } else if (message.type === 'reject') {
 resolve(false);
 this.panel?.dispose();
 }
 }
 );

 this.panel.onDidDispose(() => {
 this.panel = undefined;
 resolve(false);
 });

 // Send diffs to webview
 this.panel.webview.postMessage({
 type: 'diffs',
 diffs: this.diffs
 });
 });
 }

 /**
 * Hide diff preview
 */
 hide(): void {
 if (this.panel) {
 this.panel.dispose();
 this.panel = undefined;
 }
 }

 /**
 * Get webview HTML content
 */
 private getWebviewContent(): string {
 return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>File Changes Preview</title>
 <style>
 body {
 font-family: var(--vscode-font-family);
 color: var(--vscode-foreground);
 background-color: var(--vscode-editor-background);
 padding: 0;
 margin: 0;
 }

 .header {
 padding: 20px;
 border-bottom: 1px solid var(--vscode-panel-border);
 background-color: var(--vscode-editor-background);
 position: sticky;
 top: 0;
 z-index: 100;
 }

 h1 {
 font-size: 20px;
 margin: 0 0 10px 0;
 }

 .summary {
 font-size: 13px;
 opacity: 0.8;
 margin-bottom: 15px;
 }

 .actions {
 display: flex;
 gap: 10px;
 }

 button {
 padding: 8px 16px;
 border: none;
 border-radius: 4px;
 cursor: pointer;
 font-size: 13px;
 font-weight: 500;
 }

 .approve-btn {
 background-color: #0078d4;
 color: white;
 }

 .approve-btn:hover {
 background-color: #106ebe;
 }

 .reject-btn {
 background-color: var(--vscode-button-secondaryBackground);
 color: var(--vscode-button-secondaryForeground);
 }

 .reject-btn:hover {
 background-color: var(--vscode-button-secondaryHoverBackground);
 }

 .content {
 padding: 20px;
 }

 .file-diff {
 margin-bottom: 30px;
 border: 1px solid var(--vscode-panel-border);
 border-radius: 4px;
 overflow: hidden;
 }

 .file-header {
 padding: 10px 15px;
 background-color: var(--vscode-input-background);
 border-bottom: 1px solid var(--vscode-panel-border);
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .file-path {
 font-family: monospace;
 font-size: 13px;
 }

 .operation-badge {
 padding: 2px 8px;
 border-radius: 3px;
 font-size: 11px;
 font-weight: bold;
 }

 .operation-create {
 background-color: rgba(16, 124, 16, 0.3);
 color: #4ec9b0;
 }

 .operation-modify {
 background-color: rgba(0, 120, 212, 0.3);
 color: #4fc3f7;
 }

 .operation-delete {
 background-color: rgba(209, 52, 56, 0.3);
 color: #f48771;
 }

 .diff-container {
 display: grid;
 grid-template-columns: 1fr 1fr;
 font-family: 'Courier New', monospace;
 font-size: 12px;
 line-height: 1.5;
 }

 .diff-side {
 overflow-x: auto;
 }

 .diff-side-header {
 padding: 8px 12px;
 background-color: var(--vscode-input-background);
 border-bottom: 1px solid var(--vscode-panel-border);
 font-weight: bold;
 font-size: 11px;
 text-transform: uppercase;
 opacity: 0.8;
 }

 .diff-line {
 display: flex;
 min-height: 20px;
 }

 .line-number {
 width: 40px;
 padding: 0 8px;
 text-align: right;
 user-select: none;
 opacity: 0.5;
 flex-shrink: 0;
 }

 .line-content {
 flex: 1;
 padding: 0 8px;
 white-space: pre;
 overflow-x: auto;
 }

 .line-unchanged {
 background-color: transparent;
 }

 .line-added {
 background-color: rgba(16, 124, 16, 0.2);
 }

 .line-removed {
 background-color: rgba(209, 52, 56, 0.2);
 }

 .line-modified {
 background-color: rgba(0, 120, 212, 0.2);
 }

 .line-empty {
 background-color: var(--vscode-input-background);
 opacity: 0.3;
 }

 .stats {
 padding: 10px 15px;
 background-color: var(--vscode-input-background);
 border-top: 1px solid var(--vscode-panel-border);
 font-size: 12px;
 display: flex;
 gap: 20px;
 }

 .stat {
 display: flex;
 align-items: center;
 gap: 5px;
 }

 .stat-added {
 color: #4ec9b0;
 }

 .stat-removed {
 color: #f48771;
 }

 .stat-modified {
 color: #4fc3f7;
 }
 </style>
</head>
<body>
 <div class="header">
 <h1> File Changes Preview</h1>
 <div class="summary" id="summary">Loading...</div>
 <div class="actions">
 <button class="approve-btn" onclick="approve()"> Approve & Apply Changes</button>
 <button class="reject-btn" onclick="reject()"> Reject Changes</button>
 </div>
 </div>

 <div class="content" id="content">
 <p>Loading diffs...</p>
 </div>

 <script>
 const vscode = acquireVsCodeApi();

 window.addEventListener('message', event => {
 const message = event.data;
 if (message.type === 'diffs') {
 renderDiffs(message.diffs);
 }
 });

 function approve() {
 vscode.postMessage({ type: 'approve' });
 }

 function reject() {
 vscode.postMessage({ type: 'reject' });
 }

 function renderDiffs(diffs) {
 const summary = document.getElementById('summary');
 const content = document.getElementById('content');

 // Update summary
 const fileCount = diffs.length;
 const creates = diffs.filter(d => d.operation === 'create').length;
 const modifies = diffs.filter(d => d.operation === 'modify').length;
 const deletes = diffs.filter(d => d.operation === 'delete').length;

 summary.textContent = \`\${fileCount} file\${fileCount === 1 ? '' : 's'}: \${creates} created, \${modifies} modified, \${deletes} deleted\`;

 // Render diffs
 content.innerHTML = diffs.map(diff => renderFileDiff(diff)).join('');
 }

 function renderFileDiff(diff) {
 const stats = calculateStats(diff.lines);

 return \`
 <div class="file-diff">
 <div class="file-header">
 <span class="file-path">\${diff.filePath}</span>
 <span class="operation-badge operation-\${diff.operation}">\${diff.operation.toUpperCase()}</span>
 </div>

 <div class="diff-container">
 <div class="diff-side">
 <div class="diff-side-header">Original</div>
 \${diff.lines.map(line => renderOldLine(line)).join('')}
 </div>
 <div class="diff-side">
 <div class="diff-side-header">Modified</div>
 \${diff.lines.map(line => renderNewLine(line)).join('')}
 </div>
 </div>

 <div class="stats">
 <div class="stat stat-added">+\${stats.added} added</div>
 <div class="stat stat-removed">-\${stats.removed} removed</div>
 <div class="stat stat-modified">~\${stats.modified} modified</div>
 </div>
 </div>
 \`;
 }

 function renderOldLine(line) {
 if (line.type === 'added') {
 return '<div class="diff-line line-empty"><div class="line-number"></div><div class="line-content"></div></div>';
 }

 const lineClass = \`line-\${line.type}\`;
 const lineNum = line.oldLineNumber || '';
 const content = escapeHtml(line.oldContent || '');

 return \`<div class="diff-line \${lineClass}"><div class="line-number">\${lineNum}</div><div class="line-content">\${content}</div></div>\`;
 }

 function renderNewLine(line) {
 if (line.type === 'removed') {
 return '<div class="diff-line line-empty"><div class="line-number"></div><div class="line-content"></div></div>';
 }

 const lineClass = \`line-\${line.type}\`;
 const lineNum = line.newLineNumber || '';
 const content = escapeHtml(line.newContent || '');

 return \`<div class="diff-line \${lineClass}"><div class="line-number">\${lineNum}</div><div class="line-content">\${content}</div></div>\`;
 }

 function calculateStats(lines) {
 return {
 added: lines.filter(l => l.type === 'added').length,
 removed: lines.filter(l => l.type === 'removed').length,
 modified: lines.filter(l => l.type === 'modified').length
 };
 }

 function escapeHtml(text) {
 const div = document.createElement('div');
 div.textContent = text;
 return div.innerHTML;
 }
 </script>
</body>
</html>`;
 }

 /**
 * Dispose resources
 */
 dispose(): void {
 this.hide();
 }
}

