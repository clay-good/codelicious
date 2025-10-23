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

import * as ts from 'typescript';
import { Symbol, SymbolKind, Position, Range } from '../types';

export interface ASTSymbol extends Symbol {
 // Enhanced symbol with relationships
 parent?: string; // Parent symbol name (for methods in classes)
 children?: string[]; // Child symbols (methods in a class)
 calls?: string[]; // Functions/methods this symbol calls
 calledBy?: string[]; // Functions/methods that call this symbol
 inherits?: string[]; // Classes this class extends
 implements?: string[]; // Interfaces this class implements
 usedBy?: string[]; // Symbols that use this symbol
 uses?: string[]; // Symbols this symbol uses
 complexity?: number; // Cyclomatic complexity
 parameters?: ParameterInfo[];
 returnType?: string;
 isAsync?: boolean;
 isExported?: boolean;
 isAbstract?: boolean;
 decorators?: string[];
 documentation?: string;
}

export interface ParameterInfo {
 name: string;
 type?: string;
 optional?: boolean;
 defaultValue?: string;
}

export interface ASTAnalysisResult {
 symbols: ASTSymbol[];
 relationships: SymbolRelationship[];
 hierarchy: SymbolHierarchy;
 imports: ImportInfo[];
 exports: ExportInfo[];
}

export interface SymbolRelationship {
 from: string; // Source symbol name
 to: string; // Target symbol name
 type: 'calls' | 'inherits' | 'implements' | 'uses' | 'contains';
 confidence: number; // 0-1
}

export interface SymbolHierarchy {
 root: string; // File path
 children: HierarchyNode[];
}

export interface HierarchyNode {
 name: string;
 kind: SymbolKind;
 children: HierarchyNode[];
 startLine: number;
 endLine: number;
}

export interface ImportInfo {
 module: string;
 names: string[];
 isDefault?: boolean;
 alias?: string;
}

export interface ExportInfo {
 name: string;
 kind: SymbolKind;
 isDefault?: boolean;
}

export class ASTAnalyzer {
 /**
 * Analyze code and extract symbols with relationships
 */
 async analyze(
 content: string,
 filePath: string,
 language: string
 ): Promise<ASTAnalysisResult> {
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
 private analyzeTypeScript(content: string, filePath: string): ASTAnalysisResult {
 const sourceFile = ts.createSourceFile(
 filePath,
 content,
 ts.ScriptTarget.Latest,
 true
 );

 const symbols: ASTSymbol[] = [];
 const relationships: SymbolRelationship[] = [];
 const imports: ImportInfo[] = [];
 const exports: ExportInfo[] = [];
 const hierarchy: SymbolHierarchy = {
 root: filePath,
 children: []
 };

 // Track current context for relationship detection
 const context = {
 currentClass: undefined as string | undefined,
 currentFunction: undefined as string | undefined,
 symbolMap: new Map<string, ASTSymbol>()
 };

 const visit = (node: ts.Node) => {
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
 private parseClass(
 node: ts.ClassDeclaration,
 sourceFile: ts.SourceFile,
 context: unknown
 ): ASTSymbol {
 const name = node.name!.getText(sourceFile);
 const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
 const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

 const symbol: ASTSymbol = {
 name,
 kind: SymbolKind.CLASS,
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
 } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
 symbol.implements = clause.types.map(t => t.expression.getText(sourceFile));
 }
 }
 }

 return symbol;
 }

 /**
 * Parse function declaration
 */
 private parseFunction(
 node: ts.FunctionDeclaration,
 sourceFile: ts.SourceFile,
 context: unknown
 ): ASTSymbol {
 const name = node.name!.getText(sourceFile);
 const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
 const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

 const symbol: ASTSymbol = {
 name,
 kind: SymbolKind.FUNCTION,
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
 private parseMethod(
 node: ts.MethodDeclaration,
 sourceFile: ts.SourceFile,
 context: unknown
 ): ASTSymbol {
 const name = node.name.getText(sourceFile);
 const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
 const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

 const ctx = context && typeof context === 'object' && 'currentClass' in context ? context as { currentClass?: string } : {};
 const symbol: ASTSymbol = {
 name,
 kind: SymbolKind.METHOD,
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
 private parseInterface(
 node: ts.InterfaceDeclaration,
 sourceFile: ts.SourceFile,
 context: unknown
 ): ASTSymbol {
 const name = node.name.getText(sourceFile);
 const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
 const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

 const symbol: ASTSymbol = {
 name,
 kind: SymbolKind.INTERFACE,
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
 private parseImport(node: ts.ImportDeclaration, imports: ImportInfo[]): void {
 const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;

 if (node.importClause) {
 const names: string[] = [];
 let isDefault = false;
 let alias: string | undefined;

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
 } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
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
 private parseExport(node: ts.Node, exports: ExportInfo[]): void {
 if (ts.isClassDeclaration(node) && node.name) {
 exports.push({
 name: node.name.text,
 kind: SymbolKind.CLASS,
 isDefault: this.hasDefaultModifier(node)
 });
 } else if (ts.isFunctionDeclaration(node) && node.name) {
 exports.push({
 name: node.name.text,
 kind: SymbolKind.FUNCTION,
 isDefault: this.hasDefaultModifier(node)
 });
 } else if (ts.isInterfaceDeclaration(node)) {
 exports.push({
 name: node.name.text,
 kind: SymbolKind.INTERFACE,
 isDefault: false
 });
 }
 }

 /**
 * Detect function call
 */
 private detectFunctionCall(
 node: ts.CallExpression,
 context: unknown,
 relationships: SymbolRelationship[]
 ): void {
 const callee = node.expression.getText();
 const ctx = context && typeof context === 'object' ? context as { currentFunction?: string; currentClass?: string } : {};
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
 private parseParameters(
 parameters: ts.NodeArray<ts.ParameterDeclaration>,
 sourceFile: ts.SourceFile
 ): ParameterInfo[] {
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
 private calculateComplexity(node: ts.Node): number {
 let complexity = 1; // Base complexity

 const visit = (n: ts.Node) => {
 // Count decision points
 if (
 ts.isIfStatement(n) ||
 ts.isConditionalExpression(n) ||
 ts.isForStatement(n) ||
 ts.isForInStatement(n) ||
 ts.isForOfStatement(n) ||
 ts.isWhileStatement(n) ||
 ts.isDoStatement(n) ||
 ts.isCaseClause(n) ||
 ts.isCatchClause(n)
 ) {
 complexity++;
 }

 // Count logical operators
 if (ts.isBinaryExpression(n)) {
 if (
 n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
 n.operatorToken.kind === ts.SyntaxKind.BarBarToken
 ) {
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
 private hasExportModifier(node: ts.Node): boolean {
 if (!ts.canHaveModifiers(node)) {
 return false;
 }
 const modifiers = ts.getModifiers(node);
 return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
 }

 /**
 * Check if node has default modifier
 */
 private hasDefaultModifier(node: ts.Node): boolean {
 if (!ts.canHaveModifiers(node)) {
 return false;
 }
 const modifiers = ts.getModifiers(node);
 return modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) ?? false;
 }

 /**
 * Check if node has abstract modifier
 */
 private hasAbstractModifier(node: ts.Node): boolean {
 if (!ts.canHaveModifiers(node)) {
 return false;
 }
 const modifiers = ts.getModifiers(node);
 return modifiers?.some(m => m.kind === ts.SyntaxKind.AbstractKeyword) ?? false;
 }

 /**
 * Check if node has async modifier
 */
 private hasAsyncModifier(node: ts.Node): boolean {
 if (!ts.canHaveModifiers(node)) {
 return false;
 }
 const modifiers = ts.getModifiers(node);
 return modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
 }

 /**
 * Check if node is export declaration
 */
 private isExportDeclaration(node: ts.Node): boolean {
 return this.hasExportModifier(node) && (
 ts.isClassDeclaration(node) ||
 ts.isFunctionDeclaration(node) ||
 ts.isInterfaceDeclaration(node) ||
 ts.isVariableStatement(node)
 );
 }

 /**
 * Get decorators from node
 */
 private getDecorators(node: ts.Node, sourceFile: ts.SourceFile): string[] {
 if (!ts.canHaveDecorators(node)) {
 return [];
 }
 const decorators = ts.getDecorators(node);
 return decorators?.map(d => d.getText(sourceFile)) ?? [];
 }

 /**
 * Get JSDoc documentation
 */
 private getDocumentation(node: ts.Node, sourceFile: ts.SourceFile): string | undefined {
 const jsDoc = (node as any).jsDoc;
 if (jsDoc && jsDoc.length > 0) {
 return jsDoc[0].comment;
 }
 return undefined;
 }

 /**
 * Build hierarchy from symbols
 */
 private buildHierarchy(symbols: ASTSymbol[]): HierarchyNode[] {
 const nodes: HierarchyNode[] = [];
 const nodeMap = new Map<string, HierarchyNode>();

 // Create nodes for all symbols
 for (const symbol of symbols) {
 const node: HierarchyNode = {
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
 if (!node) continue;

 if (symbol.parent) {
 const parentNode = nodeMap.get(symbol.parent);
 if (parentNode) {
 parentNode.children.push(node);
 } else {
 nodes.push(node);
 }
 } else {
 nodes.push(node);
 }
 }

 return nodes;
 }

 /**
 * Resolve relationships between symbols
 */
 private resolveRelationships(
 symbols: ASTSymbol[],
 relationships: SymbolRelationship[],
 symbolMap: Map<string, ASTSymbol>
 ): void {
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
 private analyzePython(content: string, filePath: string): ASTAnalysisResult {
 const symbols: ASTSymbol[] = [];
 const relationships: SymbolRelationship[] = [];
 const imports: ImportInfo[] = [];
 const exports: ExportInfo[] = [];

 // Parse classes
 const classRegex = /^class\s+(\w+)(?:\(([^)]+)\))?:/gm;
 let match;
 while ((match = classRegex.exec(content)) !== null) {
 const lineNumber = content.substring(0, match.index).split('\n').length - 1;
 const symbol: ASTSymbol = {
 name: match[1],
 kind: SymbolKind.CLASS,
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
 const symbol: ASTSymbol = {
 name: match[1],
 kind: SymbolKind.FUNCTION,
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
 private analyzeRust(content: string, filePath: string): ASTAnalysisResult {
 const symbols: ASTSymbol[] = [];
 const relationships: SymbolRelationship[] = [];
 const imports: ImportInfo[] = [];
 const exports: ExportInfo[] = [];

 // Parse structs
 const structRegex = /^(?:pub\s+)?struct\s+(\w+)/gm;
 let match;
 while ((match = structRegex.exec(content)) !== null) {
 const lineNumber = content.substring(0, match.index).split('\n').length - 1;
 symbols.push({
 name: match[1],
 kind: SymbolKind.CLASS,
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
 kind: SymbolKind.FUNCTION,
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
 private analyzeGo(content: string, filePath: string): ASTAnalysisResult {
 const symbols: ASTSymbol[] = [];
 const relationships: SymbolRelationship[] = [];
 const imports: ImportInfo[] = [];
 const exports: ExportInfo[] = [];

 // Parse structs
 const structRegex = /^type\s+(\w+)\s+struct/gm;
 let match;
 while ((match = structRegex.exec(content)) !== null) {
 const lineNumber = content.substring(0, match.index).split('\n').length - 1;
 symbols.push({
 name: match[1],
 kind: SymbolKind.CLASS,
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
 kind: SymbolKind.FUNCTION,
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
 private analyzeJava(content: string, filePath: string): ASTAnalysisResult {
 const symbols: ASTSymbol[] = [];
 const relationships: SymbolRelationship[] = [];
 const imports: ImportInfo[] = [];
 const exports: ExportInfo[] = [];

 // Parse classes
 const classRegex = /^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm;
 let match;
 while ((match = classRegex.exec(content)) !== null) {
 const lineNumber = content.substring(0, match.index).split('\n').length - 1;
 symbols.push({
 name: match[1],
 kind: SymbolKind.CLASS,
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
 kind: SymbolKind.METHOD,
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
 private analyzeGeneric(content: string, filePath: string, language: string): ASTAnalysisResult {
 return {
 symbols: [],
 relationships: [],
 hierarchy: { root: filePath, children: [] },
 imports: [],
 exports: []
 };
 }
}

