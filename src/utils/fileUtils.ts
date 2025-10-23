/**
 * File utility functions for indexing
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import ignore from 'ignore';
import fastGlob from 'fast-glob';
import { createLogger } from './logger';

const logger = createLogger('FileUtils');

/**
 * Get file hash for change detection
 */
export function getFileHash(filePath: string): string {
 try {
 const content = fs.readFileSync(filePath, 'utf8');
 return crypto.createHash('md5').update(content).digest('hex');
 } catch (error) {
 logger.error(`Error hashing file ${filePath}`, error);
 return '';
 }
}

/**
 * Get file size in bytes
 */
export function getFileSize(filePath: string): number {
 try {
 const stats = fs.statSync(filePath);
 return stats.size;
 } catch (error) {
 return 0;
 }
}

/**
 * Get file last modified time
 */
export function getFileModifiedTime(filePath: string): number {
 try {
 const stats = fs.statSync(filePath);
 return stats.mtimeMs;
 } catch (error) {
 return 0;
 }
}

/**
 * Detect programming language from file extension
 */
export function detectLanguage(filePath: string): string {
 const ext = path.extname(filePath).toLowerCase();

 const languageMap: Record<string, string> = {
 '.ts': 'typescript',
 '.tsx': 'typescript',
 '.js': 'javascript',
 '.jsx': 'javascript',
 '.py': 'python',
 '.rs': 'rust',
 '.go': 'go',
 '.java': 'java',
 '.c': 'c',
 '.cpp': 'cpp',
 '.h': 'c',
 '.hpp': 'cpp',
 '.cs': 'csharp',
 '.rb': 'ruby',
 '.php': 'php',
 '.swift': 'swift',
 '.kt': 'kotlin',
 '.scala': 'scala',
 '.r': 'r',
 '.m': 'objective-c',
 '.sh': 'shell',
 '.bash': 'shell',
 '.zsh': 'shell',
 '.sql': 'sql',
 '.html': 'html',
 '.css': 'css',
 '.scss': 'scss',
 '.json': 'json',
 '.xml': 'xml',
 '.yaml': 'yaml',
 '.yml': 'yaml',
 '.md': 'markdown',
 '.txt': 'text'
 };

 return languageMap[ext] || 'unknown';
}

/**
 * Check if file should be indexed
 */
export function shouldIndexFile(filePath: string): boolean {
 const language = detectLanguage(filePath);

 // Only index known programming languages and documentation
 const indexableLanguages = [
 'typescript', 'javascript', 'python', 'rust', 'go', 'java',
 'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin',
 'scala', 'r', 'objective-c', 'shell', 'sql', 'markdown'
 ];

 return indexableLanguages.includes(language);
}

/**
 * Create ignore matcher from patterns
 */
export function createIgnoreMatcher(patterns: string[]): ReturnType<typeof ignore> {
 const ig = ignore();
 ig.add(patterns);
 return ig;
}

/**
 * Find all files in directory matching patterns
 */
export async function findFiles(
 directory: string,
 excludePatterns: string[] = []
): Promise<string[]> {
 try {
 const files = await fastGlob('**/*', {
 cwd: directory,
 absolute: true,
 ignore: excludePatterns,
 onlyFiles: true,
 followSymbolicLinks: false
 });

 return files.filter(shouldIndexFile);
 } catch (error) {
 logger.error('Error finding files', error);
 return [];
 }
}

/**
 * Read file content safely
 */
export function readFileContent(filePath: string): string | null {
 try {
 return fs.readFileSync(filePath, 'utf8');
 } catch (error) {
 logger.error(`Error reading file ${filePath}`, error);
 return null;
 }
}

/**
 * Check if file exists
 */
export function fileExists(filePath: string): boolean {
 try {
 return fs.existsSync(filePath);
 } catch (error) {
 return false;
 }
}

/**
 * Get relative path from workspace root
 */
export function getRelativePath(filePath: string, workspaceRoot: string): string {
 return path.relative(workspaceRoot, filePath);
}

/**
 * Detect project type from workspace
 */
export function detectProjectType(workspaceRoot: string): string {
 const indicators: Record<string, string[]> = {
 'node': ['package.json', 'node_modules'],
 'python': ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
 'rust': ['Cargo.toml', 'Cargo.lock'],
 'go': ['go.mod', 'go.sum'],
 'java': ['pom.xml', 'build.gradle', 'build.gradle.kts'],
 'dotnet': ['*.csproj', '*.sln'],
 'ruby': ['Gemfile', 'Gemfile.lock'],
 'php': ['composer.json', 'composer.lock']
 };

 for (const [type, files] of Object.entries(indicators)) {
 for (const file of files) {
 const filePath = path.join(workspaceRoot, file);
 if (fileExists(filePath)) {
 return type;
 }
 }
 }

 return 'unknown';
}

/**
 * Parse package.json for dependencies
 */
export function parsePackageJson(workspaceRoot: string): Record<string, any> | null {
 const packagePath = path.join(workspaceRoot, 'package.json');

 if (!fileExists(packagePath)) {
 return null;
 }

 try {
 const content = readFileContent(packagePath);
 if (!content) {
 return null;
 }
 return JSON.parse(content);
 } catch (error) {
 logger.error('Error parsing package.json', error);
 return null;
 }
}

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

export function getFileStats(filePath: string, workspaceRoot: string): FileStats {
 return {
 size: getFileSize(filePath),
 modified: getFileModifiedTime(filePath),
 hash: getFileHash(filePath),
 language: detectLanguage(filePath),
 relativePath: getRelativePath(filePath, workspaceRoot)
 };
}

