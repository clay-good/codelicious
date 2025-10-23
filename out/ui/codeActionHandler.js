"use strict";
/**
 * Code Action Handler - Handles apply, explain, and run actions on code blocks
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
exports.CodeActionHandler = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CodeActionHandler');
class CodeActionHandler {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Apply code to a file with smart detection and diff preview
    */
    async applyCode(code, language, suggestedFileName) {
        try {
            // Try to detect file path from code
            const detectedPath = this.detectFilePathFromCode(code, language);
            const targetPath = detectedPath || suggestedFileName;
            // If we have a target path and file exists, show diff preview
            if (targetPath) {
                const fullPath = path.join(this.workspaceRoot, targetPath);
                if (fs.existsSync(fullPath)) {
                    const shouldApply = await this.showDiffPreview(fullPath, code);
                    if (shouldApply) {
                        await this.writeFile(fullPath, code);
                        vscode.window.showInformationMessage(`Code applied to ${targetPath}`);
                        await this.openFile(fullPath);
                    }
                    return;
                }
            }
            // Ask user where to apply the code
            const action = await vscode.window.showQuickPick([
                { label: '$(new-file) Create New File', value: 'new', description: targetPath ? `Suggested: ${targetPath}` : undefined },
                { label: '$(file) Insert into Current File', value: 'insert' },
                { label: '$(replace) Replace Current Selection', value: 'replace' }
            ], { placeHolder: 'How would you like to apply this code?' });
            if (!action) {
                return;
            }
            switch (action.value) {
                case 'new':
                    await this.createNewFile(code, language, targetPath);
                    break;
                case 'insert':
                    await this.insertIntoCurrentFile(code);
                    break;
                case 'replace':
                    await this.replaceSelection(code);
                    break;
            }
            vscode.window.showInformationMessage('Code applied successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to apply code: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
    * Detect file path from code comments or structure
    */
    detectFilePathFromCode(code, language) {
        const lines = code.split('\n');
        const firstLine = lines[0]?.trim() || '';
        // Check for file path in first line comment
        const commentPatterns = [
            /^\/\/\s*(.+\.\w+)/, // // src/file.ts
            /^#\s*(.+\.\w+)/, // # src/file.py
            /^\/\*\s*(.+\.\w+)/ // /* src/file.js
        ];
        for (const pattern of commentPatterns) {
            const match = firstLine.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }
        // Try to detect from imports/requires
        for (const line of lines.slice(0, 10)) {
            const importMatch = line.match(/import\s+.*\s+from\s+['"](.+)['"]/);
            if (importMatch) {
                // Try to find similar files
                const moduleName = path.basename(importMatch[1]);
                return this.suggestFilePath(moduleName, language);
            }
        }
        // Try to detect from class/function names
        for (const line of lines) {
            const classMatch = line.match(/(?:export\s+)?(?:class|interface)\s+(\w+)/);
            if (classMatch) {
                const className = classMatch[1];
                return this.suggestFilePath(className, language);
            }
        }
        return undefined;
    }
    /**
    * Suggest file path based on name and language
    */
    suggestFilePath(name, language) {
        const extension = this.getFileExtension(language);
        const fileName = name.replace(/[^a-zA-Z0-9]/g, '') + extension;
        return `src/${fileName}`;
    }
    /**
    * Show diff preview before applying changes
    */
    async showDiffPreview(filePath, newContent) {
        try {
            const originalContent = fs.readFileSync(filePath, 'utf-8');
            // Create temporary file for new content
            const tempPath = path.join(this.workspaceRoot, '.codelicious', 'temp', path.basename(filePath));
            const tempDir = path.dirname(tempPath);
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            fs.writeFileSync(tempPath, newContent, 'utf-8');
            // Open diff editor
            const originalUri = vscode.Uri.file(filePath);
            const modifiedUri = vscode.Uri.file(tempPath);
            await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, `${path.basename(filePath)} (Original ↔ Modified)`);
            // Ask user to confirm
            const choice = await vscode.window.showInformationMessage(`Apply changes to ${path.basename(filePath)}?`, { modal: true }, 'Apply', 'Cancel');
            // Clean up temp file
            try {
                fs.unlinkSync(tempPath);
            }
            catch { }
            return choice === 'Apply';
        }
        catch (error) {
            logger.error('Failed to show diff preview:', error);
            return false;
        }
    }
    /**
    * Write content to file
    */
    async writeFile(filePath, content) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, content, 'utf-8');
    }
    /**
    * Open file in editor
    */
    async openFile(filePath) {
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
    }
    /**
    * Create a new file with the code
    */
    async createNewFile(code, language, suggestedFileName) {
        // Suggest a file name based on language
        const extension = this.getFileExtension(language);
        const defaultFileName = suggestedFileName || `new-file${extension}`;
        // Ask user for file name
        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter file name',
            value: defaultFileName,
            validateInput: (value) => {
                if (!value) {
                    return 'File name cannot be empty';
                }
                if (value.includes('/') || value.includes('\\')) {
                    return 'File name cannot contain path separators';
                }
                return null;
            }
        });
        if (!fileName) {
            return;
        }
        // Ask user for directory
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            throw new Error('No workspace folder open');
        }
        let targetDir = folders[0].uri.fsPath;
        // If multiple folders, let user choose
        if (folders.length > 1) {
            const selected = await vscode.window.showQuickPick(folders.map(f => ({ label: f.name, uri: f.uri })), { placeHolder: 'Select workspace folder' });
            if (selected) {
                targetDir = selected.uri.fsPath;
            }
        }
        // Ask for subdirectory (optional)
        const subDir = await vscode.window.showInputBox({
            prompt: 'Enter subdirectory (optional, e.g., src/components)',
            value: '',
            placeHolder: 'Leave empty for root directory'
        });
        if (subDir) {
            targetDir = path.join(targetDir, subDir);
            // Create directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
        }
        // Create the file
        const filePath = path.join(targetDir, fileName);
        // Check if file exists
        if (fs.existsSync(filePath)) {
            const overwrite = await vscode.window.showWarningMessage(`File ${fileName} already exists. Overwrite?`, 'Yes', 'No');
            if (overwrite !== 'Yes') {
                return;
            }
        }
        // Write file
        fs.writeFileSync(filePath, code, 'utf8');
        // Open the file
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document);
    }
    /**
    * Insert code into current file at cursor position
    */
    async insertIntoCurrentFile(code) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }
        await editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, code);
        });
    }
    /**
    * Replace current selection with code
    */
    async replaceSelection(code) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            throw new Error('No active editor');
        }
        if (editor.selection.isEmpty) {
            throw new Error('No text selected');
        }
        await editor.edit(editBuilder => {
            editBuilder.replace(editor.selection, code);
        });
    }
    /**
    * Explain code by sending it back to AI
    */
    async explainCode(code, language) {
        // Return a prompt that can be sent to the AI
        return `Please explain this ${language} code in detail:\n\n\`\`\`${language}\n${code}\n\`\`\`\n\nExplain:\n1. What this code does\n2. How it works\n3. Key concepts used\n4. Potential improvements`;
    }
    /**
    * Run code (for executable languages)
    */
    async runCode(code, language) {
        try {
            // Check if language is executable
            const runnableLanguages = ['javascript', 'typescript', 'python', 'bash', 'sh'];
            if (!runnableLanguages.includes(language.toLowerCase())) {
                vscode.window.showWarningMessage(`Cannot run ${language} code directly. Only JavaScript, TypeScript, Python, and Bash are supported.`);
                return;
            }
            // Ask for confirmation
            const confirm = await vscode.window.showWarningMessage(`Run this ${language} code? This will execute the code in your environment.`, { modal: true }, 'Run', 'Cancel');
            if (confirm !== 'Run') {
                return;
            }
            // Create temporary file
            const tempDir = path.join(this.workspaceRoot, '.codelicious-temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const extension = this.getFileExtension(language);
            const tempFile = path.join(tempDir, `temp${extension}`);
            fs.writeFileSync(tempFile, code, 'utf8');
            // Get command to run
            const command = this.getRunCommand(language, tempFile);
            // Create terminal and run
            const terminal = vscode.window.createTerminal({
                name: 'Codelicious Run',
                cwd: this.workspaceRoot
            });
            terminal.show();
            terminal.sendText(command);
            // Clean up after 5 seconds
            const cleanupTimer = setTimeout(() => {
                try {
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                }
                catch (error) {
                    logger.error('Failed to clean up temp file:', error);
                }
            }, 5000);
            // Allow Node.js to exit even if this timer is active
            cleanupTimer.unref();
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to run code: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
    * Get file extension for language
    */
    getFileExtension(language) {
        const extensions = {
            'typescript': '.ts',
            'javascript': '.js',
            'python': '.py',
            'java': '.java',
            'cpp': '.cpp',
            'c': '.c',
            'csharp': '.cs',
            'go': '.go',
            'rust': '.rs',
            'ruby': '.rb',
            'php': '.php',
            'swift': '.swift',
            'kotlin': '.kt',
            'sql': '.sql',
            'bash': '.sh',
            'sh': '.sh',
            'json': '.json',
            'yaml': '.yaml',
            'yml': '.yml',
            'xml': '.xml',
            'html': '.html',
            'css': '.css',
            'markdown': '.md',
            'md': '.md'
        };
        return extensions[language.toLowerCase()] || '.txt';
    }
    /**
    * Get command to run code
    */
    getRunCommand(language, filePath) {
        const commands = {
            'javascript': `node "${filePath}"`,
            'typescript': `ts-node "${filePath}"`,
            'python': `python3 "${filePath}"`,
            'bash': `bash "${filePath}"`,
            'sh': `sh "${filePath}"`
        };
        return commands[language.toLowerCase()] || `cat "${filePath}"`;
    }
}
exports.CodeActionHandler = CodeActionHandler;
//# sourceMappingURL=codeActionHandler.js.map