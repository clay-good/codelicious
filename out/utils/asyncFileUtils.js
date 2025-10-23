"use strict";
/**
 * Async File Utilities
 * High-performance async file operations to replace blocking fs.readFileSync
 *
 * Performance improvements:
 * - Non-blocking I/O
 * - File descriptor pooling
 * - Streaming for large files
 * - Batch operations
 * - Error recovery
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
exports.readFileAsync = readFileAsync;
exports.readFilesAsync = readFilesAsync;
exports.getFileStatsAsync = getFileStatsAsync;
exports.fileExistsAsync = fileExistsAsync;
exports.writeFileAsync = writeFileAsync;
exports.findFilesAsync = findFilesAsync;
exports.getFilePoolStats = getFilePoolStats;
exports.batchReadFiles = batchReadFiles;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const fs_1 = require("fs");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AsyncFileUtils');
/**
 * File descriptor pool to limit concurrent file operations
 */
class FileDescriptorPool {
    constructor(maxConcurrent = 100) {
        this.activeCount = 0;
        this.queue = [];
        this.maxConcurrent = maxConcurrent;
    }
    async acquire() {
        if (this.activeCount < this.maxConcurrent) {
            this.activeCount++;
            return;
        }
        // Wait for a slot to become available
        return new Promise(resolve => {
            this.queue.push(resolve);
        });
    }
    release() {
        this.activeCount--;
        // Process queue
        const next = this.queue.shift();
        if (next) {
            this.activeCount++;
            next();
        }
    }
    getStats() {
        return {
            active: this.activeCount,
            queued: this.queue.length,
            max: this.maxConcurrent
        };
    }
}
// Global file descriptor pool
const fdPool = new FileDescriptorPool(100);
/**
 * Read file content asynchronously
 */
async function readFileAsync(filePath, options = {}) {
    const { encoding = 'utf-8', maxSize = 10 * 1024 * 1024, // 10MB default
    useStreaming = false, streamThreshold = 1024 * 1024 // 1MB
     } = options;
    try {
        // Acquire file descriptor slot
        await fdPool.acquire();
        try {
            // Check file size first
            const stats = await fs.stat(filePath);
            if (stats.size > maxSize) {
                logger.warn(`File ${filePath} exceeds max size (${stats.size} > ${maxSize})`);
                return null;
            }
            // Use streaming for large files
            if (useStreaming && stats.size > streamThreshold) {
                return await readFileStreaming(filePath, encoding);
            }
            // Read file normally
            const content = await fs.readFile(filePath, encoding);
            return content;
        }
        finally {
            fdPool.release();
        }
    }
    catch (error) {
        logger.error(`Failed to read file ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}
/**
 * Read file using streaming (for large files)
 */
async function readFileStreaming(filePath, encoding) {
    const chunks = [];
    const stream = (0, fs_1.createReadStream)(filePath, { encoding });
    return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => {
            chunks.push(chunk);
        });
        stream.on('end', () => {
            resolve(Buffer.concat(chunks).toString(encoding));
        });
        stream.on('error', (error) => {
            reject(error);
        });
    });
}
/**
 * Read multiple files in parallel with controlled concurrency
 */
async function readFilesAsync(filePaths, options = {}) {
    const results = new Map();
    // Process in batches to avoid overwhelming the system
    const batchSize = 50;
    for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (filePath) => {
            const content = await readFileAsync(filePath, options);
            return { filePath, content };
        }));
        for (const { filePath, content } of batchResults) {
            if (content !== null) {
                results.set(filePath, content);
            }
        }
    }
    return results;
}
/**
 * Get file stats asynchronously
 */
async function getFileStatsAsync(filePath) {
    try {
        await fdPool.acquire();
        try {
            const stats = await fs.stat(filePath);
            // Calculate file hash
            const content = await fs.readFile(filePath);
            const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
            return {
                size: stats.size,
                modified: stats.mtimeMs,
                hash,
                isDirectory: stats.isDirectory(),
                isFile: stats.isFile()
            };
        }
        finally {
            fdPool.release();
        }
    }
    catch (error) {
        logger.error(`Failed to get stats for ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
        return null;
    }
}
/**
 * Check if file exists asynchronously
 */
async function fileExistsAsync(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Write file asynchronously
 */
async function writeFileAsync(filePath, content, options = {}) {
    const { encoding = 'utf-8', createDirs = true } = options;
    try {
        await fdPool.acquire();
        try {
            // Create directories if needed
            if (createDirs) {
                const dir = path.dirname(filePath);
                await fs.mkdir(dir, { recursive: true });
            }
            await fs.writeFile(filePath, content, encoding);
            return true;
        }
        finally {
            fdPool.release();
        }
    }
    catch (error) {
        logger.error(`Failed to write file ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
        return false;
    }
}
/**
 * Find files matching pattern asynchronously
 */
async function findFilesAsync(directory, pattern, options = {}) {
    const { maxDepth = 10, exclude = [/node_modules/, /\.git/] } = options;
    const results = [];
    async function walk(dir, depth) {
        if (depth > maxDepth)
            return;
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                // Check exclusions
                if (exclude.some(ex => ex.test(fullPath))) {
                    continue;
                }
                if (entry.isDirectory()) {
                    await walk(fullPath, depth + 1);
                }
                else if (entry.isFile() && pattern.test(entry.name)) {
                    results.push(fullPath);
                }
            }
        }
        catch (error) {
            // Skip directories we can't read
            logger.debug(`Failed to read directory ${dir}:`, error instanceof Error ? error.message : 'Unknown error');
        }
    }
    await walk(directory, 0);
    return results;
}
/**
 * Get file descriptor pool stats
 */
function getFilePoolStats() {
    return fdPool.getStats();
}
/**
 * Batch read files with detailed results
 */
async function batchReadFiles(filePaths, options = {}) {
    const results = [];
    const batchSize = 50;
    for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (filePath) => {
            const startTime = Date.now();
            try {
                const content = await readFileAsync(filePath, options);
                return {
                    filePath,
                    content: content || undefined,
                    error: content === null ? 'Failed to read file' : undefined,
                    duration: Date.now() - startTime
                };
            }
            catch (error) {
                return {
                    filePath,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    duration: Date.now() - startTime
                };
            }
        }));
        results.push(...batchResults);
    }
    return results;
}
//# sourceMappingURL=asyncFileUtils.js.map