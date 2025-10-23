/**
 * Git Service - Interact with Git repository
 * Provides methods to get status, diff, log, and other Git operations
 */
export interface GitStatus {
    branch: string;
    ahead: number;
    behind: number;
    staged: GitFile[];
    unstaged: GitFile[];
    untracked: GitFile[];
    hasChanges: boolean;
}
export interface GitFile {
    path: string;
    status: GitFileStatus;
    additions?: number;
    deletions?: number;
}
export declare enum GitFileStatus {
    ADDED = "A",
    MODIFIED = "M",
    DELETED = "D",
    RENAMED = "R",
    COPIED = "C",
    UNTRACKED = "?",
    UNMERGED = "U"
}
export interface GitDiff {
    file: string;
    additions: number;
    deletions: number;
    changes: GitChange[];
}
export interface GitChange {
    type: 'add' | 'delete' | 'context';
    lineNumber: number;
    content: string;
}
export interface GitCommit {
    hash: string;
    author: string;
    date: Date;
    message: string;
    files: string[];
}
export interface GitBranch {
    name: string;
    current: boolean;
    remote?: string;
}
export declare class GitService {
    private workspaceRoot;
    private outputChannel;
    constructor(workspaceRoot: string);
    /**
    * Check if directory is a Git repository
    */
    isGitRepository(): Promise<boolean>;
    /**
    * Get current Git status
    */
    getStatus(): Promise<GitStatus>;
    /**
    * Get diff for staged changes
    */
    getStagedDiff(): Promise<GitDiff[]>;
    /**
    * Get diff for unstaged changes
    */
    getUnstagedDiff(): Promise<GitDiff[]>;
    /**
    * Get detailed diff for a file
    */
    getFileDiff(filePath: string, staged?: boolean): Promise<GitDiff>;
    /**
    * Get commit history
    */
    getLog(limit?: number): Promise<GitCommit[]>;
    /**
    * Get diff for a specific commit
    * AUGMENT PARITY: Support commit history analysis
    */
    getCommitDiff(commitHash: string): Promise<string>;
    /**
    * Get current branch name
    */
    getCurrentBranch(): Promise<string>;
    /**
    * Get all branches
    */
    getBranches(): Promise<GitBranch[]>;
    /**
    * Stage files
    */
    stageFiles(files: string[]): Promise<void>;
    /**
    * Unstage files
    */
    unstageFiles(files: string[]): Promise<void>;
    /**
    * Commit changes
    */
    commit(message: string): Promise<string>;
    /**
    * Get remote URL
    */
    getRemoteUrl(remote?: string): Promise<string>;
    /**
    * Execute Git command
    */
    private execGit;
    /**
    * Parse file status character
    */
    private parseFileStatus;
    /**
    * Parse diff numstat output
    */
    private parseDiffNumstat;
    /**
    * Parse detailed diff output
    */
    private parseDetailedDiff;
    /**
    * Parse git log output
    */
    private parseLog;
    /**
    * Dispose resources
    */
    dispose(): void;
}
//# sourceMappingURL=gitService.d.ts.map