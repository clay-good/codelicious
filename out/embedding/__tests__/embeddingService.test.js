"use strict";
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
const embeddingService_1 = require("../embeddingService");
const indexer_1 = require("../../core/indexer");
const configurationManager_1 = require("../../core/configurationManager");
const types_1 = require("../../types");
const fileUtils = __importStar(require("../../utils/fileUtils"));
// Mock all dependencies
jest.mock('../embeddingManager');
jest.mock('../vectorStore');
jest.mock('../codeChunker');
jest.mock('../../core/indexer');
jest.mock('../../core/configurationManager');
jest.mock('../../cache/cacheManager');
jest.mock('../../utils/fileUtils');
describe('EmbeddingService', () => {
    let embeddingService;
    let mockContext;
    let mockConfigManager;
    let mockIndexingEngine;
    let mockEmbeddingManager;
    let mockVectorStore;
    let mockCodeChunker;
    let mockCacheManager;
    beforeEach(() => {
        // Mock VS Code context
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
            storagePath: '/test/storage'
        };
        // Mock ConfigurationManager
        mockConfigManager = new configurationManager_1.ConfigurationManager();
        // Mock StatusBar
        const mockStatusBar = {
            show: jest.fn(),
            hide: jest.fn(),
            updateProgress: jest.fn()
        };
        // Mock IndexingEngine
        mockIndexingEngine = new indexer_1.IndexingEngine(mockContext, mockConfigManager, mockStatusBar);
        mockIndexingEngine.getIndexedFiles = jest.fn().mockReturnValue([]);
        mockIndexingEngine.getFileMetadata = jest.fn();
        // Create service
        embeddingService = new embeddingService_1.EmbeddingService(mockContext, mockConfigManager, mockIndexingEngine);
        // Get mocked instances
        mockEmbeddingManager = embeddingService.embeddingManager;
        mockVectorStore = embeddingService.vectorStore;
        mockCodeChunker = embeddingService.codeChunker;
        mockCacheManager = embeddingService.cacheManager;
        // Setup default mock implementations
        mockCacheManager.initialize = jest.fn().mockResolvedValue(undefined);
        mockEmbeddingManager.initialize = jest.fn().mockResolvedValue(undefined);
        mockEmbeddingManager.isAvailable = jest.fn().mockReturnValue(true);
        mockEmbeddingManager.generateEmbedding = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
        mockEmbeddingManager.generateEmbeddings = jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]);
        mockVectorStore.initialize = jest.fn().mockResolvedValue(undefined);
        mockVectorStore.isReady = jest.fn().mockReturnValue(true);
        mockVectorStore.addEmbeddings = jest.fn().mockResolvedValue(undefined);
        mockVectorStore.deleteByFilter = jest.fn().mockResolvedValue(undefined);
        mockVectorStore.search = jest.fn().mockResolvedValue([]);
        mockVectorStore.clear = jest.fn().mockResolvedValue(undefined);
        mockVectorStore.dispose = jest.fn().mockResolvedValue(undefined);
        mockCodeChunker.chunkFile = jest.fn().mockReturnValue([]);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('constructor', () => {
        it('should create embedding service with all dependencies', () => {
            expect(embeddingService).toBeDefined();
            expect(embeddingService.embeddingManager).toBeDefined();
            expect(embeddingService.vectorStore).toBeDefined();
            expect(embeddingService.codeChunker).toBeDefined();
            expect(embeddingService.cacheManager).toBeDefined();
        });
        it('should initialize with default stats', () => {
            const stats = embeddingService.getStats();
            expect(stats.totalEmbeddings).toBe(0);
            expect(stats.filesEmbedded).toBe(0);
            expect(stats.chunksGenerated).toBe(0);
            expect(stats.averageChunksPerFile).toBe(0);
        });
    });
    describe('initialize', () => {
        it('should initialize all subsystems successfully', async () => {
            await embeddingService.initialize();
            expect(mockCacheManager.initialize).toHaveBeenCalled();
            expect(mockEmbeddingManager.initialize).toHaveBeenCalled();
            expect(mockVectorStore.initialize).toHaveBeenCalled();
            expect(embeddingService.isReady()).toBe(true);
        });
        it('should not initialize twice', async () => {
            await embeddingService.initialize();
            await embeddingService.initialize();
            expect(mockCacheManager.initialize).toHaveBeenCalledTimes(1);
            expect(mockEmbeddingManager.initialize).toHaveBeenCalledTimes(1);
            expect(mockVectorStore.initialize).toHaveBeenCalledTimes(1);
        });
        it('should handle initialization errors', async () => {
            mockEmbeddingManager.initialize.mockRejectedValue(new Error('Init failed'));
            await expect(embeddingService.initialize()).rejects.toThrow('Init failed');
            expect(embeddingService.isReady()).toBe(false);
        });
        it('should handle cache manager initialization errors', async () => {
            mockCacheManager.initialize.mockRejectedValue(new Error('Cache init failed'));
            await expect(embeddingService.initialize()).rejects.toThrow('Cache init failed');
        });
        it('should handle vector store initialization errors', async () => {
            mockVectorStore.initialize.mockRejectedValue(new Error('Vector store init failed'));
            await expect(embeddingService.initialize()).rejects.toThrow('Vector store init failed');
        });
    });
    describe('embedFile', () => {
        const mockFileMetadata = {
            path: '/test/file.ts',
            language: 'typescript',
            size: 1000,
            lastModified: Date.now(),
            hash: 'abc123',
            symbols: [],
            imports: [],
            exports: []
        };
        beforeEach(async () => {
            await embeddingService.initialize();
            fileUtils.readFileContent.mockReturnValue('test content');
            mockCodeChunker.chunkFile.mockResolvedValue([
                {
                    content: 'test content',
                    startLine: 1,
                    endLine: 10,
                    type: 'function',
                    language: 'typescript',
                    symbolName: 'testFunc',
                    symbolKind: types_1.SymbolKind.FUNCTION
                }
            ]);
        });
        it('should embed a file successfully', async () => {
            await embeddingService.embedFile(mockFileMetadata, '/workspace');
            expect(fileUtils.readFileContent).toHaveBeenCalledWith(mockFileMetadata.path);
            expect(mockCodeChunker.chunkFile).toHaveBeenCalledWith(mockFileMetadata.path, 'test content');
            expect(mockEmbeddingManager.generateEmbeddings).toHaveBeenCalled();
            expect(mockVectorStore.addEmbeddings).toHaveBeenCalled();
        });
        it('should update stats after embedding', async () => {
            await embeddingService.embedFile(mockFileMetadata, '/workspace');
            const stats = embeddingService.getStats();
            expect(stats.filesEmbedded).toBe(1);
            expect(stats.chunksGenerated).toBe(1);
            expect(stats.totalEmbeddings).toBe(1);
        });
        it('should handle file read errors', async () => {
            fileUtils.readFileContent.mockReturnValue(null);
            await embeddingService.embedFile(mockFileMetadata, '/workspace');
            expect(mockCodeChunker.chunkFile).not.toHaveBeenCalled();
            expect(mockEmbeddingManager.generateEmbeddings).not.toHaveBeenCalled();
        });
        it('should handle empty chunks', async () => {
            mockCodeChunker.chunkFile.mockResolvedValue([]);
            await embeddingService.embedFile(mockFileMetadata, '/workspace');
            expect(mockEmbeddingManager.generateEmbeddings).not.toHaveBeenCalled();
            expect(mockVectorStore.addEmbeddings).not.toHaveBeenCalled();
        });
        it('should not embed if not initialized', async () => {
            const uninitializedService = new embeddingService_1.EmbeddingService(mockContext, mockConfigManager, mockIndexingEngine);
            await uninitializedService.embedFile(mockFileMetadata, '/workspace');
            expect(fileUtils.readFileContent).not.toHaveBeenCalled();
        });
        it('should handle embedding generation errors', async () => {
            mockEmbeddingManager.generateEmbeddings.mockRejectedValue(new Error('Embedding failed'));
            await expect(embeddingService.embedFile(mockFileMetadata, '/workspace')).rejects.toThrow('Embedding failed');
        });
        it('should handle vector store errors', async () => {
            mockVectorStore.addEmbeddings.mockRejectedValue(new Error('Store failed'));
            await expect(embeddingService.embedFile(mockFileMetadata, '/workspace')).rejects.toThrow('Store failed');
        });
        it('should generate correct embedding metadata', async () => {
            await embeddingService.embedFile(mockFileMetadata, '/workspace');
            const addEmbeddingsCall = mockVectorStore.addEmbeddings.mock.calls[0][0];
            expect(addEmbeddingsCall).toHaveLength(1);
            expect(addEmbeddingsCall[0]).toMatchObject({
                vector: [0.1, 0.2, 0.3],
                metadata: {
                    text: 'test content',
                    source: mockFileMetadata.path,
                    language: 'typescript',
                    type: 'function',
                    filePath: mockFileMetadata.path,
                    startLine: 1,
                    endLine: 10,
                    symbolName: 'testFunc',
                    symbolKind: 'function'
                }
            });
        });
    });
    describe('embedAllFiles', () => {
        const mockFiles = [
            {
                path: '/test/file1.ts',
                language: 'typescript',
                size: 1000,
                lastModified: Date.now(),
                hash: 'abc123',
                symbols: [],
                imports: [],
                exports: []
            },
            {
                path: '/test/file2.ts',
                language: 'typescript',
                size: 2000,
                lastModified: Date.now(),
                hash: 'def456',
                symbols: [],
                imports: [],
                exports: []
            }
        ];
        beforeEach(async () => {
            await embeddingService.initialize();
            mockIndexingEngine.getIndexedFiles.mockReturnValue(mockFiles);
            fileUtils.readFileContent.mockReturnValue('test content');
            mockCodeChunker.chunkFile.mockResolvedValue([
                {
                    content: 'test content',
                    startLine: 1,
                    endLine: 10,
                    type: 'function',
                    language: 'typescript',
                    symbolName: 'testFunc',
                    symbolKind: types_1.SymbolKind.FUNCTION
                }
            ]);
        });
        it('should embed all indexed files', async () => {
            await embeddingService.embedAllFiles('/workspace');
            expect(mockIndexingEngine.getIndexedFiles).toHaveBeenCalled();
            expect(fileUtils.readFileContent).toHaveBeenCalledTimes(2);
            expect(mockVectorStore.addEmbeddings).toHaveBeenCalledTimes(2);
        });
        it('should update stats after embedding all files', async () => {
            await embeddingService.embedAllFiles('/workspace');
            const stats = embeddingService.getStats();
            expect(stats.filesEmbedded).toBe(2);
            expect(stats.chunksGenerated).toBe(2);
            expect(stats.averageChunksPerFile).toBe(1);
        });
        it('should continue on individual file errors', async () => {
            fileUtils.readFileContent
                .mockReturnValueOnce(null)
                .mockReturnValueOnce('test content');
            await embeddingService.embedAllFiles('/workspace');
            // Should still process the second file
            expect(mockVectorStore.addEmbeddings).toHaveBeenCalledTimes(1);
        });
        it('should not embed if not initialized', async () => {
            const uninitializedService = new embeddingService_1.EmbeddingService(mockContext, mockConfigManager, mockIndexingEngine);
            await uninitializedService.embedAllFiles('/workspace');
            expect(mockIndexingEngine.getIndexedFiles).not.toHaveBeenCalled();
        });
    });
    describe('updateFileEmbeddings', () => {
        const mockFileMetadata = {
            path: '/test/file.ts',
            language: 'typescript',
            size: 1000,
            lastModified: Date.now(),
            hash: 'abc123',
            symbols: [],
            imports: [],
            exports: []
        };
        beforeEach(async () => {
            await embeddingService.initialize();
            mockIndexingEngine.getFileMetadata.mockReturnValue(mockFileMetadata);
            fileUtils.readFileContent.mockReturnValue('test content');
            mockCodeChunker.chunkFile.mockResolvedValue([
                {
                    content: 'test content',
                    startLine: 1,
                    endLine: 10,
                    type: 'function',
                    language: 'typescript',
                    symbolName: 'testFunc',
                    symbolKind: types_1.SymbolKind.FUNCTION
                }
            ]);
        });
        it('should update embeddings for a file', async () => {
            await embeddingService.updateFileEmbeddings('/test/file.ts', '/workspace');
            expect(mockVectorStore.deleteByFilter).toHaveBeenCalledWith({ filePath: '/test/file.ts' });
            expect(mockIndexingEngine.getFileMetadata).toHaveBeenCalledWith('/test/file.ts');
            expect(mockVectorStore.addEmbeddings).toHaveBeenCalled();
        });
        it('should handle missing file metadata', async () => {
            mockIndexingEngine.getFileMetadata.mockReturnValue(undefined);
            await embeddingService.updateFileEmbeddings('/test/file.ts', '/workspace');
            expect(mockVectorStore.deleteByFilter).toHaveBeenCalled();
            expect(mockVectorStore.addEmbeddings).not.toHaveBeenCalled();
        });
        it('should not update if not initialized', async () => {
            const uninitializedService = new embeddingService_1.EmbeddingService(mockContext, mockConfigManager, mockIndexingEngine);
            await uninitializedService.updateFileEmbeddings('/test/file.ts', '/workspace');
            expect(mockVectorStore.deleteByFilter).not.toHaveBeenCalled();
        });
        it('should handle deletion errors gracefully', async () => {
            mockVectorStore.deleteByFilter.mockRejectedValue(new Error('Delete failed'));
            await embeddingService.updateFileEmbeddings('/test/file.ts', '/workspace');
            // Should not throw, just log error
            expect(mockIndexingEngine.getFileMetadata).not.toHaveBeenCalled();
        });
    });
    describe('deleteFileEmbeddings', () => {
        beforeEach(async () => {
            await embeddingService.initialize();
        });
        it('should delete embeddings for a file', async () => {
            await embeddingService.deleteFileEmbeddings('/test/file.ts');
            expect(mockVectorStore.deleteByFilter).toHaveBeenCalledWith({ filePath: '/test/file.ts' });
        });
        it('should not delete if not initialized', async () => {
            const uninitializedService = new embeddingService_1.EmbeddingService(mockContext, mockConfigManager, mockIndexingEngine);
            await uninitializedService.deleteFileEmbeddings('/test/file.ts');
            expect(mockVectorStore.deleteByFilter).not.toHaveBeenCalled();
        });
        it('should handle deletion errors gracefully', async () => {
            mockVectorStore.deleteByFilter.mockRejectedValue(new Error('Delete failed'));
            await embeddingService.deleteFileEmbeddings('/test/file.ts');
            // Should not throw, just log error
            expect(mockVectorStore.deleteByFilter).toHaveBeenCalled();
        });
    });
    describe('searchSimilarCode', () => {
        beforeEach(async () => {
            await embeddingService.initialize();
        });
        it('should search for similar code', async () => {
            const mockResults = [
                {
                    id: 'test-1',
                    score: 0.9,
                    content: 'similar code',
                    metadata: {
                        text: 'similar code',
                        source: '/test/file.ts',
                        language: 'typescript',
                        type: 'function',
                        timestamp: Date.now()
                    }
                }
            ];
            mockVectorStore.search.mockResolvedValue(mockResults);
            const results = await embeddingService.searchSimilarCode('test query', 5);
            expect(mockEmbeddingManager.generateEmbedding).toHaveBeenCalledWith('test query');
            expect(mockVectorStore.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], { limit: 5 });
            expect(results).toEqual(mockResults);
        });
        it('should use default limit of 10', async () => {
            await embeddingService.searchSimilarCode('test query');
            expect(mockVectorStore.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], { limit: 10 });
        });
        it('should return empty array if not initialized', async () => {
            const uninitializedService = new embeddingService_1.EmbeddingService(mockContext, mockConfigManager, mockIndexingEngine);
            const results = await uninitializedService.searchSimilarCode('test query');
            expect(results).toEqual([]);
            expect(mockEmbeddingManager.generateEmbedding).not.toHaveBeenCalled();
        });
        it('should handle search errors gracefully', async () => {
            mockVectorStore.search.mockRejectedValue(new Error('Search failed'));
            const results = await embeddingService.searchSimilarCode('test query');
            expect(results).toEqual([]);
        });
        it('should handle embedding generation errors', async () => {
            mockEmbeddingManager.generateEmbedding.mockRejectedValue(new Error('Embedding failed'));
            const results = await embeddingService.searchSimilarCode('test query');
            expect(results).toEqual([]);
        });
    });
    describe('getStats', () => {
        it('should return current stats', () => {
            const stats = embeddingService.getStats();
            expect(stats).toHaveProperty('totalEmbeddings');
            expect(stats).toHaveProperty('filesEmbedded');
            expect(stats).toHaveProperty('chunksGenerated');
            expect(stats).toHaveProperty('lastUpdate');
            expect(stats).toHaveProperty('averageChunksPerFile');
        });
        it('should return a copy of stats', () => {
            const stats1 = embeddingService.getStats();
            const stats2 = embeddingService.getStats();
            expect(stats1).not.toBe(stats2);
            expect(stats1).toEqual(stats2);
        });
    });
    describe('isReady', () => {
        it('should return false when not initialized', () => {
            expect(embeddingService.isReady()).toBe(false);
        });
        it('should return true when all systems ready', async () => {
            await embeddingService.initialize();
            expect(embeddingService.isReady()).toBe(true);
        });
        it('should return false when embedding manager not available', async () => {
            await embeddingService.initialize();
            mockEmbeddingManager.isAvailable.mockReturnValue(false);
            expect(embeddingService.isReady()).toBe(false);
        });
        it('should return false when vector store not ready', async () => {
            await embeddingService.initialize();
            mockVectorStore.isReady.mockReturnValue(false);
            expect(embeddingService.isReady()).toBe(false);
        });
    });
    describe('clearAllEmbeddings', () => {
        beforeEach(async () => {
            await embeddingService.initialize();
            // Set some stats
            embeddingService.stats = {
                totalEmbeddings: 100,
                filesEmbedded: 10,
                chunksGenerated: 50,
                lastUpdate: Date.now() - 1000,
                averageChunksPerFile: 5
            };
        });
        it('should clear all embeddings and reset stats', async () => {
            await embeddingService.clearAllEmbeddings();
            expect(mockVectorStore.clear).toHaveBeenCalled();
            const stats = embeddingService.getStats();
            expect(stats.totalEmbeddings).toBe(0);
            expect(stats.filesEmbedded).toBe(0);
            expect(stats.chunksGenerated).toBe(0);
            expect(stats.averageChunksPerFile).toBe(0);
        });
        it('should not clear if not initialized', async () => {
            const uninitializedService = new embeddingService_1.EmbeddingService(mockContext, mockConfigManager, mockIndexingEngine);
            await uninitializedService.clearAllEmbeddings();
            expect(mockVectorStore.clear).not.toHaveBeenCalled();
        });
        it('should handle clear errors gracefully', async () => {
            mockVectorStore.clear.mockRejectedValue(new Error('Clear failed'));
            await embeddingService.clearAllEmbeddings();
            // Should not throw, just log error
            expect(mockVectorStore.clear).toHaveBeenCalled();
        });
    });
    describe('dispose', () => {
        it('should dispose vector store and reset state', async () => {
            await embeddingService.initialize();
            await embeddingService.dispose();
            expect(mockVectorStore.dispose).toHaveBeenCalled();
            expect(embeddingService.isReady()).toBe(false);
        });
        it('should be safe to call multiple times', async () => {
            await embeddingService.initialize();
            await embeddingService.dispose();
            await embeddingService.dispose();
            expect(mockVectorStore.dispose).toHaveBeenCalledTimes(2);
        });
    });
});
//# sourceMappingURL=embeddingService.test.js.map