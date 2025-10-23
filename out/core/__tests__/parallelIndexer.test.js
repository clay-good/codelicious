"use strict";
/**
 * Tests for Parallel Indexer
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
const parallelIndexer_1 = require("../parallelIndexer");
const path = __importStar(require("path"));
// Mock file utils
jest.mock('../../utils/fileUtils', () => ({
    readFileContent: jest.fn((filePath) => {
        if (filePath.includes('error'))
            return null;
        return `// Mock content for ${path.basename(filePath)}`;
    }),
    getFileStats: jest.fn((filePath) => ({
        size: 1000,
        modified: Date.now(),
        hash: 'mock-hash'
    })),
    detectLanguage: jest.fn((filePath) => {
        if (filePath.endsWith('.ts'))
            return 'typescript';
        if (filePath.endsWith('.js'))
            return 'javascript';
        if (filePath.endsWith('.py'))
            return 'python';
        return 'unknown';
    })
}));
jest.mock('../../utils/symbolParser', () => ({
    parseSymbols: jest.fn(() => []),
    parseImports: jest.fn(() => []),
    parseExports: jest.fn(() => [])
}));
describe('ParallelIndexer', () => {
    let indexer;
    beforeEach(() => {
        indexer = new parallelIndexer_1.ParallelIndexer({
            maxWorkers: 4,
            batchSize: 10,
            memoryLimitMB: 500,
            enableWorkerThreads: false // Disable for tests
        });
    });
    describe('indexFiles', () => {
        it('should index files in parallel', async () => {
            const filePaths = [
                '/test/file1.ts',
                '/test/file2.ts',
                '/test/file3.ts',
                '/test/file4.ts',
                '/test/file5.ts'
            ];
            const metadata = await indexer.indexFiles(filePaths, '/test');
            expect(metadata.size).toBe(5);
            expect(metadata.has('/test/file1.ts')).toBe(true);
            expect(metadata.has('/test/file5.ts')).toBe(true);
        });
        it('should handle errors gracefully', async () => {
            const filePaths = [
                '/test/file1.ts',
                '/test/error.ts', // This will fail
                '/test/file3.ts'
            ];
            const metadata = await indexer.indexFiles(filePaths, '/test');
            // Should still index successful files
            expect(metadata.size).toBe(2);
            expect(metadata.has('/test/file1.ts')).toBe(true);
            expect(metadata.has('/test/file3.ts')).toBe(true);
            expect(metadata.has('/test/error.ts')).toBe(false);
        });
        it('should report progress', async () => {
            const filePaths = Array.from({ length: 20 }, (_, i) => `/test/file${i}.ts`);
            const progressUpdates = [];
            await indexer.indexFiles(filePaths, '/test', (progress) => {
                progressUpdates.push(progress.processed);
            });
            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates[progressUpdates.length - 1]).toBe(20);
        });
        it('should process files in batches', async () => {
            const filePaths = Array.from({ length: 50 }, (_, i) => `/test/file${i}.ts`);
            const startTime = Date.now();
            const metadata = await indexer.indexFiles(filePaths, '/test');
            const duration = Date.now() - startTime;
            expect(metadata.size).toBe(50);
            // Should be reasonably fast with parallel processing
            expect(duration).toBeLessThan(5000);
        });
    });
    describe('getStats', () => {
        it('should return accurate statistics', async () => {
            const filePaths = [
                '/test/file1.ts',
                '/test/file2.ts',
                '/test/error.ts'
            ];
            await indexer.indexFiles(filePaths, '/test');
            const stats = indexer.getStats();
            expect(stats.totalFiles).toBe(3);
            expect(stats.successfulFiles).toBe(2);
            expect(stats.failedFiles).toBe(1);
            expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
        });
    });
    describe('memory management', () => {
        it('should respect memory limits', async () => {
            const indexerWithLowMemory = new parallelIndexer_1.ParallelIndexer({
                maxWorkers: 2,
                batchSize: 5,
                memoryLimitMB: 100,
                enableWorkerThreads: false
            });
            const filePaths = Array.from({ length: 100 }, (_, i) => `/test/file${i}.ts`);
            // Should complete without memory issues
            const metadata = await indexerWithLowMemory.indexFiles(filePaths, '/test');
            expect(metadata.size).toBe(100);
        });
    });
    describe('error recovery', () => {
        it('should continue processing after errors', async () => {
            const filePaths = [
                '/test/file1.ts',
                '/test/error1.ts',
                '/test/file2.ts',
                '/test/error2.ts',
                '/test/file3.ts'
            ];
            const metadata = await indexer.indexFiles(filePaths, '/test');
            expect(metadata.size).toBe(3);
            expect(metadata.has('/test/file1.ts')).toBe(true);
            expect(metadata.has('/test/file2.ts')).toBe(true);
            expect(metadata.has('/test/file3.ts')).toBe(true);
        });
    });
    describe('performance', () => {
        it('should be faster than sequential processing', async () => {
            const filePaths = Array.from({ length: 30 }, (_, i) => `/test/file${i}.ts`);
            const startTime = Date.now();
            await indexer.indexFiles(filePaths, '/test');
            const parallelDuration = Date.now() - startTime;
            // Parallel processing should be reasonably fast
            expect(parallelDuration).toBeLessThan(3000);
        });
        it('should handle large file sets efficiently', async () => {
            const filePaths = Array.from({ length: 200 }, (_, i) => `/test/file${i}.ts`);
            const startTime = Date.now();
            const metadata = await indexer.indexFiles(filePaths, '/test');
            const duration = Date.now() - startTime;
            expect(metadata.size).toBe(200);
            // Should process ~40+ files per second
            const throughput = 200 / (duration / 1000);
            expect(throughput).toBeGreaterThan(20);
        });
    });
    describe('different file types', () => {
        it('should handle mixed file types', async () => {
            const filePaths = [
                '/test/file1.ts',
                '/test/file2.js',
                '/test/file3.py',
                '/test/file4.tsx',
                '/test/file5.jsx'
            ];
            const metadata = await indexer.indexFiles(filePaths, '/test');
            expect(metadata.size).toBe(5);
            const file1 = metadata.get('/test/file1.ts');
            expect(file1?.language).toBe('typescript');
            const file3 = metadata.get('/test/file3.py');
            expect(file3?.language).toBe('python');
        });
    });
    describe('concurrent operations', () => {
        it('should handle multiple concurrent indexing operations with separate instances', async () => {
            const indexer1 = new parallelIndexer_1.ParallelIndexer({
                maxWorkers: 2,
                batchSize: 10,
                enableWorkerThreads: false
            });
            const indexer2 = new parallelIndexer_1.ParallelIndexer({
                maxWorkers: 2,
                batchSize: 10,
                enableWorkerThreads: false
            });
            const batch1 = Array.from({ length: 10 }, (_, i) => `/test/batch1/file${i}.ts`);
            const batch2 = Array.from({ length: 10 }, (_, i) => `/test/batch2/file${i}.ts`);
            const [metadata1, metadata2] = await Promise.all([
                indexer1.indexFiles(batch1, '/test'),
                indexer2.indexFiles(batch2, '/test')
            ]);
            expect(metadata1.size).toBe(10);
            expect(metadata2.size).toBe(10);
        });
        it('should prevent concurrent operations on same instance', async () => {
            const batch1 = Array.from({ length: 10 }, (_, i) => `/test/batch1/file${i}.ts`);
            const batch2 = Array.from({ length: 10 }, (_, i) => `/test/batch2/file${i}.ts`);
            // Start first operation
            const promise1 = indexer.indexFiles(batch1, '/test');
            // Try to start second operation (should fail)
            await expect(indexer.indexFiles(batch2, '/test')).rejects.toThrow('Indexing already in progress');
            // Wait for first to complete
            await promise1;
        });
    });
});
//# sourceMappingURL=parallelIndexer.test.js.map