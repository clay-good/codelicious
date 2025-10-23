/**
 * PR Description Generator - Generate intelligent pull request descriptions
 * Uses AI to analyze commits and changes to generate comprehensive PR descriptions
 */
import { GitService } from './gitService';
import { ModelOrchestrator } from '../models/orchestrator';
export interface PRDescriptionOptions {
    baseBranch?: string;
    includeChecklist?: boolean;
    includeBreakingChanges?: boolean;
    includeTestingNotes?: boolean;
    template?: PRTemplate;
}
export declare enum PRTemplate {
    STANDARD = "standard",
    FEATURE = "feature",
    BUGFIX = "bugfix",
    HOTFIX = "hotfix",
    REFACTOR = "refactor",
    DOCS = "docs"
}
export interface GeneratedPRDescription {
    title: string;
    summary: string;
    changes: string[];
    breakingChanges?: string[];
    testingNotes?: string;
    checklist?: string[];
    full: string;
    type: PRTemplate;
}
export declare class PRDescriptionGenerator {
    private gitService;
    private modelOrchestrator;
    constructor(gitService: GitService, modelOrchestrator: ModelOrchestrator);
    /**
    * Generate PR description for current branch
    */
    generatePRDescription(options?: PRDescriptionOptions): Promise<GeneratedPRDescription>;
    /**
    * Get commits since base branch
    */
    private getCommitsSinceBase;
    /**
    * Get diff summary since base branch
    */
    private getDiffSummary;
    /**
    * Analyze changes to determine PR type and content
    */
    private analyzeChanges;
    /**
    * Build prompt for AI model
    */
    private buildPrompt;
    /**
    * Parse AI response into structured PR description
    */
    private parsePRDescription;
}
//# sourceMappingURL=prDescriptionGenerator.d.ts.map