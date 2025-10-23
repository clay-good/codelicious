/**
 * File Attachment Manager - Handle file attachments in chat
 */
export interface AttachedFile {
    path: string;
    name: string;
    relativePath: string;
    language: string;
    size: number;
    content: string;
    preview: string;
}
export declare class FileAttachmentManager {
    private readonly workspaceRoot;
    private attachedFiles;
    private readonly MAX_FILE_SIZE;
    private readonly MAX_FILES;
    private readonly PREVIEW_LENGTH;
    constructor(workspaceRoot: string);
    /**
    * Attach a file by path
    */
    attachFile(filePath: string): Promise<AttachedFile | null>;
    /**
    * Attach multiple files
    */
    attachFiles(filePaths: string[]): Promise<AttachedFile[]>;
    /**
    * Remove attached file
    */
    removeFile(filePath: string): boolean;
    /**
    * Clear all attached files
    */
    clearAll(): void;
    /**
    * Get all attached files
    */
    getAttachedFiles(): AttachedFile[];
    /**
    * Get attached file by path
    */
    getFile(filePath: string): AttachedFile | undefined;
    /**
    * Check if file is attached
    */
    isAttached(filePath: string): boolean;
    /**
    * Get total size of attached files
    */
    getTotalSize(): number;
    /**
    * Get count of attached files
    */
    getCount(): number;
    /**
    * Create preview text from content
    */
    private createPreview;
    /**
    * Format attached files for AI context
    */
    formatForContext(): string;
    /**
    * Show file picker dialog
    */
    showFilePicker(): Promise<AttachedFile[]>;
    /**
    * Attach currently open file
    */
    attachCurrentFile(): Promise<AttachedFile | null>;
    /**
    * Attach selected files from workspace
    */
    attachWorkspaceFiles(): Promise<AttachedFile[]>;
    /**
    * Get file statistics
    */
    getStatistics(): {
        count: number;
        totalSize: number;
        totalSizeMB: string;
        languages: string[];
    };
    /**
    * Validate file for attachment
    */
    validateFile(filePath: string): {
        valid: boolean;
        error?: string;
    };
}
//# sourceMappingURL=fileAttachmentManager.d.ts.map