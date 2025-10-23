"use strict";
/**
 * Adaptive Chunk Sizing
 *
 * Dynamically adjusts chunk sizes based on:
 * - Code complexity
 * - Semantic coherence
 * - Context requirements
 * - Language characteristics
 * - Historical performance
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdaptiveChunkSizing = void 0;
class AdaptiveChunkSizing {
    constructor(strategy) {
        this.strategy = {
            minSize: 100,
            maxSize: 2000,
            targetSize: 500,
            adaptToComplexity: true,
            adaptToLanguage: true,
            adaptToContext: true,
            preserveSemanticBoundaries: true,
            ...strategy
        };
        this.performanceHistory = new Map();
        this.languageProfiles = new Map();
        this.initializeLanguageProfiles();
    }
    /**
    * Adaptively chunk code
    */
    async adaptiveChunk(code, filePath, language, astAnalysis) {
        const adjustments = [];
        // Get language profile
        const profile = this.languageProfiles.get(language) || this.getDefaultProfile();
        // Calculate complexity
        const complexity = this.calculateComplexity(code, astAnalysis);
        // Determine optimal chunk size
        let chunkSize = this.strategy.targetSize;
        if (this.strategy.adaptToComplexity) {
            const complexityAdjustment = this.adjustForComplexity(complexity);
            adjustments.push({
                reason: `Complexity adjustment (complexity: ${complexity.toFixed(2)})`,
                originalSize: chunkSize,
                adjustedSize: chunkSize * complexityAdjustment,
                impact: complexityAdjustment > 1 ? 'increased' : 'decreased'
            });
            chunkSize *= complexityAdjustment;
        }
        if (this.strategy.adaptToLanguage) {
            const languageAdjustment = profile.sizeMultiplier;
            adjustments.push({
                reason: `Language adjustment (${language})`,
                originalSize: chunkSize,
                adjustedSize: chunkSize * languageAdjustment,
                impact: languageAdjustment > 1 ? 'increased' : 'decreased'
            });
            chunkSize *= languageAdjustment;
        }
        // Ensure within bounds
        chunkSize = Math.max(this.strategy.minSize, Math.min(this.strategy.maxSize, chunkSize));
        // Create chunks
        const chunks = this.createChunks(code, filePath, language, chunkSize, astAnalysis);
        // Calculate metrics
        const metrics = this.calculateMetrics(chunks);
        return {
            chunks,
            metrics,
            adjustments
        };
    }
    /**
    * Create chunks with adaptive sizing
    */
    createChunks(code, filePath, language, targetSize, astAnalysis) {
        const chunks = [];
        const lines = code.split('\n');
        let currentChunk = [];
        let currentSize = 0;
        let chunkIndex = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineSize = line.length;
            // Check if adding this line would exceed target
            if (currentSize + lineSize > targetSize && currentChunk.length > 0) {
                // Check if we should preserve semantic boundary
                if (this.strategy.preserveSemanticBoundaries) {
                    if (!this.isSemanticBoundary(line, lines[i - 1])) {
                        // Continue to next boundary
                        currentChunk.push(line);
                        currentSize += lineSize;
                        continue;
                    }
                }
                // Create chunk
                chunks.push(this.createChunk(currentChunk, filePath, language, chunkIndex));
                currentChunk = [];
                currentSize = 0;
                chunkIndex++;
            }
            currentChunk.push(line);
            currentSize += lineSize;
        }
        // Add remaining chunk
        if (currentChunk.length > 0) {
            chunks.push(this.createChunk(currentChunk, filePath, language, chunkIndex));
        }
        return chunks;
    }
    /**
    * Create a code chunk
    */
    createChunk(lines, filePath, language, index) {
        const content = lines.join('\n');
        return {
            content,
            type: 'block',
            startLine: 0, // Would need to track actual line numbers
            endLine: lines.length,
            language
        };
    }
    /**
    * Check if line is a semantic boundary
    */
    isSemanticBoundary(currentLine, previousLine) {
        const trimmed = currentLine.trim();
        // Empty line
        if (trimmed === '')
            return true;
        // Function/class definition
        if (/^(function|class|interface|type|const|let|var|export|import)\s/.test(trimmed)) {
            return true;
        }
        // Comment block
        if (/^(\/\/|\/\*|\*|#)/.test(trimmed))
            return true;
        // Closing brace followed by new statement
        if (previousLine && previousLine.trim() === '}' && trimmed !== '}') {
            return true;
        }
        return false;
    }
    /**
    * Calculate code complexity
    */
    calculateComplexity(code, astAnalysis) {
        let complexity = 0;
        // Cyclomatic complexity indicators
        complexity += (code.match(/if|else|for|while|switch|case|catch/g) || []).length * 0.1;
        // Nesting level
        const maxNesting = this.calculateMaxNesting(code);
        complexity += maxNesting * 0.2;
        // Number of functions
        const functions = (code.match(/function|=>|def\s/g) || []).length;
        complexity += functions * 0.15;
        // AST-based complexity
        if (astAnalysis) {
            complexity += astAnalysis.symbols.length * 0.05;
        }
        return Math.min(complexity, 10); // Cap at 10
    }
    /**
    * Calculate maximum nesting level
    */
    calculateMaxNesting(code) {
        let maxNesting = 0;
        let currentNesting = 0;
        for (const char of code) {
            if (char === '{' || char === '(') {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            }
            else if (char === '}' || char === ')') {
                currentNesting = Math.max(0, currentNesting - 1);
            }
        }
        return maxNesting;
    }
    /**
    * Adjust chunk size based on complexity
    */
    adjustForComplexity(complexity) {
        // Higher complexity = smaller chunks for better focus
        if (complexity > 7)
            return 0.6;
        if (complexity > 5)
            return 0.8;
        if (complexity > 3)
            return 1.0;
        return 1.2; // Simple code can have larger chunks
    }
    /**
    * Calculate metrics
    */
    calculateMetrics(chunks) {
        const sizes = chunks.map(c => c.content.length);
        const complexities = chunks.map(c => this.calculateComplexity(c.content));
        const languages = chunks.map(c => c.language);
        const complexityDist = new Map();
        for (const complexity of complexities) {
            const bucket = Math.floor(complexity);
            complexityDist.set(`${bucket}-${bucket + 1}`, (complexityDist.get(`${bucket}-${bucket + 1}`) || 0) + 1);
        }
        const languageDist = new Map();
        for (const lang of languages) {
            languageDist.set(lang, (languageDist.get(lang) || 0) + 1);
        }
        return {
            averageSize: sizes.reduce((a, b) => a + b, 0) / sizes.length,
            minSize: Math.min(...sizes),
            maxSize: Math.max(...sizes),
            complexityDistribution: complexityDist,
            languageDistribution: languageDist,
            performanceScore: 0.8 // Would be calculated from actual performance
        };
    }
    /**
    * Get default language profile
    */
    getDefaultProfile() {
        return {
            language: 'unknown',
            sizeMultiplier: 1.0,
            complexityWeight: 1.0,
            preferredBoundaries: []
        };
    }
    /**
    * Initialize language profiles
    */
    initializeLanguageProfiles() {
        this.languageProfiles.set('typescript', {
            language: 'typescript',
            sizeMultiplier: 1.0,
            complexityWeight: 1.2,
            preferredBoundaries: ['function', 'class', 'interface', 'type']
        });
        this.languageProfiles.set('javascript', {
            language: 'javascript',
            sizeMultiplier: 1.0,
            complexityWeight: 1.1,
            preferredBoundaries: ['function', 'class', 'const', 'let']
        });
        this.languageProfiles.set('python', {
            language: 'python',
            sizeMultiplier: 0.9,
            complexityWeight: 1.0,
            preferredBoundaries: ['def', 'class', 'async def']
        });
        this.languageProfiles.set('java', {
            language: 'java',
            sizeMultiplier: 1.2,
            complexityWeight: 1.3,
            preferredBoundaries: ['class', 'interface', 'public', 'private']
        });
        this.languageProfiles.set('rust', {
            language: 'rust',
            sizeMultiplier: 1.1,
            complexityWeight: 1.4,
            preferredBoundaries: ['fn', 'struct', 'impl', 'trait']
        });
        this.languageProfiles.set('go', {
            language: 'go',
            sizeMultiplier: 0.95,
            complexityWeight: 1.0,
            preferredBoundaries: ['func', 'type', 'struct', 'interface']
        });
    }
}
exports.AdaptiveChunkSizing = AdaptiveChunkSizing;
//# sourceMappingURL=adaptiveChunkSizing.js.map