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

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createLogger } from '../utils/logger';

const logger = createLogger('AsyncFileUtils');

export interface FileReadOptions {
 encoding?: BufferEncoding;
 maxSize?: number; // Max file size in bytes
 useStreaming?: boolean; // Use streaming for large files
 streamThreshold?: number; // File size threshold for streaming (bytes)
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
 * File descriptor pool to limit concurrent file operations
 */
class FileDescriptorPool {
 private activeCount = 0;
 private readonly maxConcurrent: number;
 private queue: Array<() => void> = [];

 constructor(maxConcurrent: number = 100) {
 this.maxConcurrent = maxConcurrent;
 }

 async acquire(): Promise<void> {
 if (this.activeCount < this.maxConcurrent) {
 this.activeCount++;
 return;
 }

 // Wait for a slot to become available
 return new Promise<void>(resolve => {
 this.queue.push(resolve);
 });
 }

 release(): void {
 this.activeCount--;

 // Process queue
 const next = this.queue.shift();
 if (next) {
 this.activeCount++;
 next();
 }
 }

 getStats(): { active: number; queued: number; max: number } {
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
export async function readFileAsync(
 filePath: string,
 options: FileReadOptions = {}
): Promise<string | null> {
 const {
 encoding = 'utf-8',
 maxSize = 10 * 1024 * 1024, // 10MB default
 useStreaming = false,
 streamThreshold = 1024 * 1024 // 1MB
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

 } finally {
 fdPool.release();
 }

 } catch (error) {
 logger.error(`Failed to read file ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
 return null;
 }
}

/**
 * Read file using streaming (for large files)
 */
async function readFileStreaming(filePath: string, encoding: BufferEncoding): Promise<string> {
 const chunks: Buffer[] = [];
 const stream = createReadStream(filePath, { encoding });

 return new Promise((resolve, reject) => {
 stream.on('data', (chunk: Buffer) => {
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
export async function readFilesAsync(
 filePaths: string[],
 options: FileReadOptions = {}
): Promise<Map<string, string>> {
 const results = new Map<string, string>();

 // Process in batches to avoid overwhelming the system
 const batchSize = 50;
 for (let i = 0; i < filePaths.length; i += batchSize) {
 const batch = filePaths.slice(i, i + batchSize);

 const batchResults = await Promise.all(
 batch.map(async (filePath) => {
 const content = await readFileAsync(filePath, options);
 return { filePath, content };
 })
 );

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
export async function getFileStatsAsync(filePath: string): Promise<FileStats | null> {
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

 } finally {
 fdPool.release();
 }

 } catch (error) {
 logger.error(`Failed to get stats for ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
 return null;
 }
}

/**
 * Check if file exists asynchronously
 */
export async function fileExistsAsync(filePath: string): Promise<boolean> {
 try {
 await fs.access(filePath);
 return true;
 } catch {
 return false;
 }
}

/**
 * Write file asynchronously
 */
export async function writeFileAsync(
 filePath: string,
 content: string,
 options: { encoding?: BufferEncoding; createDirs?: boolean } = {}
): Promise<boolean> {
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

 } finally {
 fdPool.release();
 }

 } catch (error) {
 logger.error(`Failed to write file ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
 return false;
 }
}

/**
 * Find files matching pattern asynchronously
 */
export async function findFilesAsync(
 directory: string,
 pattern: RegExp,
 options: { maxDepth?: number; exclude?: RegExp[] } = {}
): Promise<string[]> {
 const { maxDepth = 10, exclude = [/node_modules/, /\.git/] } = options;
 const results: string[] = [];

 async function walk(dir: string, depth: number): Promise<void> {
 if (depth > maxDepth) return;

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
 } else if (entry.isFile() && pattern.test(entry.name)) {
 results.push(fullPath);
 }
 }
 } catch (error) {
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
export function getFilePoolStats(): { active: number; queued: number; max: number } {
 return fdPool.getStats();
}

/**
 * Batch read files with detailed results
 */
export async function batchReadFiles(
 filePaths: string[],
 options: FileReadOptions = {}
): Promise<BatchReadResult[]> {
 const results: BatchReadResult[] = [];
 const batchSize = 50;

 for (let i = 0; i < filePaths.length; i += batchSize) {
 const batch = filePaths.slice(i, i + batchSize);

 const batchResults = await Promise.all(
 batch.map(async (filePath) => {
 const startTime = Date.now();
 try {
 const content = await readFileAsync(filePath, options);
 return {
 filePath,
 content: content || undefined,
 error: content === null ? 'Failed to read file' : undefined,
 duration: Date.now() - startTime
 };
 } catch (error) {
 return {
 filePath,
 error: error instanceof Error ? error.message : 'Unknown error',
 duration: Date.now() - startTime
 };
 }
 })
 );

 results.push(...batchResults);
 }

 return results;
}

