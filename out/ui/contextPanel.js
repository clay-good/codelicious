"use strict";
/**
 * Context Panel Provider
 * AUGMENT PARITY: Show users what context sources are being used
 *
 * This panel provides transparency by displaying:
 * - Files included in context
 * - Commits referenced
 * - Symbols and dependencies
 * - Relevance scores
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextPanelProvider = void 0;
const vscode = __importStar(require("vscode"));
class ContextPanelProvider {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.currentContext = [];
        this.currentQuery = '';
    }
    resolveWebviewView(webviewView, context, _token) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };
        this.updateView();
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'openFile':
                    this.openFile(data.path, data.lineNumber);
                    break;
                case 'copyContent':
                    vscode.env.clipboard.writeText(data.content);
                    vscode.window.showInformationMessage('Content copied to clipboard');
                    break;
            }
        });
    }
    /**
    * Update context display
    */
    updateContext(query, sources) {
        this.currentQuery = query;
        this.currentContext = sources;
        this.updateView();
    }
    /**
    * Clear context display
    */
    clearContext() {
        this.currentQuery = '';
        this.currentContext = [];
        this.updateView();
    }
    updateView() {
        if (!this.view) {
            return;
        }
        this.view.webview.html = this.getHtmlContent();
    }
    openFile(path, lineNumber) {
        const uri = vscode.Uri.file(path);
        vscode.window.showTextDocument(uri, {
            preview: false,
            selection: lineNumber ? new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 0) : undefined
        });
    }
    getHtmlContent() {
        if (this.currentContext.length === 0) {
            return this.getEmptyStateHtml();
        }
        const contextHtml = this.currentContext.map((source, index) => {
            const typeIcon = this.getTypeIcon(source.type);
            const scorePercent = Math.round(source.score * 100);
            const scoreColor = this.getScoreColor(source.score);
            return `
 <div class="context-item" data-index="${index}">
 <div class="context-header">
 <div class="context-type">
 <span class="type-icon">${typeIcon}</span>
 <span class="type-label">${source.type}</span>
 </div>
 <div class="context-score" style="color: ${scoreColor}">
 ${scorePercent}%
 </div>
 </div>
 <div class="context-path" onclick="openFile('${source.path}')">
 ${this.escapeHtml(source.path)}
 </div>
 <div class="context-reason">${this.escapeHtml(source.reason)}</div>
 ${source.metadata ? this.renderMetadata(source.metadata) : ''}
 <details class="context-preview-details">
 <summary>Preview</summary>
 <pre class="context-preview">${this.escapeHtml(source.preview)}</pre>
 </details>
 <div class="context-actions">
 <button onclick="openFile('${source.path}')" class="action-btn">Open File</button>
 <button onclick="copyContent(${index})" class="action-btn">Copy</button>
 </div>
 </div>
 `;
        }).join('');
        return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Context Sources</title>
 <style>
 body {
 padding: 10px;
 font-family: var(--vscode-font-family);
 font-size: var(--vscode-font-size);
 color: var(--vscode-foreground);
 background-color: var(--vscode-editor-background);
 }
 .query-section {
 margin-bottom: 15px;
 padding: 10px;
 background: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 4px;
 }
 .query-label {
 font-size: 11px;
 text-transform: uppercase;
 color: var(--vscode-descriptionForeground);
 margin-bottom: 5px;
 }
 .query-text {
 font-weight: 500;
 }
 .context-item {
 margin-bottom: 15px;
 border: 1px solid var(--vscode-panel-border);
 border-radius: 4px;
 padding: 10px;
 background: var(--vscode-editor-background);
 }
 .context-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 8px;
 }
 .context-type {
 display: flex;
 align-items: center;
 gap: 6px;
 }
 .type-icon {
 font-size: 16px;
 }
 .type-label {
 font-weight: bold;
 text-transform: uppercase;
 font-size: 11px;
 color: var(--vscode-textLink-foreground);
 }
 .context-score {
 font-weight: bold;
 font-size: 12px;
 }
 .context-path {
 font-size: 12px;
 color: var(--vscode-textLink-foreground);
 cursor: pointer;
 margin-bottom: 5px;
 word-break: break-all;
 }
 .context-path:hover {
 text-decoration: underline;
 }
 .context-reason {
 font-size: 11px;
 font-style: italic;
 color: var(--vscode-descriptionForeground);
 margin: 5px 0;
 }
 .context-metadata {
 font-size: 10px;
 color: var(--vscode-descriptionForeground);
 margin: 5px 0;
 display: flex;
 gap: 10px;
 flex-wrap: wrap;
 }
 .metadata-item {
 display: flex;
 gap: 4px;
 }
 .metadata-label {
 font-weight: 600;
 }
 .context-preview-details {
 margin: 8px 0;
 }
 .context-preview-details summary {
 cursor: pointer;
 font-size: 11px;
 color: var(--vscode-textLink-foreground);
 user-select: none;
 }
 .context-preview {
 font-size: 11px;
 background: var(--vscode-textCodeBlock-background);
 padding: 8px;
 overflow-x: auto;
 margin: 5px 0 0 0;
 border-radius: 3px;
 max-height: 200px;
 overflow-y: auto;
 }
 .context-actions {
 display: flex;
 gap: 8px;
 margin-top: 8px;
 }
 .action-btn {
 background: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 border: none;
 padding: 4px 12px;
 font-size: 11px;
 cursor: pointer;
 border-radius: 3px;
 }
 .action-btn:hover {
 background: var(--vscode-button-hoverBackground);
 }
 .stats {
 font-size: 11px;
 color: var(--vscode-descriptionForeground);
 margin-bottom: 10px;
 padding: 8px;
 background: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 4px;
 }
 </style>
</head>
<body>
 <div class="query-section">
 <div class="query-label">Current Query</div>
 <div class="query-text">${this.escapeHtml(this.currentQuery)}</div>
 </div>
 <div class="stats">
 <strong>${this.currentContext.length}</strong> context sources found
 </div>
 ${contextHtml}
 <script>
 const vscode = acquireVsCodeApi();

 function openFile(path, lineNumber) {
 vscode.postMessage({
 type: 'openFile',
 path: path,
 lineNumber: lineNumber
 });
 }

 function copyContent(index) {
 const sources = ${JSON.stringify(this.currentContext)};
 vscode.postMessage({
 type: 'copyContent',
 content: sources[index].preview
 });
 }
 </script>
</body>
</html>`;
    }
    getEmptyStateHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Context Sources</title>
 <style>
 body {
 padding: 20px;
 font-family: var(--vscode-font-family);
 color: var(--vscode-foreground);
 text-align: center;
 }
 .empty-state {
 margin-top: 40px;
 }
 .empty-icon {
 font-size: 48px;
 margin-bottom: 16px;
 }
 .empty-title {
 font-size: 16px;
 font-weight: 600;
 margin-bottom: 8px;
 }
 .empty-description {
 font-size: 12px;
 color: var(--vscode-descriptionForeground);
 }
 </style>
</head>
<body>
 <div class="empty-state">
 <div class="empty-icon"></div>
 <div class="empty-title">No Context Loaded</div>
 <div class="empty-description">
 Ask a question in the chat to see what context sources are being used.
 </div>
 </div>
</body>
</html>`;
    }
    renderMetadata(metadata) {
        if (!metadata)
            return '';
        const items = [];
        if (metadata.author) {
            items.push(`<div class="metadata-item"><span class="metadata-label">Author:</span><span>${this.escapeHtml(metadata.author)}</span></div>`);
        }
        if (metadata.date) {
            items.push(`<div class="metadata-item"><span class="metadata-label">Date:</span><span>${this.escapeHtml(metadata.date)}</span></div>`);
        }
        if (metadata.lineNumbers) {
            items.push(`<div class="metadata-item"><span class="metadata-label">Lines:</span><span>${this.escapeHtml(metadata.lineNumbers)}</span></div>`);
        }
        return items.length > 0 ? `<div class="context-metadata">${items.join('')}</div>` : '';
    }
    getTypeIcon(type) {
        const icons = {
            file: '',
            commit: '',
            symbol: '',
            dependency: '',
            pattern: ''
        };
        return icons[type] || '';
    }
    getScoreColor(score) {
        if (score >= 0.8)
            return 'var(--vscode-charts-green)';
        if (score >= 0.5)
            return 'var(--vscode-charts-yellow)';
        return 'var(--vscode-charts-orange)';
    }
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
exports.ContextPanelProvider = ContextPanelProvider;
ContextPanelProvider.viewType = 'codelicious.contextPanel';
//# sourceMappingURL=contextPanel.js.map