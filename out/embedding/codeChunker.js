"use strict";
/**
 * Code Chunker - Intelligently splits code into meaningful chunks for embedding
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeChunker = void 0;
const types_1 = require("../types");
const symbolParser_1 = require("../utils/symbolParser");
const fileUtils_1 = require("../utils/fileUtils");
const semanticChunker_1 = require("./semanticChunker");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CodeChunker');
class CodeChunker {
    constructor(maxChunkSize = 512, overlapLines = 50, useSemanticChunking = true) {
        this.maxChunkSize = maxChunkSize;
        this.overlapLines = overlapLines;
        this.useSemanticChunking = useSemanticChunking;
        this.semanticChunker = new semanticChunker_1.SemanticChunker(maxChunkSize, 50, 3);
    }
    /**
    * Chunk code file into meaningful pieces
    */
    async chunkFile(filePath, content) {
        const language = (0, fileUtils_1.detectLanguage)(filePath);
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
            }
            catch (error) {
                logger.warn('Semantic chunking failed, falling back to symbol-based chunking:', error);
            }
        }
        const lines = content.split('\n');
        // Try symbol-based chunking first
        const symbols = (0, symbolParser_1.parseSymbols)(content, language, filePath);
        if (symbols.length > 0) {
            return this.chunkBySymbols(content, symbols, language);
        }
        // Fall back to line-based chunking
        return this.chunkByLines(content, language);
    }
    /**
    * Chunk by symbols (classes, functions, etc.)
    */
    chunkBySymbols(content, symbols, language) {
        const chunks = [];
        const lines = content.split('\n');
        for (const symbol of symbols) {
            const startLine = symbol.range.start.line;
            const endLine = this.findSymbolEnd(lines, startLine, symbol.kind);
            const chunkContent = lines.slice(startLine, endLine + 1).join('\n');
            // If symbol is too large, split it further
            if (chunkContent.length > this.maxChunkSize * 4) {
                const subChunks = this.splitLargeSymbol(chunkContent, startLine, language, symbol);
                chunks.push(...subChunks);
            }
            else {
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
    findSymbolEnd(lines, startLine, kind) {
        let braceCount = 0;
        let foundOpenBrace = false;
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];
            // Count braces
            for (const char of line) {
                if (char === '{') {
                    braceCount++;
                    foundOpenBrace = true;
                }
                else if (char === '}') {
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
    splitLargeSymbol(content, startLine, language, symbol) {
        const chunks = [];
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
    chunkByLines(content, language) {
        const chunks = [];
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
    getChunkType(kind) {
        switch (kind) {
            case types_1.SymbolKind.CLASS:
            case types_1.SymbolKind.INTERFACE:
                return 'class';
            case types_1.SymbolKind.FUNCTION:
            case types_1.SymbolKind.METHOD:
                return 'function';
            default:
                return 'block';
        }
    }
    /**
    * Create hierarchical chunks (file → class → function)
    */
    createHierarchicalChunks(filePath, content) {
        const language = (0, fileUtils_1.detectLanguage)(filePath);
        const symbols = (0, symbolParser_1.parseSymbols)(content, language, filePath);
        const lines = content.split('\n');
        // File-level chunk (summary)
        const fileChunk = {
            content: this.createFileSummary(content, symbols),
            type: 'file',
            startLine: 0,
            endLine: lines.length - 1,
            language
        };
        // Class-level chunks
        const classSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.CLASS || s.kind === types_1.SymbolKind.INTERFACE);
        const classChunks = classSymbols.map(symbol => {
            const startLine = symbol.range.start.line;
            const endLine = this.findSymbolEnd(lines, startLine, symbol.kind);
            return {
                content: lines.slice(startLine, endLine + 1).join('\n'),
                type: 'class',
                startLine,
                endLine,
                symbolName: symbol.name,
                symbolKind: symbol.kind,
                language
            };
        });
        // Function-level chunks
        const functionSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.FUNCTION || s.kind === types_1.SymbolKind.METHOD);
        const functionChunks = functionSymbols.map(symbol => {
            const startLine = symbol.range.start.line;
            const endLine = this.findSymbolEnd(lines, startLine, symbol.kind);
            return {
                content: lines.slice(startLine, endLine + 1).join('\n'),
                type: 'function',
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
    createFileSummary(content, symbols) {
        const lines = content.split('\n');
        const summary = [];
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
    async chunkWithContext(filePath, content, contextLines = 5) {
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
exports.CodeChunker = CodeChunker;
//# sourceMappingURL=codeChunker.js.map