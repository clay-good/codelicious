/**
 * Tests for CommitMessageGenerator
 */

import { CommitMessageGenerator, CommitType } from '../commitMessageGenerator';
import { GitService, GitFileStatus } from '../gitService';
import { ModelOrchestrator } from '../../models/orchestrator';

// Mock dependencies
jest.mock('../gitService');
jest.mock('../../models/orchestrator');

describe('CommitMessageGenerator', () => {
 let generator: CommitMessageGenerator;
 let mockGitService: jest.Mocked<GitService>;
 let mockOrchestrator: jest.Mocked<ModelOrchestrator>;

 beforeEach(() => {
 mockGitService = new GitService('/test') as jest.Mocked<GitService>;
 mockOrchestrator = new ModelOrchestrator({} as any, {} as any, {} as any, {} as any) as jest.Mocked<ModelOrchestrator>;
 generator = new CommitMessageGenerator(mockGitService, mockOrchestrator);
 });

 describe('generateCommitMessage', () => {
 it('should generate commit message for staged changes', async () => {
 // Mock Git status
 mockGitService.getStatus.mockResolvedValue({
 branch: 'main',
 ahead: 0,
 behind: 0,
 staged: [
 { path: 'src/feature.ts', status: GitFileStatus.ADDED }
 ],
 unstaged: [],
 untracked: [],
 hasChanges: true
 });

 // Mock Git diff
 mockGitService.getStagedDiff.mockResolvedValue([
 { file: 'src/feature.ts', additions: 50, deletions: 0, changes: [] }
 ]);

 // Mock AI response
 mockOrchestrator.sendRequest.mockResolvedValue({
 content: 'SUBJECT: feat: add new feature\nBODY: Implemented new feature with comprehensive functionality\nFOOTER: ',
 model: 'test-model',
 usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
 cost: 0.001,
 latency: 100
 });

 const result = await generator.generateCommitMessage();

 expect(result.type).toBe(CommitType.FEAT);
 expect(result.subject).toContain('feat');
 expect(result.body).toBeDefined();
 expect(mockGitService.getStatus).toHaveBeenCalled();
 expect(mockGitService.getStagedDiff).toHaveBeenCalled();
 expect(mockOrchestrator.sendRequest).toHaveBeenCalled();
 });

 it('should throw error if no staged changes', async () => {
 mockGitService.getStatus.mockResolvedValue({
 branch: 'main',
 ahead: 0,
 behind: 0,
 staged: [],
 unstaged: [],
 untracked: [],
 hasChanges: false
 });

 await expect(generator.generateCommitMessage()).rejects.toThrow('No staged changes to commit');
 });

 it('should generate conventional commit format', async () => {
 mockGitService.getStatus.mockResolvedValue({
 branch: 'main',
 ahead: 0,
 behind: 0,
 staged: [
 { path: 'src/bugfix.ts', status: GitFileStatus.MODIFIED }
 ],
 unstaged: [],
 untracked: [],
 hasChanges: true
 });

 mockGitService.getStagedDiff.mockResolvedValue([
 { file: 'src/bugfix.ts', additions: 5, deletions: 3, changes: [] }
 ]);

 mockOrchestrator.sendRequest.mockResolvedValue({
 content: 'SUBJECT: fix(core): resolve memory leak\nBODY: Fixed memory leak in cache system\nFOOTER: ',
 model: 'test-model',
 usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
 cost: 0.001,
 latency: 100
 });

 const result = await generator.generateCommitMessage({ conventional: true });

 expect(result.subject).toMatch(/^fix\(core\):/);
 expect(result.type).toBe(CommitType.FIX);
 expect(result.scope).toBe('core');
 });

 it('should include body when requested', async () => {
 mockGitService.getStatus.mockResolvedValue({
 branch: 'main',
 ahead: 0,
 behind: 0,
 staged: [
 { path: 'src/feature.ts', status: GitFileStatus.ADDED }
 ],
 unstaged: [],
 untracked: [],
 hasChanges: true
 });

 mockGitService.getStagedDiff.mockResolvedValue([
 { file: 'src/feature.ts', additions: 100, deletions: 0, changes: [] }
 ]);

 mockOrchestrator.sendRequest.mockResolvedValue({
 content: 'SUBJECT: feat: add feature\nBODY: This feature adds comprehensive functionality for users\nFOOTER: ',
 model: 'test-model',
 usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
 cost: 0.001,
 latency: 100
 });

 const result = await generator.generateCommitMessage({ includeBody: true });

 expect(result.body).toBeDefined();
 expect(result.body).toContain('functionality');
 });
 });

 describe('generateSuggestions', () => {
 it('should generate multiple suggestions', async () => {
 mockGitService.getStatus.mockResolvedValue({
 branch: 'main',
 ahead: 0,
 behind: 0,
 staged: [
 { path: 'src/feature.ts', status: GitFileStatus.ADDED }
 ],
 unstaged: [],
 untracked: [],
 hasChanges: true
 });

 mockGitService.getStagedDiff.mockResolvedValue([
 { file: 'src/feature.ts', additions: 50, deletions: 0, changes: [] }
 ]);

 const mockResponse = {
 model: 'test-model',
 usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
 cost: 0.001,
 latency: 100
 };
 mockOrchestrator.sendRequest
 .mockResolvedValueOnce({ ...mockResponse, content: 'SUBJECT: feat: add new feature\nBODY: First suggestion\nFOOTER: ' })
 .mockResolvedValueOnce({ ...mockResponse, content: 'SUBJECT: feat: implement feature\nBODY: Second suggestion\nFOOTER: ' })
 .mockResolvedValueOnce({ ...mockResponse, content: 'SUBJECT: feat: create feature\nBODY: Third suggestion\nFOOTER: ' });

 const suggestions = await generator.generateSuggestions(3);

 expect(suggestions.length).toBe(3);
 expect(suggestions[0].subject).toContain('feat');
 expect(suggestions[1].subject).toContain('feat');
 expect(suggestions[2].subject).toContain('feat');
 });

 it('should handle errors gracefully', async () => {
 mockGitService.getStatus.mockResolvedValue({
 branch: 'main',
 ahead: 0,
 behind: 0,
 staged: [
 { path: 'src/feature.ts', status: GitFileStatus.ADDED }
 ],
 unstaged: [],
 untracked: [],
 hasChanges: true
 });

 mockGitService.getStagedDiff.mockResolvedValue([
 { file: 'src/feature.ts', additions: 50, deletions: 0, changes: [] }
 ]);

 const mockResponse = {
 model: 'test-model',
 usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
 cost: 0.001,
 latency: 100
 };
 mockOrchestrator.sendRequest
 .mockResolvedValueOnce({ ...mockResponse, content: 'SUBJECT: feat: add feature\nBODY: Success\nFOOTER: ' })
 .mockRejectedValueOnce(new Error('API error'))
 .mockResolvedValueOnce({ ...mockResponse, content: 'SUBJECT: feat: create feature\nBODY: Success\nFOOTER: ' });

 const suggestions = await generator.generateSuggestions(3);

 expect(suggestions.length).toBe(2); // Only successful ones
 });
 });

 describe('analyzeChanges', () => {
 it('should detect test commit type', () => {
 const analyzeChanges = (generator as any).analyzeChanges.bind(generator);

 const files = [
 { path: 'src/__tests__/feature.test.ts', status: GitFileStatus.ADDED }
 ];
 const diffs = [
 { file: 'src/__tests__/feature.test.ts', additions: 50, deletions: 0, changes: [] }
 ];

 const analysis = analyzeChanges(files, diffs);

 expect(analysis.type).toBe(CommitType.TEST);
 });

 it('should detect docs commit type', () => {
 const analyzeChanges = (generator as any).analyzeChanges.bind(generator);

 const files = [
 { path: 'README.md', status: GitFileStatus.MODIFIED }
 ];
 const diffs = [
 { file: 'README.md', additions: 10, deletions: 5, changes: [] }
 ];

 const analysis = analyzeChanges(files, diffs);

 expect(analysis.type).toBe(CommitType.DOCS);
 });

 it('should detect build commit type', () => {
 const analyzeChanges = (generator as any).analyzeChanges.bind(generator);

 const files = [
 { path: 'package.json', status: GitFileStatus.MODIFIED }
 ];
 const diffs = [
 { file: 'package.json', additions: 2, deletions: 1, changes: [] }
 ];

 const analysis = analyzeChanges(files, diffs);

 expect(analysis.type).toBe(CommitType.BUILD);
 });

 it('should detect refactor commit type', () => {
 const analyzeChanges = (generator as any).analyzeChanges.bind(generator);

 const files = [
 { path: 'src/feature.ts', status: GitFileStatus.MODIFIED }
 ];
 const diffs = [
 { file: 'src/feature.ts', additions: 10, deletions: 50, changes: [] }
 ];

 const analysis = analyzeChanges(files, diffs);

 expect(analysis.type).toBe(CommitType.REFACTOR);
 });

 it('should determine scope from single affected area', () => {
 const analyzeChanges = (generator as any).analyzeChanges.bind(generator);

 const files = [
 { path: 'core/feature.ts', status: GitFileStatus.ADDED },
 { path: 'core/utils.ts', status: GitFileStatus.MODIFIED }
 ];
 const diffs = [
 { file: 'core/feature.ts', additions: 50, deletions: 0, changes: [] },
 { file: 'core/utils.ts', additions: 10, deletions: 5, changes: [] }
 ];

 const analysis = analyzeChanges(files, diffs);

 expect(analysis.scope).toBe('core');
 });

 it('should not set scope for multiple affected areas', () => {
 const analyzeChanges = (generator as any).analyzeChanges.bind(generator);

 const files = [
 { path: 'core/feature.ts', status: GitFileStatus.ADDED },
 { path: 'ui/component.ts', status: GitFileStatus.MODIFIED }
 ];
 const diffs = [
 { file: 'core/feature.ts', additions: 50, deletions: 0, changes: [] },
 { file: 'ui/component.ts', additions: 10, deletions: 5, changes: [] }
 ];

 const analysis = analyzeChanges(files, diffs);

 expect(analysis.scope).toBeUndefined();
 });
 });

 describe('parseCommitMessage', () => {
 it('should parse conventional commit format', () => {
 const parseCommitMessage = (generator as any).parseCommitMessage.bind(generator);

 const response = 'SUBJECT: feat(core): add feature\nBODY: This is the body\nFOOTER: ';
 const result = parseCommitMessage(response, true);

 expect(result.type).toBe(CommitType.FEAT);
 expect(result.scope).toBe('core');
 expect(result.subject).toContain('feat(core): add feature');
 expect(result.body).toContain('This is the body');
 });

 it('should parse non-conventional format', () => {
 const parseCommitMessage = (generator as any).parseCommitMessage.bind(generator);

 const response = 'SUBJECT: Add new feature\nBODY: This is the body\nFOOTER: ';
 const result = parseCommitMessage(response, false);

 expect(result.subject).toBe('Add new feature');
 expect(result.body).toContain('This is the body');
 });

 it('should handle multiline sections', () => {
 const parseCommitMessage = (generator as any).parseCommitMessage.bind(generator);

 const response = 'SUBJECT: feat: add feature\nBODY: Line 1\nLine 2\nLine 3\nFOOTER: ';
 const result = parseCommitMessage(response, true);

 expect(result.body).toContain('Line 1');
 expect(result.body).toContain('Line 2');
 expect(result.body).toContain('Line 3');
 });
 });
});

