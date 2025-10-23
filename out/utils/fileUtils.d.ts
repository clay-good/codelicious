/**
 * File utility functions for indexing
 */
import ignore from 'ignore';
/**
 * Get file hash for change detection
 */
export declare function getFileHash(filePath: string): string;
/**
 * Get file size in bytes
 */
export declare function getFileSize(filePath: string): number;
/**
 * Get file last modified time
 */
export declare function getFileModifiedTime(filePath: string): number;
/**
 * Detect programming language from file extension
 */
export declare function detectLanguage(filePath: string): string;
/**
 * Check if file should be indexed
 */
export declare function shouldIndexFile(filePath: string): boolean;
/**
 * Create ignore matcher from patterns
 */
export declare function createIgnoreMatcher(patterns: string[]): ReturnType<typeof ignore>;
/**
 * Find all files in directory matching patterns
 */
export declare function findFiles(directory: string, excludePatterns?: string[]): Promise<string[]>;
/**
 * Read file content safely
 */
export declare function readFileContent(filePath: string): string | null;
/**
 * Check if file exists
 */
export declare function fileExists(filePath: string): boolean;
/**
 * Get relative path from workspace root
 */
export declare function getRelativePath(filePath: string, workspaceRoot: string): string;
/**
 * Detect project type from workspace
 */
export declare function detectProjectType(workspaceRoot: string): string;
/**
 * Parse package.json for dependencies
 */
export declare function parsePackageJson(workspaceRoot: string): Record<string, any> | null;
/**
 * Get file statistics
 */
export interface FileStats {
    size: number;
    modified: number;
    hash: string;
    language: string;
    relativePath: string;
}
export declare function getFileStats(filePath: string, workspaceRoot: string): FileStats;
//# sourceMappingURL=fileUtils.d.ts.map