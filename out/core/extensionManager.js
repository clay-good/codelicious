"use strict";
/**
 * Central manager for the Codelicious extension
 * Coordinates all major subsystems and manages lifecycle
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
exports.ExtensionManager = void 0;
const vscode = __importStar(require("vscode"));
const indexer_1 = require("./indexer");
const embeddingManager_1 = require("../embedding/embeddingManager");
const embeddingService_1 = require("../embedding/embeddingService");
const vectorStore_1 = require("../embedding/vectorStore");
const cacheManager_1 = require("../cache/cacheManager");
const orchestrator_1 = require("../models/orchestrator");
const executionEngine_1 = require("./executionEngine");
const sessionManager_1 = require("./sessionManager");
const testManager_1 = require("../testing/testManager");
const intelligenceManager_1 = require("../intelligence/intelligenceManager");
const specificationManager_1 = require("../specification/specificationManager");
const gitManager_1 = require("../git/gitManager");
const ragService_1 = require("../rag/ragService");
const types_1 = require("../types");
const analyticsManager_1 = require("../analytics/analyticsManager");
const learningManager_1 = require("../learning/learningManager");
const multiFileEditor_1 = require("../editing/multiFileEditor");
const codeReviewAgent_1 = require("../agents/codeReviewAgent");
const documentationGenerator_1 = require("../documentation/documentationGenerator");
const autonomousWorkflow_1 = require("../autonomous/autonomousWorkflow");
const advancedTestingOrchestrator_1 = require("../testing/advancedTestingOrchestrator");
const endToEndProductBuilder_1 = require("../autonomous/endToEndProductBuilder");
const enhancedStatusBar_1 = require("../ui/enhancedStatusBar");
const quickActions_1 = require("../ui/quickActions");
const tutorialSystem_1 = require("../ui/tutorialSystem");
const configurationWizard_1 = require("../ui/configurationWizard");
const mcpToolRegistry_1 = require("../integrations/mcpToolRegistry");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ExtensionManager');
class ExtensionManager {
    constructor(context, configManager, storageManager, statusBar) {
        this.context = context;
        this.configManager = configManager;
        this.storageManager = storageManager;
        this.statusBar = statusBar;
        this.isInitialized = false;
    }
    /**
    * Initialize all subsystems with progressive capability unlocking
    */
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            this.statusBar.show('Initializing Codelicious...', 'sync~spin');
            // Phase 1: Initialize core systems (immediate)
            await this.initializeCoreSystem();
            // Phase 2: Start background indexing (non-blocking)
            this.startBackgroundIndexing();
            // Phase 3: Initialize embedding system (background)
            this.initializeEmbeddingSystem();
            this.isInitialized = true;
            this.statusBar.show('Codelicious Ready', 'check');
            // Set up file watchers for real-time updates
            this.setupFileWatchers();
        }
        catch (error) {
            logger.error('Failed to initialize ExtensionManager', error);
            this.statusBar.show('Codelicious: Initialization Failed', 'error');
            throw error;
        }
    }
    /**
    * Initialize core systems that are needed immediately
    */
    async initializeCoreSystem() {
        // Initialize analytics manager
        this.analyticsManager = new analyticsManager_1.AnalyticsManager(this.context);
        // Initialize cache manager
        this.cacheManager = new cacheManager_1.CacheManager(this.context, this.configManager);
        await this.cacheManager.initialize();
        // Initialize MCP Tool Registry
        try {
            this.mcpRegistry = new mcpToolRegistry_1.MCPToolRegistry(this.configManager, this.cacheManager);
            await this.mcpRegistry.initialize();
            logger.info('MCP Tool Registry initialized');
        }
        catch (error) {
            logger.warn('MCP Tool Registry initialization failed (external tools will be disabled)', error);
        }
        // Initialize learning manager (will be enhanced with embedding service later)
        this.learningManager = new learningManager_1.LearningManager(this.context, this.analyticsManager);
        // Initialize model orchestrator
        this.modelOrchestrator = new orchestrator_1.ModelOrchestrator(this.context, this.configManager, this.storageManager, this.cacheManager);
        await this.modelOrchestrator.initialize();
        // Initialize enhanced UX components
        this.initializeUXComponents();
        // Initialize execution engine
        this.executionEngine = new executionEngine_1.ExecutionEngine(this.configManager);
        // Initialize session manager
        this.sessionManager = new sessionManager_1.SessionManager(this.context);
        await this.sessionManager.initialize();
        // Initialize test manager, intelligence manager, specification manager, and git manager
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.testManager = new testManager_1.TestManager(workspaceFolders[0].uri.fsPath);
            this.intelligenceManager = new intelligenceManager_1.IntelligenceManager(workspaceFolders[0].uri.fsPath);
            this.specificationManager = new specificationManager_1.SpecificationManager(workspaceFolders[0].uri.fsPath);
            // Initialize Git manager
            if (this.modelOrchestrator) {
                this.gitManager = new gitManager_1.GitManager(workspaceFolders[0].uri.fsPath, this.modelOrchestrator);
                await this.gitManager.initialize();
            }
            // Initialize multi-file editor
            if (this.modelOrchestrator) {
                this.multiFileEditor = new multiFileEditor_1.MultiFileEditor(this.modelOrchestrator, workspaceFolders[0].uri.fsPath);
            }
            // Initialize code review agent
            if (this.modelOrchestrator) {
                this.codeReviewAgent = new codeReviewAgent_1.CodeReviewAgent(this.modelOrchestrator);
            }
            // Initialize documentation generator
            if (this.modelOrchestrator) {
                this.documentationGenerator = new documentationGenerator_1.DocumentationGenerator(this.modelOrchestrator, workspaceFolders[0].uri.fsPath);
            }
        }
    }
    /**
    * Start background indexing with progressive enhancement
    */
    startBackgroundIndexing() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            logger.info('No workspace folder found, skipping indexing');
            return;
        }
        // Initialize indexing engine
        this.indexingEngine = new indexer_1.IndexingEngine(this.context, this.configManager, this.statusBar);
        // Start indexing in background
        this.indexingEngine.startIndexing(workspaceFolders[0].uri.fsPath).catch(error => {
            logger.error('Background indexing failed', error);
        });
        // Listen to indexing progress
        this.indexingEngine.onProgress((progress) => {
            this.updateStatusForIndexing(progress.phase, progress.progress);
        });
    }
    /**
    * Initialize embedding system in background
    */
    initializeEmbeddingSystem() {
        if (!this.indexingEngine) {
            logger.warn('Cannot initialize embedding system without indexing engine');
            return;
        }
        // Create embedding service
        this.embeddingService = new embeddingService_1.EmbeddingService(this.context, this.configManager, this.indexingEngine);
        // Create vector store
        this.vectorStore = new vectorStore_1.VectorStore(this.configManager);
        // Create embedding manager
        this.embeddingManager = new embeddingManager_1.EmbeddingManager(this.configManager, this.cacheManager);
        // Initialize embedding service
        this.embeddingService.initialize()
            .then(() => {
            logger.info('Embedding service initialized');
            // Connect embedding service to indexing engine
            if (this.indexingEngine && this.embeddingService) {
                this.indexingEngine.setEmbeddingService(this.embeddingService);
            }
            // Enhance learning manager with embedding manager
            if (this.learningManager && this.embeddingManager && this.vectorStore) {
                // Re-create learning manager with embedding capabilities
                this.learningManager = new learningManager_1.LearningManager(this.context, this.analyticsManager, this.embeddingManager, this.vectorStore);
                logger.info('Learning manager enhanced with embeddings');
            }
            // Initialize RAG service
            return this.initializeRAGService();
        })
            .catch(error => {
            logger.error('Failed to initialize embedding system', error);
            vscode.window.showWarningMessage('Embedding system initialization failed. Semantic search will be unavailable.');
        });
    }
    /**
    * Initialize RAG service
    */
    async initializeRAGService() {
        if (!this.embeddingManager || !this.vectorStore || !this.indexingEngine) {
            logger.warn('Cannot initialize RAG service: missing dependencies');
            return;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            logger.warn('Cannot initialize RAG service: no workspace folder');
            return;
        }
        try {
            // Create RAG service with learning manager for pattern integration
            // AUGMENT PARITY: Pass model orchestrator for commit summarization
            this.ragService = new ragService_1.RAGService(this.context, this.configManager, this.embeddingManager, this.vectorStore, this.indexingEngine, this.learningManager, // Pass learning manager for pattern integration
            this.modelOrchestrator // Pass model orchestrator for git history indexing
            );
            // Initialize with workspace path
            await this.ragService.initialize(workspaceFolders[0].uri.fsPath);
            logger.info('RAG service initialized');
            // Log pattern integration status
            if (this.ragService.hasPatternIntegration()) {
                logger.info('Pattern RAG integration enabled');
            }
            // Initialize autonomous workflow
            this.initializeAutonomousWorkflow();
            // Initialize advanced testing
            this.initializeAdvancedTesting();
        }
        catch (error) {
            logger.error('Failed to initialize RAG service', error);
        }
    }
    /**
    * Initialize autonomous workflow
    */
    initializeAutonomousWorkflow() {
        if (!this.modelOrchestrator || !this.ragService || !this.executionEngine) {
            logger.warn('Cannot initialize autonomous workflow: missing dependencies');
            return;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            logger.warn('Cannot initialize autonomous workflow: no workspace folder');
            return;
        }
        try {
            this.autonomousWorkflow = new autonomousWorkflow_1.AutonomousWorkflow(this.modelOrchestrator, this.ragService, this.executionEngine, workspaceFolders[0].uri.fsPath, this.mcpRegistry // Pass MCP registry
            );
            // Initialize end-to-end product builder
            if (this.specificationManager) {
                this.endToEndProductBuilder = new endToEndProductBuilder_1.EndToEndProductBuilder(this.modelOrchestrator, this.ragService, this.executionEngine, workspaceFolders[0].uri.fsPath, this.specificationManager);
                logger.info('End-to-end product builder initialized');
            }
            logger.info('Autonomous workflow initialized');
        }
        catch (error) {
            logger.error('Failed to initialize autonomous workflow', error);
        }
    }
    /**
    * Initialize advanced testing orchestrator
    */
    initializeAdvancedTesting() {
        if (!this.modelOrchestrator || !this.executionEngine || !this.ragService) {
            logger.warn('Cannot initialize advanced testing: missing dependencies');
            return;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            logger.warn('Cannot initialize advanced testing: no workspace folder');
            return;
        }
        try {
            this.advancedTesting = new advancedTestingOrchestrator_1.AdvancedTestingOrchestrator(this.modelOrchestrator, this.executionEngine, this.ragService, workspaceFolders[0].uri.fsPath);
            logger.info('Advanced testing orchestrator initialized');
        }
        catch (error) {
            logger.error('Failed to initialize advanced testing', error);
        }
    }
    /**
    * Set up file watchers for real-time updates
    */
    setupFileWatchers() {
        // Watch for file changes in the workspace
        this.fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        this.fileWatcher.onDidCreate(uri => {
            this.indexingEngine?.indexFile(uri.fsPath);
        });
        this.fileWatcher.onDidChange(uri => {
            this.indexingEngine?.updateFile(uri.fsPath);
        });
        this.fileWatcher.onDidDelete(uri => {
            this.indexingEngine?.removeFile(uri.fsPath);
        });
        this.context.subscriptions.push(this.fileWatcher);
    }
    /**
    * Update status bar based on indexing phase
    */
    updateStatusForIndexing(phase, progress) {
        const phaseNames = {
            [types_1.IndexingPhase.BASIC]: 'Basic',
            [types_1.IndexingPhase.STRUCTURE]: 'Structure',
            [types_1.IndexingPhase.SEMANTIC]: 'Semantic',
            [types_1.IndexingPhase.DEEP]: 'Deep',
            [types_1.IndexingPhase.CONTINUOUS]: 'Ready'
        };
        const phaseName = phaseNames[phase];
        const progressText = progress < 100 ? ` (${Math.round(progress)}%)` : '';
        this.statusBar.show(` Codelicious: ${phaseName}${progressText}`, progress < 100 ? 'sync~spin' : 'check');
    }
    /**
    * Configure API keys for cloud models
    */
    async configureApiKeys() {
        const providers = ['Claude (Anthropic)', 'OpenAI', 'Google Gemini'];
        const selected = await vscode.window.showQuickPick(providers, {
            placeHolder: 'Select AI provider to configure'
        });
        if (!selected) {
            return;
        }
        const apiKey = await vscode.window.showInputBox({
            prompt: `Enter API key for ${selected}`,
            password: true,
            placeHolder: 'sk-...'
        });
        if (apiKey) {
            const providerKey = selected.split(' ')[0].toLowerCase();
            await this.storageManager.storeApiKey(providerKey, apiKey);
            vscode.window.showInformationMessage(`API key for ${selected} saved securely!`);
        }
    }
    /**
    * Reindex the entire project
    */
    async reindexProject() {
        const confirm = await vscode.window.showWarningMessage('This will reindex the entire project. Continue?', 'Yes', 'No');
        if (confirm === 'Yes' && this.indexingEngine) {
            await this.indexingEngine.reindex();
            vscode.window.showInformationMessage('Project reindexing started!');
        }
    }
    /**
    * Show indexing status
    */
    async showIndexStatus() {
        if (!this.indexingEngine) {
            vscode.window.showInformationMessage('Indexing engine not initialized');
            return;
        }
        const status = this.indexingEngine.getStatus();
        const message = `
Indexing Status:
- Phase: ${status.phase}
- Progress: ${status.progress}%
- Files Processed: ${status.filesProcessed}/${status.totalFiles}
- Current File: ${status.currentFile || 'None'}
 `.trim();
        vscode.window.showInformationMessage(message);
    }
    /**
    * Clear all caches
    */
    async clearCache() {
        if (this.cacheManager) {
            await this.cacheManager.clear();
            vscode.window.showInformationMessage('Cache cleared successfully!');
        }
    }
    /**
    * Show cost tracking information
    */
    async showCostTracking() {
        if (this.modelOrchestrator) {
            const stats = this.modelOrchestrator.getCostStats();
            const avgCost = stats.totalRequests > 0 ? stats.totalCost / stats.totalRequests : 0;
            const message = `
Cost Tracking:
- Total Cost Today: $${stats.totalCost.toFixed(4)}
- Requests: ${stats.totalRequests}
- Tokens Used: ${stats.totalTokens}
- Average Cost per Request: $${avgCost.toFixed(4)}
 `.trim();
            vscode.window.showInformationMessage(message);
        }
    }
    /**
    * Get the model orchestrator
    */
    getModelOrchestrator() {
        return this.modelOrchestrator;
    }
    /**
    * Get the execution engine
    */
    getExecutionEngine() {
        return this.executionEngine;
    }
    /**
    * Get the session manager
    */
    getSessionManager() {
        return this.sessionManager;
    }
    /**
    * Get the test manager
    */
    getTestManager() {
        return this.testManager;
    }
    /**
    * Get the analytics manager
    */
    getAnalyticsManager() {
        return this.analyticsManager;
    }
    /**
    * Get the cache manager
    */
    getCacheManager() {
        return this.cacheManager;
    }
    /**
    * Get the learning manager
    */
    getLearningManager() {
        return this.learningManager;
    }
    /**
    * Get the MCP registry
    */
    getMCPRegistry() {
        return this.mcpRegistry;
    }
    /**
    * Get the intelligence manager
    */
    getIntelligenceManager() {
        return this.intelligenceManager;
    }
    /**
    * Get the specification manager
    */
    getSpecificationManager() {
        return this.specificationManager;
    }
    /**
    * Get the git manager
    */
    getGitManager() {
        return this.gitManager;
    }
    /**
    * Get the embedding manager
    */
    getEmbeddingManager() {
        return this.embeddingManager;
    }
    /**
    * Get the embedding service
    */
    getEmbeddingService() {
        return this.embeddingService;
    }
    /**
    * Get the RAG service
    */
    getRAGService() {
        return this.ragService;
    }
    /**
    * Get the indexing engine
    */
    getIndexingEngine() {
        return this.indexingEngine;
    }
    /**
    * Get the multi-file editor
    */
    getMultiFileEditor() {
        return this.multiFileEditor;
    }
    /**
    * Get the code review agent
    */
    getCodeReviewAgent() {
        return this.codeReviewAgent;
    }
    /**
    * Get the documentation generator
    */
    getDocumentationGenerator() {
        return this.documentationGenerator;
    }
    /**
    * Get the autonomous workflow
    */
    getAutonomousWorkflow() {
        return this.autonomousWorkflow;
    }
    /**
    * Get the product builder
    */
    getProductBuilder() {
        // Return the end-to-end product builder if available
        return this.endToEndProductBuilder;
    }
    /**
    * Get the advanced testing orchestrator
    */
    getAdvancedTesting() {
        return this.advancedTesting;
    }
    /**
    * Initialize enhanced UX components
    */
    initializeUXComponents() {
        // Initialize enhanced status bar
        this.enhancedStatusBar = new enhancedStatusBar_1.EnhancedStatusBar();
        // Initialize with metrics provider
        if (this.modelOrchestrator) {
            this.enhancedStatusBar.initialize(async () => {
                return await this.getStatusBarMetrics();
            });
        }
        // Initialize quick actions menu
        this.quickActionsMenu = new quickActions_1.QuickActionsMenu(this.context);
        // Initialize tutorial system
        this.tutorialSystem = new tutorialSystem_1.TutorialSystem(this.context);
        // Initialize configuration wizard
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.configurationWizard = new configurationWizard_1.ConfigurationWizard(this.context, workspaceFolders[0].uri.fsPath);
            // Run wizard on first launch
            if (configurationWizard_1.ConfigurationWizard.shouldRun(this.context)) {
                // Delay to let extension fully activate
                setTimeout(() => {
                    this.configurationWizard?.start();
                }, 2000);
            }
        }
    }
    /**
    * Get metrics for status bar
    */
    async getStatusBarMetrics() {
        const orchestrator = this.modelOrchestrator;
        if (!orchestrator) {
            return {
                circuitBreakerHealth: { healthy: 0, unhealthy: 0 },
                rateLimiterStats: { throttled: 0, total: 0 },
                queueStats: { queued: 0, active: 0 },
                averageLatency: 0,
                cacheHitRate: 0,
                totalCost: 0,
                costLimit: 10,
                activeRequests: 0,
                totalRequests: 0
            };
        }
        // Get circuit breaker stats
        const cbHealthRaw = orchestrator.getCircuitBreakerHealth?.() || { healthy: [], unhealthy: [] };
        const cbHealth = {
            healthy: Array.isArray(cbHealthRaw.healthy) ? cbHealthRaw.healthy.length : 0,
            unhealthy: Array.isArray(cbHealthRaw.unhealthy) ? cbHealthRaw.unhealthy.length : 0
        };
        // Get rate limiter stats
        const rlStats = orchestrator.getRateLimiterStats?.() || {};
        const rlTotal = Object.values(rlStats).reduce((sum, stat) => {
            if (stat && typeof stat === 'object' && 'totalRequests' in stat) {
                return sum + (stat.totalRequests || 0);
            }
            return sum;
        }, 0);
        const rlThrottled = Object.values(rlStats).reduce((sum, stat) => {
            if (stat && typeof stat === 'object' && 'totalThrottled' in stat) {
                return sum + (stat.totalThrottled || 0);
            }
            return sum;
        }, 0);
        // Get queue stats
        const queueStats = orchestrator.getRequestQueueStats?.() || {};
        const queueData = Object.values(queueStats)[0] || { queueSize: 0, activeRequests: 0 };
        // Get analytics data
        const analyticsSummary = this.analyticsManager?.getSummary();
        const analytics = {
            totalRequests: analyticsSummary?.performance.totalOperations || 0,
            totalCost: analyticsSummary?.cost.totalCost || 0,
            averageLatency: analyticsSummary?.performance.averageDuration || 0
        };
        // Get cache stats
        const cacheStats = this.cacheManager?.getStats() || { hits: 0, misses: 0 };
        const cacheHitRate = cacheStats.hits + cacheStats.misses > 0
            ? cacheStats.hits / (cacheStats.hits + cacheStats.misses)
            : 0;
        // Get cost limit from config
        const config = vscode.workspace.getConfiguration('codelicious');
        const costLimit = config.get('models.costLimit', 10);
        return {
            circuitBreakerHealth: cbHealth,
            rateLimiterStats: { throttled: rlThrottled, total: rlTotal },
            queueStats: { queued: queueData.queueSize, active: queueData.activeRequests },
            averageLatency: analytics.averageLatency || 0,
            cacheHitRate,
            totalCost: analytics.totalCost || 0,
            costLimit,
            activeRequests: queueData.activeRequests || 0,
            totalRequests: analytics.totalRequests || 0
        };
    }
    /**
    * Get enhanced status bar
    */
    getEnhancedStatusBar() {
        return this.enhancedStatusBar;
    }
    /**
    * Get quick actions menu
    */
    getQuickActionsMenu() {
        return this.quickActionsMenu;
    }
    /**
    * Get tutorial system
    */
    getTutorialSystem() {
        return this.tutorialSystem;
    }
    /**
    * Get configuration wizard
    */
    getConfigurationWizard() {
        return this.configurationWizard;
    }
    /**
    * Clean up resources
    */
    async dispose() {
        this.fileWatcher?.dispose();
        await this.indexingEngine?.dispose();
        await this.embeddingService?.dispose();
        await this.embeddingManager?.dispose();
        await this.cacheManager?.dispose();
        await this.sessionManager?.dispose();
        this.testManager?.dispose();
        this.intelligenceManager?.dispose();
        this.gitManager?.dispose();
        this.specificationManager?.dispose();
        this.statusBar.dispose();
        this.enhancedStatusBar?.dispose();
    }
}
exports.ExtensionManager = ExtensionManager;
//# sourceMappingURL=extensionManager.js.map