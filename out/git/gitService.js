"use strict";
/**
 * Git Service - Interact with Git repository
 * Provides methods to get status, diff, log, and other Git operations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitService = exports.GitFileStatus = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('GitService');
const execAsync = (0, util_1.promisify)(child_process_1.exec);
var GitFileStatus;
(function (GitFileStatus) {
    GitFileStatus["ADDED"] = "A";
    GitFileStatus["MODIFIED"] = "M";
    GitFileStatus["DELETED"] = "D";
    GitFileStatus["RENAMED"] = "R";
    GitFileStatus["COPIED"] = "C";
    GitFileStatus["UNTRACKED"] = "?";
    GitFileStatus["UNMERGED"] = "U";
})(GitFileStatus || (exports.GitFileStatus = GitFileStatus = {}));
class GitService {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.outputChannel = vscode.window.createOutputChannel('Codelicious Git');
    }
    /**
    * Check if directory is a Git repository
    */
    async isGitRepository() {
        try {
            await this.execGit(['rev-parse', '--git-dir']);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
    * Get current Git status
    */
    async getStatus() {
        const [branch, statusOutput] = await Promise.all([
            this.getCurrentBranch(),
            this.execGit(['status', '--porcelain', '-b'])
        ]);
        const lines = statusOutput.split('\n').filter(l => l.trim());
        const staged = [];
        const unstaged = [];
        const untracked = [];
        let ahead = 0;
        let behind = 0;
        for (const line of lines) {
            if (line.startsWith('##')) {
                // Parse branch tracking info
                const match = line.match(/ahead (\d+)|behind (\d+)/g);
                if (match) {
                    for (const m of match) {
                        if (m.startsWith('ahead')) {
                            ahead = parseInt(m.split(' ')[1]);
                        }
                        else if (m.startsWith('behind')) {
                            behind = parseInt(m.split(' ')[1]);
                        }
                    }
                }
                continue;
            }
            const status = line.substring(0, 2);
            const filePath = line.substring(3);
            const file = {
                path: filePath,
                status: this.parseFileStatus(status[0])
            };
            // Staged changes (first character)
            if (status[0] !== ' ' && status[0] !== '?') {
                staged.push(file);
            }
            // Unstaged changes (second character)
            if (status[1] !== ' ' && status[1] !== '?') {
                unstaged.push({ ...file, status: this.parseFileStatus(status[1]) });
            }
            // Untracked files
            if (status[0] === '?' && status[1] === '?') {
                untracked.push({ ...file, status: GitFileStatus.UNTRACKED });
            }
        }
        return {
            branch,
            ahead,
            behind,
            staged,
            unstaged,
            untracked,
            hasChanges: staged.length > 0 || unstaged.length > 0 || untracked.length > 0
        };
    }
    /**
    * Get diff for staged changes
    */
    async getStagedDiff() {
        const output = await this.execGit(['diff', '--cached', '--numstat']);
        return this.parseDiffNumstat(output);
    }
    /**
    * Get diff for unstaged changes
    */
    async getUnstagedDiff() {
        const output = await this.execGit(['diff', '--numstat']);
        return this.parseDiffNumstat(output);
    }
    /**
    * Get detailed diff for a file
    */
    async getFileDiff(filePath, staged = false) {
        const args = staged
            ? ['diff', '--cached', '--', filePath]
            : ['diff', '--', filePath];
        const output = await this.execGit(args);
        return this.parseDetailedDiff(filePath, output);
    }
    /**
    * Get commit history
    */
    async getLog(limit = 10) {
        const output = await this.execGit([
            'log',
            `--max-count=${limit}`,
            '--pretty=format:%H|%an|%ad|%s',
            '--date=iso',
            '--name-only'
        ]);
        return this.parseLog(output);
    }
    /**
    * Get diff for a specific commit
    * AUGMENT PARITY: Support commit history analysis
    */
    async getCommitDiff(commitHash) {
        try {
            const output = await this.execGit(['show', commitHash, '--format=', '--unified=3']);
            return output;
        }
        catch (error) {
            logger.error(`Failed to get diff for commit ${commitHash}:`, error);
            return '';
        }
    }
    /**
    * Get current branch name
    */
    async getCurrentBranch() {
        const output = await this.execGit(['branch', '--show-current']);
        return output.trim();
    }
    /**
    * Get all branches
    */
    async getBranches() {
        const output = await this.execGit(['branch', '-a']);
        const lines = output.split('\n').filter(l => l.trim());
        return lines.map(line => {
            const current = line.startsWith('*');
            const name = line.replace('*', '').trim();
            const isRemote = name.startsWith('remotes/');
            return {
                name: isRemote ? name.replace('remotes/', '') : name,
                current,
                remote: isRemote ? name.split('/')[1] : undefined
            };
        });
    }
    /**
    * Stage files
    */
    async stageFiles(files) {
        await this.execGit(['add', ...files]);
    }
    /**
    * Unstage files
    */
    async unstageFiles(files) {
        await this.execGit(['reset', 'HEAD', ...files]);
    }
    /**
    * Commit changes
    */
    async commit(message) {
        const output = await this.execGit(['commit', '-m', message]);
        const match = output.match(/\[.+\s+([a-f0-9]+)\]/);
        return match ? match[1] : '';
    }
    /**
    * Get remote URL
    */
    async getRemoteUrl(remote = 'origin') {
        try {
            const output = await this.execGit(['remote', 'get-url', remote]);
            return output.trim();
        }
        catch {
            return '';
        }
    }
    /**
    * Execute Git command
    */
    async execGit(args) {
        const command = `git ${args.join(' ')}`;
        this.outputChannel.appendLine(`> ${command}`);
        try {
            const { stdout, stderr } = await execAsync(command, {
                cwd: this.workspaceRoot,
                maxBuffer: 10 * 1024 * 1024 // 10MB
            });
            if (stderr && !stderr.includes('warning')) {
                this.outputChannel.appendLine(`stderr: ${stderr}`);
            }
            return stdout;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.outputChannel.appendLine(`Error: ${errorMessage}`);
            throw new Error(`Git command failed: ${errorMessage}`);
        }
    }
    /**
    * Parse file status character
    */
    parseFileStatus(status) {
        switch (status) {
            case 'A': return GitFileStatus.ADDED;
            case 'M': return GitFileStatus.MODIFIED;
            case 'D': return GitFileStatus.DELETED;
            case 'R': return GitFileStatus.RENAMED;
            case 'C': return GitFileStatus.COPIED;
            case '?': return GitFileStatus.UNTRACKED;
            case 'U': return GitFileStatus.UNMERGED;
            default: return GitFileStatus.MODIFIED;
        }
    }
    /**
    * Parse diff numstat output
    */
    parseDiffNumstat(output) {
        const lines = output.split('\n').filter(l => l.trim());
        const diffs = [];
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length >= 3) {
                diffs.push({
                    file: parts[2],
                    additions: parseInt(parts[0]) || 0,
                    deletions: parseInt(parts[1]) || 0,
                    changes: []
                });
            }
        }
        return diffs;
    }
    /**
    * Parse detailed diff output
    */
    parseDetailedDiff(filePath, output) {
        const lines = output.split('\n');
        const changes = [];
        let additions = 0;
        let deletions = 0;
        let lineNumber = 0;
        for (const line of lines) {
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -\d+,?\d* \+(\d+),?\d* @@/);
                if (match) {
                    lineNumber = parseInt(match[1]);
                }
                continue;
            }
            if (line.startsWith('+') && !line.startsWith('+++')) {
                changes.push({ type: 'add', lineNumber: lineNumber++, content: line.substring(1) });
                additions++;
            }
            else if (line.startsWith('-') && !line.startsWith('---')) {
                changes.push({ type: 'delete', lineNumber, content: line.substring(1) });
                deletions++;
            }
            else if (line.startsWith(' ')) {
                changes.push({ type: 'context', lineNumber: lineNumber++, content: line.substring(1) });
            }
        }
        return {
            file: filePath,
            additions,
            deletions,
            changes
        };
    }
    /**
    * Parse git log output
    */
    parseLog(output) {
        const commits = [];
        const entries = output.split('\n\n');
        for (const entry of entries) {
            const lines = entry.split('\n').filter(l => l.trim());
            if (lines.length === 0)
                continue;
            const [hash, author, date, message] = lines[0].split('|');
            const files = lines.slice(1);
            commits.push({
                hash,
                author,
                date: new Date(date),
                message,
                files
            });
        }
        return commits;
    }
    /**
    * Dispose resources
    */
    dispose() {
        this.outputChannel.dispose();
    }
}
exports.GitService = GitService;
//# sourceMappingURL=gitService.js.map