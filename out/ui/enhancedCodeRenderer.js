"use strict";
/**
 * Enhanced Code Renderer for Chat Interface
 * Provides better code rendering, diff preview, and one-click apply
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
exports.EnhancedCodeRenderer = void 0;
const vscode = __importStar(require("vscode"));
class EnhancedCodeRenderer {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Render code block with enhanced features
    */
    renderCodeBlock(block) {
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
    renderWithLineNumbers(code) {
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
    async generateDiffPreview(diff) {
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
    computeDiff(original, modified) {
        const result = [];
        const maxLen = Math.max(original.length, modified.length);
        for (let i = 0; i < maxLen; i++) {
            const origLine = original[i];
            const modLine = modified[i];
            if (origLine === modLine) {
                result.push({ type: 'unchanged', content: origLine, lineNumber: i + 1 });
            }
            else if (origLine && !modLine) {
                result.push({ type: 'removed', content: origLine, lineNumber: i + 1 });
            }
            else if (!origLine && modLine) {
                result.push({ type: 'added', content: modLine, lineNumber: i + 1 });
            }
            else {
                result.push({ type: 'removed', content: origLine, lineNumber: i + 1 });
                result.push({ type: 'added', content: modLine, lineNumber: i + 1 });
            }
        }
        return result;
    }
    /**
    * Render a single diff line
    */
    renderDiffLine(line) {
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
    extractCodeBlocks(content) {
        const blocks = [];
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
    extractFilePath(code) {
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
    async detectFilePath(code, language) {
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
    async findSimilarFiles(query) {
        try {
            const files = await vscode.workspace.findFiles(`**/*${query}*`, '**/node_modules/**', 10);
            return files.map(f => vscode.workspace.asRelativePath(f));
        }
        catch {
            return [];
        }
    }
    /**
    * Get file extension for language
    */
    getExtensionForLanguage(language) {
        const extensions = {
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
    generateId() {
        return `code_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
    * Escape HTML
    */
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
exports.EnhancedCodeRenderer = EnhancedCodeRenderer;
//# sourceMappingURL=enhancedCodeRenderer.js.map