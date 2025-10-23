"use strict";
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
exports.RefactoringEngine = void 0;
const vscode = __importStar(require("vscode"));
class RefactoringEngine {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Extract method from selection
    */
    async extractMethod(document, selection, methodName) {
        const selectedText = document.getText(selection);
        // Analyze selected code
        const variables = this.extractVariables(selectedText);
        const parameters = variables.filter(v => this.isUsedBefore(document, selection, v));
        const returnValue = this.detectReturnValue(selectedText);
        // Generate method signature
        const paramList = parameters.join(', ');
        const returnType = returnValue ? ': any' : ': void';
        // Generate new method
        const newMethod = this.generateMethod(methodName, paramList, returnType, selectedText, returnValue);
        // Generate method call
        const methodCall = returnValue
            ? `const result = ${methodName}(${paramList});`
            : `${methodName}(${paramList});`;
        const operations = [
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
    async extractVariable(document, selection, variableName) {
        const selectedText = document.getText(selection);
        // Generate variable declaration
        const declaration = `const ${variableName} = ${selectedText};`;
        // Find all occurrences of the expression
        const occurrences = this.findOccurrences(document, selectedText);
        const operations = [
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
    async renameSymbol(document, position, newName) {
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
        const operations = occurrences.map(range => ({
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
    async inlineVariable(document, position) {
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
        const operations = usages.map(range => ({
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
    async convertToArrowFunction(document, range) {
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
        const operations = [
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
    async applyRefactoring(document, operations) {
        const edit = new vscode.WorkspaceEdit();
        for (const operation of operations) {
            edit.replace(document.uri, operation.range, operation.newCode);
        }
        return await vscode.workspace.applyEdit(edit);
    }
    /**
    * Extract variables from code
    */
    extractVariables(code) {
        const variables = [];
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
    isUsedBefore(document, selection, variable) {
        const textBefore = document.getText(new vscode.Range(new vscode.Position(0, 0), selection.start));
        return textBefore.includes(variable);
    }
    /**
    * Detect return value in code
    */
    detectReturnValue(code) {
        return /\breturn\b/.test(code);
    }
    /**
    * Generate method code
    */
    generateMethod(name, params, returnType, body, hasReturn) {
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
    findOccurrences(document, text) {
        const ranges = [];
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
    findSymbolOccurrences(document, symbol) {
        const ranges = [];
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
    findVariableDeclaration(document, variable) {
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
    extractVariableValue(document, range) {
        const declaration = document.getText(range);
        const match = declaration.match(/=\s*(.+?);?$/);
        return match ? match[1].trim() : '';
    }
    /**
    * Check if word is a keyword
    */
    isKeyword(word) {
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
exports.RefactoringEngine = RefactoringEngine;
//# sourceMappingURL=refactoringEngine.js.map