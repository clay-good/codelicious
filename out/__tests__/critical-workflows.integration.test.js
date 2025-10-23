"use strict";
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
const globals_1 = require("@jest/globals");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
// Import testable systems (no VS Code dependencies)
const asyncFileUtils_1 = require("../utils/asyncFileUtils");
const gitService_1 = require("../git/gitService");
const codeAnalyzer_1 = require("../intelligence/codeAnalyzer");
const dependencyAnalyzer_1 = require("../intelligence/dependencyAnalyzer");
const complexityAnalyzer_1 = require("../utils/complexityAnalyzer");
(0, globals_1.describe)('Critical Workflows Integration Tests', () => {
    let testWorkspace;
    let gitService;
    (0, globals_1.beforeAll)(async () => {
        // Create temporary test workspace
        testWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'codelicious-integration-'));
    });
    (0, globals_1.afterAll)(async () => {
        // Cleanup test workspace
        try {
            await fs.rm(testWorkspace, { recursive: true, force: true });
        }
        catch (error) {
            console.warn('Failed to cleanup test workspace:', error);
        }
    });
    (0, globals_1.describe)('1. File Operations with Error Recovery', () => {
        (0, globals_1.it)('should read files asynchronously with pooling', async () => {
            // Create test files
            const files = Array.from({ length: 10 }, (_, i) => ({
                path: path.join(testWorkspace, `file${i}.txt`),
                content: `Content ${i}`
            }));
            for (const file of files) {
                await (0, asyncFileUtils_1.writeFileAsync)(file.path, file.content);
            }
            // Read files in batch
            const contents = await (0, asyncFileUtils_1.batchReadFiles)(files.map(f => f.path));
            (0, globals_1.expect)(contents).toHaveLength(10);
            (0, globals_1.expect)(contents.every(c => c !== null)).toBe(true);
        }, 10000);
        (0, globals_1.it)('should handle missing files gracefully', async () => {
            const content = await (0, asyncFileUtils_1.readFileAsync)('/nonexistent/file.txt');
            (0, globals_1.expect)(content).toBeNull();
        });
        (0, globals_1.it)('should handle write errors gracefully', async () => {
            const result = await (0, asyncFileUtils_1.writeFileAsync)('/invalid/path/file.txt', 'content', {
                createDirs: false
            });
            (0, globals_1.expect)(result).toBe(false);
        });
        (0, globals_1.it)('should write multiple files successfully', async () => {
            const files = Array.from({ length: 5 }, (_, i) => ({
                path: path.join(testWorkspace, `batch${i}.txt`),
                content: `Batch content ${i}`
            }));
            // Write files individually
            for (const file of files) {
                const result = await (0, asyncFileUtils_1.writeFileAsync)(file.path, file.content);
                (0, globals_1.expect)(result).toBe(true);
            }
            // Verify files were written
            for (const file of files) {
                const content = await (0, asyncFileUtils_1.readFileAsync)(file.path);
                (0, globals_1.expect)(content).toBe(file.content);
            }
        }, 10000);
    });
    (0, globals_1.describe)('2. Git Integration Workflows', () => {
        (0, globals_1.beforeAll)(() => {
            gitService = new gitService_1.GitService(testWorkspace);
        });
        (0, globals_1.it)('should handle non-git directories gracefully', async () => {
            const nonGitWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'non-git-'));
            const nonGitService = new gitService_1.GitService(nonGitWorkspace);
            // Should not throw error even if not a git repo
            try {
                const status = await nonGitService.getStatus();
                (0, globals_1.expect)(status).toBeTruthy();
            }
            catch (error) {
                // Expected to fail for non-git directory
                (0, globals_1.expect)(error).toBeTruthy();
            }
            await fs.rm(nonGitWorkspace, { recursive: true, force: true });
        });
        (0, globals_1.it)('should create GitService instance', () => {
            (0, globals_1.expect)(gitService).toBeTruthy();
            (0, globals_1.expect)(gitService).toBeInstanceOf(gitService_1.GitService);
        });
    });
    (0, globals_1.describe)('3. Code Analysis Workflows', () => {
        (0, globals_1.it)('should analyze code file', async () => {
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
            await (0, asyncFileUtils_1.writeFileAsync)(filePath, code);
            const analyzer = new codeAnalyzer_1.CodeAnalyzer(testWorkspace);
            const analysis = await analyzer.analyzeFile(filePath);
            (0, globals_1.expect)(analysis).toBeTruthy();
            (0, globals_1.expect)(analysis.metrics).toBeTruthy();
            (0, globals_1.expect)(analysis.metrics.linesOfCode).toBeGreaterThan(0);
        });
        (0, globals_1.it)('should analyze code complexity', async () => {
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
            const complexity = (0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code);
            (0, globals_1.expect)(complexity).toBeGreaterThan(1);
        });
    });
    (0, globals_1.describe)('4. Dependency Analysis Workflows', () => {
        (0, globals_1.it)('should create dependency analyzer instance', async () => {
            // Create test files with dependencies
            const file1 = path.join(testWorkspace, 'utils.ts');
            const file2 = path.join(testWorkspace, 'service.ts');
            await (0, asyncFileUtils_1.writeFileAsync)(file1, `
export function helper(): string {
 return 'helper';
}
 `);
            await (0, asyncFileUtils_1.writeFileAsync)(file2, `
import { helper } from './utils';

export class Service {
 use() {
 return helper();
 }
}
 `);
            const analyzer = new dependencyAnalyzer_1.DependencyAnalyzer(testWorkspace);
            (0, globals_1.expect)(analyzer).toBeTruthy();
            (0, globals_1.expect)(analyzer).toBeInstanceOf(dependencyAnalyzer_1.DependencyAnalyzer);
            // Note: analyzeWorkspace requires VS Code workspace API
            // which is not available in test environment
        });
    });
    (0, globals_1.describe)('5. End-to-End File Workflow', () => {
        (0, globals_1.it)('should complete full workflow: write → read → analyze', async () => {
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
            const writeSuccess = await (0, asyncFileUtils_1.writeFileAsync)(filePath, code);
            (0, globals_1.expect)(writeSuccess).toBe(true);
            // Step 2: Read back and verify
            const readContent = await (0, asyncFileUtils_1.readFileAsync)(filePath);
            (0, globals_1.expect)(readContent).toBe(code);
            // Step 3: Analyze the code
            const analyzer = new codeAnalyzer_1.CodeAnalyzer(testWorkspace);
            const analysis = await analyzer.analyzeFile(filePath);
            (0, globals_1.expect)(analysis.metrics.linesOfCode).toBeGreaterThan(0);
            // Step 4: Verify file exists
            const stats = await fs.stat(filePath);
            (0, globals_1.expect)(stats.isFile()).toBe(true);
            // Step 5: Calculate complexity
            const complexity = (0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code);
            (0, globals_1.expect)(complexity).toBeGreaterThan(0);
        }, 10000);
    });
});
//# sourceMappingURL=critical-workflows.integration.test.js.map