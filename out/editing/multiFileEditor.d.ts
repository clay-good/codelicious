import { ModelOrchestrator } from '../models/orchestrator';
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
export declare class MultiFileEditor {
    private orchestrator;
    private workspaceRoot;
    private pendingEdits;
    constructor(orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Plan multi-file edits based on user request
    */
    planEdits(request: string, affectedFiles: string[]): Promise<FileEdit[]>;
    /**
    * Analyze dependencies between files
    */
    analyzeDependencies(files: string[]): Promise<FileDependency[]>;
    /**
    * Detect conflicts between edits
    */
    detectConflicts(edits: FileEdit[]): string[];
    /**
    * Apply edits with preview
    */
    applyEdits(edits: FileEdit[], preview?: boolean): Promise<MultiFileEditResult>;
    /**
    * Show edit preview in VS Code
    */
    private showEditPreview;
    /**
    * Stage edits for later application
    */
    stageEdit(edit: FileEdit): void;
    /**
    * Get all pending edits
    */
    getPendingEdits(): FileEdit[];
    /**
    * Clear pending edits
    */
    clearPendingEdits(): void;
    /**
    * Apply all pending edits
    */
    applyPendingEdits(): Promise<MultiFileEditResult>;
}
//# sourceMappingURL=multiFileEditor.d.ts.map