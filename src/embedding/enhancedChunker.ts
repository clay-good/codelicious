/**
 * Enhanced Code Chunker - Semantic-aware chunking with hierarchical structure
 *
 * Features:
 * - Semantic-aware chunking (respects code boundaries)
 * - Hierarchical structure (file → class → method)
 * - Context preservation (includes surrounding context)
 * - Overlap optimization (smart overlap based on dependencies)
 * - Multi-level chunking (different granularities)
 * - Chunk quality scoring
 * - Adaptive chunk sizing
 */

import * as ts from 'typescript';
import { CodeChunk } from './codeChunker';
import { detectLanguage } from '../utils/fileUtils';

export interface EnhancedChunk extends CodeChunk {
 // Enhanced metadata
 id: string;
 parentId?: string; // For hierarchical structure
 childIds: string[]; // Child chunks

 // Context information
 contextBefore: string; // Code before this chunk
 contextAfter: string; // Code after this chunk
 dependencies: string[]; // Imported/referenced symbols

 // Quality metrics
 quality: number; // 0-100
 completeness: number; // 0-1 (is chunk self-contained?)
 complexity: number; // Cyclomatic complexity

 // Semantic information
 semanticType: SemanticType;
 keywords: string[]; // Important keywords in chunk
 summary: string; // Brief description
}

export enum SemanticType {
 FILE_HEADER = 'file_header',
 IMPORT_BLOCK = 'import_block',
 CLASS_DEFINITION = 'class_definition',
 INTERFACE_DEFINITION = 'interface_definition',
 FUNCTION_DEFINITION = 'function_definition',
 METHOD_DEFINITION = 'method_definition',
 TYPE_DEFINITION = 'type_definition',
 CONSTANT_BLOCK = 'constant_block',
 COMMENT_BLOCK = 'comment_block',
 CODE_BLOCK = 'code_block'
}

export interface ChunkingStrategy {
 maxChunkSize: number; // tokens
 minChunkSize: number; // tokens
 overlapSize: number; // tokens
 contextLines: number; // lines of context
 respectBoundaries: boolean; // respect function/class boundaries
 includeContext: boolean; // include surrounding context
 adaptiveSize: boolean; // adjust size based on complexity
}

export interface HierarchicalChunks {
 root: EnhancedChunk; // File-level chunk
 level1: EnhancedChunk[]; // Class/interface level
 level2: EnhancedChunk[]; // Method/function level
 level3: EnhancedChunk[]; // Block level
 flat: EnhancedChunk[]; // All chunks in flat array
}

export class EnhancedChunker {
 private chunkIdCounter = 0;

 constructor(
 private strategy: ChunkingStrategy = {
 maxChunkSize: 512,
 minChunkSize: 50,
 overlapSize: 50,
 contextLines: 5,
 respectBoundaries: true,
 includeContext: true,
 adaptiveSize: true
 }
 ) {}

 /**
 * Create hierarchical chunks from code
 */
 createHierarchicalChunks(
 filePath: string,
 content: string
 ): HierarchicalChunks {
 const language = detectLanguage(filePath);

 if (language === 'typescript' || language === 'javascript') {
 return this.createTypeScriptHierarchy(filePath, content);
 }

 // Fallback to simple chunking for other languages
 return this.createSimpleHierarchy(filePath, content, language);
 }

 /**
 * Create TypeScript/JavaScript hierarchical chunks using AST
 */
 private createTypeScriptHierarchy(
 filePath: string,
 content: string
 ): HierarchicalChunks {
 const sourceFile = ts.createSourceFile(
 filePath,
 content,
 ts.ScriptTarget.Latest,
 true
 );

 const lines = content.split('\n');

 // Level 0: File-level chunk (summary)
 const root = this.createFileChunk(sourceFile, content, filePath);

 // Level 1: Class/Interface chunks
 const level1: EnhancedChunk[] = [];
 const level2: EnhancedChunk[] = [];
 const level3: EnhancedChunk[] = [];

 const visit = (node: ts.Node) => {
 // Level 1: Classes and Interfaces
 if (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
 const chunk = this.createClassChunk(node, sourceFile, lines, root.id);
 level1.push(chunk);

 // Level 2: Methods within classes
 if (ts.isClassDeclaration(node)) {
 node.members.forEach(member => {
 if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member)) {
 const methodChunk = this.createMethodChunk(member, sourceFile, lines, chunk.id);
 level2.push(methodChunk);
 chunk.childIds.push(methodChunk.id);
 }
 });
 }
 }

 // Level 1: Top-level functions
 else if (ts.isFunctionDeclaration(node)) {
 const chunk = this.createFunctionChunk(node, sourceFile, lines, root.id);
 level1.push(chunk);
 root.childIds.push(chunk.id);
 }

 ts.forEachChild(node, visit);
 };

 visit(sourceFile);

 // Level 3: Create block-level chunks for large functions
 for (const chunk of [...level1, ...level2]) {
 if (chunk.content.length > this.strategy.maxChunkSize * 4) {
 const blocks = this.splitIntoBlocks(chunk, lines);
 level3.push(...blocks);
 }
 }

 const flat = [root, ...level1, ...level2, ...level3];

 return { root, level1, level2, level3, flat };
 }

 /**
 * Create file-level chunk (summary)
 */
 private createFileChunk(
 sourceFile: ts.SourceFile,
 content: string,
 filePath: string
 ): EnhancedChunk {
 const lines = content.split('\n');

 // Extract imports
 const imports: string[] = [];
 const exports: string[] = [];
 const classes: string[] = [];
 const functions: string[] = [];

 const visit = (node: ts.Node) => {
 if (ts.isImportDeclaration(node)) {
 imports.push(node.getText(sourceFile));
 } else if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
 exports.push(node.getText(sourceFile));
 } else if (ts.isClassDeclaration(node) && node.name) {
 classes.push(node.name.getText(sourceFile));
 } else if (ts.isFunctionDeclaration(node) && node.name) {
 functions.push(node.name.getText(sourceFile));
 }
 ts.forEachChild(node, visit);
 };

 visit(sourceFile);

 // Create summary
 const summary = this.createFileSummary(filePath, classes, functions, imports);

 return {
 id: this.generateChunkId(),
 content: summary,
 type: 'file',
 startLine: 0,
 endLine: lines.length - 1,
 language: 'typescript',
 parentId: undefined,
 childIds: [],
 contextBefore: '',
 contextAfter: '',
 dependencies: imports,
 quality: 95,
 completeness: 1.0,
 complexity: 1,
 semanticType: SemanticType.FILE_HEADER,
 keywords: [...classes, ...functions],
 summary
 };
 }

 /**
 * Create class-level chunk
 */
 private createClassChunk(
 node: ts.ClassDeclaration | ts.InterfaceDeclaration,
 sourceFile: ts.SourceFile,
 lines: string[],
 parentId: string
 ): EnhancedChunk {
 const name = node.name?.getText(sourceFile) || 'anonymous';
 const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
 const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;

 const content = lines.slice(startLine, endLine + 1).join('\n');
 const contextBefore = this.getContext(lines, startLine, -this.strategy.contextLines);
 const contextAfter = this.getContext(lines, endLine, this.strategy.contextLines);

 // Extract methods and properties
 const methods: string[] = [];
 const properties: string[] = [];

 if (ts.isClassDeclaration(node)) {
 node.members.forEach(member => {
 if (ts.isMethodDeclaration(member) && member.name) {
 methods.push(member.name.getText(sourceFile));
 } else if (ts.isPropertyDeclaration(member) && member.name) {
 properties.push(member.name.getText(sourceFile));
 }
 });
 }

 const summary = `${ts.isClassDeclaration(node) ? 'Class' : 'Interface'} ${name} with ${methods.length} methods and ${properties.length} properties`;
 const complexity = this.calculateComplexity(node);

 return {
 id: this.generateChunkId(),
 content,
 type: 'class',
 startLine,
 endLine,
 symbolName: name,
 language: 'typescript',
 parentId,
 childIds: [],
 contextBefore,
 contextAfter,
 dependencies: this.extractDependencies(node, sourceFile),
 quality: this.assessChunkQuality(content, complexity),
 completeness: 0.9,
 complexity,
 semanticType: ts.isClassDeclaration(node) ? SemanticType.CLASS_DEFINITION : SemanticType.INTERFACE_DEFINITION,
 keywords: [name, ...methods, ...properties],
 summary
 };
 }

 /**
 * Create method-level chunk
 */
 private createMethodChunk(
 node: ts.MethodDeclaration | ts.ConstructorDeclaration,
 sourceFile: ts.SourceFile,
 lines: string[],
 parentId: string
 ): EnhancedChunk {
 const name = ts.isConstructorDeclaration(node) ? 'constructor' : node.name?.getText(sourceFile) || 'anonymous';
 const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
 const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;

 const content = lines.slice(startLine, endLine + 1).join('\n');
 const contextBefore = this.getContext(lines, startLine, -this.strategy.contextLines);
 const contextAfter = this.getContext(lines, endLine, this.strategy.contextLines);

 const complexity = this.calculateComplexity(node);
 const signature = this.extractMethodSignature(node, sourceFile);

 return {
 id: this.generateChunkId(),
 content,
 type: 'function',
 startLine,
 endLine,
 symbolName: name,
 language: 'typescript',
 parentId,
 childIds: [],
 contextBefore,
 contextAfter,
 dependencies: this.extractDependencies(node, sourceFile),
 quality: this.assessChunkQuality(content, complexity),
 completeness: 0.95,
 complexity,
 semanticType: SemanticType.METHOD_DEFINITION,
 keywords: this.extractKeywords(content),
 summary: `Method ${name}: ${signature}`
 };
 }

 /**
 * Create function-level chunk
 */
 private createFunctionChunk(
 node: ts.FunctionDeclaration,
 sourceFile: ts.SourceFile,
 lines: string[],
 parentId: string
 ): EnhancedChunk {
 const name = node.name?.getText(sourceFile) || 'anonymous';
 const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line;
 const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;

 const content = lines.slice(startLine, endLine + 1).join('\n');
 const contextBefore = this.getContext(lines, startLine, -this.strategy.contextLines);
 const contextAfter = this.getContext(lines, endLine, this.strategy.contextLines);

 const complexity = this.calculateComplexity(node);
 const signature = this.extractFunctionSignature(node, sourceFile);

 return {
 id: this.generateChunkId(),
 content,
 type: 'function',
 startLine,
 endLine,
 symbolName: name,
 language: 'typescript',
 parentId,
 childIds: [],
 contextBefore,
 contextAfter,
 dependencies: this.extractDependencies(node, sourceFile),
 quality: this.assessChunkQuality(content, complexity),
 completeness: 0.95,
 complexity,
 semanticType: SemanticType.FUNCTION_DEFINITION,
 keywords: this.extractKeywords(content),
 summary: `Function ${name}: ${signature}`
 };
 }

 /**
 * Split large chunk into smaller blocks
 */
 private splitIntoBlocks(chunk: EnhancedChunk, lines: string[]): EnhancedChunk[] {
 const blocks: EnhancedChunk[] = [];
 const chunkLines = chunk.content.split('\n');

 for (let i = 0; i < chunkLines.length; i += this.strategy.maxChunkSize - this.strategy.overlapSize) {
 const endIdx = Math.min(i + this.strategy.maxChunkSize, chunkLines.length);
 const blockContent = chunkLines.slice(i, endIdx).join('\n');

 const block: EnhancedChunk = {
 id: this.generateChunkId(),
 content: blockContent,
 type: 'block',
 startLine: chunk.startLine + i,
 endLine: chunk.startLine + endIdx - 1,
 language: chunk.language,
 parentId: chunk.id,
 childIds: [],
 contextBefore: i === 0 ? chunk.contextBefore : chunkLines.slice(Math.max(0, i - this.strategy.contextLines), i).join('\n'),
 contextAfter: endIdx === chunkLines.length ? chunk.contextAfter : chunkLines.slice(endIdx, Math.min(chunkLines.length, endIdx + this.strategy.contextLines)).join('\n'),
 dependencies: chunk.dependencies,
 quality: this.assessChunkQuality(blockContent, 1),
 completeness: 0.7,
 complexity: 1,
 semanticType: SemanticType.CODE_BLOCK,
 keywords: this.extractKeywords(blockContent),
 summary: `Code block from ${chunk.symbolName || 'unknown'}`
 };

 blocks.push(block);
 chunk.childIds.push(block.id);
 }

 return blocks;
 }

 /**
 * Create simple hierarchy for non-TypeScript files
 */
 private createSimpleHierarchy(
 filePath: string,
 content: string,
 language: string
 ): HierarchicalChunks {
 const lines = content.split('\n');

 // Create root chunk
 const root: EnhancedChunk = {
 id: this.generateChunkId(),
 content: this.createSimpleSummary(filePath, content),
 type: 'file',
 startLine: 0,
 endLine: lines.length - 1,
 language,
 parentId: undefined,
 childIds: [],
 contextBefore: '',
 contextAfter: '',
 dependencies: [],
 quality: 80,
 completeness: 1.0,
 complexity: 1,
 semanticType: SemanticType.FILE_HEADER,
 keywords: [],
 summary: `File: ${filePath}`
 };

 // Create level 1 chunks (split by size)
 const level1: EnhancedChunk[] = [];
 for (let i = 0; i < lines.length; i += this.strategy.maxChunkSize - this.strategy.overlapSize) {
 const endIdx = Math.min(i + this.strategy.maxChunkSize, lines.length);
 const chunkContent = lines.slice(i, endIdx).join('\n');

 const chunk: EnhancedChunk = {
 id: this.generateChunkId(),
 content: chunkContent,
 type: 'block',
 startLine: i,
 endLine: endIdx - 1,
 language,
 parentId: root.id,
 childIds: [],
 contextBefore: this.getContext(lines, i, -this.strategy.contextLines),
 contextAfter: this.getContext(lines, endIdx - 1, this.strategy.contextLines),
 dependencies: [],
 quality: this.assessChunkQuality(chunkContent, 1),
 completeness: 0.8,
 complexity: 1,
 semanticType: SemanticType.CODE_BLOCK,
 keywords: this.extractKeywords(chunkContent),
 summary: `Code block ${i}-${endIdx - 1}`
 };

 level1.push(chunk);
 root.childIds.push(chunk.id);
 }

 const flat = [root, ...level1];
 return { root, level1, level2: [], level3: [], flat };
 }

 // ========== Helper Methods ==========

 private generateChunkId(): string {
 return `chunk_${this.chunkIdCounter++}_${Date.now()}`;
 }

 private getContext(lines: string[], lineNumber: number, offset: number): string {
 if (offset < 0) {
 const start = Math.max(0, lineNumber + offset);
 return lines.slice(start, lineNumber).join('\n');
 } else {
 const end = Math.min(lines.length, lineNumber + offset + 1);
 return lines.slice(lineNumber + 1, end).join('\n');
 }
 }

 private calculateComplexity(node: ts.Node): number {
 let complexity = 1;

 const visit = (n: ts.Node) => {
 if (ts.isIfStatement(n) || ts.isForStatement(n) || ts.isWhileStatement(n) ||
 ts.isDoStatement(n) || ts.isSwitchStatement(n) || ts.isConditionalExpression(n)) {
 complexity++;
 }
 ts.forEachChild(n, visit);
 };

 visit(node);
 return complexity;
 }

 private extractDependencies(node: ts.Node, sourceFile: ts.SourceFile): string[] {
 const dependencies: Set<string> = new Set();

 const visit = (n: ts.Node) => {
 if (ts.isIdentifier(n)) {
 dependencies.add(n.getText(sourceFile));
 }
 ts.forEachChild(n, visit);
 };

 visit(node);
 return Array.from(dependencies).slice(0, 20); // Limit to top 20
 }

 private extractMethodSignature(
 node: ts.MethodDeclaration | ts.ConstructorDeclaration,
 sourceFile: ts.SourceFile
 ): string {
 if (ts.isConstructorDeclaration(node)) {
 const params = node.parameters.map(p => p.name.getText(sourceFile)).join(', ');
 return `constructor(${params})`;
 }

 const name = node.name?.getText(sourceFile) || 'anonymous';
 const params = node.parameters.map(p => p.name.getText(sourceFile)).join(', ');
 const returnType = node.type?.getText(sourceFile) || 'void';
 return `${name}(${params}): ${returnType}`;
 }

 private extractFunctionSignature(node: ts.FunctionDeclaration, sourceFile: ts.SourceFile): string {
 const name = node.name?.getText(sourceFile) || 'anonymous';
 const params = node.parameters.map(p => p.name.getText(sourceFile)).join(', ');
 const returnType = node.type?.getText(sourceFile) || 'void';
 return `${name}(${params}): ${returnType}`;
 }

 private extractKeywords(content: string): string[] {
 // Extract important keywords (simplified)
 const words = content.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) || [];
 const frequency = new Map<string, number>();

 words.forEach(word => {
 frequency.set(word, (frequency.get(word) || 0) + 1);
 });

 return Array.from(frequency.entries())
 .sort((a, b) => b[1] - a[1])
 .slice(0, 10)
 .map(([word]) => word);
 }

 private assessChunkQuality(content: string, complexity: number): number {
 let quality = 70;

 // Penalize high complexity
 if (complexity > 15) quality -= 20;
 else if (complexity > 10) quality -= 10;

 // Reward documentation
 if (content.includes('/**') || content.includes('//')) quality += 10;

 // Reward type annotations
 if (content.includes(': ')) quality += 10;

 // Penalize very short chunks
 if (content.length < 100) quality -= 10;

 return Math.min(100, Math.max(0, quality));
 }

 private createFileSummary(
 filePath: string,
 classes: string[],
 functions: string[],
 imports: string[]
 ): string {
 return `File: ${filePath}
Classes: ${classes.join(', ') || 'none'}
Functions: ${functions.join(', ') || 'none'}
Imports: ${imports.length} imports`;
 }

 private createSimpleSummary(filePath: string, content: string): string {
 const lines = content.split('\n').length;
 return `File: ${filePath} (${lines} lines)`;
 }
}

