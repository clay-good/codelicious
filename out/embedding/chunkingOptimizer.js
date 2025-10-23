"use strict";
/**
 * Chunking Optimization
 *
 * Optimizes:
 * - Chunk quality scoring
 * - Deduplication strategies
 * - Optimal overlap calculation
 * - Performance profiling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkingOptimizer = void 0;
class ChunkingOptimizer {
    constructor(config) {
        this.config = {
            minChunkSize: 100,
            maxChunkSize: 2000,
            targetChunkSize: 500,
            overlapSize: 50,
            deduplicationEnabled: true,
            qualityThreshold: 0.6,
            ...config
        };
        this.chunkHashes = new Set();
        this.qualityStats = new Map();
    }
    /**
    * Optimize chunks
    */
    optimizeChunks(chunks) {
        let optimized = chunks;
        // 1. Score quality
        optimized = this.scoreChunkQuality(optimized);
        // 2. Deduplicate
        if (this.config.deduplicationEnabled) {
            optimized = this.deduplicateChunks(optimized);
        }
        // 3. Optimize overlap
        optimized = this.optimizeOverlap(optimized);
        // 4. Filter low quality
        optimized = this.filterLowQuality(optimized);
        // 5. Merge small chunks
        optimized = this.mergeSmallChunks(optimized);
        return optimized;
    }
    /**
    * Score chunk quality
    */
    scoreChunkQuality(chunks) {
        return chunks.map(chunk => {
            const metrics = this.calculateQualityMetrics(chunk);
            this.qualityStats.set(this.getChunkId(chunk), metrics);
            return chunk;
        });
    }
    /**
    * Calculate quality metrics
    */
    calculateQualityMetrics(chunk) {
        const coherence = this.calculateCoherence(chunk);
        const completeness = this.calculateCompleteness(chunk);
        const size = this.calculateSizeScore(chunk);
        const overlap = this.calculateOverlapScore(chunk);
        const uniqueness = this.calculateUniqueness(chunk);
        const overall = (coherence * 0.3 +
            completeness * 0.3 +
            size * 0.2 +
            overlap * 0.1 +
            uniqueness * 0.1);
        return {
            coherence,
            completeness,
            size,
            overlap,
            uniqueness,
            overall
        };
    }
    /**
    * Calculate coherence
    */
    calculateCoherence(chunk) {
        const lines = chunk.content.split('\n');
        // Check for semantic boundaries
        let boundaryViolations = 0;
        for (let i = 1; i < lines.length; i++) {
            const prev = lines[i - 1].trim();
            const curr = lines[i].trim();
            // Check for abrupt transitions
            if (this.isAbruptTransition(prev, curr)) {
                boundaryViolations++;
            }
        }
        return Math.max(0, 1 - (boundaryViolations / lines.length));
    }
    /**
    * Check for abrupt transition
    */
    isAbruptTransition(prev, curr) {
        // Function definition after unrelated code
        if (!prev.includes('function') && curr.includes('function')) {
            return true;
        }
        // Class definition after unrelated code
        if (!prev.includes('class') && curr.includes('class')) {
            return true;
        }
        return false;
    }
    /**
    * Calculate completeness
    */
    calculateCompleteness(chunk) {
        const content = chunk.content;
        // Check for complete logical units
        let score = 1.0;
        // Unclosed braces
        const openBraces = (content.match(/{/g) || []).length;
        const closeBraces = (content.match(/}/g) || []).length;
        if (openBraces !== closeBraces) {
            score -= 0.3;
        }
        // Unclosed parentheses
        const openParens = (content.match(/\(/g) || []).length;
        const closeParens = (content.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
            score -= 0.2;
        }
        // Incomplete function
        if (content.includes('function') && !content.includes('return') && !content.includes('}')) {
            score -= 0.2;
        }
        return Math.max(0, score);
    }
    /**
    * Calculate size score
    */
    calculateSizeScore(chunk) {
        const size = chunk.content.length;
        if (size < this.config.minChunkSize) {
            return size / this.config.minChunkSize;
        }
        else if (size > this.config.maxChunkSize) {
            return this.config.maxChunkSize / size;
        }
        else {
            // Gaussian around target size
            const diff = Math.abs(size - this.config.targetChunkSize);
            return Math.exp(-(diff * diff) / (2 * this.config.targetChunkSize * this.config.targetChunkSize));
        }
    }
    /**
    * Calculate overlap score
    */
    calculateOverlapScore(chunk) {
        // This would check overlap with adjacent chunks
        // For now, return 1.0
        return 1.0;
    }
    /**
    * Calculate uniqueness
    */
    calculateUniqueness(chunk) {
        const hash = this.hashChunk(chunk);
        if (this.chunkHashes.has(hash)) {
            return 0.0;
        }
        this.chunkHashes.add(hash);
        return 1.0;
    }
    /**
    * Deduplicate chunks
    */
    deduplicateChunks(chunks) {
        const seen = new Set();
        const unique = [];
        for (const chunk of chunks) {
            const hash = this.hashChunk(chunk);
            if (!seen.has(hash)) {
                seen.add(hash);
                unique.push(chunk);
            }
        }
        return unique;
    }
    /**
    * Hash chunk for deduplication
    */
    hashChunk(chunk) {
        // Simple hash based on content
        const normalized = chunk.content
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        return this.simpleHash(normalized);
    }
    /**
    * Simple hash function
    */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }
    /**
    * Optimize overlap
    */
    optimizeOverlap(chunks) {
        // This would adjust overlap between adjacent chunks
        // For now, return as-is
        return chunks;
    }
    /**
    * Filter low quality chunks
    */
    filterLowQuality(chunks) {
        return chunks.filter(chunk => {
            const metrics = this.qualityStats.get(this.getChunkId(chunk));
            return !metrics || metrics.overall >= this.config.qualityThreshold;
        });
    }
    /**
    * Merge small chunks
    */
    mergeSmallChunks(chunks) {
        const merged = [];
        let current = null;
        for (const chunk of chunks) {
            if (chunk.content.length < this.config.minChunkSize) {
                if (current) {
                    // Merge with current
                    current = {
                        content: current.content + '\n' + chunk.content,
                        type: current.type,
                        startLine: current.startLine,
                        endLine: chunk.endLine,
                        language: current.language
                    };
                }
                else {
                    current = chunk;
                }
            }
            else {
                if (current) {
                    merged.push(current);
                    current = null;
                }
                merged.push(chunk);
            }
        }
        if (current) {
            merged.push(current);
        }
        return merged;
    }
    /**
    * Get chunk ID
    */
    getChunkId(chunk) {
        return `${chunk.startLine}-${chunk.endLine}`;
    }
    /**
    * Get quality statistics
    */
    getQualityStatistics() {
        const qualities = Array.from(this.qualityStats.values());
        const averageQuality = qualities.length > 0
            ? qualities.reduce((sum, m) => sum + m.overall, 0) / qualities.length
            : 0;
        const lowQualityCount = qualities.filter(m => m.overall < this.config.qualityThreshold).length;
        const duplicateCount = qualities.filter(m => m.uniqueness === 0).length;
        return {
            averageQuality,
            lowQualityCount,
            duplicateCount
        };
    }
    /**
    * Profile chunking performance
    */
    profileChunking(chunks) {
        const sizes = chunks.map(c => c.content.length);
        const averageSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
        const sizeDistribution = {
            small: sizes.filter(s => s < this.config.minChunkSize).length,
            medium: sizes.filter(s => s >= this.config.minChunkSize && s <= this.config.maxChunkSize).length,
            large: sizes.filter(s => s > this.config.maxChunkSize).length
        };
        const qualities = Array.from(this.qualityStats.values());
        const qualityDistribution = {
            low: qualities.filter(q => q.overall < 0.5).length,
            medium: qualities.filter(q => q.overall >= 0.5 && q.overall < 0.8).length,
            high: qualities.filter(q => q.overall >= 0.8).length
        };
        return {
            totalChunks: chunks.length,
            averageSize,
            sizeDistribution,
            qualityDistribution
        };
    }
}
exports.ChunkingOptimizer = ChunkingOptimizer;
//# sourceMappingURL=chunkingOptimizer.js.map