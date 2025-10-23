"use strict";
/**
 * Semantic Chunker - Advanced chunking with semantic boundary detection and AST analysis
 *
 * Features:
 * - Semantic boundary detection (logical code blocks, related statements)
 * - AST-based semantic analysis for better understanding
 * - Context preservation across chunks
 * - Intelligent chunk sizing based on semantic meaning
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SemanticChunker = void 0;
const types_1 = require("../types");
const symbolParser_1 = require("../utils/symbolParser");
const fileUtils_1 = require("../utils/fileUtils");
class SemanticChunker {
    constructor(maxChunkSize = 512, minChunkSize = 50, contextLines = 3) {
        this.maxChunkSize = maxChunkSize;
        this.minChunkSize = minChunkSize;
        this.contextLines = contextLines;
    }
    /**
    * Chunk code file with semantic awareness
    */
    async chunkFile(filePath, content) {
        const language = (0, fileUtils_1.detectLanguage)(filePath);
        const lines = content.split('\n');
        // Parse symbols for AST-based analysis
        const symbols = (0, symbolParser_1.parseSymbols)(content, language, filePath);
        // Detect semantic boundaries
        const boundaries = this.detectSemanticBoundaries(content, symbols, language);
        // Extract imports and exports
        const imports = this.extractImports(content, language);
        const exports = this.extractExports(content, language);
        // Create chunks based on boundaries
        const chunks = this.createChunksFromBoundaries(content, boundaries, symbols, imports, exports, language);
        // Add context to chunks
        return this.addContextToChunks(chunks, lines);
    }
    /**
    * Detect semantic boundaries in code
    */
    detectSemanticBoundaries(content, symbols, language) {
        const lines = content.split('\n');
        const boundaries = [];
        // Add boundaries at symbol definitions (hard boundaries)
        for (const symbol of symbols) {
            boundaries.push({
                line: symbol.range.start.line,
                type: 'hard',
                reason: `${symbol.kind} definition: ${symbol.name}`,
                confidence: 1.0
            });
        }
        // Detect logical boundaries within code (only at top level, not inside functions/classes)
        let braceDepth = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Track brace depth to avoid creating boundaries inside functions/classes
            braceDepth += (line.match(/{/g) || []).length;
            braceDepth -= (line.match(/}/g) || []).length;
            // Only create boundaries at top level (braceDepth <= 1)
            // braceDepth === 1 means we're inside the first level (e.g., inside a class but not inside a method)
            if (braceDepth <= 1) {
                // Empty lines followed by comments (soft boundary)
                if (line === '' && i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    if (this.isComment(nextLine, language)) {
                        boundaries.push({
                            line: i,
                            type: 'soft',
                            reason: 'Empty line before comment',
                            confidence: 0.7
                        });
                    }
                }
                // Import/export blocks (hard boundary)
                if (this.isImportOrExport(line, language)) {
                    boundaries.push({
                        line: i,
                        type: 'hard',
                        reason: 'Import/export statement',
                        confidence: 0.9
                    });
                }
                // Class/function decorators (hard boundary)
                if (this.isDecorator(line, language)) {
                    boundaries.push({
                        line: i,
                        type: 'hard',
                        reason: 'Decorator',
                        confidence: 0.95
                    });
                }
                // Multi-line comment blocks (soft boundary)
                if (this.isMultiLineCommentStart(line, language)) {
                    boundaries.push({
                        line: i,
                        type: 'soft',
                        reason: 'Documentation block',
                        confidence: 0.8
                    });
                }
            }
        }
        // Sort by line number and remove duplicates
        return boundaries
            .sort((a, b) => a.line - b.line)
            .filter((b, i, arr) => i === 0 || b.line !== arr[i - 1].line);
    }
    /**
    * Create chunks from detected boundaries
    */
    createChunksFromBoundaries(content, boundaries, symbols, imports, exports, language) {
        const lines = content.split('\n');
        const chunks = [];
        // If no boundaries, create chunks for the entire content
        if (boundaries.length === 0) {
            if (lines.length > 0) {
                // Check if content is too large and needs splitting
                if (lines.length > this.maxChunkSize) {
                    return this.splitLargeChunk(lines, 0, symbols, imports, exports, language);
                }
                else {
                    const chunk = this.createSemanticChunk(content, 0, lines.length - 1, symbols, imports, exports, language);
                    chunks.push(chunk);
                }
            }
            return chunks;
        }
        let currentStart = 0;
        for (let i = 0; i < boundaries.length; i++) {
            const boundary = boundaries[i];
            const nextBoundary = boundaries[i + 1];
            // Determine chunk end
            const chunkEnd = nextBoundary ? nextBoundary.line : lines.length;
            // Check if chunk is too large
            const chunkLines = chunkEnd - currentStart;
            if (chunkLines > this.maxChunkSize) {
                // Split large chunk
                const subChunks = this.splitLargeChunk(lines.slice(currentStart, chunkEnd), currentStart, symbols, imports, exports, language);
                chunks.push(...subChunks);
            }
            else if (chunkLines > 0) {
                // Create chunk (removed minChunkSize requirement to ensure we always create chunks)
                const chunkContent = lines.slice(currentStart, chunkEnd).join('\n');
                const chunk = this.createSemanticChunk(chunkContent, currentStart, chunkEnd - 1, symbols, imports, exports, language);
                chunks.push(chunk);
            }
            currentStart = chunkEnd;
        }
        return chunks;
    }
    /**
    * Create a semantic chunk with metadata
    */
    createSemanticChunk(content, startLine, endLine, symbols, imports, exports, language) {
        // Find symbols in this chunk
        const chunkSymbols = symbols.filter(s => s.range.start.line >= startLine && s.range.start.line <= endLine);
        // Determine semantic type
        const semanticType = this.determineSemanticType(content, chunkSymbols);
        // Extract related symbols
        const relatedSymbols = this.extractRelatedSymbols(content, symbols);
        // Calculate complexity
        const complexity = this.estimateComplexity(content);
        // Determine chunk type
        const type = chunkSymbols.length > 0
            ? this.getChunkType(chunkSymbols[0].kind)
            : 'block';
        return {
            content,
            type,
            startLine,
            endLine,
            symbolName: chunkSymbols[0]?.name,
            symbolKind: chunkSymbols[0]?.kind,
            language,
            semanticType,
            relatedSymbols,
            imports: imports.filter(imp => content.includes(imp)),
            exports: exports.filter(exp => content.includes(exp)),
            complexity
        };
    }
    /**
    * Determine the semantic type of a chunk
    */
    determineSemanticType(content, symbols) {
        const hasDefinition = symbols.some(s => s.kind === types_1.SymbolKind.CLASS ||
            s.kind === types_1.SymbolKind.INTERFACE ||
            s.kind === types_1.SymbolKind.FUNCTION);
        const hasImplementation = content.includes('{') && content.includes('}');
        const hasDocumentation = content.includes('/**') || content.includes('//');
        const hasUsage = /\w+\(/.test(content); // Function calls
        if (hasDocumentation && !hasImplementation) {
            return 'documentation';
        }
        if (hasDefinition && !hasImplementation) {
            return 'definition';
        }
        if (hasImplementation && hasDefinition) {
            return 'implementation';
        }
        if (hasUsage && !hasDefinition) {
            return 'usage';
        }
        return 'mixed';
    }
    /**
    * Extract related symbols mentioned in the content
    */
    extractRelatedSymbols(content, allSymbols) {
        const related = [];
        for (const symbol of allSymbols) {
            // Check if symbol is referenced in content
            const regex = new RegExp(`\\b${symbol.name}\\b`, 'g');
            if (regex.test(content)) {
                related.push(symbol.name);
            }
        }
        return [...new Set(related)]; // Remove duplicates
    }
    /**
    * Estimate cyclomatic complexity
    */
    estimateComplexity(content) {
        let complexity = 1; // Base complexity
        // Count decision points
        const patterns = [
            /\bif\b/g,
            /\belse\b/g,
            /\bfor\b/g,
            /\bwhile\b/g,
            /\bcase\b/g,
            /\bcatch\b/g,
            /\b\?\b/g, // Ternary operator
            /\b&&\b/g, // Logical AND
            /\b\|\|\b/g // Logical OR
        ];
        for (const pattern of patterns) {
            const matches = content.match(pattern);
            if (matches) {
                complexity += matches.length;
            }
        }
        return complexity;
    }
    // Helper methods for boundary detection
    isComment(line, language) {
        return line.startsWith('//') || line.startsWith('#') || line.startsWith('/*');
    }
    isControlFlowStatement(line, language) {
        return /\b(if|else|for|while|switch|case|break|continue|return)\b/.test(line);
    }
    isImportOrExport(line, language) {
        return /\b(import|export|from|require)\b/.test(line);
    }
    isDecorator(line, language) {
        return line.startsWith('@');
    }
    isMultiLineCommentStart(line, language) {
        return line.startsWith('/**') || line.startsWith('/*');
    }
    getChunkType(kind) {
        switch (kind) {
            case types_1.SymbolKind.CLASS:
                return 'class';
            case types_1.SymbolKind.FUNCTION:
            case types_1.SymbolKind.METHOD:
                return 'function';
            default:
                return 'block';
        }
    }
    // Placeholder methods (to be implemented)
    extractImports(content, language) {
        const imports = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (this.isImportOrExport(line, language)) {
                imports.push(line.trim());
            }
        }
        return imports;
    }
    extractExports(content, language) {
        const exports = [];
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.includes('export')) {
                exports.push(line.trim());
            }
        }
        return exports;
    }
    splitLargeChunk(lines, startLine, symbols, imports, exports, language) {
        // Simple split for now - can be enhanced
        const chunks = [];
        const chunkSize = this.maxChunkSize;
        for (let i = 0; i < lines.length; i += chunkSize) {
            const chunkLines = lines.slice(i, i + chunkSize);
            const content = chunkLines.join('\n');
            const chunk = this.createSemanticChunk(content, startLine + i, startLine + i + chunkLines.length - 1, symbols, imports, exports, language);
            chunks.push(chunk);
        }
        return chunks;
    }
    addContextToChunks(chunks, lines) {
        return chunks.map((chunk, index) => {
            // Add context before
            if (chunk.startLine > 0) {
                const contextStart = Math.max(0, chunk.startLine - this.contextLines);
                chunk.contextBefore = lines.slice(contextStart, chunk.startLine).join('\n');
            }
            // Add context after
            if (chunk.endLine < lines.length - 1) {
                const contextEnd = Math.min(lines.length, chunk.endLine + 1 + this.contextLines);
                chunk.contextAfter = lines.slice(chunk.endLine + 1, contextEnd).join('\n');
            }
            return chunk;
        });
    }
}
exports.SemanticChunker = SemanticChunker;
//# sourceMappingURL=semanticChunker.js.map