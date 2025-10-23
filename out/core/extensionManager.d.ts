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
import { CacheManager } from '../cache/cacheManager';
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionEngine } from './executionEngine';
import { SessionManager } from './sessionManager';
import { TestManager } from '../testing/testManager';
import { IntelligenceManager } from '../intelligence/intelligenceManager';
import { SpecificationManager } from '../specification/specificationManager';
import { GitManager } from '../git/gitManager';
import { RAGService } from '../rag/ragService';
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
export declare class ExtensionManager {
    private context;
    private configManager;
    private storageManager;
    private statusBar;
    private indexingEngine?;
    private embeddingManager?;
    private embeddingService?;
    private vectorStore?;
    private ragService?;
    private cacheManager?;
    private modelOrchestrator?;
    private executionEngine?;
    private sessionManager?;
    private testManager?;
    private intelligenceManager?;
    private specificationManager?;
    private gitManager?;
    private analyticsManager?;
    private learningManager?;
    private multiFileEditor?;
    private codeReviewAgent?;
    private documentationGenerator?;
    private autonomousWorkflow?;
    private advancedTesting?;
    private endToEndProductBuilder?;
    private fileWatcher?;
    private isInitialized;
    private enhancedStatusBar?;
    private quickActionsMenu?;
    private tutorialSystem?;
    private configurationWizard?;
    private mcpRegistry?;
    constructor(context: vscode.ExtensionContext, configManager: ConfigurationManager, storageManager: SecureStorageManager, statusBar: StatusBarManager);
    /**
    * Initialize all subsystems with progressive capability unlocking
    */
    initialize(): Promise<void>;
    /**
    * Initialize core systems that are needed immediately
    */
    private initializeCoreSystem;
    /**
    * Start background indexing with progressive enhancement
    */
    private startBackgroundIndexing;
    /**
    * Initialize embedding system in background
    */
    private initializeEmbeddingSystem;
    /**
    * Initialize RAG service
    */
    private initializeRAGService;
    /**
    * Initialize autonomous workflow
    */
    private initializeAutonomousWorkflow;
    /**
    * Initialize advanced testing orchestrator
    */
    private initializeAdvancedTesting;
    /**
    * Set up file watchers for real-time updates
    */
    private setupFileWatchers;
    /**
    * Update status bar based on indexing phase
    */
    private updateStatusForIndexing;
    /**
    * Configure API keys for cloud models
    */
    configureApiKeys(): Promise<void>;
    /**
    * Reindex the entire project
    */
    reindexProject(): Promise<void>;
    /**
    * Show indexing status
    */
    showIndexStatus(): Promise<void>;
    /**
    * Clear all caches
    */
    clearCache(): Promise<void>;
    /**
    * Show cost tracking information
    */
    showCostTracking(): Promise<void>;
    /**
    * Get the model orchestrator
    */
    getModelOrchestrator(): ModelOrchestrator | undefined;
    /**
    * Get the execution engine
    */
    getExecutionEngine(): ExecutionEngine | undefined;
    /**
    * Get the session manager
    */
    getSessionManager(): SessionManager | undefined;
    /**
    * Get the test manager
    */
    getTestManager(): TestManager | undefined;
    /**
    * Get the analytics manager
    */
    getAnalyticsManager(): AnalyticsManager | undefined;
    /**
    * Get the cache manager
    */
    getCacheManager(): CacheManager | undefined;
    /**
    * Get the learning manager
    */
    getLearningManager(): LearningManager | undefined;
    /**
    * Get the MCP registry
    */
    getMCPRegistry(): MCPToolRegistry | undefined;
    /**
    * Get the intelligence manager
    */
    getIntelligenceManager(): IntelligenceManager | undefined;
    /**
    * Get the specification manager
    */
    getSpecificationManager(): SpecificationManager | undefined;
    /**
    * Get the git manager
    */
    getGitManager(): GitManager | undefined;
    /**
    * Get the embedding manager
    */
    getEmbeddingManager(): EmbeddingManager | undefined;
    /**
    * Get the embedding service
    */
    getEmbeddingService(): EmbeddingService | undefined;
    /**
    * Get the RAG service
    */
    getRAGService(): RAGService | undefined;
    /**
    * Get the indexing engine
    */
    getIndexingEngine(): IndexingEngine | undefined;
    /**
    * Get the multi-file editor
    */
    getMultiFileEditor(): MultiFileEditor | undefined;
    /**
    * Get the code review agent
    */
    getCodeReviewAgent(): CodeReviewAgent | undefined;
    /**
    * Get the documentation generator
    */
    getDocumentationGenerator(): DocumentationGenerator | undefined;
    /**
    * Get the autonomous workflow
    */
    getAutonomousWorkflow(): AutonomousWorkflow | undefined;
    /**
    * Get the product builder
    */
    getProductBuilder(): EndToEndProductBuilder | undefined;
    /**
    * Get the advanced testing orchestrator
    */
    getAdvancedTesting(): AdvancedTestingOrchestrator | undefined;
    /**
    * Initialize enhanced UX components
    */
    private initializeUXComponents;
    /**
    * Get metrics for status bar
    */
    private getStatusBarMetrics;
    /**
    * Get enhanced status bar
    */
    getEnhancedStatusBar(): EnhancedStatusBar | undefined;
    /**
    * Get quick actions menu
    */
    getQuickActionsMenu(): QuickActionsMenu | undefined;
    /**
    * Get tutorial system
    */
    getTutorialSystem(): TutorialSystem | undefined;
    /**
    * Get configuration wizard
    */
    getConfigurationWizard(): ConfigurationWizard | undefined;
    /**
    * Clean up resources
    */
    dispose(): Promise<void>;
}
//# sourceMappingURL=extensionManager.d.ts.map