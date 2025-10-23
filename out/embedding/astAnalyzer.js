"use strict";
/**
 * Enhanced AST Analyzer - Multi-language AST parsing with relationship detection
 *
 * Features:
 * - TypeScript/JavaScript AST parsing with TypeScript compiler API
 * - Python AST parsing (regex-based for now, can be enhanced with tree-sitter)
 * - Rust, Go, Java parsing (regex-based for now, can be enhanced with tree-sitter)
 * - Relationship detection (calls, inheritance, composition, dependencies)
 * - Hierarchical structure extraction
 * - Cross-reference tracking
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
exports.ASTAnalyzer = void 0;
const ts = __importStar(require("typescript"));
const types_1 = require("../types");
class ASTAnalyzer {
    /**
    * Analyze code and extract symbols with relationships
    */
    async analyze(content, filePath, language) {
        switch (language) {
            case 'typescript':
            case 'javascript':
                return this.analyzeTypeScript(content, filePath);
            case 'python':
                return this.analyzePython(content, filePath);
            case 'rust':
                return this.analyzeRust(content, filePath);
            case 'go':
                return this.analyzeGo(content, filePath);
            case 'java':
                return this.analyzeJava(content, filePath);
            default:
                return this.analyzeGeneric(content, filePath, language);
        }
    }
    /**
    * Analyze TypeScript/JavaScript using TypeScript compiler API
    */
    analyzeTypeScript(content, filePath) {
        const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
        const symbols = [];
        const relationships = [];
        const imports = [];
        const exports = [];
        const hierarchy = {
            root: filePath,
            children: []
        };
        // Track current context for relationship detection
        const context = {
            currentClass: undefined,
            currentFunction: undefined,
            symbolMap: new Map()
        };
        const visit = (node) => {
            // Parse imports
            if (ts.isImportDeclaration(node)) {
                this.parseImport(node, imports);
            }
            // Parse exports
            if (this.isExportDeclaration(node)) {
                this.parseExport(node, exports);
            }
            // Parse class declarations
            if (ts.isClassDeclaration(node) && node.name) {
                const symbol = this.parseClass(node, sourceFile, context);
                symbols.push(symbol);
                context.symbolMap.set(symbol.name, symbol);
                const oldClass = context.currentClass;
                context.currentClass = symbol.name;
                ts.forEachChild(node, visit);
                context.currentClass = oldClass;
                return;
            }
            // Parse function declarations
            if (ts.isFunctionDeclaration(node) && node.name) {
                const symbol = this.parseFunction(node, sourceFile, context);
                symbols.push(symbol);
                context.symbolMap.set(symbol.name, symbol);
                const oldFunction = context.currentFunction;
                context.currentFunction = symbol.name;
                ts.forEachChild(node, visit);
                context.currentFunction = oldFunction;
                return;
            }
            // Parse method declarations
            if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
                const symbol = this.parseMethod(node, sourceFile, context);
                symbols.push(symbol);
                context.symbolMap.set(symbol.name, symbol);
                const oldFunction = context.currentFunction;
                context.currentFunction = symbol.name;
                ts.forEachChild(node, visit);
                context.currentFunction = oldFunction;
                return;
            }
            // Parse interface declarations
            if (ts.isInterfaceDeclaration(node)) {
                const symbol = this.parseInterface(node, sourceFile, context);
                symbols.push(symbol);
                context.symbolMap.set(symbol.name, symbol);
            }
            // Detect function calls
            if (ts.isCallExpression(node)) {
                this.detectFunctionCall(node, context, relationships);
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        // Build hierarchy
        hierarchy.children = this.buildHierarchy(symbols);
        // Resolve relationships
        this.resolveRelationships(symbols, relationships, context.symbolMap);
        return {
            symbols,
            relationships,
            hierarchy,
            imports,
            exports
        };
    }
    /**
    * Parse class declaration
    */
    parseClass(node, sourceFile, context) {
        const name = node.name.getText(sourceFile);
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const symbol = {
            name,
            kind: types_1.SymbolKind.CLASS,
            range: {
                start: { line: pos.line, character: pos.character },
                end: { line: end.line, character: end.character }
            },
            children: [],
            inherits: [],
            implements: [],
            isExported: this.hasExportModifier(node),
            isAbstract: this.hasAbstractModifier(node),
            decorators: this.getDecorators(node, sourceFile),
            documentation: this.getDocumentation(node, sourceFile)
        };
        // Parse heritage clauses (extends, implements)
        if (node.heritageClauses) {
            for (const clause of node.heritageClauses) {
                if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                    symbol.inherits = clause.types.map(t => t.expression.getText(sourceFile));
                }
                else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
                    symbol.implements = clause.types.map(t => t.expression.getText(sourceFile));
                }
            }
        }
        return symbol;
    }
    /**
    * Parse function declaration
    */
    parseFunction(node, sourceFile, context) {
        const name = node.name.getText(sourceFile);
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const symbol = {
            name,
            kind: types_1.SymbolKind.FUNCTION,
            range: {
                start: { line: pos.line, character: pos.character },
                end: { line: end.line, character: end.character }
            },
            calls: [],
            parameters: this.parseParameters(node.parameters, sourceFile),
            returnType: node.type?.getText(sourceFile),
            isAsync: this.hasAsyncModifier(node),
            isExported: this.hasExportModifier(node),
            complexity: this.calculateComplexity(node),
            documentation: this.getDocumentation(node, sourceFile)
        };
        return symbol;
    }
    /**
    * Parse method declaration
    */
    parseMethod(node, sourceFile, context) {
        const name = node.name.getText(sourceFile);
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const ctx = context && typeof context === 'object' && 'currentClass' in context ? context : {};
        const symbol = {
            name,
            kind: types_1.SymbolKind.METHOD,
            range: {
                start: { line: pos.line, character: pos.character },
                end: { line: end.line, character: end.character }
            },
            parent: ctx.currentClass,
            calls: [],
            parameters: this.parseParameters(node.parameters, sourceFile),
            returnType: node.type?.getText(sourceFile),
            isAsync: this.hasAsyncModifier(node),
            complexity: this.calculateComplexity(node),
            documentation: this.getDocumentation(node, sourceFile)
        };
        return symbol;
    }
    /**
    * Parse interface declaration
    */
    parseInterface(node, sourceFile, context) {
        const name = node.name.getText(sourceFile);
        const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        const symbol = {
            name,
            kind: types_1.SymbolKind.INTERFACE,
            range: {
                start: { line: pos.line, character: pos.character },
                end: { line: end.line, character: end.character }
            },
            inherits: [],
            isExported: this.hasExportModifier(node),
            documentation: this.getDocumentation(node, sourceFile)
        };
        // Parse heritage clauses (extends)
        if (node.heritageClauses) {
            for (const clause of node.heritageClauses) {
                if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
                    symbol.inherits = clause.types.map(t => t.expression.getText(sourceFile));
                }
            }
        }
        return symbol;
    }
    /**
    * Parse import declaration
    */
    parseImport(node, imports) {
        const moduleSpecifier = node.moduleSpecifier.text;
        if (node.importClause) {
            const names = [];
            let isDefault = false;
            let alias;
            // Default import
            if (node.importClause.name) {
                names.push(node.importClause.name.text);
                isDefault = true;
            }
            // Named imports
            if (node.importClause.namedBindings) {
                if (ts.isNamedImports(node.importClause.namedBindings)) {
                    for (const element of node.importClause.namedBindings.elements) {
                        names.push(element.name.text);
                        if (element.propertyName) {
                            alias = element.name.text;
                        }
                    }
                }
                else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                    names.push(node.importClause.namedBindings.name.text);
                    alias = node.importClause.namedBindings.name.text;
                }
            }
            imports.push({
                module: moduleSpecifier,
                names,
                isDefault,
                alias
            });
        }
    }
    /**
    * Parse export declaration
    */
    parseExport(node, exports) {
        if (ts.isClassDeclaration(node) && node.name) {
            exports.push({
                name: node.name.text,
                kind: types_1.SymbolKind.CLASS,
                isDefault: this.hasDefaultModifier(node)
            });
        }
        else if (ts.isFunctionDeclaration(node) && node.name) {
            exports.push({
                name: node.name.text,
                kind: types_1.SymbolKind.FUNCTION,
                isDefault: this.hasDefaultModifier(node)
            });
        }
        else if (ts.isInterfaceDeclaration(node)) {
            exports.push({
                name: node.name.text,
                kind: types_1.SymbolKind.INTERFACE,
                isDefault: false
            });
        }
    }
    /**
    * Detect function call
    */
    detectFunctionCall(node, context, relationships) {
        const callee = node.expression.getText();
        const ctx = context && typeof context === 'object' ? context : {};
        const caller = ctx.currentFunction || ctx.currentClass;
        if (caller) {
            relationships.push({
                from: caller,
                to: callee,
                type: 'calls',
                confidence: 0.9
            });
        }
    }
    /**
    * Parse parameters
    */
    parseParameters(parameters, sourceFile) {
        return parameters.map(param => ({
            name: param.name.getText(sourceFile),
            type: param.type?.getText(sourceFile),
            optional: !!param.questionToken,
            defaultValue: param.initializer?.getText(sourceFile)
        }));
    }
    /**
    * Calculate cyclomatic complexity
    */
    calculateComplexity(node) {
        let complexity = 1; // Base complexity
        const visit = (n) => {
            // Count decision points
            if (ts.isIfStatement(n) ||
                ts.isConditionalExpression(n) ||
                ts.isForStatement(n) ||
                ts.isForInStatement(n) ||
                ts.isForOfStatement(n) ||
                ts.isWhileStatement(n) ||
                ts.isDoStatement(n) ||
                ts.isCaseClause(n) ||
                ts.isCatchClause(n)) {
                complexity++;
            }
            // Count logical operators
            if (ts.isBinaryExpression(n)) {
                if (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                    n.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                    complexity++;
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(node);
        return complexity;
    }
    /**
    * Check if node has export modifier
    */
    hasExportModifier(node) {
        if (!ts.canHaveModifiers(node)) {
            return false;
        }
        const modifiers = ts.getModifiers(node);
        return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    }
    /**
    * Check if node has default modifier
    */
    hasDefaultModifier(node) {
        if (!ts.canHaveModifiers(node)) {
            return false;
        }
        const modifiers = ts.getModifiers(node);
        return modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
    }
    /**
    * Check if node has abstract modifier
    */
    hasAbstractModifier(node) {
        if (!ts.canHaveModifiers(node)) {
            return false;
        }
        const modifiers = ts.getModifiers(node);
        return modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword) ?? false;
    }
    /**
    * Check if node has async modifier
    */
    hasAsyncModifier(node) {
        if (!ts.canHaveModifiers(node)) {
            return false;
        }
        const modifiers = ts.getModifiers(node);
        return modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    }
    /**
    * Check if node is export declaration
    */
    isExportDeclaration(node) {
        return this.hasExportModifier(node) && (ts.isClassDeclaration(node) ||
            ts.isFunctionDeclaration(node) ||
            ts.isInterfaceDeclaration(node) ||
            ts.isVariableStatement(node));
    }
    /**
    * Get decorators from node
    */
    getDecorators(node, sourceFile) {
        if (!ts.canHaveDecorators(node)) {
            return [];
        }
        const decorators = ts.getDecorators(node);
        return decorators?.map(d => d.getText(sourceFile)) ?? [];
    }
    /**
    * Get JSDoc documentation
    */
    getDocumentation(node, sourceFile) {
        const jsDoc = node.jsDoc;
        if (jsDoc && jsDoc.length > 0) {
            return jsDoc[0].comment;
        }
        return undefined;
    }
    /**
    * Build hierarchy from symbols
    */
    buildHierarchy(symbols) {
        const nodes = [];
        const nodeMap = new Map();
        // Create nodes for all symbols
        for (const symbol of symbols) {
            const node = {
                name: symbol.name,
                kind: symbol.kind,
                children: [],
                startLine: symbol.range.start.line,
                endLine: symbol.range.end.line
            };
            nodeMap.set(symbol.name, node);
        }
        // Build parent-child relationships
        for (const symbol of symbols) {
            const node = nodeMap.get(symbol.name);
            if (!node)
                continue;
            if (symbol.parent) {
                const parentNode = nodeMap.get(symbol.parent);
                if (parentNode) {
                    parentNode.children.push(node);
                }
                else {
                    nodes.push(node);
                }
            }
            else {
                nodes.push(node);
            }
        }
        return nodes;
    }
    /**
    * Resolve relationships between symbols
    */
    resolveRelationships(symbols, relationships, symbolMap) {
        // Add relationships to symbols
        for (const rel of relationships) {
            const fromSymbol = symbolMap.get(rel.from);
            const toSymbol = symbolMap.get(rel.to);
            if (fromSymbol && toSymbol) {
                if (rel.type === 'calls') {
                    fromSymbol.calls = fromSymbol.calls || [];
                    fromSymbol.calls.push(rel.to);
                    toSymbol.calledBy = toSymbol.calledBy || [];
                    toSymbol.calledBy.push(rel.from);
                }
            }
        }
        // Add inheritance relationships
        for (const symbol of symbols) {
            if (symbol.inherits) {
                for (const parent of symbol.inherits) {
                    relationships.push({
                        from: symbol.name,
                        to: parent,
                        type: 'inherits',
                        confidence: 1.0
                    });
                }
            }
            if (symbol.implements) {
                for (const iface of symbol.implements) {
                    relationships.push({
                        from: symbol.name,
                        to: iface,
                        type: 'implements',
                        confidence: 1.0
                    });
                }
            }
        }
    }
    /**
    * Analyze Python code (regex-based for now)
    */
    analyzePython(content, filePath) {
        const symbols = [];
        const relationships = [];
        const imports = [];
        const exports = [];
        // Parse classes
        const classRegex = /^class\s+(\w+)(?:\(([^)]+)\))?:/gm;
        let match;
        while ((match = classRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length - 1;
            const symbol = {
                name: match[1],
                kind: types_1.SymbolKind.CLASS,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: match[0].length }
                },
                inherits: match[2] ? match[2].split(',').map(s => s.trim()) : []
            };
            symbols.push(symbol);
        }
        // Parse functions
        const functionRegex = /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm;
        while ((match = functionRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length - 1;
            const symbol = {
                name: match[1],
                kind: types_1.SymbolKind.FUNCTION,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: match[0].length }
                },
                isAsync: match[0].startsWith('async')
            };
            symbols.push(symbol);
        }
        // Parse imports
        const importRegex = /^(?:from\s+([\w.]+)\s+)?import\s+(.+)/gm;
        while ((match = importRegex.exec(content)) !== null) {
            const module = match[1] || match[2].split(',')[0].trim();
            const names = match[2].split(',').map(s => s.trim());
            imports.push({ module, names });
        }
        return {
            symbols,
            relationships,
            hierarchy: { root: filePath, children: this.buildHierarchy(symbols) },
            imports,
            exports
        };
    }
    /**
    * Analyze Rust code (regex-based for now)
    */
    analyzeRust(content, filePath) {
        const symbols = [];
        const relationships = [];
        const imports = [];
        const exports = [];
        // Parse structs
        const structRegex = /^(?:pub\s+)?struct\s+(\w+)/gm;
        let match;
        while ((match = structRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length - 1;
            symbols.push({
                name: match[1],
                kind: types_1.SymbolKind.CLASS,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: match[0].length }
                },
                isExported: match[0].includes('pub')
            });
        }
        // Parse functions
        const functionRegex = /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm;
        while ((match = functionRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length - 1;
            symbols.push({
                name: match[1],
                kind: types_1.SymbolKind.FUNCTION,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: match[0].length }
                },
                isAsync: match[0].includes('async'),
                isExported: match[0].includes('pub')
            });
        }
        // Parse use statements
        const useRegex = /^use\s+([^;]+);/gm;
        while ((match = useRegex.exec(content)) !== null) {
            imports.push({ module: match[1], names: [match[1]] });
        }
        return {
            symbols,
            relationships,
            hierarchy: { root: filePath, children: this.buildHierarchy(symbols) },
            imports,
            exports
        };
    }
    /**
    * Analyze Go code (regex-based for now)
    */
    analyzeGo(content, filePath) {
        const symbols = [];
        const relationships = [];
        const imports = [];
        const exports = [];
        // Parse structs
        const structRegex = /^type\s+(\w+)\s+struct/gm;
        let match;
        while ((match = structRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length - 1;
            symbols.push({
                name: match[1],
                kind: types_1.SymbolKind.CLASS,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: match[0].length }
                },
                isExported: /^[A-Z]/.test(match[1])
            });
        }
        // Parse functions
        const functionRegex = /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm;
        while ((match = functionRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length - 1;
            symbols.push({
                name: match[1],
                kind: types_1.SymbolKind.FUNCTION,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: match[0].length }
                },
                isExported: /^[A-Z]/.test(match[1])
            });
        }
        // Parse imports
        const importRegex = /^import\s+(?:"([^"]+)"|(\([^)]+\)))/gm;
        while ((match = importRegex.exec(content)) !== null) {
            if (match[1]) {
                imports.push({ module: match[1], names: [match[1]] });
            }
        }
        return {
            symbols,
            relationships,
            hierarchy: { root: filePath, children: this.buildHierarchy(symbols) },
            imports,
            exports
        };
    }
    /**
    * Analyze Java code (regex-based for now)
    */
    analyzeJava(content, filePath) {
        const symbols = [];
        const relationships = [];
        const imports = [];
        const exports = [];
        // Parse classes
        const classRegex = /^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm;
        let match;
        while ((match = classRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length - 1;
            symbols.push({
                name: match[1],
                kind: types_1.SymbolKind.CLASS,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: match[0].length }
                },
                inherits: match[2] ? [match[2]] : [],
                implements: match[3] ? match[3].split(',').map(s => s.trim()) : [],
                isExported: match[0].includes('public'),
                isAbstract: match[0].includes('abstract')
            });
        }
        // Parse methods
        const methodRegex = /^(?:public|private|protected)?\s+(?:static\s+)?(?:\w+)\s+(\w+)\s*\(/gm;
        while ((match = methodRegex.exec(content)) !== null) {
            const lineNumber = content.substring(0, match.index).split('\n').length - 1;
            symbols.push({
                name: match[1],
                kind: types_1.SymbolKind.METHOD,
                range: {
                    start: { line: lineNumber, character: 0 },
                    end: { line: lineNumber, character: match[0].length }
                }
            });
        }
        // Parse imports
        const importRegex = /^import\s+([^;]+);/gm;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push({ module: match[1], names: [match[1].split('.').pop() || match[1]] });
        }
        return {
            symbols,
            relationships,
            hierarchy: { root: filePath, children: this.buildHierarchy(symbols) },
            imports,
            exports
        };
    }
    /**
    * Generic analyzer for unsupported languages
    */
    analyzeGeneric(content, filePath, language) {
        return {
            symbols: [],
            relationships: [],
            hierarchy: { root: filePath, children: [] },
            imports: [],
            exports: []
        };
    }
}
exports.ASTAnalyzer = ASTAnalyzer;
//# sourceMappingURL=astAnalyzer.js.map