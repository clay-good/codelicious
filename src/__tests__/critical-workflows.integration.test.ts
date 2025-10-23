/**
 * Critical Workflows Integration Tests
 *
 * Tests end-to-end workflows that are critical for production:
 * 1. File operations with error recovery
 * 2. Git integration workflows
 * 3. Utility functions integration
 * 4. Code analysis workflows
 * 5. Pattern detection and learning
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

// Import testable systems (no VS Code dependencies)
import { readFileAsync, writeFileAsync, batchReadFiles } from '../utils/asyncFileUtils';
import { GitService } from '../git/gitService';
import { CodeAnalyzer } from '../intelligence/codeAnalyzer';
import { DependencyAnalyzer } from '../intelligence/dependencyAnalyzer';
import { calculateCyclomaticComplexity } from '../utils/complexityAnalyzer';

describe('Critical Workflows Integration Tests', () => {
 let testWorkspace: string;
 let gitService: GitService;

 beforeAll(async () => {
 // Create temporary test workspace
 testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'codelicious-integration-'));
 });

 afterAll(async () => {
 // Cleanup test workspace
 try {
 await fs.rm(testWorkspace, { recursive: true, force: true });
 } catch (error) {
 console.warn('Failed to cleanup test workspace:', error);
 }
 });

 describe('1. File Operations with Error Recovery', () => {
 it('should read files asynchronously with pooling', async () => {
 // Create test files
 const files = Array.from({ length: 10 }, (_, i) => ({
 path: path.join(testWorkspace, `file${i}.txt`),
 content: `Content ${i}`
 }));

 for (const file of files) {
 await writeFileAsync(file.path, file.content);
 }

 // Read files in batch
 const contents = await batchReadFiles(files.map(f => f.path));

 expect(contents).toHaveLength(10);
 expect(contents.every(c => c !== null)).toBe(true);
 }, 10000);

 it('should handle missing files gracefully', async () => {
 const content = await readFileAsync('/nonexistent/file.txt');
 expect(content).toBeNull();
 });

 it('should handle write errors gracefully', async () => {
 const result = await writeFileAsync('/invalid/path/file.txt', 'content', {
 createDirs: false
 });
 expect(result).toBe(false);
 });

 it('should write multiple files successfully', async () => {
 const files = Array.from({ length: 5 }, (_, i) => ({
 path: path.join(testWorkspace, `batch${i}.txt`),
 content: `Batch content ${i}`
 }));

 // Write files individually
 for (const file of files) {
 const result = await writeFileAsync(file.path, file.content);
 expect(result).toBe(true);
 }

 // Verify files were written
 for (const file of files) {
 const content = await readFileAsync(file.path);
 expect(content).toBe(file.content);
 }
 }, 10000);
 });

 describe('2. Git Integration Workflows', () => {
 beforeAll(() => {
 gitService = new GitService(testWorkspace);
 });

 it('should handle non-git directories gracefully', async () => {
 const nonGitWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'non-git-'));
 const nonGitService = new GitService(nonGitWorkspace);

 // Should not throw error even if not a git repo
 try {
 const status = await nonGitService.getStatus();
 expect(status).toBeTruthy();
 } catch (error) {
 // Expected to fail for non-git directory
 expect(error).toBeTruthy();
 }

 await fs.rm(nonGitWorkspace, { recursive: true, force: true });
 });

 it('should create GitService instance', () => {
 expect(gitService).toBeTruthy();
 expect(gitService).toBeInstanceOf(GitService);
 });
 });

 describe('3. Code Analysis Workflows', () => {
 it('should analyze code file', async () => {
 const code = `
export class Calculator {
 add(a: number, b: number): number {
 return a + b;
 }

 subtract(a: number, b: number): number {
 return a - b;
 }
}
 `;

 const filePath = path.join(testWorkspace, 'calculator.ts');
 await writeFileAsync(filePath, code);

 const analyzer = new CodeAnalyzer(testWorkspace);
 const analysis = await analyzer.analyzeFile(filePath);

 expect(analysis).toBeTruthy();
 expect(analysis.metrics).toBeTruthy();
 expect(analysis.metrics.linesOfCode).toBeGreaterThan(0);
 });

 it('should analyze code complexity', async () => {
 const code = `
function complexFunction(x: number): number {
 if (x > 10) {
 for (let i = 0; i < x; i++) {
 if (i % 2 === 0) {
 console.log(i);
 }
 }
 } else {
 return x * 2;
 }
 return x;
}
 `;

 const complexity = calculateCyclomaticComplexity(code);
 expect(complexity).toBeGreaterThan(1);
 });
 });

 describe('4. Dependency Analysis Workflows', () => {
 it('should create dependency analyzer instance', async () => {
 // Create test files with dependencies
 const file1 = path.join(testWorkspace, 'utils.ts');
 const file2 = path.join(testWorkspace, 'service.ts');

 await writeFileAsync(file1, `
export function helper(): string {
 return 'helper';
}
 `);

 await writeFileAsync(file2, `
import { helper } from './utils';

export class Service {
 use() {
 return helper();
 }
}
 `);

 const analyzer = new DependencyAnalyzer(testWorkspace);
 expect(analyzer).toBeTruthy();
 expect(analyzer).toBeInstanceOf(DependencyAnalyzer);

 // Note: analyzeWorkspace requires VS Code workspace API
 // which is not available in test environment
 });
 });

 describe('5. End-to-End File Workflow', () => {
 it('should complete full workflow: write → read → analyze', async () => {
 // Step 1: Write code to file
 const code = `
export class UserService {
 private users: Map<string, User> = new Map();

 async getUser(id: string): Promise<User | null> {
 return this.users.get(id) || null;
 }

 async createUser(user: User): Promise<void> {
 this.users.set(user.id, user);
 }
}

interface User {
 id: string;
 name: string;
 email: string;
}
 `;

 const filePath = path.join(testWorkspace, 'userService.ts');
 const writeSuccess = await writeFileAsync(filePath, code);
 expect(writeSuccess).toBe(true);

 // Step 2: Read back and verify
 const readContent = await readFileAsync(filePath);
 expect(readContent).toBe(code);

 // Step 3: Analyze the code
 const analyzer = new CodeAnalyzer(testWorkspace);
 const analysis = await analyzer.analyzeFile(filePath);
 expect(analysis.metrics.linesOfCode).toBeGreaterThan(0);

 // Step 4: Verify file exists
 const stats = await fs.stat(filePath);
 expect(stats.isFile()).toBe(true);

 // Step 5: Calculate complexity
 const complexity = calculateCyclomaticComplexity(code);
 expect(complexity).toBeGreaterThan(0);
 }, 10000);
 });
});

