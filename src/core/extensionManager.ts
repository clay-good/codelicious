/**
 * Central manager for the Codelicious extension
 * Coordinates all major subsystems and manages lifecycle
 */

import * as vscode from 'vscode';
import { ConfigurationManager } from './configurationManager';
import { SecureStorageManager } from './secureStorage';
import { StatusBarManager } from '../ui/statusBar';
import { IndexingEngine } from './indexer';
import { EmbeddingManager } from '../embedding/embeddingManager';
import { EmbeddingService } from '../embedding/embeddingService';
import { VectorStore } from '../embedding/vectorStore';
import { CacheManager } from '../cache/cacheManager';
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionEngine } from './executionEngine';
import { SessionManager } from './sessionManager';
import { TestManager } from '../testing/testManager';
import { IntelligenceManager } from '../intelligence/intelligenceManager';
import { SpecificationManager } from '../specification/specificationManager';
import { GitManager } from '../git/gitManager';
import { RAGService } from '../rag/ragService';
import { IndexingPhase } from '../types';
import { AnalyticsManager } from '../analytics/analyticsManager';
import { LearningManager } from '../learning/learningManager';
import { MultiFileEditor } from '../editing/multiFileEditor';
import { CodeReviewAgent } from '../agents/codeReviewAgent';
import { DocumentationGenerator } from '../documentation/documentationGenerator';
import { AutonomousWorkflow } from '../autonomous/autonomousWorkflow';
import { AdvancedTestingOrchestrator } from '../testing/advancedTestingOrchestrator';
import { EndToEndProductBuilder } from '../autonomous/endToEndProductBuilder';
import { EnhancedStatusBar } from '../ui/enhancedStatusBar';
import { QuickActionsMenu } from '../ui/quickActions';
import { TutorialSystem } from '../ui/tutorialSystem';
import { ConfigurationWizard } from '../ui/configurationWizard';
import { MCPToolRegistry } from '../integrations/mcpToolRegistry';
import { createLogger } from '../utils/logger';

const logger = createLogger('ExtensionManager');

export class ExtensionManager {
 private indexingEngine?: IndexingEngine;
 private embeddingManager?: EmbeddingManager;
 private embeddingService?: EmbeddingService;
 private vectorStore?: VectorStore;
 private ragService?: RAGService;
 private cacheManager?: CacheManager;
 private modelOrchestrator?: ModelOrchestrator;
 private executionEngine?: ExecutionEngine;
 private sessionManager?: SessionManager;
 private testManager?: TestManager;
 private intelligenceManager?: IntelligenceManager;
 private specificationManager?: SpecificationManager;
 private gitManager?: GitManager;
 private analyticsManager?: AnalyticsManager;
 private learningManager?: LearningManager;
 private multiFileEditor?: MultiFileEditor;
 private codeReviewAgent?: CodeReviewAgent;
 private documentationGenerator?: DocumentationGenerator;
 private autonomousWorkflow?: AutonomousWorkflow;
 private advancedTesting?: AdvancedTestingOrchestrator;
 private endToEndProductBuilder?: EndToEndProductBuilder;
 private fileWatcher?: vscode.FileSystemWatcher;
 private isInitialized = false;

 // Enhanced UX components
 private enhancedStatusBar?: EnhancedStatusBar;
 private quickActionsMenu?: QuickActionsMenu;
 private tutorialSystem?: TutorialSystem;
 private configurationWizard?: ConfigurationWizard;

 // MCP Integration
 private mcpRegistry?: MCPToolRegistry;

 constructor(
 private context: vscode.ExtensionContext,
 private configManager: ConfigurationManager,
 private storageManager: SecureStorageManager,
 private statusBar: StatusBarManager
 ) {}

 /**
 * Initialize all subsystems with progressive capability unlocking
 */
 async initialize(): Promise<void> {
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

 } catch (error) {
 logger.error('Failed to initialize ExtensionManager', error);
 this.statusBar.show('Codelicious: Initialization Failed', 'error');
 throw error;
 }
 }

 /**
 * Initialize core systems that are needed immediately
 */
 private async initializeCoreSystem(): Promise<void> {
 // Initialize analytics manager
 this.analyticsManager = new AnalyticsManager(this.context);

 // Initialize cache manager
 this.cacheManager = new CacheManager(this.context, this.configManager);
 await this.cacheManager.initialize();

 // Initialize MCP Tool Registry
 try {
 this.mcpRegistry = new MCPToolRegistry(this.configManager, this.cacheManager);
 await this.mcpRegistry.initialize();
 logger.info('MCP Tool Registry initialized');
 } catch (error) {
 logger.warn('MCP Tool Registry initialization failed (external tools will be disabled)', error);
 }

 // Initialize learning manager (will be enhanced with embedding service later)
 this.learningManager = new LearningManager(
 this.context,
 this.analyticsManager
 );

 // Initialize model orchestrator
 this.modelOrchestrator = new ModelOrchestrator(
 this.context,
 this.configManager,
 this.storageManager,
 this.cacheManager
 );
 await this.modelOrchestrator.initialize();

 // Initialize enhanced UX components
 this.initializeUXComponents();

 // Initialize execution engine
 this.executionEngine = new ExecutionEngine(this.configManager);

 // Initialize session manager
 this.sessionManager = new SessionManager(this.context);
 await this.sessionManager.initialize();

 // Initialize test manager, intelligence manager, specification manager, and git manager
 const workspaceFolders = vscode.workspace.workspaceFolders;
 if (workspaceFolders && workspaceFolders.length > 0) {
 this.testManager = new TestManager(workspaceFolders[0].uri.fsPath);
 this.intelligenceManager = new IntelligenceManager(workspaceFolders[0].uri.fsPath);
 this.specificationManager = new SpecificationManager(workspaceFolders[0].uri.fsPath);

 // Initialize Git manager
 if (this.modelOrchestrator) {
 this.gitManager = new GitManager(workspaceFolders[0].uri.fsPath, this.modelOrchestrator);
 await this.gitManager.initialize();
 }

 // Initialize multi-file editor
 if (this.modelOrchestrator) {
 this.multiFileEditor = new MultiFileEditor(this.modelOrchestrator, workspaceFolders[0].uri.fsPath);
 }

 // Initialize code review agent
 if (this.modelOrchestrator) {
 this.codeReviewAgent = new CodeReviewAgent(this.modelOrchestrator);
 }

 // Initialize documentation generator
 if (this.modelOrchestrator) {
 this.documentationGenerator = new DocumentationGenerator(this.modelOrchestrator, workspaceFolders[0].uri.fsPath);
 }
 }
 }

 /**
 * Start background indexing with progressive enhancement
 */
 private startBackgroundIndexing(): void {
 const workspaceFolders = vscode.workspace.workspaceFolders;
 if (!workspaceFolders || workspaceFolders.length === 0) {
 logger.info('No workspace folder found, skipping indexing');
 return;
 }

 // Initialize indexing engine
 this.indexingEngine = new IndexingEngine(
 this.context,
 this.configManager,
 this.statusBar
 );

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
 private initializeEmbeddingSystem(): void {
 if (!this.indexingEngine) {
 logger.warn('Cannot initialize embedding system without indexing engine');
 return;
 }

 // Create embedding service
 this.embeddingService = new EmbeddingService(
 this.context,
 this.configManager,
 this.indexingEngine
 );

 // Create vector store
 this.vectorStore = new VectorStore(this.configManager);

 // Create embedding manager
 this.embeddingManager = new EmbeddingManager(
 this.configManager,
 this.cacheManager!
 );

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
 this.learningManager = new LearningManager(
 this.context,
 this.analyticsManager,
 this.embeddingManager,
 this.vectorStore
 );
 logger.info('Learning manager enhanced with embeddings');
 }

 // Initialize RAG service
 return this.initializeRAGService();
 })
 .catch(error => {
 logger.error('Failed to initialize embedding system', error);
 vscode.window.showWarningMessage(
 'Embedding system initialization failed. Semantic search will be unavailable.'
 );
 });
 }

 /**
 * Initialize RAG service
 */
 private async initializeRAGService(): Promise<void> {
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
 this.ragService = new RAGService(
 this.context,
 this.configManager,
 this.embeddingManager,
 this.vectorStore,
 this.indexingEngine,
 this.learningManager, // Pass learning manager for pattern integration
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
 } catch (error) {
 logger.error('Failed to initialize RAG service', error);
 }
 }

 /**
 * Initialize autonomous workflow
 */
 private initializeAutonomousWorkflow(): void {
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
 this.autonomousWorkflow = new AutonomousWorkflow(
 this.modelOrchestrator,
 this.ragService,
 this.executionEngine,
 workspaceFolders[0].uri.fsPath,
 this.mcpRegistry // Pass MCP registry
 );

 // Initialize end-to-end product builder
 if (this.specificationManager) {
 this.endToEndProductBuilder = new EndToEndProductBuilder(
 this.modelOrchestrator,
 this.ragService,
 this.executionEngine,
 workspaceFolders[0].uri.fsPath,
 this.specificationManager
 );
 logger.info('End-to-end product builder initialized');
 }

 logger.info('Autonomous workflow initialized');
 } catch (error) {
 logger.error('Failed to initialize autonomous workflow', error);
 }
 }

 /**
 * Initialize advanced testing orchestrator
 */
 private initializeAdvancedTesting(): void {
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
 this.advancedTesting = new AdvancedTestingOrchestrator(
 this.modelOrchestrator,
 this.executionEngine,
 this.ragService,
 workspaceFolders[0].uri.fsPath
 );

 logger.info('Advanced testing orchestrator initialized');
 } catch (error) {
 logger.error('Failed to initialize advanced testing', error);
 }
 }

 /**
 * Set up file watchers for real-time updates
 */
 private setupFileWatchers(): void {
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
 private updateStatusForIndexing(phase: IndexingPhase, progress: number): void {
 const phaseNames = {
 [IndexingPhase.BASIC]: 'Basic',
 [IndexingPhase.STRUCTURE]: 'Structure',
 [IndexingPhase.SEMANTIC]: 'Semantic',
 [IndexingPhase.DEEP]: 'Deep',
 [IndexingPhase.CONTINUOUS]: 'Ready'
 };

 const phaseName = phaseNames[phase];
 const progressText = progress < 100 ? ` (${Math.round(progress)}%)` : '';

 this.statusBar.show(
 ` Codelicious: ${phaseName}${progressText}`,
 progress < 100 ? 'sync~spin' : 'check'
 );
 }

 /**
 * Configure API keys for cloud models
 */
 async configureApiKeys(): Promise<void> {
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
 async reindexProject(): Promise<void> {
 const confirm = await vscode.window.showWarningMessage(
 'This will reindex the entire project. Continue?',
 'Yes',
 'No'
 );

 if (confirm === 'Yes' && this.indexingEngine) {
 await this.indexingEngine.reindex();
 vscode.window.showInformationMessage('Project reindexing started!');
 }
 }

 /**
 * Show indexing status
 */
 async showIndexStatus(): Promise<void> {
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
 async clearCache(): Promise<void> {
 if (this.cacheManager) {
 await this.cacheManager.clear();
 vscode.window.showInformationMessage('Cache cleared successfully!');
 }
 }

 /**
 * Show cost tracking information
 */
 async showCostTracking(): Promise<void> {
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
 getModelOrchestrator(): ModelOrchestrator | undefined {
 return this.modelOrchestrator;
 }

 /**
 * Get the execution engine
 */
 getExecutionEngine(): ExecutionEngine | undefined {
 return this.executionEngine;
 }

 /**
 * Get the session manager
 */
 getSessionManager(): SessionManager | undefined {
 return this.sessionManager;
 }

 /**
 * Get the test manager
 */
 getTestManager(): TestManager | undefined {
 return this.testManager;
 }

 /**
 * Get the analytics manager
 */
 getAnalyticsManager(): AnalyticsManager | undefined {
 return this.analyticsManager;
 }

 /**
 * Get the cache manager
 */
 getCacheManager(): CacheManager | undefined {
 return this.cacheManager;
 }

 /**
 * Get the learning manager
 */
 getLearningManager(): LearningManager | undefined {
 return this.learningManager;
 }

 /**
 * Get the MCP registry
 */
 getMCPRegistry(): MCPToolRegistry | undefined {
 return this.mcpRegistry;
 }

 /**
 * Get the intelligence manager
 */
 getIntelligenceManager(): IntelligenceManager | undefined {
 return this.intelligenceManager;
 }

 /**
 * Get the specification manager
 */
 getSpecificationManager(): SpecificationManager | undefined {
 return this.specificationManager;
 }

 /**
 * Get the git manager
 */
 getGitManager(): GitManager | undefined {
 return this.gitManager;
 }

 /**
 * Get the embedding manager
 */
 getEmbeddingManager(): EmbeddingManager | undefined {
 return this.embeddingManager;
 }

 /**
 * Get the embedding service
 */
 getEmbeddingService(): EmbeddingService | undefined {
 return this.embeddingService;
 }

 /**
 * Get the RAG service
 */
 getRAGService(): RAGService | undefined {
 return this.ragService;
 }

 /**
 * Get the indexing engine
 */
 getIndexingEngine(): IndexingEngine | undefined {
 return this.indexingEngine;
 }

 /**
 * Get the multi-file editor
 */
 getMultiFileEditor(): MultiFileEditor | undefined {
 return this.multiFileEditor;
 }

 /**
 * Get the code review agent
 */
 getCodeReviewAgent(): CodeReviewAgent | undefined {
 return this.codeReviewAgent;
 }

 /**
 * Get the documentation generator
 */
 getDocumentationGenerator(): DocumentationGenerator | undefined {
 return this.documentationGenerator;
 }

 /**
 * Get the autonomous workflow
 */
 getAutonomousWorkflow(): AutonomousWorkflow | undefined {
 return this.autonomousWorkflow;
 }

 /**
 * Get the product builder
 */
 getProductBuilder(): EndToEndProductBuilder | undefined {
 // Return the end-to-end product builder if available
 return this.endToEndProductBuilder;
 }

 /**
 * Get the advanced testing orchestrator
 */
 getAdvancedTesting(): AdvancedTestingOrchestrator | undefined {
 return this.advancedTesting;
 }

 /**
 * Initialize enhanced UX components
 */
 private initializeUXComponents(): void {
 // Initialize enhanced status bar
 this.enhancedStatusBar = new EnhancedStatusBar();

 // Initialize with metrics provider
 if (this.modelOrchestrator) {
 this.enhancedStatusBar.initialize(async () => {
 return await this.getStatusBarMetrics();
 });
 }

 // Initialize quick actions menu
 this.quickActionsMenu = new QuickActionsMenu(this.context);

 // Initialize tutorial system
 this.tutorialSystem = new TutorialSystem(this.context);

 // Initialize configuration wizard
 const workspaceFolders = vscode.workspace.workspaceFolders;
 if (workspaceFolders && workspaceFolders.length > 0) {
 this.configurationWizard = new ConfigurationWizard(
 this.context,
 workspaceFolders[0].uri.fsPath
 );

 // Run wizard on first launch
 if (ConfigurationWizard.shouldRun(this.context)) {
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
 private async getStatusBarMetrics(): Promise<any> {
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
 const rlTotal = Object.values(rlStats).reduce((sum: number, stat: unknown) => {
 if (stat && typeof stat === 'object' && 'totalRequests' in stat) {
 return sum + ((stat as { totalRequests?: number }).totalRequests || 0);
 }
 return sum;
 }, 0);
 const rlThrottled = Object.values(rlStats).reduce((sum: number, stat: unknown) => {
 if (stat && typeof stat === 'object' && 'totalThrottled' in stat) {
 return sum + ((stat as { totalThrottled?: number }).totalThrottled || 0);
 }
 return sum;
 }, 0);

 // Get queue stats
 const queueStats = orchestrator.getRequestQueueStats?.() || {};
 const queueData = Object.values(queueStats)[0] as any || { queueSize: 0, activeRequests: 0 };

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
 const costLimit = config.get<number>('models.costLimit', 10);

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
 getEnhancedStatusBar(): EnhancedStatusBar | undefined {
 return this.enhancedStatusBar;
 }

 /**
 * Get quick actions menu
 */
 getQuickActionsMenu(): QuickActionsMenu | undefined {
 return this.quickActionsMenu;
 }

 /**
 * Get tutorial system
 */
 getTutorialSystem(): TutorialSystem | undefined {
 return this.tutorialSystem;
 }

 /**
 * Get configuration wizard
 */
 getConfigurationWizard(): ConfigurationWizard | undefined {
 return this.configurationWizard;
 }

 /**
 * Clean up resources
 */
 async dispose(): Promise<void> {
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

