"use strict";
/**
 * Tests for CommitMessageGenerator
 */
Object.defineProperty(exports, "__esModule", { value: true });
const commitMessageGenerator_1 = require("../commitMessageGenerator");
const gitService_1 = require("../gitService");
const orchestrator_1 = require("../../models/orchestrator");
// Mock dependencies
jest.mock('../gitService');
jest.mock('../../models/orchestrator');
describe('CommitMessageGenerator', () => {
    let generator;
    let mockGitService;
    let mockOrchestrator;
    beforeEach(() => {
        mockGitService = new gitService_1.GitService('/test');
        mockOrchestrator = new orchestrator_1.ModelOrchestrator({}, {}, {}, {});
        generator = new commitMessageGenerator_1.CommitMessageGenerator(mockGitService, mockOrchestrator);
    });
    describe('generateCommitMessage', () => {
        it('should generate commit message for staged changes', async () => {
            // Mock Git status
            mockGitService.getStatus.mockResolvedValue({
                branch: 'main',
                ahead: 0,
                behind: 0,
                staged: [
                    { path: 'src/feature.ts', status: gitService_1.GitFileStatus.ADDED }
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
            expect(result.type).toBe(commitMessageGenerator_1.CommitType.FEAT);
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
                    { path: 'src/bugfix.ts', status: gitService_1.GitFileStatus.MODIFIED }
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
            expect(result.type).toBe(commitMessageGenerator_1.CommitType.FIX);
            expect(result.scope).toBe('core');
        });
        it('should include body when requested', async () => {
            mockGitService.getStatus.mockResolvedValue({
                branch: 'main',
                ahead: 0,
                behind: 0,
                staged: [
                    { path: 'src/feature.ts', status: gitService_1.GitFileStatus.ADDED }
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
                    { path: 'src/feature.ts', status: gitService_1.GitFileStatus.ADDED }
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
                    { path: 'src/feature.ts', status: gitService_1.GitFileStatus.ADDED }
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
            const analyzeChanges = generator.analyzeChanges.bind(generator);
            const files = [
                { path: 'src/__tests__/feature.test.ts', status: gitService_1.GitFileStatus.ADDED }
            ];
            const diffs = [
                { file: 'src/__tests__/feature.test.ts', additions: 50, deletions: 0, changes: [] }
            ];
            const analysis = analyzeChanges(files, diffs);
            expect(analysis.type).toBe(commitMessageGenerator_1.CommitType.TEST);
        });
        it('should detect docs commit type', () => {
            const analyzeChanges = generator.analyzeChanges.bind(generator);
            const files = [
                { path: 'README.md', status: gitService_1.GitFileStatus.MODIFIED }
            ];
            const diffs = [
                { file: 'README.md', additions: 10, deletions: 5, changes: [] }
            ];
            const analysis = analyzeChanges(files, diffs);
            expect(analysis.type).toBe(commitMessageGenerator_1.CommitType.DOCS);
        });
        it('should detect build commit type', () => {
            const analyzeChanges = generator.analyzeChanges.bind(generator);
            const files = [
                { path: 'package.json', status: gitService_1.GitFileStatus.MODIFIED }
            ];
            const diffs = [
                { file: 'package.json', additions: 2, deletions: 1, changes: [] }
            ];
            const analysis = analyzeChanges(files, diffs);
            expect(analysis.type).toBe(commitMessageGenerator_1.CommitType.BUILD);
        });
        it('should detect refactor commit type', () => {
            const analyzeChanges = generator.analyzeChanges.bind(generator);
            const files = [
                { path: 'src/feature.ts', status: gitService_1.GitFileStatus.MODIFIED }
            ];
            const diffs = [
                { file: 'src/feature.ts', additions: 10, deletions: 50, changes: [] }
            ];
            const analysis = analyzeChanges(files, diffs);
            expect(analysis.type).toBe(commitMessageGenerator_1.CommitType.REFACTOR);
        });
        it('should determine scope from single affected area', () => {
            const analyzeChanges = generator.analyzeChanges.bind(generator);
            const files = [
                { path: 'core/feature.ts', status: gitService_1.GitFileStatus.ADDED },
                { path: 'core/utils.ts', status: gitService_1.GitFileStatus.MODIFIED }
            ];
            const diffs = [
                { file: 'core/feature.ts', additions: 50, deletions: 0, changes: [] },
                { file: 'core/utils.ts', additions: 10, deletions: 5, changes: [] }
            ];
            const analysis = analyzeChanges(files, diffs);
            expect(analysis.scope).toBe('core');
        });
        it('should not set scope for multiple affected areas', () => {
            const analyzeChanges = generator.analyzeChanges.bind(generator);
            const files = [
                { path: 'core/feature.ts', status: gitService_1.GitFileStatus.ADDED },
                { path: 'ui/component.ts', status: gitService_1.GitFileStatus.MODIFIED }
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
            const parseCommitMessage = generator.parseCommitMessage.bind(generator);
            const response = 'SUBJECT: feat(core): add feature\nBODY: This is the body\nFOOTER: ';
            const result = parseCommitMessage(response, true);
            expect(result.type).toBe(commitMessageGenerator_1.CommitType.FEAT);
            expect(result.scope).toBe('core');
            expect(result.subject).toContain('feat(core): add feature');
            expect(result.body).toContain('This is the body');
        });
        it('should parse non-conventional format', () => {
            const parseCommitMessage = generator.parseCommitMessage.bind(generator);
            const response = 'SUBJECT: Add new feature\nBODY: This is the body\nFOOTER: ';
            const result = parseCommitMessage(response, false);
            expect(result.subject).toBe('Add new feature');
            expect(result.body).toContain('This is the body');
        });
        it('should handle multiline sections', () => {
            const parseCommitMessage = generator.parseCommitMessage.bind(generator);
            const response = 'SUBJECT: feat: add feature\nBODY: Line 1\nLine 2\nLine 3\nFOOTER: ';
            const result = parseCommitMessage(response, true);
            expect(result.body).toContain('Line 1');
            expect(result.body).toContain('Line 2');
            expect(result.body).toContain('Line 3');
        });
    });
});
//# sourceMappingURL=commitMessageGenerator.test.js.map