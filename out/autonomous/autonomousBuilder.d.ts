/**
 * Autonomous Builder
 *
 * Orchestrates fully autonomous application building from specifications.
 * Runs in a loop until the project is complete, handling:
 * - Multi-turn AI conversations
 * - Automatic task execution
 * - Error recovery
 * - Progress tracking
 * - Completion detection
 */
import * as vscode from 'vscode';
import { ProjectState } from './projectState';
import { ModelOrchestrator } from '../models/orchestrator';
import { AutonomousExecutor } from '../core/autonomousExecutor';
import { ExecutionEngine } from '../core/executionEngine';
import { RAGService } from '../rag/ragService';
import { LearningManager } from '../learning/learningManager';
export interface AutonomousBuildOptions {
    maxIterations?: number;
    requireUserApproval?: boolean;
    autoFixErrors?: boolean;
    enableTests?: boolean;
    saveStateInterval?: number;
    outputChannel?: vscode.OutputChannel;
}
export interface AutonomousBuildResult {
    success: boolean;
    projectState: ProjectState;
    duration: number;
    iterations: number;
    errors: string[];
    costSavings?: {
        totalCost: number;
        ragSavings: number;
        cacheSavings: number;
        routingSavings: number;
    };
}
export declare class AutonomousBuilder {
    private readonly workspaceRoot;
    private readonly orchestrator;
    private readonly autonomousExecutor;
    private readonly executionEngine;
    private readonly ragService;
    private readonly learningManager;
    private readonly options;
    private stateTracker;
    private conversationHistory;
    private outputChannel;
    private cancelled;
    private lastAIResponse;
    private problemSolver;
    constructor(workspaceRoot: string, orchestrator: ModelOrchestrator, autonomousExecutor: AutonomousExecutor, executionEngine: ExecutionEngine, ragService: RAGService | null, learningManager: LearningManager | null, options?: AutonomousBuildOptions);
    /**
    * Build a project autonomously from a specification
    */
    buildFromSpecification(specification: string, projectName: string): Promise<AutonomousBuildResult>;
    /**
    * Main autonomous execution loop
    */
    private autonomousLoop;
    /**
    * Initialize conversation with system prompt
    */
    private initializeConversation;
    /**
    * Get next action from AI with RAG context and intelligent routing
    */
    private getNextAction;
    /**
    * Build context message with current state
    */
    private buildStateContext;
    /**
    * Execute an action from AI response
    */
    private executeAction;
    /**
    * Execute file operations
    */
    private executeFileOperations;
    /**
    * Parse commands from AI response
    */
    private parseCommands;
    /**
    * Log message
    */
    private log;
    /**
    * Log error
    */
    private logError;
    /**
    * Execute commands
    */
    private executeCommands;
    /**
    * Parse test results from command output
    */
    private parseTestResults;
    /**
    * Handle error with AI assistance and RAG context
    */
    private handleError;
    /**
    * Get current state
    */
    getState(): ProjectState;
    /**
    * Get state summary
    */
    getSummary(): string;
    /**
    * Cancel the build
    */
    cancel(): void;
    /**
    * Dispose resources
    */
    dispose(): void;
    /**
    * OPTIMIZATION 2: Detect task complexity for intelligent model routing
    * Routes simple tasks to cheap models (Gemini Flash, GPT-3.5)
    * Routes complex tasks to powerful models (Claude Sonnet, GPT-4)
    */
    private detectTaskComplexity;
    /**
    * OPTIMIZATION 3: Get optimized conversation history with summarization
    * Summarizes old messages to reduce token usage by 15-20%
    */
    private getOptimizedConversationHistory;
    /**
    * Detect language from file path
    */
    private detectLanguage;
}
//# sourceMappingURL=autonomousBuilder.d.ts.map