"use strict";
/**
 * Autonomous Executor - Automatically executes code generation and file operations
 *
 * Features:
 * - Parse AI responses for file operations
 * - Generate multiple files automatically
 * - Show diff previews before applying
 * - Handle complex multi-file changes
 * - Provide undo/redo support
 * - Safety checks and validation
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
exports.AutonomousExecutor = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const diffViewer_1 = require("./diffViewer");
class AutonomousExecutor {
    constructor(workspaceRoot, context) {
        this.workspaceRoot = workspaceRoot;
        this.context = context;
        this.undoStack = [];
        this.maxUndoStackSize = 50;
        if (context) {
            this.diffViewer = new diffViewer_1.DiffViewer(context);
        }
    }
    /**
    * Parse AI response to extract file operations
    */
    parseFileOperations(aiResponse) {
        const operations = [];
        // Pattern 1: Create file with content
        // ```typescript:src/path/to/file.ts
        // content here
        // ```
        const createPattern = /```(\w+):([^\n]+)\n([\s\S]*?)```/g;
        let match;
        while ((match = createPattern.exec(aiResponse)) !== null) {
            const language = match[1];
            const filePath = match[2].trim();
            const content = match[3].trim();
            operations.push({
                type: 'create',
                filePath,
                content,
                language
            });
        }
        // Pattern 2: Modify existing file
        // MODIFY: src/path/to/file.ts
        // ```typescript
        // new content
        // ```
        const modifyPattern = /MODIFY:\s*([^\n]+)\n```(\w+)\n([\s\S]*?)```/g;
        while ((match = modifyPattern.exec(aiResponse)) !== null) {
            const filePath = match[1].trim();
            const language = match[2];
            const content = match[3].trim();
            // Read original content if file exists
            const fullPath = path.join(this.workspaceRoot, filePath);
            let originalContent;
            if (fs.existsSync(fullPath)) {
                originalContent = fs.readFileSync(fullPath, 'utf8');
            }
            operations.push({
                type: 'modify',
                filePath,
                content,
                originalContent,
                language
            });
        }
        // Pattern 3: Delete file
        // DELETE: src/path/to/file.ts
        const deletePattern = /DELETE:\s*([^\n]+)/g;
        while ((match = deletePattern.exec(aiResponse)) !== null) {
            const filePath = match[1].trim();
            // Read original content for undo
            const fullPath = path.join(this.workspaceRoot, filePath);
            let originalContent;
            if (fs.existsSync(fullPath)) {
                originalContent = fs.readFileSync(fullPath, 'utf8');
            }
            operations.push({
                type: 'delete',
                filePath,
                originalContent
            });
        }
        if (operations.length === 0) {
            return null;
        }
        // Estimate impact
        const estimatedImpact = this.estimateImpact(operations);
        // Generate description
        const description = this.generateDescription(operations);
        return {
            operations,
            description,
            estimatedImpact
        };
    }
    /**
    * Show execution plan to user for approval
    */
    async showExecutionPlan(plan) {
        // If diff viewer is available, use it directly with approval buttons
        if (this.diffViewer) {
            this.diffViewer.generateDiffs(plan.operations);
            return await this.diffViewer.show();
        }
        // Fallback to old approval dialog
        const items = plan.operations.map(op => {
            const icon = op.type === 'create' ? '$(new-file)' :
                op.type === 'modify' ? '$(edit)' : '$(trash)';
            return `${icon} ${op.type.toUpperCase()}: ${op.filePath}`;
        });
        const impactColor = plan.estimatedImpact === 'high' ? '' :
            plan.estimatedImpact === 'medium' ? '' : '';
        const message = `${impactColor} ${plan.description}\n\n${items.join('\n')}\n\nApply these changes?`;
        const result = await vscode.window.showInformationMessage(message, { modal: true }, 'Preview Changes', 'Apply All', 'Cancel');
        if (result === 'Preview Changes') {
            // Show diff previews
            await this.showDiffPreviews(plan.operations);
            // Ask again after showing previews
            const secondResult = await vscode.window.showInformationMessage(`${impactColor} ${plan.description}\n\nApply these changes?`, { modal: true }, 'Apply All', 'Cancel');
            return secondResult === 'Apply All';
        }
        return result === 'Apply All';
    }
    /**
    * Execute the plan
    */
    async executePlan(plan) {
        const appliedOperations = [];
        const failedOperations = [];
        const errors = [];
        // Create undo snapshot
        const snapshot = {
            timestamp: Date.now(),
            operations: plan.operations,
            description: plan.description
        };
        try {
            for (const operation of plan.operations) {
                try {
                    await this.executeOperation(operation);
                    appliedOperations.push(operation);
                }
                catch (error) {
                    failedOperations.push(operation);
                    errors.push(`${operation.filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
            }
            // Add to undo stack if any operations succeeded
            if (appliedOperations.length > 0) {
                this.addToUndoStack(snapshot);
            }
            return {
                success: failedOperations.length === 0,
                appliedOperations,
                failedOperations,
                errors
            };
        }
        catch (error) {
            return {
                success: false,
                appliedOperations,
                failedOperations: plan.operations,
                errors: [error instanceof Error ? error.message : 'Unknown error']
            };
        }
    }
    /**
    * Execute a single operation
    */
    async executeOperation(operation) {
        const fullPath = path.join(this.workspaceRoot, operation.filePath);
        switch (operation.type) {
            case 'create':
                await this.createFile(fullPath, operation.content);
                break;
            case 'modify':
                await this.modifyFile(fullPath, operation.content);
                break;
            case 'delete':
                await this.deleteFile(fullPath);
                break;
        }
    }
    /**
    * Create a new file
    */
    async createFile(filePath, content) {
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Check if file already exists
        if (fs.existsSync(filePath)) {
            throw new Error(`File already exists: ${filePath}`);
        }
        // Write file
        fs.writeFileSync(filePath, content, 'utf8');
        // Open the file
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document, { preview: false });
    }
    /**
    * Modify an existing file
    */
    async modifyFile(filePath, content) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }
        // Write file
        fs.writeFileSync(filePath, content, 'utf8');
        // Refresh if file is open
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
        if (document) {
            await vscode.window.showTextDocument(document, { preview: false });
        }
    }
    /**
    * Delete a file
    */
    async deleteFile(filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }
        // Close file if open
        const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === filePath);
        if (document) {
            await vscode.window.showTextDocument(document);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        }
        // Delete file
        fs.unlinkSync(filePath);
    }
    /**
    * Show diff previews for all operations
    */
    async showDiffPreviews(operations) {
        if (this.diffViewer) {
            // Use new diff viewer with side-by-side view
            this.diffViewer.generateDiffs(operations);
            return await this.diffViewer.show();
        }
        else {
            // Fallback to old method
            for (const operation of operations) {
                if (operation.type === 'create') {
                    // Show new file content
                    const uri = vscode.Uri.parse(`untitled:${operation.filePath}`);
                    const document = await vscode.workspace.openTextDocument(uri);
                    const editor = await vscode.window.showTextDocument(document);
                    await editor.edit(editBuilder => {
                        editBuilder.insert(new vscode.Position(0, 0), operation.content || '');
                    });
                }
                else if (operation.type === 'modify' && operation.originalContent) {
                    // Show diff
                    const tempDir = path.join(this.workspaceRoot, '.codelicious-temp');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    const fileName = path.basename(operation.filePath);
                    const originalFile = path.join(tempDir, `${fileName}.original`);
                    const newFile = path.join(tempDir, `${fileName}.new`);
                    fs.writeFileSync(originalFile, operation.originalContent, 'utf8');
                    fs.writeFileSync(newFile, operation.content || '', 'utf8');
                    await vscode.commands.executeCommand('vscode.diff', vscode.Uri.file(originalFile), vscode.Uri.file(newFile), `${operation.filePath}: Original ↔ New`);
                }
            }
            return true;
        }
    }
    /**
    * Undo last execution
    */
    async undo() {
        if (this.undoStack.length === 0) {
            vscode.window.showInformationMessage('Nothing to undo');
            return false;
        }
        const snapshot = this.undoStack.pop();
        try {
            // Reverse operations
            for (const operation of snapshot.operations.reverse()) {
                await this.reverseOperation(operation);
            }
            vscode.window.showInformationMessage(` Undone: ${snapshot.description}`);
            return true;
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to undo: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }
    /**
    * Reverse a single operation
    */
    async reverseOperation(operation) {
        const fullPath = path.join(this.workspaceRoot, operation.filePath);
        switch (operation.type) {
            case 'create':
                // Delete the created file
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
                break;
            case 'modify':
                // Restore original content
                if (operation.originalContent) {
                    fs.writeFileSync(fullPath, operation.originalContent, 'utf8');
                }
                break;
            case 'delete':
                // Restore deleted file
                if (operation.originalContent) {
                    const dir = path.dirname(fullPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    fs.writeFileSync(fullPath, operation.originalContent, 'utf8');
                }
                break;
        }
    }
    /**
    * Add snapshot to undo stack
    */
    addToUndoStack(snapshot) {
        this.undoStack.push(snapshot);
        // Limit stack size
        if (this.undoStack.length > this.maxUndoStackSize) {
            this.undoStack.shift();
        }
    }
    /**
    * Estimate impact of operations
    */
    estimateImpact(operations) {
        const deleteCount = operations.filter(op => op.type === 'delete').length;
        const modifyCount = operations.filter(op => op.type === 'modify').length;
        const totalCount = operations.length;
        if (deleteCount > 0 || totalCount > 10) {
            return 'high';
        }
        else if (modifyCount > 3 || totalCount > 5) {
            return 'medium';
        }
        else {
            return 'low';
        }
    }
    /**
    * Generate description of operations
    */
    generateDescription(operations) {
        const createCount = operations.filter(op => op.type === 'create').length;
        const modifyCount = operations.filter(op => op.type === 'modify').length;
        const deleteCount = operations.filter(op => op.type === 'delete').length;
        const parts = [];
        if (createCount > 0)
            parts.push(`Create ${createCount} file${createCount > 1 ? 's' : ''}`);
        if (modifyCount > 0)
            parts.push(`Modify ${modifyCount} file${modifyCount > 1 ? 's' : ''}`);
        if (deleteCount > 0)
            parts.push(`Delete ${deleteCount} file${deleteCount > 1 ? 's' : ''}`);
        return parts.join(', ');
    }
    /**
    * Get undo stack size
    */
    getUndoStackSize() {
        return this.undoStack.length;
    }
    /**
    * Clear undo stack
    */
    clearUndoStack() {
        this.undoStack = [];
    }
    /**
    * Dispose resources
    */
    dispose() {
        if (this.diffViewer) {
            this.diffViewer.dispose();
        }
    }
}
exports.AutonomousExecutor = AutonomousExecutor;
//# sourceMappingURL=autonomousExecutor.js.map