"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prDescriptionGenerator_1 = require("../prDescriptionGenerator");
const gitService_1 = require("../gitService");
const orchestrator_1 = require("../../models/orchestrator");
// Mock dependencies
jest.mock('../gitService');
jest.mock('../../models/orchestrator');
describe('PRDescriptionGenerator', () => {
    let generator;
    let mockGitService;
    let mockModelOrchestrator;
    const mockCommits = [
        {
            hash: 'abc123',
            author: 'Test User',
            date: new Date('2024-01-01'),
            message: 'feat: Add new feature',
            files: ['src/feature.ts']
        },
        {
            hash: 'def456',
            author: 'Test User',
            date: new Date('2024-01-02'),
            message: 'test: Add tests for feature',
            files: ['src/__tests__/feature.test.ts']
        }
    ];
    const mockDiffs = [
        {
            file: 'src/feature.ts',
            additions: 100,
            deletions: 10,
            changes: []
        },
        {
            file: 'src/__tests__/feature.test.ts',
            additions: 50,
            deletions: 0,
            changes: []
        }
    ];
    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        // Create mocked instances
        mockGitService = new gitService_1.GitService('/test/repo');
        mockModelOrchestrator = new orchestrator_1.ModelOrchestrator({}, {}, {}, {});
        // Setup default mock implementations
        mockGitService.getCurrentBranch = jest.fn().mockResolvedValue('feature/test');
        mockGitService.execGit = jest.fn().mockResolvedValue('');
        mockGitService.parseLog = jest.fn().mockReturnValue(mockCommits);
        mockGitService.parseDiffNumstat = jest.fn().mockReturnValue(mockDiffs);
        mockModelOrchestrator.sendRequest = jest.fn().mockResolvedValue({
            content: `TITLE: Add new feature
SUMMARY: This PR adds a new feature with comprehensive tests
CHANGES:
- Implemented feature functionality
- Added unit tests
- Updated documentation
TESTING: Run npm test to verify changes
CHECKLIST:
- Tests pass
- Documentation updated`,
            model: 'test-model',
            usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
            cost: 0.001,
            latency: 100
        });
        generator = new prDescriptionGenerator_1.PRDescriptionGenerator(mockGitService, mockModelOrchestrator);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('generatePRDescription', () => {
        it('should generate PR description successfully', async () => {
            const result = await generator.generatePRDescription();
            expect(mockGitService.getCurrentBranch).toHaveBeenCalled();
            expect(mockModelOrchestrator.sendRequest).toHaveBeenCalled();
            expect(result.title).toBe('Add new feature');
            expect(result.summary).toContain('new feature');
            expect(result.changes).toHaveLength(3);
            expect(result.testingNotes).toBeTruthy();
            expect(result.checklist).toHaveLength(2);
        });
        it('should throw error when on base branch', async () => {
            mockGitService.getCurrentBranch.mockResolvedValue('main');
            await expect(generator.generatePRDescription()).rejects.toThrow('Cannot generate PR description for base branch: main');
        });
        it('should throw error when no commits found', async () => {
            mockGitService.parseLog.mockReturnValue([]);
            await expect(generator.generatePRDescription()).rejects.toThrow('No commits found between feature/test and main');
        });
        it('should use custom base branch', async () => {
            await generator.generatePRDescription({ baseBranch: 'develop' });
            const execGitCalls = mockGitService.execGit.mock.calls;
            expect(execGitCalls.some((call) => call[0].includes('develop..HEAD') || call[0].includes('develop...HEAD'))).toBe(true);
        });
        it('should respect includeChecklist option', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: `TITLE: Test
SUMMARY: Test summary
CHANGES:
- Change 1`,
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription({ includeChecklist: false });
            expect(result.checklist).toBeUndefined();
        });
        it('should handle breaking changes', async () => {
            const breakingCommits = [
                {
                    hash: 'abc123',
                    author: 'Test User',
                    date: new Date('2024-01-01'),
                    message: 'feat: BREAKING CHANGE: Update API',
                    files: ['src/api.ts']
                }
            ];
            mockGitService.parseLog.mockReturnValue(breakingCommits);
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: `TITLE: Update API
SUMMARY: Breaking API changes
CHANGES:
- Updated API endpoints
BREAKING:
- Changed endpoint structure
- Removed deprecated methods`,
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription({ includeBreakingChanges: true });
            expect(result.breakingChanges).toBeDefined();
            expect(result.breakingChanges).toHaveLength(2);
            expect(result.full).toContain('Breaking Changes');
        });
        it('should use specified template', async () => {
            await generator.generatePRDescription({ template: prDescriptionGenerator_1.PRTemplate.BUGFIX });
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('bugfix');
        });
        it('should handle feature template', async () => {
            const featureCommits = [
                {
                    hash: 'abc123',
                    author: 'Test User',
                    date: new Date('2024-01-01'),
                    message: 'feat: Add new feature',
                    files: ['src/feature.ts']
                }
            ];
            mockGitService.parseLog.mockReturnValue(featureCommits);
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('feature');
        });
        it('should handle bugfix template', async () => {
            const bugfixCommits = [
                {
                    hash: 'abc123',
                    author: 'Test User',
                    date: new Date('2024-01-01'),
                    message: 'fix: Fix critical bug',
                    files: ['src/buggy.ts']
                }
            ];
            mockGitService.parseLog.mockReturnValue(bugfixCommits);
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toMatch(/bugfix|fix/i);
        });
        it('should handle hotfix template', async () => {
            const hotfixCommits = [
                {
                    hash: 'abc123',
                    author: 'Test User',
                    date: new Date('2024-01-01'),
                    message: 'hotfix: Fix production issue',
                    files: ['src/critical.ts']
                }
            ];
            mockGitService.parseLog.mockReturnValue(hotfixCommits);
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('hotfix');
        });
        it('should handle refactor template', async () => {
            const refactorCommits = [
                {
                    hash: 'abc123',
                    author: 'Test User',
                    date: new Date('2024-01-01'),
                    message: 'refactor: Improve code structure',
                    files: ['src/refactored.ts']
                }
            ];
            mockGitService.parseLog.mockReturnValue(refactorCommits);
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('refactor');
        });
        it('should handle docs template', async () => {
            const docsCommits = [
                {
                    hash: 'abc123',
                    author: 'Test User',
                    date: new Date('2024-01-01'),
                    message: 'docs: Update documentation',
                    files: ['README.md']
                }
            ];
            mockGitService.parseLog.mockReturnValue(docsCommits);
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('docs');
        });
    });
    describe('analyzeChanges', () => {
        it('should detect tests in changes', async () => {
            const diffsWithTests = [
                { file: 'src/feature.ts', additions: 100, deletions: 10, changes: [] },
                { file: 'src/__tests__/feature.test.ts', additions: 50, deletions: 0, changes: [] }
            ];
            mockGitService.parseDiffNumstat.mockReturnValue(diffsWithTests);
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('Has tests: true');
        });
        it('should detect docs in changes', async () => {
            const diffsWithDocs = [
                { file: 'src/feature.ts', additions: 100, deletions: 10, changes: [] },
                { file: 'docs/README.md', additions: 20, deletions: 5, changes: [] }
            ];
            mockGitService.parseDiffNumstat.mockReturnValue(diffsWithDocs);
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('Has docs: true');
        });
        it('should calculate total additions and deletions', async () => {
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('Additions: 150');
            expect(requestCall.messages[0].content).toContain('Deletions: 10');
        });
        it('should identify affected areas', async () => {
            const diffsMultipleAreas = [
                { file: 'src/feature.ts', additions: 100, deletions: 10, changes: [] },
                { file: 'tests/feature.test.ts', additions: 50, deletions: 0, changes: [] },
                { file: 'docs/README.md', additions: 20, deletions: 5, changes: [] }
            ];
            mockGitService.parseDiffNumstat.mockReturnValue(diffsMultipleAreas);
            await generator.generatePRDescription();
            const requestCall = mockModelOrchestrator.sendRequest.mock.calls[0][0];
            expect(requestCall.messages[0].content).toContain('Affected areas:');
            expect(requestCall.messages[0].content).toContain('src');
            expect(requestCall.messages[0].content).toContain('tests');
            expect(requestCall.messages[0].content).toContain('docs');
        });
    });
    describe('parsePRDescription', () => {
        it('should parse title correctly', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: 'TITLE: Test Title\nSUMMARY: Test summary',
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.title).toBe('Test Title');
        });
        it('should parse multi-line title', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: 'TITLE: Test Title\nContinued on next line\nSUMMARY: Test summary',
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.title).toContain('Test Title');
            expect(result.title).toContain('Continued on next line');
        });
        it('should parse summary correctly', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: 'TITLE: Test\nSUMMARY: This is a test summary',
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.summary).toBe('This is a test summary');
        });
        it('should parse changes list', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: `TITLE: Test
SUMMARY: Test summary
CHANGES:
- Change 1
- Change 2
- Change 3`,
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.changes).toHaveLength(3);
            expect(result.changes[0]).toBe('Change 1');
            expect(result.changes[1]).toBe('Change 2');
            expect(result.changes[2]).toBe('Change 3');
        });
        it('should parse changes with asterisks', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: `TITLE: Test
SUMMARY: Test summary
CHANGES:
* Change 1
* Change 2`,
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.changes).toHaveLength(2);
            expect(result.changes[0]).toBe('Change 1');
        });
        it('should parse breaking changes', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: `TITLE: Test
SUMMARY: Test summary
CHANGES:
- Change 1
BREAKING:
- Breaking change 1
- Breaking change 2`,
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.breakingChanges).toBeDefined();
            expect(result.breakingChanges).toHaveLength(2);
            expect(result.breakingChanges[0]).toBe('Breaking change 1');
        });
        it('should parse testing notes', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: `TITLE: Test
SUMMARY: Test summary
CHANGES:
- Change 1
TESTING: Run npm test and verify all tests pass`,
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.testingNotes).toBe('Run npm test and verify all tests pass');
        });
        it('should parse checklist', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: `TITLE: Test
SUMMARY: Test summary
CHANGES:
- Change 1
CHECKLIST:
- Item 1
- Item 2
- Item 3`,
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.checklist).toBeDefined();
            expect(result.checklist).toHaveLength(3);
            expect(result.checklist[0]).toBe('Item 1');
        });
        it('should build full description with all sections', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: `TITLE: Test PR
SUMMARY: This is a test PR
CHANGES:
- Change 1
- Change 2
BREAKING:
- Breaking change
TESTING: Test instructions
CHECKLIST:
- Checklist item`,
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.full).toContain('## Test PR');
            expect(result.full).toContain('This is a test PR');
            expect(result.full).toContain('### Changes');
            expect(result.full).toContain('### Breaking Changes');
            expect(result.full).toContain('### Testing');
            expect(result.full).toContain('### Checklist');
            expect(result.full).toContain('- [ ] Checklist item');
        });
        it('should handle empty sections gracefully', async () => {
            mockModelOrchestrator.sendRequest.mockResolvedValue({
                content: 'TITLE: Test\nSUMMARY: Test summary',
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const result = await generator.generatePRDescription();
            expect(result.changes).toHaveLength(0);
            expect(result.breakingChanges).toBeUndefined();
            expect(result.testingNotes).toBeUndefined();
            expect(result.checklist).toBeUndefined();
        });
    });
    describe('error handling', () => {
        it('should handle git service errors gracefully', async () => {
            mockGitService.execGit.mockRejectedValue(new Error('Git error'));
            await expect(generator.generatePRDescription()).rejects.toThrow();
        });
        it('should handle model orchestrator errors', async () => {
            mockModelOrchestrator.sendRequest.mockRejectedValue(new Error('Model error'));
            await expect(generator.generatePRDescription()).rejects.toThrow('Model error');
        });
        it('should handle empty commit list', async () => {
            mockGitService.parseLog.mockReturnValue([]);
            await expect(generator.generatePRDescription()).rejects.toThrow('No commits found');
        });
    });
});
//# sourceMappingURL=prDescriptionGenerator.test.js.map