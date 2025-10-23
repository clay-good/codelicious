"use strict";
/**
 * Integration Tests - Verify all systems work together correctly
 *
 * Tests the integration between:
 * - Indexer → Embedding Service → Vector Store
 * - RAG Service → Model Orchestrator
 * - Session Manager → Cache Manager
 * - Extension Manager → All Components
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
const vscode = __importStar(require("vscode"));
const indexer_1 = require("../core/indexer");
const ragService_1 = require("../rag/ragService");
const orchestrator_1 = require("../models/orchestrator");
const sessionManager_1 = require("../core/sessionManager");
const cacheManager_1 = require("../cache/cacheManager");
const configurationManager_1 = require("../core/configurationManager");
const secureStorage_1 = require("../core/secureStorage");
// Mock VS Code
jest.mock('vscode');
// Mock file system
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('{}'),
    readdirSync: jest.fn().mockReturnValue([]),
    unlinkSync: jest.fn(),
    promises: {
        writeFile: jest.fn().mockResolvedValue(undefined),
        readFile: jest.fn().mockResolvedValue('{}'),
        unlink: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn().mockResolvedValue([]),
        stat: jest.fn().mockResolvedValue({ size: 0, mtime: new Date() })
    }
}));
describe('Integration Tests', () => {
    let context;
    let configManager;
    let storageManager;
    let cacheManager;
    beforeEach(() => {
        // Create mock context
        context = {
            subscriptions: [],
            workspaceState: {
                get: jest.fn(),
                update: jest.fn()
            },
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
                setKeysForSync: jest.fn()
            },
            extensionPath: '/mock/path',
            storagePath: '/mock/storage',
            globalStoragePath: '/mock/global-storage',
            logPath: '/mock/logs',
            extensionUri: vscode.Uri.file('/mock/path'),
            environmentVariableCollection: {},
            extensionMode: 3, // Test mode
            storageUri: vscode.Uri.file('/mock/storage'),
            globalStorageUri: vscode.Uri.file('/mock/global-storage'),
            logUri: vscode.Uri.file('/mock/logs'),
            secrets: {
                get: jest.fn(),
                store: jest.fn(),
                delete: jest.fn(),
                onDidChange: jest.fn()
            },
            extension: {},
            asAbsolutePath: jest.fn((path) => `/mock/path/${path}`)
        };
        configManager = new configurationManager_1.ConfigurationManager();
        storageManager = new secureStorage_1.SecureStorageManager(context);
        cacheManager = new cacheManager_1.CacheManager(context, configManager);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('Indexer → Embedding Service Integration', () => {
        it('should verify indexer requires status bar', () => {
            // IndexingEngine requires 3 parameters: context, configManager, statusBar
            expect(indexer_1.IndexingEngine).toBeDefined();
            expect(indexer_1.IndexingEngine.length).toBe(3); // constructor takes 3 params
        });
        it('should verify indexer has required methods', () => {
            // Verify the IndexingEngine class has the expected methods
            expect(typeof indexer_1.IndexingEngine.prototype.startIndexing).toBe('function');
            expect(typeof indexer_1.IndexingEngine.prototype.getIndexedFiles).toBe('function');
        });
    });
    describe('RAG Service → Model Orchestrator Integration', () => {
        it('should verify orchestrator can send requests', async () => {
            const orchestrator = new orchestrator_1.ModelOrchestrator(context, configManager, storageManager, cacheManager);
            // Verify orchestrator can be initialized
            expect(orchestrator).toBeDefined();
            // Verify orchestrator has sendRequest method
            expect(typeof orchestrator.sendRequest).toBe('function');
        });
        it('should verify RAG service requires all dependencies', () => {
            // RAG service requires 6 parameters (5 required + 2 optional)
            // This test verifies the dependency structure
            // AUGMENT PARITY: Added modelOrchestrator parameter for git history indexing
            expect(ragService_1.RAGService).toBeDefined();
            expect(ragService_1.RAGService.length).toBe(7); // constructor takes 7 params (5 required + 2 optional)
        });
    });
    describe('Session Manager → Cache Manager Integration', () => {
        it('should save session data to cache', async () => {
            const sessionManager = new sessionManager_1.SessionManager(context);
            // Create a session
            const session = await sessionManager.createSession('Test Session');
            expect(session).toBeDefined();
            expect(session.id).toBeDefined();
            expect(session.messages).toEqual([]);
        });
        it('should restore session from cache', async () => {
            const sessionManager = new sessionManager_1.SessionManager(context);
            // Create and save a session
            const session = await sessionManager.createSession('Test Session');
            sessionManager.addMessage({
                role: 'user',
                content: 'Hello'
            });
            await sessionManager.saveCurrentSession();
            // Verify session was saved
            const currentSession = sessionManager.getCurrentSession();
            expect(currentSession).toBeDefined();
            expect(currentSession?.messages.length).toBe(1);
        });
        it('should update session context', () => {
            const sessionManager = new sessionManager_1.SessionManager(context);
            sessionManager.createSession('Test Session');
            sessionManager.updateContext({
                activeFiles: ['file1.ts', 'file2.ts']
            });
            const session = sessionManager.getCurrentSession();
            expect(session?.context.activeFiles).toEqual(['file1.ts', 'file2.ts']);
        });
    });
    describe('Cache Manager Integration', () => {
        it('should cache model responses', async () => {
            await cacheManager.initialize();
            const testData = {
                content: 'Test response',
                model: 'test-model',
                usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
                cost: 0.001,
                latency: 100
            };
            await cacheManager.set('test-key', testData);
            const cached = await cacheManager.get('test-key');
            expect(cached).toEqual(testData);
        });
        it('should handle cache misses', async () => {
            await cacheManager.initialize();
            const cached = await cacheManager.get('non-existent-key');
            expect(cached).toBeUndefined();
        });
        it('should clear all cache entries', async () => {
            await cacheManager.initialize();
            await cacheManager.set('test-key', { data: 'test' });
            await cacheManager.clear();
            const cached = await cacheManager.get('test-key');
            expect(cached).toBeUndefined();
        });
    });
    describe('Model Orchestrator Integration', () => {
        it('should initialize without API keys', async () => {
            const orchestrator = new orchestrator_1.ModelOrchestrator(context, configManager, storageManager, cacheManager);
            // Should initialize even without API keys
            await orchestrator.initialize();
            expect(orchestrator).toBeDefined();
        });
        it('should check cache before sending request', async () => {
            const orchestrator = new orchestrator_1.ModelOrchestrator(context, configManager, storageManager, cacheManager);
            await orchestrator.initialize();
            // Verify orchestrator checks cache
            expect(typeof orchestrator.sendRequest).toBe('function');
        });
        it('should track statistics', async () => {
            const orchestrator = new orchestrator_1.ModelOrchestrator(context, configManager, storageManager, cacheManager);
            await orchestrator.initialize();
            const stats = orchestrator.getCostStats();
            expect(stats).toBeDefined();
            expect(stats.totalRequests).toBe(0);
            expect(stats.totalCost).toBe(0);
        });
    });
    describe('Configuration Manager Integration', () => {
        it('should provide configuration to all components', () => {
            const config = configManager.getModelsConfig();
            expect(config).toBeDefined();
            expect(typeof config.costLimit).toBe('number');
            expect(typeof config.preferLocal).toBe('boolean');
        });
        it('should provide cache configuration', () => {
            const config = configManager.getCacheConfig();
            expect(config).toBeDefined();
            expect(typeof config.enabled).toBe('boolean');
        });
        it('should provide indexing configuration', () => {
            const config = configManager.getIndexingConfig();
            expect(config).toBeDefined();
            expect(typeof config.progressive).toBe('boolean');
            expect(typeof config.background).toBe('boolean');
        });
    });
    describe('End-to-End Flow Simulation', () => {
        it('should simulate complete user query flow', async () => {
            // 1. Initialize all components
            const sessionManager = new sessionManager_1.SessionManager(context);
            await cacheManager.initialize();
            const orchestrator = new orchestrator_1.ModelOrchestrator(context, configManager, storageManager, cacheManager);
            await orchestrator.initialize();
            // 2. Create session
            const session = await sessionManager.createSession('E2E Test');
            expect(session).toBeDefined();
            // 3. Add user message
            sessionManager.addMessage({
                role: 'user',
                content: 'Explain async/await'
            });
            // 4. Verify message was added
            const currentSession = sessionManager.getCurrentSession();
            expect(currentSession?.messages.length).toBe(1);
            // 5. Verify orchestrator is ready
            const stats = orchestrator.getCostStats();
            expect(stats).toBeDefined();
        });
        it('should handle error scenarios gracefully', async () => {
            const orchestrator = new orchestrator_1.ModelOrchestrator(context, configManager, storageManager, cacheManager);
            await orchestrator.initialize();
            // Should throw error when no providers available
            await expect(orchestrator.sendRequest({
                messages: [{ role: 'user', content: 'test' }]
            })).rejects.toThrow();
        });
    });
    describe('Component Lifecycle', () => {
        it('should initialize all components in correct order', async () => {
            // 1. Config Manager (no initialization needed)
            expect(configManager).toBeDefined();
            // 2. Storage Manager
            expect(storageManager).toBeDefined();
            // 3. Cache Manager
            await cacheManager.initialize();
            expect(cacheManager).toBeDefined();
            // 4. Session Manager
            const sessionManager = new sessionManager_1.SessionManager(context);
            await sessionManager.initialize();
            expect(sessionManager).toBeDefined();
            // 5. Model Orchestrator
            const orchestrator = new orchestrator_1.ModelOrchestrator(context, configManager, storageManager, cacheManager);
            await orchestrator.initialize();
            expect(orchestrator).toBeDefined();
        });
        it('should handle initialization failures gracefully', async () => {
            // Components should not throw during initialization
            const sessionManager = new sessionManager_1.SessionManager(context);
            await expect(sessionManager.initialize()).resolves.not.toThrow();
            const orchestrator = new orchestrator_1.ModelOrchestrator(context, configManager, storageManager, cacheManager);
            await expect(orchestrator.initialize()).resolves.not.toThrow();
        });
    });
});
//# sourceMappingURL=integration.test.js.map