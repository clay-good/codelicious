/**
 * Commit Message Generator - Generate intelligent commit messages
 * Uses AI to analyze staged changes and generate conventional commit messages
 */
import { GitService } from './gitService';
import { ModelOrchestrator } from '../models/orchestrator';
export interface CommitMessageOptions {
    conventional?: boolean;
    includeBody?: boolean;
    includeBreakingChanges?: boolean;
    maxLength?: number;
}
export interface GeneratedCommitMessage {
    subject: string;
    body?: string;
    footer?: string;
    full: string;
    type: CommitType;
    scope?: string;
}
export declare enum CommitType {
    FEAT = "feat",
    FIX = "fix",
    DOCS = "docs",
    STYLE = "style",
    REFACTOR = "refactor",
    PERF = "perf",
    TEST = "test",
    BUILD = "build",
    CI = "ci",
    CHORE = "chore",
    REVERT = "revert"
}
export declare class CommitMessageGenerator {
    private gitService;
    private modelOrchestrator;
    constructor(gitService: GitService, modelOrchestrator: ModelOrchestrator);
    /**
    * Generate commit message for staged changes
    */
    generateCommitMessage(options?: CommitMessageOptions): Promise<GeneratedCommitMessage>;
    /**
    * Generate multiple commit message suggestions
    */
    generateSuggestions(count?: number, options?: CommitMessageOptions): Promise<GeneratedCommitMessage[]>;
    /**
    * Analyze changes to determine commit type and scope
    */
    private analyzeChanges;
    /**
    * Build prompt for AI model
    */
    private buildPrompt;
    /**
    * Parse AI response into structured commit message
    */
    private parseCommitMessage;
}
//# sourceMappingURL=commitMessageGenerator.d.ts.map