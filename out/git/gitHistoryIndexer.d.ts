/**
 * Git History Indexer
 * AUGMENT PARITY: Context Lineage - Index and search commit history
 *
 * This service indexes git commit history and makes it searchable,
 * enabling evolution-aware intelligence similar to Augment's Context Lineage.
 */
import { GitService } from './gitService';
import { ModelOrchestrator } from '../models/orchestrator';
export interface CommitSummary {
    hash: string;
    author: string;
    date: Date;
    message: string;
    summary: string;
    filesChanged: string[];
    embedding?: number[];
}
export declare class GitHistoryIndexer {
    private gitService;
    private modelOrchestrator;
    private commits;
    private indexingInProgress;
    private indexingComplete;
    constructor(gitService: GitService, modelOrchestrator: ModelOrchestrator);
    /**
    * Index recent commit history (last 6 months)
    */
    indexCommitHistory(workspaceRoot: string): Promise<void>;
    /**
    * Index a single commit
    */
    private indexCommit;
    /**
    * Summarize commit with AI
    */
    private summarizeCommit;
    /**
    * Search commits by query
    */
    searchCommits(query: string, limit?: number): Promise<CommitSummary[]>;
    /**
    * Get commits that modified a specific file
    */
    getCommitsForFile(filePath: string, limit?: number): Promise<CommitSummary[]>;
    /**
    * Check if indexing is complete
    */
    isReady(): boolean;
    /**
    * Get total number of indexed commits
    */
    getIndexedCommitCount(): number;
    /**
    * Clear the index (for testing or re-indexing)
    */
    clearIndex(): void;
}
//# sourceMappingURL=gitHistoryIndexer.d.ts.map