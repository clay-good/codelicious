/**
 * Code Chunker - Intelligently splits code into meaningful chunks for embedding
 */

import { Symbol, SymbolKind } from '../types';
import { parseSymbols } from '../utils/symbolParser';
import { detectLanguage } from '../utils/fileUtils';
import { SemanticChunker, SemanticChunk } from './semanticChunker';
import { createLogger } from '../utils/logger';

const logger = createLogger('CodeChunker');

export interface CodeChunk {
 content: string;
 type: 'file' | 'class' | 'function' | 'block';
 startLine: number;
 endLine: number;
 symbolName?: string;
 symbolKind?: SymbolKind;
 language: string;
}

export class CodeChunker {
 private maxChunkSize: number;
 private overlapLines: number;
 private semanticChunker: SemanticChunker;
 private useSemanticChunking: boolean;

 constructor(maxChunkSize = 512, overlapLines = 50, useSemanticChunking = true) {
 this.maxChunkSize = maxChunkSize;
 this.overlapLines = overlapLines;
 this.useSemanticChunking = useSemanticChunking;
 this.semanticChunker = new SemanticChunker(maxChunkSize, 50, 3);
 }

 /**
 * Chunk code file into meaningful pieces
 */
 async chunkFile(filePath: string, content: string): Promise<CodeChunk[]> {
 const language = detectLanguage(filePath);

 // Use semantic chunking if enabled
 if (this.useSemanticChunking) {
 try {
 const semanticChunks = await this.semanticChunker.chunkFile(filePath, content);
 // Convert SemanticChunk to CodeChunk for backward compatibility
 return semanticChunks.map(chunk => ({
 content: chunk.content,
 type: chunk.type,
 startLine: chunk.startLine,
 endLine: chunk.endLine,
 symbolName: chunk.symbolName,
 symbolKind: chunk.symbolKind,
 language: chunk.language
 }));
 } catch (error) {
 logger.warn('Semantic chunking failed, falling back to symbol-based chunking:', error);
 }
 }

 const lines = content.split('\n');

 // Try symbol-based chunking first
 const symbols = parseSymbols(content, language, filePath);
 if (symbols.length > 0) {
 return this.chunkBySymbols(content, symbols, language);
 }

 // Fall back to line-based chunking
 return this.chunkByLines(content, language);
 }

 /**
 * Chunk by symbols (classes, functions, etc.)
 */
 private chunkBySymbols(content: string, symbols: Symbol[], language: string): CodeChunk[] {
 const chunks: CodeChunk[] = [];
 const lines = content.split('\n');

 for (const symbol of symbols) {
 const startLine = symbol.range.start.line;
 const endLine = this.findSymbolEnd(lines, startLine, symbol.kind);

 const chunkContent = lines.slice(startLine, endLine + 1).join('\n');

 // If symbol is too large, split it further
 if (chunkContent.length > this.maxChunkSize * 4) {
 const subChunks = this.splitLargeSymbol(chunkContent, startLine, language, symbol);
 chunks.push(...subChunks);
 } else {
 chunks.push({
 content: chunkContent,
 type: this.getChunkType(symbol.kind),
 startLine,
 endLine,
 symbolName: symbol.name,
 symbolKind: symbol.kind,
 language
 });
 }
 }

 return chunks;
 }

 /**
 * Find the end line of a symbol
 */
 private findSymbolEnd(lines: string[], startLine: number, kind: SymbolKind): number {
 let braceCount = 0;
 let foundOpenBrace = false;

 for (let i = startLine; i < lines.length; i++) {
 const line = lines[i];

 // Count braces
 for (const char of line) {
 if (char === '{') {
 braceCount++;
 foundOpenBrace = true;
 } else if (char === '}') {
 braceCount--;
 if (foundOpenBrace && braceCount === 0) {
 return i;
 }
 }
 }
 }

 // If no closing brace found, return a reasonable default
 return Math.min(startLine + 50, lines.length - 1);
 }

 /**
 * Split large symbols into smaller chunks
 */
 private splitLargeSymbol(
 content: string,
 startLine: number,
 language: string,
 symbol: Symbol
 ): CodeChunk[] {
 const chunks: CodeChunk[] = [];
 const lines = content.split('\n');

 for (let i = 0; i < lines.length; i += this.maxChunkSize - this.overlapLines) {
 const endIdx = Math.min(i + this.maxChunkSize, lines.length);
 const chunkLines = lines.slice(i, endIdx);

 chunks.push({
 content: chunkLines.join('\n'),
 type: 'block',
 startLine: startLine + i,
 endLine: startLine + endIdx - 1,
 symbolName: symbol.name,
 symbolKind: symbol.kind,
 language
 });
 }

 return chunks;
 }

 /**
 * Chunk by lines (fallback for files without symbols)
 */
 private chunkByLines(content: string, language: string): CodeChunk[] {
 const chunks: CodeChunk[] = [];
 const lines = content.split('\n');

 for (let i = 0; i < lines.length; i += this.maxChunkSize - this.overlapLines) {
 const endIdx = Math.min(i + this.maxChunkSize, lines.length);
 const chunkLines = lines.slice(i, endIdx);

 chunks.push({
 content: chunkLines.join('\n'),
 type: 'block',
 startLine: i,
 endLine: endIdx - 1,
 language
 });
 }

 return chunks;
 }

 /**
 * Get chunk type from symbol kind
 */
 private getChunkType(kind: SymbolKind): 'class' | 'function' | 'block' {
 switch (kind) {
 case SymbolKind.CLASS:
 case SymbolKind.INTERFACE:
 return 'class';
 case SymbolKind.FUNCTION:
 case SymbolKind.METHOD:
 return 'function';
 default:
 return 'block';
 }
 }

 /**
 * Create hierarchical chunks (file → class → function)
 */
 createHierarchicalChunks(filePath: string, content: string): {
 file: CodeChunk;
 classes: CodeChunk[];
 functions: CodeChunk[];
 } {
 const language = detectLanguage(filePath);
 const symbols = parseSymbols(content, language, filePath);
 const lines = content.split('\n');

 // File-level chunk (summary)
 const fileChunk: CodeChunk = {
 content: this.createFileSummary(content, symbols),
 type: 'file',
 startLine: 0,
 endLine: lines.length - 1,
 language
 };

 // Class-level chunks
 const classSymbols = symbols.filter(s =>
 s.kind === SymbolKind.CLASS || s.kind === SymbolKind.INTERFACE
 );
 const classChunks = classSymbols.map(symbol => {
 const startLine = symbol.range.start.line;
 const endLine = this.findSymbolEnd(lines, startLine, symbol.kind);
 return {
 content: lines.slice(startLine, endLine + 1).join('\n'),
 type: 'class' as const,
 startLine,
 endLine,
 symbolName: symbol.name,
 symbolKind: symbol.kind,
 language
 };
 });

 // Function-level chunks
 const functionSymbols = symbols.filter(s =>
 s.kind === SymbolKind.FUNCTION || s.kind === SymbolKind.METHOD
 );
 const functionChunks = functionSymbols.map(symbol => {
 const startLine = symbol.range.start.line;
 const endLine = this.findSymbolEnd(lines, startLine, symbol.kind);
 return {
 content: lines.slice(startLine, endLine + 1).join('\n'),
 type: 'function' as const,
 startLine,
 endLine,
 symbolName: symbol.name,
 symbolKind: symbol.kind,
 language
 };
 });

 return {
 file: fileChunk,
 classes: classChunks,
 functions: functionChunks
 };
 }

 /**
 * Create a summary of the file for file-level embedding
 */
 private createFileSummary(content: string, symbols: Symbol[]): string {
 const lines = content.split('\n');
 const summary: string[] = [];

 // Add first 10 lines (usually imports and file header)
 summary.push(...lines.slice(0, Math.min(10, lines.length)));

 // Add symbol signatures
 if (symbols.length > 0) {
 summary.push('\n// Symbols in this file:');
 for (const symbol of symbols) {
 const line = lines[symbol.range.start.line];
 if (line) {
 summary.push(line.trim());
 }
 }
 }

 return summary.join('\n');
 }

 /**
 * Chunk code with context (includes surrounding code)
 */
 async chunkWithContext(
 filePath: string,
 content: string,
 contextLines = 5
 ): Promise<CodeChunk[]> {
 const baseChunks = await this.chunkFile(filePath, content);
 const lines = content.split('\n');

 return baseChunks.map(chunk => {
 const startLine = Math.max(0, chunk.startLine - contextLines);
 const endLine = Math.min(lines.length - 1, chunk.endLine + contextLines);

 return {
 ...chunk,
 content: lines.slice(startLine, endLine + 1).join('\n'),
 startLine,
 endLine
 };
 });
 }
}

