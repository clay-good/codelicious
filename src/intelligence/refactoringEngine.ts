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
import * as fs from 'fs';
import * as path from 'path';

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

export class RefactoringEngine {
 constructor(
 private readonly workspaceRoot: string
 ) {}

 /**
 * Extract method from selection
 */
 async extractMethod(
 document: vscode.TextDocument,
 selection: vscode.Range,
 methodName: string
 ): Promise<RefactoringResult> {
 const selectedText = document.getText(selection);

 // Analyze selected code
 const variables = this.extractVariables(selectedText);
 const parameters = variables.filter(v => this.isUsedBefore(document, selection, v));
 const returnValue = this.detectReturnValue(selectedText);

 // Generate method signature
 const paramList = parameters.join(', ');
 const returnType = returnValue ? ': any' : ': void';

 // Generate new method
 const newMethod = this.generateMethod(
 methodName,
 paramList,
 returnType,
 selectedText,
 returnValue
 );

 // Generate method call
 const methodCall = returnValue
 ? `const result = ${methodName}(${paramList});`
 : `${methodName}(${paramList});`;

 const operations: RefactoringOperation[] = [
 {
 type: 'extract-method',
 description: `Extract method '${methodName}'`,
 range: selection,
 newCode: methodCall,
 preview: newMethod
 }
 ];

 return {
 success: true,
 operations,
 message: `Extracted method '${methodName}' successfully`
 };
 }

 /**
 * Extract variable from expression
 */
 async extractVariable(
 document: vscode.TextDocument,
 selection: vscode.Range,
 variableName: string
 ): Promise<RefactoringResult> {
 const selectedText = document.getText(selection);

 // Generate variable declaration
 const declaration = `const ${variableName} = ${selectedText};`;

 // Find all occurrences of the expression
 const occurrences = this.findOccurrences(document, selectedText);

 const operations: RefactoringOperation[] = [
 {
 type: 'extract-variable',
 description: `Extract variable '${variableName}'`,
 range: selection,
 newCode: variableName,
 preview: declaration
 }
 ];

 return {
 success: true,
 operations,
 message: `Extracted variable '${variableName}' (${occurrences.length} occurrences)`
 };
 }

 /**
 * Rename symbol
 */
 async renameSymbol(
 document: vscode.TextDocument,
 position: vscode.Position,
 newName: string
 ): Promise<RefactoringResult> {
 const wordRange = document.getWordRangeAtPosition(position);
 if (!wordRange) {
 return {
 success: false,
 operations: [],
 message: 'No symbol found at position'
 };
 }

 const oldName = document.getText(wordRange);
 const occurrences = this.findSymbolOccurrences(document, oldName);

 const operations: RefactoringOperation[] = occurrences.map(range => ({
 type: 'rename',
 description: `Rename '${oldName}' to '${newName}'`,
 range,
 newCode: newName,
 preview: `${oldName} → ${newName}`
 }));

 return {
 success: true,
 operations,
 message: `Renamed '${oldName}' to '${newName}' (${occurrences.length} occurrences)`
 };
 }

 /**
 * Inline variable
 */
 async inlineVariable(
 document: vscode.TextDocument,
 position: vscode.Position
 ): Promise<RefactoringResult> {
 const wordRange = document.getWordRangeAtPosition(position);
 if (!wordRange) {
 return {
 success: false,
 operations: [],
 message: 'No variable found at position'
 };
 }

 const variableName = document.getText(wordRange);
 const declaration = this.findVariableDeclaration(document, variableName);

 if (!declaration) {
 return {
 success: false,
 operations: [],
 message: 'Variable declaration not found'
 };
 }

 const value = this.extractVariableValue(document, declaration);
 const usages = this.findSymbolOccurrences(document, variableName);

 const operations: RefactoringOperation[] = usages.map(range => ({
 type: 'inline',
 description: `Inline variable '${variableName}'`,
 range,
 newCode: value,
 preview: `${variableName} → ${value}`
 }));

 return {
 success: true,
 operations,
 message: `Inlined variable '${variableName}' (${usages.length} usages)`
 };
 }

 /**
 * Convert function to arrow function
 */
 async convertToArrowFunction(
 document: vscode.TextDocument,
 range: vscode.Range
 ): Promise<RefactoringResult> {
 const functionText = document.getText(range);

 // Parse function
 const match = functionText.match(/function\s+(\w+)?\s*\(([^)]*)\)\s*{([\s\S]*)}/);
 if (!match) {
 return {
 success: false,
 operations: [],
 message: 'Not a valid function declaration'
 };
 }

 const [, name, params, body] = match;

 // Generate arrow function
 const arrowFunction = name
 ? `const ${name} = (${params}) => {${body}}`
 : `(${params}) => {${body}}`;

 const operations: RefactoringOperation[] = [
 {
 type: 'convert',
 description: 'Convert to arrow function',
 range,
 newCode: arrowFunction,
 preview: arrowFunction
 }
 ];

 return {
 success: true,
 operations,
 message: 'Converted to arrow function'
 };
 }

 /**
 * Apply refactoring operations
 */
 async applyRefactoring(
 document: vscode.TextDocument,
 operations: RefactoringOperation[]
 ): Promise<boolean> {
 const edit = new vscode.WorkspaceEdit();

 for (const operation of operations) {
 edit.replace(document.uri, operation.range, operation.newCode);
 }

 return await vscode.workspace.applyEdit(edit);
 }

 /**
 * Extract variables from code
 */
 private extractVariables(code: string): string[] {
 const variables: string[] = [];
 const pattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
 let match;

 while ((match = pattern.exec(code)) !== null) {
 const variable = match[1];
 if (!this.isKeyword(variable) && !variables.includes(variable)) {
 variables.push(variable);
 }
 }

 return variables;
 }

 /**
 * Check if variable is used before selection
 */
 private isUsedBefore(
 document: vscode.TextDocument,
 selection: vscode.Range,
 variable: string
 ): boolean {
 const textBefore = document.getText(
 new vscode.Range(new vscode.Position(0, 0), selection.start)
 );
 return textBefore.includes(variable);
 }

 /**
 * Detect return value in code
 */
 private detectReturnValue(code: string): boolean {
 return /\breturn\b/.test(code);
 }

 /**
 * Generate method code
 */
 private generateMethod(
 name: string,
 params: string,
 returnType: string,
 body: string,
 hasReturn: boolean
 ): string {
 const indent = ' ';
 const bodyLines = body.split('\n').map(line => indent + line).join('\n');

 return `
${indent}private ${name}(${params})${returnType} {
${bodyLines}
${indent}}
`;
 }

 /**
 * Find occurrences of text
 */
 private findOccurrences(
 document: vscode.TextDocument,
 text: string
 ): vscode.Range[] {
 const ranges: vscode.Range[] = [];
 const content = document.getText();
 let index = 0;

 while ((index = content.indexOf(text, index)) !== -1) {
 const start = document.positionAt(index);
 const end = document.positionAt(index + text.length);
 ranges.push(new vscode.Range(start, end));
 index += text.length;
 }

 return ranges;
 }

 /**
 * Find symbol occurrences
 */
 private findSymbolOccurrences(
 document: vscode.TextDocument,
 symbol: string
 ): vscode.Range[] {
 const ranges: vscode.Range[] = [];
 const pattern = new RegExp(`\\b${symbol}\\b`, 'g');
 const content = document.getText();
 let match;

 while ((match = pattern.exec(content)) !== null) {
 const start = document.positionAt(match.index);
 const end = document.positionAt(match.index + symbol.length);
 ranges.push(new vscode.Range(start, end));
 }

 return ranges;
 }

 /**
 * Find variable declaration
 */
 private findVariableDeclaration(
 document: vscode.TextDocument,
 variable: string
 ): vscode.Range | null {
 const pattern = new RegExp(`\\b(const|let|var)\\s+${variable}\\s*=`, 'g');
 const content = document.getText();
 const match = pattern.exec(content);

 if (match) {
 const start = document.positionAt(match.index);
 const lineEnd = document.lineAt(start.line).range.end;
 return new vscode.Range(start, lineEnd);
 }

 return null;
 }

 /**
 * Extract variable value from declaration
 */
 private extractVariableValue(
 document: vscode.TextDocument,
 range: vscode.Range
 ): string {
 const declaration = document.getText(range);
 const match = declaration.match(/=\s*(.+?);?$/);
 return match ? match[1].trim() : '';
 }

 /**
 * Check if word is a keyword
 */
 private isKeyword(word: string): boolean {
 const keywords = [
 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break',
 'continue', 'return', 'function', 'const', 'let', 'var', 'class',
 'interface', 'type', 'enum', 'import', 'export', 'from', 'as',
 'async', 'await', 'try', 'catch', 'finally', 'throw', 'new',
 'this', 'super', 'extends', 'implements', 'public', 'private',
 'protected', 'static', 'readonly', 'abstract', 'namespace'
 ];
 return keywords.includes(word);
 }
}

