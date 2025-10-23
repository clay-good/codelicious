"use strict";
/**
 * File Attachment Manager - Handle file attachments in chat
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
exports.FileAttachmentManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const fileUtils_1 = require("../utils/fileUtils");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('FileAttachmentManager');
class FileAttachmentManager {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.attachedFiles = new Map();
        this.MAX_FILE_SIZE = 1024 * 1024; // 1MB
        this.MAX_FILES = 10;
        this.PREVIEW_LENGTH = 200;
    }
    /**
    * Attach a file by path
    */
    async attachFile(filePath) {
        try {
            // Check if already attached
            if (this.attachedFiles.has(filePath)) {
                vscode.window.showInformationMessage(`File already attached: ${path.basename(filePath)}`);
                return this.attachedFiles.get(filePath) || null;
            }
            // Check file count limit
            if (this.attachedFiles.size >= this.MAX_FILES) {
                vscode.window.showWarningMessage(`Maximum ${this.MAX_FILES} files can be attached at once`);
                return null;
            }
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`File not found: ${filePath}`);
                return null;
            }
            // Check file size
            const size = (0, fileUtils_1.getFileSize)(filePath);
            if (size > this.MAX_FILE_SIZE) {
                const sizeMB = (size / (1024 * 1024)).toFixed(2);
                vscode.window.showWarningMessage(`File too large: ${sizeMB}MB (max 1MB). Consider attaching a smaller file.`);
                return null;
            }
            // Read file content
            const content = (0, fileUtils_1.readFileContent)(filePath);
            if (!content) {
                vscode.window.showErrorMessage(`Failed to read file: ${filePath}`);
                return null;
            }
            // Create attached file object
            const attachedFile = {
                path: filePath,
                name: path.basename(filePath),
                relativePath: path.relative(this.workspaceRoot, filePath),
                language: (0, fileUtils_1.detectLanguage)(filePath),
                size,
                content,
                preview: this.createPreview(content)
            };
            // Add to attached files
            this.attachedFiles.set(filePath, attachedFile);
            return attachedFile;
        }
        catch (error) {
            logger.error('Error attaching file:', error);
            vscode.window.showErrorMessage(`Error attaching file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return null;
        }
    }
    /**
    * Attach multiple files
    */
    async attachFiles(filePaths) {
        const attached = [];
        for (const filePath of filePaths) {
            const file = await this.attachFile(filePath);
            if (file) {
                attached.push(file);
            }
        }
        return attached;
    }
    /**
    * Remove attached file
    */
    removeFile(filePath) {
        return this.attachedFiles.delete(filePath);
    }
    /**
    * Clear all attached files
    */
    clearAll() {
        this.attachedFiles.clear();
    }
    /**
    * Get all attached files
    */
    getAttachedFiles() {
        return Array.from(this.attachedFiles.values());
    }
    /**
    * Get attached file by path
    */
    getFile(filePath) {
        return this.attachedFiles.get(filePath);
    }
    /**
    * Check if file is attached
    */
    isAttached(filePath) {
        return this.attachedFiles.has(filePath);
    }
    /**
    * Get total size of attached files
    */
    getTotalSize() {
        let total = 0;
        for (const file of this.attachedFiles.values()) {
            total += file.size;
        }
        return total;
    }
    /**
    * Get count of attached files
    */
    getCount() {
        return this.attachedFiles.size;
    }
    /**
    * Create preview text from content
    */
    createPreview(content) {
        const lines = content.split('\n');
        const preview = lines.slice(0, 10).join('\n');
        if (preview.length > this.PREVIEW_LENGTH) {
            return preview.substring(0, this.PREVIEW_LENGTH) + '...';
        }
        if (lines.length > 10) {
            return preview + '\n...';
        }
        return preview;
    }
    /**
    * Format attached files for AI context
    */
    formatForContext() {
        if (this.attachedFiles.size === 0) {
            return '';
        }
        const parts = ['\n\n## Attached Files\n'];
        for (const file of this.attachedFiles.values()) {
            parts.push(`\n### File: ${file.relativePath}\n`);
            parts.push(`Language: ${file.language}\n`);
            parts.push(`\`\`\`${file.language}\n`);
            parts.push(file.content);
            parts.push('\n```\n');
        }
        return parts.join('');
    }
    /**
    * Show file picker dialog
    */
    async showFilePicker() {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            openLabel: 'Attach Files',
            filters: {
                'Code Files': ['ts', 'js', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt'],
                'All Files': ['*']
            }
        });
        if (!uris || uris.length === 0) {
            return [];
        }
        const filePaths = uris.map(uri => uri.fsPath);
        return await this.attachFiles(filePaths);
    }
    /**
    * Attach currently open file
    */
    async attachCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No file is currently open');
            return null;
        }
        const filePath = editor.document.uri.fsPath;
        return await this.attachFile(filePath);
    }
    /**
    * Attach selected files from workspace
    */
    async attachWorkspaceFiles() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return [];
        }
        // Find all code files in workspace
        const files = await vscode.workspace.findFiles('**/*.{ts,js,py,java,cpp,c,cs,go,rs,rb,php,swift,kt,tsx,jsx}', '**/node_modules/**', 100);
        if (files.length === 0) {
            vscode.window.showInformationMessage('No code files found in workspace');
            return [];
        }
        // Show quick pick for file selection
        const items = files.map(uri => ({
            label: path.basename(uri.fsPath),
            description: path.relative(this.workspaceRoot, uri.fsPath),
            uri
        }));
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: 'Select files to attach',
            matchOnDescription: true
        });
        if (!selected || selected.length === 0) {
            return [];
        }
        const filePaths = selected.map(item => item.uri.fsPath);
        return await this.attachFiles(filePaths);
    }
    /**
    * Get file statistics
    */
    getStatistics() {
        const languages = new Set();
        for (const file of this.attachedFiles.values()) {
            languages.add(file.language);
        }
        const totalSize = this.getTotalSize();
        return {
            count: this.getCount(),
            totalSize,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            languages: Array.from(languages)
        };
    }
    /**
    * Validate file for attachment
    */
    validateFile(filePath) {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return { valid: false, error: 'File not found' };
        }
        // Check file size
        const size = (0, fileUtils_1.getFileSize)(filePath);
        if (size > this.MAX_FILE_SIZE) {
            const sizeMB = (size / (1024 * 1024)).toFixed(2);
            return { valid: false, error: `File too large: ${sizeMB}MB (max 1MB)` };
        }
        // Check if binary file
        const ext = path.extname(filePath).toLowerCase();
        const binaryExtensions = ['.exe', '.dll', '.so', '.dylib', '.bin', '.zip', '.tar', '.gz', '.jpg', '.png', '.gif', '.pdf'];
        if (binaryExtensions.includes(ext)) {
            return { valid: false, error: 'Binary files are not supported' };
        }
        return { valid: true };
    }
}
exports.FileAttachmentManager = FileAttachmentManager;
//# sourceMappingURL=fileAttachmentManager.js.map