import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ModelOrchestrator } from '../models/orchestrator';
import { TaskComplexity } from '../models/modelRouter';
import { createLogger } from '../utils/logger';

const logger = createLogger('MultiFileEditor');

/**
 * File edit operation
 */
export interface FileEdit {
 filePath: string;
 originalContent: string;
 newContent: string;
 operation: 'create' | 'modify' | 'delete';
 reason: string;
}

/**
 * Dependency between files
 */
export interface FileDependency {
 from: string;
 to: string;
 type: 'import' | 'reference' | 'extends' | 'implements';
}

/**
 * Multi-file edit result
 */
export interface MultiFileEditResult {
 edits: FileEdit[];
 dependencies: FileDependency[];
 conflicts: string[];
 success: boolean;
 filesModified: number;
}

/**
 * Multi-file editor with dependency tracking
 * Enables simultaneous edits across multiple files with conflict detection
 */
export class MultiFileEditor {
 private orchestrator: ModelOrchestrator;
 private workspaceRoot: string;
 private pendingEdits: Map<string, FileEdit> = new Map();

 constructor(orchestrator: ModelOrchestrator, workspaceRoot: string) {
 this.orchestrator = orchestrator;
 this.workspaceRoot = workspaceRoot;
 }

 /**
 * Plan multi-file edits based on user request
 */
 async planEdits(request: string, affectedFiles: string[]): Promise<FileEdit[]> {
 logger.info(` Planning edits for ${affectedFiles.length} files...`);

 // Read current content of all files
 const fileContents = await Promise.all(
 affectedFiles.map(async (filePath) => {
 const fullPath = path.join(this.workspaceRoot, filePath);
 try {
 const content = await fs.readFile(fullPath, 'utf-8');
 return { filePath, content, exists: true };
 } catch {
 return { filePath, content: '', exists: false };
 }
 })
 );

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

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 { role: 'system', content: 'You are an expert code editor. Generate coordinated multi-file edits.' },
 { role: 'user', content: prompt }
 ],
 temperature: 0.3
 },
 { complexity: TaskComplexity.MODERATE }
 );

 // Parse response
 const jsonMatch = response.content.match(/\{[\s\S]*\}/);
 if (!jsonMatch) {
 throw new Error('Failed to parse edit plan from AI response');
 }

 const plan = JSON.parse(jsonMatch[0]);
 const edits: FileEdit[] = [];

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
 async analyzeDependencies(files: string[]): Promise<FileDependency[]> {
 const dependencies: FileDependency[] = [];

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
 } catch (error) {
 logger.warn(`Failed to analyze dependencies for ${filePath}:`, error);
 }
 }

 return dependencies;
 }

 /**
 * Detect conflicts between edits
 */
 detectConflicts(edits: FileEdit[]): string[] {
 const conflicts: string[] = [];

 // Check for duplicate file edits
 const fileEditCounts = new Map<string, number>();
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
 const hasReferences = edits.some(e =>
 e.filePath !== deleteOp.filePath &&
 e.newContent.includes(deleteOp.filePath)
 );
 if (hasReferences) {
 conflicts.push(`Deleting ${deleteOp.filePath} but it's still referenced`);
 }
 }

 return conflicts;
 }

 /**
 * Apply edits with preview
 */
 async applyEdits(edits: FileEdit[], preview: boolean = true): Promise<MultiFileEditResult> {
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
 } else if (edit.operation === 'create' || edit.operation === 'modify') {
 // Ensure directory exists
 await fs.mkdir(path.dirname(fullPath), { recursive: true });
 await fs.writeFile(fullPath, edit.newContent, 'utf-8');
 logger.info(`${edit.operation === 'create' ? 'Created' : 'Modified'}: ${edit.filePath}`);
 }

 filesModified++;
 } catch (error) {
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
 private async showEditPreview(edits: FileEdit[]): Promise<void> {
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

 await vscode.commands.executeCommand(
 'vscode.diff',
 originalUri,
 modifiedUri,
 `${edit.filePath} (${edit.operation})`
 );

 // Clean up temp file after a delay
 setTimeout(async () => {
 try {
 await fs.unlink(tempPath);
 } catch {}
 }, 30000);
 } catch (error) {
 logger.error(`Failed to show preview for ${edit.filePath}:`, error);
 }
 }
 }

 /**
 * Stage edits for later application
 */
 stageEdit(edit: FileEdit): void {
 this.pendingEdits.set(edit.filePath, edit);
 }

 /**
 * Get all pending edits
 */
 getPendingEdits(): FileEdit[] {
 return Array.from(this.pendingEdits.values());
 }

 /**
 * Clear pending edits
 */
 clearPendingEdits(): void {
 this.pendingEdits.clear();
 }

 /**
 * Apply all pending edits
 */
 async applyPendingEdits(): Promise<MultiFileEditResult> {
 const edits = this.getPendingEdits();
 const result = await this.applyEdits(edits, false);
 if (result.success) {
 this.clearPendingEdits();
 }
 return result;
 }
}

