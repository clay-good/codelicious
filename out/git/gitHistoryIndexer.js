"use strict";
/**
 * Git History Indexer
 * AUGMENT PARITY: Context Lineage - Index and search commit history
 *
 * This service indexes git commit history and makes it searchable,
 * enabling evolution-aware intelligence similar to Augment's Context Lineage.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHistoryIndexer = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('GitHistoryIndexer');
class GitHistoryIndexer {
    constructor(gitService, modelOrchestrator) {
        this.gitService = gitService;
        this.modelOrchestrator = modelOrchestrator;
        this.commits = new Map();
        this.indexingInProgress = false;
        this.indexingComplete = false;
    }
    /**
    * Index recent commit history (last 6 months)
    */
    async indexCommitHistory(workspaceRoot) {
        if (this.indexingInProgress) {
            logger.info('Commit indexing already in progress...');
            return;
        }
        if (this.indexingComplete) {
            logger.info('Commit history already indexed');
            return;
        }
        this.indexingInProgress = true;
        logger.info('Indexing commit history...');
        try {
            // Get last 6 months of commits (~180 days)
            const commits = await this.gitService.getLog(1000); // Adjust limit as needed
            const sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
            const recentCommits = commits.filter(c => c.date.getTime() > sixMonthsAgo);
            logger.info(`Found ${recentCommits.length} commits to index`);
            // Process in batches to avoid rate limits
            const batchSize = 10;
            for (let i = 0; i < recentCommits.length; i += batchSize) {
                const batch = recentCommits.slice(i, i + batchSize);
                await Promise.all(batch.map(commit => this.indexCommit(commit)));
                // Progress update
                const progress = Math.round(((i + batch.length) / recentCommits.length) * 100);
                logger.debug(`Indexed ${Math.min(i + batch.length, recentCommits.length)}/${recentCommits.length} commits (${progress}%)`);
            }
            this.indexingComplete = true;
            logger.info('Commit history indexed successfully');
        }
        catch (error) {
            logger.error('Failed to index commit history', error);
        }
        finally {
            this.indexingInProgress = false;
        }
    }
    /**
    * Index a single commit
    */
    async indexCommit(commit) {
        try {
            // Get diff for this commit
            const diff = await this.gitService.getCommitDiff(commit.hash);
            // Summarize with AI (use fast model)
            const summary = await this.summarizeCommit(commit, diff);
            // Store in index
            this.commits.set(commit.hash, {
                hash: commit.hash,
                author: commit.author,
                date: commit.date,
                message: commit.message,
                summary: summary,
                filesChanged: commit.files
            });
        }
        catch (error) {
            logger.error(`Failed to index commit ${commit.hash}`, error);
            // Store without summary as fallback
            this.commits.set(commit.hash, {
                hash: commit.hash,
                author: commit.author,
                date: commit.date,
                message: commit.message,
                summary: commit.message, // Fallback to commit message
                filesChanged: commit.files
            });
        }
    }
    /**
    * Summarize commit with AI
    */
    async summarizeCommit(commit, diff) {
        try {
            const prompt = `Summarize this git commit in 2-3 sentences for code search:

Commit Message: ${commit.message}
Files Changed: ${commit.files.join(', ')}
Diff: ${diff.substring(0, 2000)}${diff.length > 2000 ? '...(truncated)' : ''}

Focus on:
1. Primary goal of the change
2. Key functions or files touched
3. Technical terms that aid retrieval

Summary:`;
            const response = await this.modelOrchestrator.sendRequest({
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                maxTokens: 200
            });
            return response.content.trim();
        }
        catch (error) {
            logger.error('Failed to summarize commit', error);
            // Fallback to commit message
            return commit.message;
        }
    }
    /**
    * Search commits by query
    */
    async searchCommits(query, limit = 5) {
        if (!this.indexingComplete) {
            logger.warn('Commit history not yet indexed');
            return [];
        }
        const results = [];
        const queryLower = query.toLowerCase();
        const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
        for (const commit of this.commits.values()) {
            const searchText = `${commit.message} ${commit.summary} ${commit.filesChanged.join(' ')}`.toLowerCase();
            // Calculate relevance score
            let score = 0;
            // Exact phrase match (highest priority)
            if (searchText.includes(queryLower)) {
                score += 20;
            }
            // Individual term matches
            for (const term of queryTerms) {
                if (commit.message.toLowerCase().includes(term)) {
                    score += 5;
                }
                if (commit.summary.toLowerCase().includes(term)) {
                    score += 3;
                }
                if (commit.filesChanged.some(f => f.toLowerCase().includes(term))) {
                    score += 2;
                }
            }
            // Boost recent commits slightly
            const ageInDays = (Date.now() - commit.date.getTime()) / (1000 * 60 * 60 * 24);
            if (ageInDays < 30) {
                score += 2;
            }
            else if (ageInDays < 90) {
                score += 1;
            }
            if (score > 0) {
                results.push({ commit, score });
            }
        }
        // Sort by score and return top results
        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(r => r.commit);
    }
    /**
    * Get commits that modified a specific file
    */
    async getCommitsForFile(filePath, limit = 10) {
        if (!this.indexingComplete) {
            logger.warn('Commit history not yet indexed');
            return [];
        }
        const results = [];
        for (const commit of this.commits.values()) {
            if (commit.filesChanged.some(f => f.includes(filePath))) {
                results.push(commit);
            }
        }
        // Sort by date (most recent first)
        return results
            .sort((a, b) => b.date.getTime() - a.date.getTime())
            .slice(0, limit);
    }
    /**
    * Check if indexing is complete
    */
    isReady() {
        return this.indexingComplete;
    }
    /**
    * Get total number of indexed commits
    */
    getIndexedCommitCount() {
        return this.commits.size;
    }
    /**
    * Clear the index (for testing or re-indexing)
    */
    clearIndex() {
        this.commits.clear();
        this.indexingComplete = false;
    }
}
exports.GitHistoryIndexer = GitHistoryIndexer;
//# sourceMappingURL=gitHistoryIndexer.js.map