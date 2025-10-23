"use strict";
/**
 * Tests for RAG Service
 */
Object.defineProperty(exports, "__esModule", { value: true });
const ragService_1 = require("../ragService");
const embeddingManager_1 = require("../../embedding/embeddingManager");
const vectorStore_1 = require("../../embedding/vectorStore");
const configurationManager_1 = require("../../core/configurationManager");
const cacheManager_1 = require("../../cache/cacheManager");
// Mock fs/promises
jest.mock('fs/promises', () => ({
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockRejectedValue(new Error('File not found')),
    access: jest.fn().mockRejectedValue(new Error('File not found'))
}));
// Mock VS Code API
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((key) => {
                const config = {
                    'embeddingServer.url': 'http://localhost:8001',
                    'embeddingServer.enabled': true,
                    'chromadb.url': 'http://localhost:8000',
                    'chromadb.enabled': true,
                };
                return config[key];
            }),
            update: jest.fn()
        })),
        findFiles: jest.fn().mockResolvedValue([]),
        openTextDocument: jest.fn().mockResolvedValue({
            getText: jest.fn().mockReturnValue(''),
            uri: { fsPath: '/test/file.ts' },
            languageId: 'typescript'
        }),
        createFileSystemWatcher: jest.fn().mockReturnValue({
            onDidCreate: jest.fn(),
            onDidChange: jest.fn(),
            onDidDelete: jest.fn(),
            dispose: jest.fn()
        })
    },
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn()
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    Uri: {
        file: (path) => ({ fsPath: path })
    },
    RelativePattern: jest.fn().mockImplementation((base, pattern) => ({ base, pattern })),
    Disposable: {
        from: jest.fn().mockReturnValue({ dispose: jest.fn() })
    }
}), { virtual: true });
describe('RAGService', () => {
    let ragService;
    let mockContext;
    let mockConfigManager;
    let mockEmbeddingManager;
    let mockVectorStore;
    let mockIndexingEngine;
    let mockCacheManager;
    beforeEach(() => {
        // Create mock context
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            },
            extensionPath: '/test/path',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global-storage',
            logPath: '/test/logs',
            globalStorageUri: {
                fsPath: '/test/global-storage'
            },
            storageUri: {
                fsPath: '/test/storage'
            },
            logUri: {
                fsPath: '/test/logs'
            }
        };
        // Create real config manager
        mockConfigManager = new configurationManager_1.ConfigurationManager();
        // Create mock cache manager
        mockCacheManager = new cacheManager_1.CacheManager(mockContext, mockConfigManager);
        mockCacheManager.initialize = jest.fn().mockResolvedValue(undefined);
        mockCacheManager.get = jest.fn().mockResolvedValue(null);
        mockCacheManager.set = jest.fn().mockResolvedValue(undefined);
        // Create mock embedding manager
        mockEmbeddingManager = new embeddingManager_1.EmbeddingManager(mockConfigManager, mockCacheManager);
        mockEmbeddingManager.initialize = jest.fn().mockResolvedValue(undefined);
        mockEmbeddingManager.generateEmbedding = jest.fn().mockResolvedValue(new Array(384).fill(0.1));
        // Create mock vector store
        mockVectorStore = new vectorStore_1.VectorStore(mockConfigManager);
        mockVectorStore.initialize = jest.fn().mockResolvedValue(undefined);
        mockVectorStore.search = jest.fn().mockResolvedValue([
            {
                id: 'test-1',
                score: 0.9,
                content: 'function testFunction() { return true; }',
                metadata: {
                    filePath: '/test/file.ts',
                    language: 'typescript',
                    startLine: 1,
                    endLine: 3,
                    symbolName: 'testFunction'
                }
            }
        ]);
        // Create mock indexing engine
        mockIndexingEngine = {
            getIndexedFiles: jest.fn().mockReturnValue([
                {
                    path: '/test/file.ts',
                    language: 'typescript',
                    symbols: [
                        {
                            name: 'testFunction',
                            kind: 'function',
                            signature: 'function testFunction(): boolean'
                        }
                    ]
                }
            ]),
            getFileMetadata: jest.fn().mockReturnValue({
                path: '/test/file.ts',
                language: 'typescript',
                symbols: []
            })
        };
        // Create RAG service
        ragService = new ragService_1.RAGService(mockContext, mockConfigManager, mockEmbeddingManager, mockVectorStore, mockIndexingEngine);
    });
    describe('initialization', () => {
        it('should initialize successfully', async () => {
            await ragService.initialize('/test/workspace');
            expect(ragService.isReady()).toBe(true);
        });
        it('should not initialize twice', async () => {
            await ragService.initialize('/test/workspace');
            await ragService.initialize('/test/workspace');
            expect(ragService.isReady()).toBe(true);
        });
    });
    describe('query', () => {
        beforeEach(async () => {
            await ragService.initialize('/test/workspace');
        });
        it('should execute a basic query', async () => {
            const response = await ragService.query('test function');
            expect(response).toBeDefined();
            expect(response.results).toBeDefined();
            expect(response.assembledContext).toBeDefined();
            expect(response.metadata).toBeDefined();
        });
        it('should return results with metadata', async () => {
            const response = await ragService.query('test function', {
                limit: 5,
                minScore: 0.5
            });
            expect(response.results.length).toBeGreaterThan(0);
            expect(response.metadata.retrievalTime).toBeGreaterThanOrEqual(0);
            expect(response.metadata.assemblyTime).toBeGreaterThanOrEqual(0);
            expect(response.metadata.qualityScore).toBeGreaterThan(0);
        });
        it('should respect limit option', async () => {
            const response = await ragService.query('test', { limit: 3 });
            expect(response.results.length).toBeLessThanOrEqual(3);
        });
        it('should handle different formats', async () => {
            const markdownResponse = await ragService.query('test', { format: 'markdown' });
            expect(markdownResponse.assembledContext.context).toContain('##');
            const xmlResponse = await ragService.query('test', { format: 'xml' });
            expect(xmlResponse.assembledContext.context).toContain('<');
        });
        it('should throw error if not initialized', async () => {
            const uninitializedService = new ragService_1.RAGService(mockContext, mockConfigManager, mockEmbeddingManager, mockVectorStore, mockIndexingEngine);
            await expect(uninitializedService.query('test')).rejects.toThrow();
        });
    });
    describe('queryOptimized', () => {
        beforeEach(async () => {
            await ragService.initialize('/test/workspace');
        });
        it('should detect error query type', async () => {
            const response = await ragService.queryOptimized('fix this error in my code');
            expect(response).toBeDefined();
            // Error queries should include more context
            expect(response.metadata.totalResults).toBeGreaterThan(0);
        });
        it('should detect test query type', async () => {
            const response = await ragService.queryOptimized('write unit tests for this');
            expect(response).toBeDefined();
        });
        it('should detect documentation query type', async () => {
            const response = await ragService.queryOptimized('explain how this works');
            expect(response).toBeDefined();
        });
        it('should detect refactor query type', async () => {
            const response = await ragService.queryOptimized('refactor this code');
            expect(response).toBeDefined();
        });
    });
    describe('searchSimilar', () => {
        beforeEach(async () => {
            await ragService.initialize('/test/workspace');
        });
        it('should search for similar code', async () => {
            const results = await ragService.searchSimilar('test function', 5);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
        it('should respect limit parameter', async () => {
            const results = await ragService.searchSimilar('test', 3);
            expect(results.length).toBeLessThanOrEqual(3);
        });
        it('should respect minScore parameter', async () => {
            const results = await ragService.searchSimilar('test', 10, 0.8);
            results.forEach(result => {
                expect(result.score).toBeGreaterThanOrEqual(0.8);
            });
        });
    });
    describe('getFileContext', () => {
        beforeEach(async () => {
            await ragService.initialize('/test/workspace');
        });
        it('should get context for specific files', async () => {
            const context = await ragService.getFileContext(['/test/file.ts']);
            expect(context).toBeDefined();
            expect(context.context).toBeDefined();
        });
        it('should handle multiple files', async () => {
            const context = await ragService.getFileContext([
                '/test/file1.ts',
                '/test/file2.ts'
            ]);
            expect(context).toBeDefined();
        });
        it('should respect maxTokens parameter', async () => {
            const context = await ragService.getFileContext(['/test/file.ts'], 1000);
            expect(context.metadata.totalTokens).toBeLessThanOrEqual(1000);
        });
    });
    describe('getStats', () => {
        it('should return stats before initialization', () => {
            const stats = ragService.getStats();
            expect(stats.isInitialized).toBe(false);
            expect(stats.indexedFiles).toBe(1); // Mock returns 1 file
        });
        it('should return stats after initialization', async () => {
            await ragService.initialize('/test/workspace');
            const stats = ragService.getStats();
            expect(stats.isInitialized).toBe(true);
            expect(stats.indexedFiles).toBeGreaterThanOrEqual(0);
        });
    });
    describe('isReady', () => {
        it('should return false before initialization', () => {
            expect(ragService.isReady()).toBe(false);
        });
        it('should return true after initialization', async () => {
            await ragService.initialize('/test/workspace');
            expect(ragService.isReady()).toBe(true);
        });
    });
});
//# sourceMappingURL=ragService.test.js.map