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
export interface FileReadOptions {
    encoding?: BufferEncoding;
    maxSize?: number;
    useStreaming?: boolean;
    streamThreshold?: number;
}
export interface FileStats {
    size: number;
    modified: number;
    hash: string;
    isDirectory: boolean;
    isFile: boolean;
}
export interface BatchReadResult {
    filePath: string;
    content?: string;
    error?: string;
    duration: number;
}
/**
 * Read file content asynchronously
 */
export declare function readFileAsync(filePath: string, options?: FileReadOptions): Promise<string | null>;
/**
 * Read multiple files in parallel with controlled concurrency
 */
export declare function readFilesAsync(filePaths: string[], options?: FileReadOptions): Promise<Map<string, string>>;
/**
 * Get file stats asynchronously
 */
export declare function getFileStatsAsync(filePath: string): Promise<FileStats | null>;
/**
 * Check if file exists asynchronously
 */
export declare function fileExistsAsync(filePath: string): Promise<boolean>;
/**
 * Write file asynchronously
 */
export declare function writeFileAsync(filePath: string, content: string, options?: {
    encoding?: BufferEncoding;
    createDirs?: boolean;
}): Promise<boolean>;
/**
 * Find files matching pattern asynchronously
 */
export declare function findFilesAsync(directory: string, pattern: RegExp, options?: {
    maxDepth?: number;
    exclude?: RegExp[];
}): Promise<string[]>;
/**
 * Get file descriptor pool stats
 */
export declare function getFilePoolStats(): {
    active: number;
    queued: number;
    max: number;
};
/**
 * Batch read files with detailed results
 */
export declare function batchReadFiles(filePaths: string[], options?: FileReadOptions): Promise<BatchReadResult[]>;
//# sourceMappingURL=asyncFileUtils.d.ts.map