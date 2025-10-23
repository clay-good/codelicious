/**
 * Code Action Handler - Handles apply, explain, and run actions on code blocks
 */
export interface CodeAction {
    type: 'apply' | 'explain' | 'run';
    code: string;
    language: string;
    filePath?: string;
}
export declare class CodeActionHandler {
    private readonly workspaceRoot;
    constructor(workspaceRoot: string);
    /**
    * Apply code to a file with smart detection and diff preview
    */
    applyCode(code: string, language: string, suggestedFileName?: string): Promise<void>;
    /**
    * Detect file path from code comments or structure
    */
    private detectFilePathFromCode;
    /**
    * Suggest file path based on name and language
    */
    private suggestFilePath;
    /**
    * Show diff preview before applying changes
    */
    private showDiffPreview;
    /**
    * Write content to file
    */
    private writeFile;
    /**
    * Open file in editor
    */
    private openFile;
    /**
    * Create a new file with the code
    */
    private createNewFile;
    /**
    * Insert code into current file at cursor position
    */
    private insertIntoCurrentFile;
    /**
    * Replace current selection with code
    */
    private replaceSelection;
    /**
    * Explain code by sending it back to AI
    */
    explainCode(code: string, language: string): Promise<string>;
    /**
    * Run code (for executable languages)
    */
    runCode(code: string, language: string): Promise<void>;
    /**
    * Get file extension for language
    */
    private getFileExtension;
    /**
    * Get command to run code
    */
    private getRunCommand;
}
//# sourceMappingURL=codeActionHandler.d.ts.map