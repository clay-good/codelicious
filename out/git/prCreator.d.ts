/**
 * PR Creation System
 *
 * Automatic PR creation with:
 * - Branch management
 * - PR description generation
 * - Review request automation
 * - Git workflow integration
 */
import { GitService } from './gitService';
export interface PROptions {
    title: string;
    description?: string;
    baseBranch?: string;
    targetBranch?: string;
    draft?: boolean;
    reviewers?: string[];
    labels?: string[];
    autoMerge?: boolean;
}
export interface PRResult {
    success: boolean;
    prNumber?: number;
    prUrl?: string;
    error?: string;
}
export interface BranchStrategy {
    type: 'feature' | 'bugfix' | 'hotfix' | 'release';
    prefix: string;
    baseBranch: string;
}
export interface FileChange {
    path: string;
    additions: number;
    deletions: number;
    description?: string;
}
export interface ChangeAnalysis {
    files: FileChange[];
    filesChanged: number;
    additions: number;
    deletions: number;
}
export declare class PRCreator {
    private gitService;
    constructor(gitService: GitService);
    /**
    * Create PR from current changes
    */
    createPR(options: PROptions): Promise<PRResult>;
    /**
    * Create feature branch and PR
    */
    createFeatureBranch(featureName: string, options?: Partial<PROptions>): Promise<PRResult>;
    /**
    * Generate PR description
    */
    generatePRDescription(): Promise<string>;
    /**
    * Generate commit message
    */
    private generateCommitMessage;
    /**
    * Determine branch strategy
    */
    private determineBranchStrategy;
    /**
    * Sanitize branch name
    */
    private sanitizeBranchName;
    /**
    * Analyze changes
    */
    private analyzeChanges;
    /**
    * Determine commit type
    */
    private determineCommitType;
    /**
    * Determine commit scope
    */
    private determineCommitScope;
    /**
    * Generate commit subject
    */
    private generateCommitSubject;
    /**
    * Create PR via API (GitHub/GitLab)
    */
    private createPRViaAPI;
}
//# sourceMappingURL=prCreator.d.ts.map