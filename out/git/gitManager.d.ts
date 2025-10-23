/**
 * Git Manager - Coordinate all Git-related operations
 * Provides high-level interface for Git integration features
 */
import { GitService } from './gitService';
import { GeneratedCommitMessage, CommitMessageOptions } from './commitMessageGenerator';
import { GeneratedPRDescription, PRDescriptionOptions } from './prDescriptionGenerator';
import { ChangeAnalysis } from './changeAnalyzer';
import { ModelOrchestrator } from '../models/orchestrator';
export declare class GitManager {
    private workspaceRoot;
    private modelOrchestrator;
    private gitService;
    private commitGenerator;
    private prGenerator;
    private changeAnalyzer;
    private outputChannel;
    private statusBarItem;
    constructor(workspaceRoot: string, modelOrchestrator: ModelOrchestrator);
    /**
    * Initialize Git manager
    */
    initialize(): Promise<void>;
    /**
    * Generate commit message for staged changes
    */
    generateCommitMessage(options?: CommitMessageOptions): Promise<GeneratedCommitMessage>;
    /**
    * Generate multiple commit message suggestions
    */
    generateCommitSuggestions(count?: number, options?: CommitMessageOptions): Promise<GeneratedCommitMessage[]>;
    /**
    * Show commit message picker and commit
    */
    showCommitMessagePicker(): Promise<void>;
    /**
    * Generate PR description
    */
    generatePRDescription(options?: PRDescriptionOptions): Promise<GeneratedPRDescription>;
    /**
    * Show PR description in editor
    */
    showPRDescription(): Promise<void>;
    /**
    * Analyze staged changes
    */
    analyzeStagedChanges(): Promise<ChangeAnalysis>;
    /**
    * Show change analysis report
    */
    showChangeAnalysis(): Promise<void>;
    /**
    * Get Git service
    */
    getGitService(): GitService;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=gitManager.d.ts.map