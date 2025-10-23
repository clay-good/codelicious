"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vectorStore_1 = require("../vectorStore");
// Mock ChromaDB
jest.mock('chromadb', () => ({
    ChromaClient: jest.fn().mockImplementation(() => ({
        getOrCreateCollection: jest.fn().mockResolvedValue({
            add: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue({ ids: [], embeddings: [], metadatas: [], documents: [] }),
            query: jest.fn().mockResolvedValue({ ids: [[]], distances: [[]], metadatas: [[]], documents: [[]] }),
            update: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            count: jest.fn().mockResolvedValue(0)
        }),
        deleteCollection: jest.fn().mockResolvedValue(undefined),
        createCollection: jest.fn().mockResolvedValue({
            add: jest.fn().mockResolvedValue(undefined),
            get: jest.fn().mockResolvedValue({ ids: [], embeddings: [], metadatas: [], documents: [] }),
            query: jest.fn().mockResolvedValue({ ids: [[]], distances: [[]], metadatas: [[]], documents: [[]] }),
            update: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
            count: jest.fn().mockResolvedValue(0)
        })
    }))
}));
describe('VectorStore', () => {
    let vectorStore;
    let mockConfigManager;
    beforeEach(() => {
        mockConfigManager = {
            getChromaDBConfig: jest.fn().mockReturnValue({
                url: 'http://localhost:8000',
                collectionName: 'test_collection'
            })
        };
        vectorStore = new vectorStore_1.VectorStore(mockConfigManager, 'test_collection');
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('constructor', () => {
        it('should create vector store with default collection name', () => {
            const store = new vectorStore_1.VectorStore(mockConfigManager);
            expect(store).toBeDefined();
        });
        it('should create vector store with custom collection name', () => {
            const store = new vectorStore_1.VectorStore(mockConfigManager, 'custom_collection');
            expect(store).toBeDefined();
        });
    });
    describe('initialize', () => {
        it('should initialize ChromaDB connection', async () => {
            await vectorStore.initialize();
            expect(mockConfigManager.getChromaDBConfig).toHaveBeenCalled();
        });
        it('should handle initialization errors', async () => {
            mockConfigManager.getChromaDBConfig.mockImplementation(() => {
                throw new Error('Config error');
            });
            await expect(vectorStore.initialize()).rejects.toThrow('Config error');
        });
    });
    describe('addEmbeddings', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should add embeddings to vector store', async () => {
            const embeddings = [
                {
                    id: 'test-1',
                    vector: [0.1, 0.2, 0.3],
                    metadata: {
                        source: 'test.ts',
                        text: 'test content',
                        language: 'typescript',
                        type: 'function',
                        timestamp: Date.now(),
                        symbolName: 'test'
                    }
                }
            ];
            await expect(vectorStore.addEmbeddings(embeddings)).resolves.not.toThrow();
        });
        it('should handle empty embeddings array', async () => {
            await expect(vectorStore.addEmbeddings([])).resolves.not.toThrow();
        });
        it('should throw error if not initialized', async () => {
            const uninitializedStore = new vectorStore_1.VectorStore(mockConfigManager);
            await expect(uninitializedStore.addEmbeddings([{
                    id: 'test',
                    vector: [0.1],
                    metadata: { source: 'test.ts', text: 'test', language: 'typescript', type: 'function', timestamp: Date.now() }
                }])).rejects.toThrow('VectorStore not initialized');
        });
        it('should add multiple embeddings', async () => {
            const embeddings = [
                {
                    id: 'test-1',
                    vector: [0.1, 0.2],
                    metadata: { source: 'test1.ts', text: 'test 1', language: 'typescript', type: 'function', timestamp: Date.now() }
                },
                {
                    id: 'test-2',
                    vector: [0.3, 0.4],
                    metadata: { source: 'test2.ts', text: 'test 2', language: 'typescript', type: 'function', timestamp: Date.now() }
                }
            ];
            await expect(vectorStore.addEmbeddings(embeddings)).resolves.not.toThrow();
        });
    });
    describe('addEmbedding', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should add single embedding', async () => {
            const embedding = {
                id: 'test-1',
                vector: [0.1, 0.2, 0.3],
                metadata: {
                    source: 'test.ts',
                    text: 'test content',
                    language: 'typescript',
                    type: 'function',
                    timestamp: Date.now(),
                    symbolName: 'test'
                }
            };
            await expect(vectorStore.addEmbedding(embedding)).resolves.not.toThrow();
        });
    });
    describe('search', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should search for similar embeddings', async () => {
            const queryVector = [0.1, 0.2, 0.3];
            const results = await vectorStore.search(queryVector);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });
        it('should search with limit', async () => {
            const queryVector = [0.1, 0.2, 0.3];
            const results = await vectorStore.search(queryVector, { limit: 5 });
            expect(results).toBeDefined();
        });
        it('should search with filter', async () => {
            const queryVector = [0.1, 0.2, 0.3];
            const results = await vectorStore.search(queryVector, {
                filter: { language: 'typescript' }
            });
            expect(results).toBeDefined();
        });
        it('should throw error if not initialized', async () => {
            const uninitializedStore = new vectorStore_1.VectorStore(mockConfigManager);
            await expect(uninitializedStore.search([0.1, 0.2])).rejects.toThrow('VectorStore not initialized');
        });
    });
    describe('getEmbedding', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should get embedding by id', async () => {
            const result = await vectorStore.getEmbedding('test-1');
            expect(result).toBeDefined();
        });
        it('should return null for non-existent id', async () => {
            const result = await vectorStore.getEmbedding('non-existent');
            expect(result).toBeNull();
        });
    });
    describe('deleteEmbeddings', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should delete embeddings by ids', async () => {
            await expect(vectorStore.deleteEmbeddings(['test-1', 'test-2'])).resolves.not.toThrow();
        });
        it('should throw error if not initialized', async () => {
            const uninitializedStore = new vectorStore_1.VectorStore(mockConfigManager);
            await expect(uninitializedStore.deleteEmbeddings(['test-1'])).rejects.toThrow('VectorStore not initialized');
        });
    });
    describe('deleteByFilter', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should delete embeddings by filter', async () => {
            await expect(vectorStore.deleteByFilter({ source: 'test.ts' })).resolves.not.toThrow();
        });
    });
    describe('updateEmbedding', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should update embedding', async () => {
            const embedding = {
                id: 'test-1',
                vector: [0.1, 0.2, 0.3],
                metadata: {
                    source: 'test.ts',
                    text: 'updated content',
                    language: 'typescript',
                    type: 'function',
                    timestamp: Date.now(),
                    symbolName: 'test'
                }
            };
            await expect(vectorStore.updateEmbedding(embedding)).resolves.not.toThrow();
        });
    });
    describe('count', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should return count of embeddings', async () => {
            const count = await vectorStore.count();
            expect(typeof count).toBe('number');
            expect(count).toBeGreaterThanOrEqual(0);
        });
    });
    describe('clear', () => {
        beforeEach(async () => {
            await vectorStore.initialize();
        });
        it('should clear all embeddings', async () => {
            await expect(vectorStore.clear()).resolves.not.toThrow();
        });
    });
    describe('isReady', () => {
        it('should return false before initialization', () => {
            expect(vectorStore.isReady()).toBe(false);
        });
        it('should return true after initialization', async () => {
            await vectorStore.initialize();
            expect(vectorStore.isReady()).toBe(true);
        });
    });
});
//# sourceMappingURL=vectorStore.test.js.map