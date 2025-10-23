/**
 * Tests for GitService
 */

import { GitService, GitFileStatus } from '../gitService';
import * as vscode from 'vscode';

// Mock vscode
jest.mock('vscode', () => ({
 window: {
 createOutputChannel: jest.fn(() => ({
 appendLine: jest.fn(),
 dispose: jest.fn()
 }))
 }
}));

// Mock child_process
jest.mock('child_process', () => ({
 exec: jest.fn()
}));

describe('GitService', () => {
 let gitService: GitService;
 const mockWorkspaceRoot = '/test/workspace';

 beforeEach(() => {
 gitService = new GitService(mockWorkspaceRoot);
 jest.clearAllMocks();
 });

 afterEach(() => {
 gitService.dispose();
 });

 describe('isGitRepository', () => {
 it('should return true for valid Git repository', async () => {
 // Mock successful git command
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, { stdout: '.git\n', stderr: '' });
 });

 const result = await gitService.isGitRepository();
 expect(result).toBe(true);
 });

 it('should return false for non-Git directory', async () => {
 // Mock failed git command
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(new Error('Not a git repository'), { stdout: '', stderr: 'fatal: not a git repository' });
 });

 const result = await gitService.isGitRepository();
 expect(result).toBe(false);
 });
 });

 describe('getStatus', () => {
 it('should parse Git status correctly', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 if (cmd.includes('branch --show-current')) {
 callback(null, { stdout: 'main\n', stderr: '' });
 } else if (cmd.includes('status --porcelain')) {
 callback(null, {
 stdout: '## main...origin/main [ahead 1]\nM src/file1.ts\nA src/file2.ts\n?? src/file3.ts\n',
 stderr: ''
 });
 }
 });

 const status = await gitService.getStatus();

 expect(status.branch).toBe('main');
 expect(status.ahead).toBe(1);
 expect(status.behind).toBe(0);
 expect(status.staged.length).toBe(2);
 expect(status.unstaged.length).toBe(0);
 expect(status.untracked.length).toBe(1);
 expect(status.hasChanges).toBe(true);
 });

 it('should handle empty status', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 if (cmd.includes('branch --show-current')) {
 callback(null, { stdout: 'main\n', stderr: '' });
 } else if (cmd.includes('status --porcelain')) {
 callback(null, { stdout: '## main\n', stderr: '' });
 }
 });

 const status = await gitService.getStatus();

 expect(status.branch).toBe('main');
 expect(status.staged.length).toBe(0);
 expect(status.unstaged.length).toBe(0);
 expect(status.untracked.length).toBe(0);
 expect(status.hasChanges).toBe(false);
 });
 });

 describe('getStagedDiff', () => {
 it('should parse staged diff correctly', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, {
 stdout: '10\t5\tsrc/file1.ts\n20\t3\tsrc/file2.ts\n',
 stderr: ''
 });
 });

 const diffs = await gitService.getStagedDiff();

 expect(diffs.length).toBe(2);
 expect(diffs[0].file).toBe('src/file1.ts');
 expect(diffs[0].additions).toBe(10);
 expect(diffs[0].deletions).toBe(5);
 expect(diffs[1].file).toBe('src/file2.ts');
 expect(diffs[1].additions).toBe(20);
 expect(diffs[1].deletions).toBe(3);
 });

 it('should handle empty diff', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, { stdout: '', stderr: '' });
 });

 const diffs = await gitService.getStagedDiff();

 expect(diffs.length).toBe(0);
 });
 });

 describe('getUnstagedDiff', () => {
 it('should parse unstaged diff correctly', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, {
 stdout: '5\t2\tsrc/file1.ts\n',
 stderr: ''
 });
 });

 const diffs = await gitService.getUnstagedDiff();

 expect(diffs.length).toBe(1);
 expect(diffs[0].file).toBe('src/file1.ts');
 expect(diffs[0].additions).toBe(5);
 expect(diffs[0].deletions).toBe(2);
 });
 });

 describe('getFileDiff', () => {
 it('should parse detailed file diff', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, {
 stdout: '@@ -1,3 +1,4 @@\n context line\n+added line\n-deleted line\n context line\n',
 stderr: ''
 });
 });

 const diff = await gitService.getFileDiff('src/file1.ts');

 expect(diff.file).toBe('src/file1.ts');
 expect(diff.additions).toBe(1);
 expect(diff.deletions).toBe(1);
 expect(diff.changes.length).toBeGreaterThan(0);
 });
 });

 describe('getLog', () => {
 it('should parse commit log correctly', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, {
 stdout: 'abc123|John Doe|2024-01-01 10:00:00 +0000|feat: add feature\nsrc/file1.ts\nsrc/file2.ts\n\n',
 stderr: ''
 });
 });

 const commits = await gitService.getLog(10);

 expect(commits.length).toBe(1);
 expect(commits[0].hash).toBe('abc123');
 expect(commits[0].author).toBe('John Doe');
 expect(commits[0].message).toBe('feat: add feature');
 expect(commits[0].files.length).toBe(2);
 });
 });

 describe('getCurrentBranch', () => {
 it('should return current branch name', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, { stdout: 'feature-branch\n', stderr: '' });
 });

 const branch = await gitService.getCurrentBranch();

 expect(branch).toBe('feature-branch');
 });
 });

 describe('getBranches', () => {
 it('should parse branch list correctly', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, {
 stdout: '* main\n feature-branch\n remotes/origin/main\n',
 stderr: ''
 });
 });

 const branches = await gitService.getBranches();

 expect(branches.length).toBe(3);
 expect(branches[0].name).toBe('main');
 expect(branches[0].current).toBe(true);
 expect(branches[1].name).toBe('feature-branch');
 expect(branches[1].current).toBe(false);
 expect(branches[2].name).toBe('origin/main');
 expect(branches[2].remote).toBe('origin');
 });
 });

 describe('stageFiles', () => {
 it('should stage files successfully', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, { stdout: '', stderr: '' });
 });

 await expect(gitService.stageFiles(['src/file1.ts', 'src/file2.ts'])).resolves.not.toThrow();
 });
 });

 describe('unstageFiles', () => {
 it('should unstage files successfully', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, { stdout: '', stderr: '' });
 });

 await expect(gitService.unstageFiles(['src/file1.ts'])).resolves.not.toThrow();
 });
 });

 describe('commit', () => {
 it('should commit changes and return hash', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, { stdout: '[main abc1234] feat: add feature\n', stderr: '' });
 });

 const hash = await gitService.commit('feat: add feature');

 expect(hash).toBe('abc1234');
 });
 });

 describe('getRemoteUrl', () => {
 it('should return remote URL', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(null, { stdout: 'https://github.com/user/repo.git\n', stderr: '' });
 });

 const url = await gitService.getRemoteUrl('origin');

 expect(url).toBe('https://github.com/user/repo.git');
 });

 it('should return empty string if remote not found', async () => {
 const { exec } = require('child_process');
 exec.mockImplementation((cmd: string, options: any, callback: Function) => {
 callback(new Error('No such remote'), { stdout: '', stderr: 'fatal: No such remote' });
 });

 const url = await gitService.getRemoteUrl('origin');

 expect(url).toBe('');
 });
 });

 describe('parseFileStatus', () => {
 it('should parse file status characters correctly', () => {
 const parseFileStatus = (gitService as any).parseFileStatus.bind(gitService);

 expect(parseFileStatus('A')).toBe(GitFileStatus.ADDED);
 expect(parseFileStatus('M')).toBe(GitFileStatus.MODIFIED);
 expect(parseFileStatus('D')).toBe(GitFileStatus.DELETED);
 expect(parseFileStatus('R')).toBe(GitFileStatus.RENAMED);
 expect(parseFileStatus('C')).toBe(GitFileStatus.COPIED);
 expect(parseFileStatus('?')).toBe(GitFileStatus.UNTRACKED);
 expect(parseFileStatus('U')).toBe(GitFileStatus.UNMERGED);
 });
 });
});

