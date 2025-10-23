/**
 * Git Service - Interact with Git repository
 * Provides methods to get status, diff, log, and other Git operations
 */

import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const logger = createLogger('GitService');

const execAsync = promisify(exec);

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

export enum GitFileStatus {
 ADDED = 'A',
 MODIFIED = 'M',
 DELETED = 'D',
 RENAMED = 'R',
 COPIED = 'C',
 UNTRACKED = '?',
 UNMERGED = 'U'
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

export class GitService {
 private workspaceRoot: string;
 private outputChannel: vscode.OutputChannel;

 constructor(workspaceRoot: string) {
 this.workspaceRoot = workspaceRoot;
 this.outputChannel = vscode.window.createOutputChannel('Codelicious Git');
 }

 /**
 * Check if directory is a Git repository
 */
 async isGitRepository(): Promise<boolean> {
 try {
 await this.execGit(['rev-parse', '--git-dir']);
 return true;
 } catch {
 return false;
 }
 }

 /**
 * Get current Git status
 */
 async getStatus(): Promise<GitStatus> {
 const [branch, statusOutput] = await Promise.all([
 this.getCurrentBranch(),
 this.execGit(['status', '--porcelain', '-b'])
 ]);

 const lines = statusOutput.split('\n').filter(l => l.trim());
 const staged: GitFile[] = [];
 const unstaged: GitFile[] = [];
 const untracked: GitFile[] = [];

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
 } else if (m.startsWith('behind')) {
 behind = parseInt(m.split(' ')[1]);
 }
 }
 }
 continue;
 }

 const status = line.substring(0, 2);
 const filePath = line.substring(3);

 const file: GitFile = {
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
 async getStagedDiff(): Promise<GitDiff[]> {
 const output = await this.execGit(['diff', '--cached', '--numstat']);
 return this.parseDiffNumstat(output);
 }

 /**
 * Get diff for unstaged changes
 */
 async getUnstagedDiff(): Promise<GitDiff[]> {
 const output = await this.execGit(['diff', '--numstat']);
 return this.parseDiffNumstat(output);
 }

 /**
 * Get detailed diff for a file
 */
 async getFileDiff(filePath: string, staged: boolean = false): Promise<GitDiff> {
 const args = staged
 ? ['diff', '--cached', '--', filePath]
 : ['diff', '--', filePath];

 const output = await this.execGit(args);
 return this.parseDetailedDiff(filePath, output);
 }

 /**
 * Get commit history
 */
 async getLog(limit: number = 10): Promise<GitCommit[]> {
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
 async getCommitDiff(commitHash: string): Promise<string> {
 try {
 const output = await this.execGit(['show', commitHash, '--format=', '--unified=3']);
 return output;
 } catch (error) {
 logger.error(`Failed to get diff for commit ${commitHash}:`, error);
 return '';
 }
 }

 /**
 * Get current branch name
 */
 async getCurrentBranch(): Promise<string> {
 const output = await this.execGit(['branch', '--show-current']);
 return output.trim();
 }

 /**
 * Get all branches
 */
 async getBranches(): Promise<GitBranch[]> {
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
 async stageFiles(files: string[]): Promise<void> {
 await this.execGit(['add', ...files]);
 }

 /**
 * Unstage files
 */
 async unstageFiles(files: string[]): Promise<void> {
 await this.execGit(['reset', 'HEAD', ...files]);
 }

 /**
 * Commit changes
 */
 async commit(message: string): Promise<string> {
 const output = await this.execGit(['commit', '-m', message]);
 const match = output.match(/\[.+\s+([a-f0-9]+)\]/);
 return match ? match[1] : '';
 }

 /**
 * Get remote URL
 */
 async getRemoteUrl(remote: string = 'origin'): Promise<string> {
 try {
 const output = await this.execGit(['remote', 'get-url', remote]);
 return output.trim();
 } catch {
 return '';
 }
 }

 /**
 * Execute Git command
 */
 private async execGit(args: string[]): Promise<string> {
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
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 this.outputChannel.appendLine(`Error: ${errorMessage}`);
 throw new Error(`Git command failed: ${errorMessage}`);
 }
 }

 /**
 * Parse file status character
 */
 private parseFileStatus(status: string): GitFileStatus {
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
 private parseDiffNumstat(output: string): GitDiff[] {
 const lines = output.split('\n').filter(l => l.trim());
 const diffs: GitDiff[] = [];

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
 private parseDetailedDiff(filePath: string, output: string): GitDiff {
 const lines = output.split('\n');
 const changes: GitChange[] = [];
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
 } else if (line.startsWith('-') && !line.startsWith('---')) {
 changes.push({ type: 'delete', lineNumber, content: line.substring(1) });
 deletions++;
 } else if (line.startsWith(' ')) {
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
 private parseLog(output: string): GitCommit[] {
 const commits: GitCommit[] = [];
 const entries = output.split('\n\n');

 for (const entry of entries) {
 const lines = entry.split('\n').filter(l => l.trim());
 if (lines.length === 0) continue;

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
 dispose(): void {
 this.outputChannel.dispose();
 }
}

