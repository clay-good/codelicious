"use strict";
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
exports.MultiFileEditor = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const modelRouter_1 = require("../models/modelRouter");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('MultiFileEditor');
/**
 * Multi-file editor with dependency tracking
 * Enables simultaneous edits across multiple files with conflict detection
 */
class MultiFileEditor {
    constructor(orchestrator, workspaceRoot) {
        this.pendingEdits = new Map();
        this.orchestrator = orchestrator;
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Plan multi-file edits based on user request
    */
    async planEdits(request, affectedFiles) {
        logger.info(` Planning edits for ${affectedFiles.length} files...`);
        // Read current content of all files
        const fileContents = await Promise.all(affectedFiles.map(async (filePath) => {
            const fullPath = path.join(this.workspaceRoot, filePath);
            try {
                const content = await fs.readFile(fullPath, 'utf-8');
                return { filePath, content, exists: true };
            }
            catch {
                return { filePath, content: '', exists: false };
            }
        }));
        // Build prompt for AI
        const prompt = `You are editing multiple files simultaneously. Analyze the request and generate coordinated edits.

**Request**: ${request}

**Files to edit**:
${fileContents.map(f => `
File: ${f.filePath}
Exists: ${f.exists}
Current content:
\`\`\`
${f.content.substring(0, 1000)}${f.content.length > 1000 ? '...' : ''}
\`\`\`
`).join('\n')}

Generate edits in this JSON format:
{
 "edits": [
 {
 "filePath": "path/to/file.ts",
 "operation": "create" | "modify" | "delete",
 "newContent": "full file content",
 "reason": "why this change is needed"
 }
 ]
}

Ensure all edits are coordinated and maintain consistency across files.`;
        const response = await this.orchestrator.sendRequest({
            messages: [
                { role: 'system', content: 'You are an expert code editor. Generate coordinated multi-file edits.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3
        }, { complexity: modelRouter_1.TaskComplexity.MODERATE });
        // Parse response
        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse edit plan from AI response');
        }
        const plan = JSON.parse(jsonMatch[0]);
        const edits = [];
        for (const edit of plan.edits) {
            const fileContent = fileContents.find(f => f.filePath === edit.filePath);
            edits.push({
                filePath: edit.filePath,
                originalContent: fileContent?.content || '',
                newContent: edit.newContent,
                operation: edit.operation,
                reason: edit.reason
            });
        }
        return edits;
    }
    /**
    * Analyze dependencies between files
    */
    async analyzeDependencies(files) {
        const dependencies = [];
        for (const filePath of files) {
            const fullPath = path.join(this.workspaceRoot, filePath);
            try {
                const content = await fs.readFile(fullPath, 'utf-8');
                // Extract imports (simple regex-based)
                const importRegex = /import\s+.*\s+from\s+['"](.+)['"]/g;
                let match;
                while ((match = importRegex.exec(content)) !== null) {
                    const importPath = match[1];
                    // Resolve relative imports
                    if (importPath.startsWith('.')) {
                        const resolvedPath = path.join(path.dirname(filePath), importPath);
                        dependencies.push({
                            from: filePath,
                            to: resolvedPath,
                            type: 'import'
                        });
                    }
                }
                // Extract extends/implements
                const extendsRegex = /class\s+\w+\s+extends\s+(\w+)/g;
                while ((match = extendsRegex.exec(content)) !== null) {
                    dependencies.push({
                        from: filePath,
                        to: match[1],
                        type: 'extends'
                    });
                }
                const implementsRegex = /class\s+\w+\s+implements\s+(\w+)/g;
                while ((match = implementsRegex.exec(content)) !== null) {
                    dependencies.push({
                        from: filePath,
                        to: match[1],
                        type: 'implements'
                    });
                }
            }
            catch (error) {
                logger.warn(`Failed to analyze dependencies for ${filePath}:`, error);
            }
        }
        return dependencies;
    }
    /**
    * Detect conflicts between edits
    */
    detectConflicts(edits) {
        const conflicts = [];
        // Check for duplicate file edits
        const fileEditCounts = new Map();
        for (const edit of edits) {
            const count = fileEditCounts.get(edit.filePath) || 0;
            fileEditCounts.set(edit.filePath, count + 1);
        }
        for (const [filePath, count] of fileEditCounts.entries()) {
            if (count > 1) {
                conflicts.push(`Multiple edits for file: ${filePath}`);
            }
        }
        // Check for delete operations on files with dependencies
        const deleteOps = edits.filter(e => e.operation === 'delete');
        for (const deleteOp of deleteOps) {
            const hasReferences = edits.some(e => e.filePath !== deleteOp.filePath &&
                e.newContent.includes(deleteOp.filePath));
            if (hasReferences) {
                conflicts.push(`Deleting ${deleteOp.filePath} but it's still referenced`);
            }
        }
        return conflicts;
    }
    /**
    * Apply edits with preview
    */
    async applyEdits(edits, preview = true) {
        logger.info(`Applying ${edits.length} file edits...`);
        // Detect conflicts
        const conflicts = this.detectConflicts(edits);
        if (conflicts.length > 0 && !preview) {
            return {
                edits,
                dependencies: [],
                conflicts,
                success: false,
                filesModified: 0
            };
        }
        // Analyze dependencies
        const dependencies = await this.analyzeDependencies(edits.map(e => e.filePath));
        if (preview) {
            // Show preview in VS Code
            await this.showEditPreview(edits);
            return {
                edits,
                dependencies,
                conflicts,
                success: true,
                filesModified: 0
            };
        }
        // Apply edits
        let filesModified = 0;
        for (const edit of edits) {
            try {
                const fullPath = path.join(this.workspaceRoot, edit.filePath);
                if (edit.operation === 'delete') {
                    await fs.unlink(fullPath);
                    logger.info(` Deleted: ${edit.filePath}`);
                }
                else if (edit.operation === 'create' || edit.operation === 'modify') {
                    // Ensure directory exists
                    await fs.mkdir(path.dirname(fullPath), { recursive: true });
                    await fs.writeFile(fullPath, edit.newContent, 'utf-8');
                    logger.info(`${edit.operation === 'create' ? 'Created' : 'Modified'}: ${edit.filePath}`);
                }
                filesModified++;
            }
            catch (error) {
                logger.error(`Failed to apply edit to ${edit.filePath}:`, error);
            }
        }
        return {
            edits,
            dependencies,
            conflicts,
            success: true,
            filesModified
        };
    }
    /**
    * Show edit preview in VS Code
    */
    async showEditPreview(edits) {
        for (const edit of edits) {
            if (edit.operation === 'delete') {
                vscode.window.showInformationMessage(`Will delete: ${edit.filePath}`);
                continue;
            }
            // Create temporary file for diff
            const fullPath = path.join(this.workspaceRoot, edit.filePath);
            const tempPath = fullPath + '.new';
            try {
                await fs.writeFile(tempPath, edit.newContent, 'utf-8');
                // Open diff editor
                const originalUri = vscode.Uri.file(fullPath);
                const modifiedUri = vscode.Uri.file(tempPath);
                await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, `${edit.filePath} (${edit.operation})`);
                // Clean up temp file after a delay
                setTimeout(async () => {
                    try {
                        await fs.unlink(tempPath);
                    }
                    catch { }
                }, 30000);
            }
            catch (error) {
                logger.error(`Failed to show preview for ${edit.filePath}:`, error);
            }
        }
    }
    /**
    * Stage edits for later application
    */
    stageEdit(edit) {
        this.pendingEdits.set(edit.filePath, edit);
    }
    /**
    * Get all pending edits
    */
    getPendingEdits() {
        return Array.from(this.pendingEdits.values());
    }
    /**
    * Clear pending edits
    */
    clearPendingEdits() {
        this.pendingEdits.clear();
    }
    /**
    * Apply all pending edits
    */
    async applyPendingEdits() {
        const edits = this.getPendingEdits();
        const result = await this.applyEdits(edits, false);
        if (result.success) {
            this.clearPendingEdits();
        }
        return result;
    }
}
exports.MultiFileEditor = MultiFileEditor;
//# sourceMappingURL=multiFileEditor.js.map