"use strict";
/**
 * Symbol parser for extracting code symbols
 * Uses regex-based parsing for now, will be enhanced with Tree-sitter later
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTypeScriptSymbols = parseTypeScriptSymbols;
exports.parsePythonSymbols = parsePythonSymbols;
exports.parseTypeScriptImports = parseTypeScriptImports;
exports.parsePythonImports = parsePythonImports;
exports.parseTypeScriptExports = parseTypeScriptExports;
exports.parseSymbols = parseSymbols;
exports.parseImports = parseImports;
exports.parseExports = parseExports;
const types_1 = require("../types");
/**
 * Parse symbols from TypeScript/JavaScript code
 */
function parseTypeScriptSymbols(content, filePath) {
    const symbols = [];
    const lines = content.split('\n');
    // Parse classes
    const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length - 1;
        symbols.push({
            name: match[1],
            kind: types_1.SymbolKind.CLASS,
            range: {
                start: { line: lineNumber, character: match.index },
                end: { line: lineNumber, character: match.index + match[0].length }
            }
        });
    }
    // Parse interfaces
    const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)/gm;
    while ((match = interfaceRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length - 1;
        symbols.push({
            name: match[1],
            kind: types_1.SymbolKind.INTERFACE,
            range: {
                start: { line: lineNumber, character: match.index },
                end: { line: lineNumber, character: match.index + match[0].length }
            }
        });
    }
    // Parse functions
    const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
    while ((match = functionRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length - 1;
        symbols.push({
            name: match[1],
            kind: types_1.SymbolKind.FUNCTION,
            range: {
                start: { line: lineNumber, character: match.index },
                end: { line: lineNumber, character: match.index + match[0].length }
            }
        });
    }
    // Parse arrow functions (const name = () => {})
    const arrowFunctionRegex = /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm;
    while ((match = arrowFunctionRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length - 1;
        symbols.push({
            name: match[1],
            kind: types_1.SymbolKind.FUNCTION,
            range: {
                start: { line: lineNumber, character: match.index },
                end: { line: lineNumber, character: match.index + match[0].length }
            }
        });
    }
    // Parse methods (inside classes)
    const methodRegex = /^\s+(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*[:{]/gm;
    while ((match = methodRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length - 1;
        symbols.push({
            name: match[1],
            kind: types_1.SymbolKind.METHOD,
            range: {
                start: { line: lineNumber, character: match.index },
                end: { line: lineNumber, character: match.index + match[0].length }
            }
        });
    }
    // Parse enums
    const enumRegex = /^(?:export\s+)?enum\s+(\w+)/gm;
    while ((match = enumRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length - 1;
        symbols.push({
            name: match[1],
            kind: types_1.SymbolKind.ENUM,
            range: {
                start: { line: lineNumber, character: match.index },
                end: { line: lineNumber, character: match.index + match[0].length }
            }
        });
    }
    return symbols;
}
/**
 * Parse symbols from Python code
 */
function parsePythonSymbols(content, filePath) {
    const symbols = [];
    // Parse classes
    const classRegex = /^class\s+(\w+)/gm;
    let match;
    while ((match = classRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length - 1;
        symbols.push({
            name: match[1],
            kind: types_1.SymbolKind.CLASS,
            range: {
                start: { line: lineNumber, character: match.index },
                end: { line: lineNumber, character: match.index + match[0].length }
            }
        });
    }
    // Parse functions
    const functionRegex = /^(?:async\s+)?def\s+(\w+)/gm;
    while ((match = functionRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length - 1;
        symbols.push({
            name: match[1],
            kind: types_1.SymbolKind.FUNCTION,
            range: {
                start: { line: lineNumber, character: match.index },
                end: { line: lineNumber, character: match.index + match[0].length }
            }
        });
    }
    return symbols;
}
/**
 * Parse imports from TypeScript/JavaScript
 */
function parseTypeScriptImports(content) {
    const imports = [];
    // Parse ES6 imports
    const importRegex = /import\s+(?:{[^}]+}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
    }
    // Parse require statements
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRegex.exec(content)) !== null) {
        imports.push(match[1]);
    }
    return imports;
}
/**
 * Parse imports from Python
 */
function parsePythonImports(content) {
    const imports = [];
    // Parse import statements
    const importRegex = /^import\s+([\w.]+)/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        imports.push(match[1]);
    }
    // Parse from...import statements
    const fromImportRegex = /^from\s+([\w.]+)\s+import/gm;
    while ((match = fromImportRegex.exec(content)) !== null) {
        imports.push(match[1]);
    }
    return imports;
}
/**
 * Parse exports from TypeScript/JavaScript
 */
function parseTypeScriptExports(content) {
    const exports = [];
    // Parse named exports
    const exportRegex = /export\s+(?:const|let|var|function|class|interface|enum|type)\s+(\w+)/g;
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
        exports.push(match[1]);
    }
    // Parse export { ... }
    const exportBlockRegex = /export\s+{([^}]+)}/g;
    while ((match = exportBlockRegex.exec(content)) !== null) {
        const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]);
        exports.push(...names);
    }
    return exports;
}
/**
 * Parse symbols based on language
 */
function parseSymbols(content, language, filePath) {
    switch (language) {
        case 'typescript':
        case 'javascript':
            return parseTypeScriptSymbols(content, filePath);
        case 'python':
            return parsePythonSymbols(content, filePath);
        default:
            return [];
    }
}
/**
 * Parse imports based on language
 */
function parseImports(content, language) {
    switch (language) {
        case 'typescript':
        case 'javascript':
            return parseTypeScriptImports(content);
        case 'python':
            return parsePythonImports(content);
        default:
            return [];
    }
}
/**
 * Parse exports based on language
 */
function parseExports(content, language) {
    switch (language) {
        case 'typescript':
        case 'javascript':
            return parseTypeScriptExports(content);
        default:
            return [];
    }
}
//# sourceMappingURL=symbolParser.js.map