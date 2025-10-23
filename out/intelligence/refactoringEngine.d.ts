/**
 * Refactoring Engine - Automated code refactoring
 *
 * Features:
 * - Extract method/function
 * - Rename symbol
 * - Inline variable
 * - Extract variable
 * - Move to file
 * - Convert to arrow function
 */
import * as vscode from 'vscode';
export interface RefactoringOperation {
    type: 'extract-method' | 'extract-variable' | 'rename' | 'inline' | 'move' | 'convert';
    description: string;
    range: vscode.Range;
    newCode: string;
    preview: string;
}
export interface RefactoringResult {
    success: boolean;
    operations: RefactoringOperation[];
    message: string;
}
export declare class RefactoringEngine {
    private readonly workspaceRoot;
    constructor(workspaceRoot: string);
    /**
    * Extract method from selection
    */
    extractMethod(document: vscode.TextDocument, selection: vscode.Range, methodName: string): Promise<RefactoringResult>;
    /**
    * Extract variable from expression
    */
    extractVariable(document: vscode.TextDocument, selection: vscode.Range, variableName: string): Promise<RefactoringResult>;
    /**
    * Rename symbol
    */
    renameSymbol(document: vscode.TextDocument, position: vscode.Position, newName: string): Promise<RefactoringResult>;
    /**
    * Inline variable
    */
    inlineVariable(document: vscode.TextDocument, position: vscode.Position): Promise<RefactoringResult>;
    /**
    * Convert function to arrow function
    */
    convertToArrowFunction(document: vscode.TextDocument, range: vscode.Range): Promise<RefactoringResult>;
    /**
    * Apply refactoring operations
    */
    applyRefactoring(document: vscode.TextDocument, operations: RefactoringOperation[]): Promise<boolean>;
    /**
    * Extract variables from code
    */
    private extractVariables;
    /**
    * Check if variable is used before selection
    */
    private isUsedBefore;
    /**
    * Detect return value in code
    */
    private detectReturnValue;
    /**
    * Generate method code
    */
    private generateMethod;
    /**
    * Find occurrences of text
    */
    private findOccurrences;
    /**
    * Find symbol occurrences
    */
    private findSymbolOccurrences;
    /**
    * Find variable declaration
    */
    private findVariableDeclaration;
    /**
    * Extract variable value from declaration
    */
    private extractVariableValue;
    /**
    * Check if word is a keyword
    */
    private isKeyword;
}
//# sourceMappingURL=refactoringEngine.d.ts.map