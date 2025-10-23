/**
 * Diff Viewer - Side-by-side diff preview with syntax highlighting
 */
import * as vscode from 'vscode';
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
export declare class DiffViewer {
    private readonly context;
    private panel;
    private diffs;
    private options;
    constructor(context: vscode.ExtensionContext, options?: DiffViewerOptions);
    /**
    * Generate diff for file operations
    */
    generateDiffs(operations: FileOperation[]): FileDiff[];
    /**
    * Generate diff for a single file operation
    */
    private generateFileDiff;
    /**
    * Generate diff lines for create operation
    */
    private generateCreateDiff;
    /**
    * Generate diff lines for delete operation
    */
    private generateDeleteDiff;
    /**
    * Generate diff lines for modify operation using simple line-by-line comparison
    */
    private generateModifyDiff;
    /**
    * Detect language from file path
    */
    private detectLanguage;
    /**
    * Show diff preview in webview
    */
    show(): Promise<boolean>;
    /**
    * Hide diff preview
    */
    hide(): void;
    /**
    * Get webview HTML content
    */
    private getWebviewContent;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=diffViewer.d.ts.map