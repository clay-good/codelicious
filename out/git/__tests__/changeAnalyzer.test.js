"use strict";
/**
 * Tests for ChangeAnalyzer
 */
Object.defineProperty(exports, "__esModule", { value: true });
const changeAnalyzer_1 = require("../changeAnalyzer");
const gitService_1 = require("../gitService");
const orchestrator_1 = require("../../models/orchestrator");
// Mock dependencies
jest.mock('../gitService');
jest.mock('../../models/orchestrator');
describe('ChangeAnalyzer', () => {
    let analyzer;
    let mockGitService;
    let mockOrchestrator;
    beforeEach(() => {
        mockGitService = new gitService_1.GitService('/test');
        mockOrchestrator = new orchestrator_1.ModelOrchestrator({}, {}, {}, {});
        analyzer = new changeAnalyzer_1.ChangeAnalyzer(mockGitService, mockOrchestrator);
    });
    describe('analyzeStagedChanges', () => {
        it('should analyze staged changes successfully', async () => {
            mockGitService.getStatus.mockResolvedValue({
                branch: 'main',
                ahead: 0,
                behind: 0,
                staged: [
                    { path: 'src/feature.ts', status: gitService_1.GitFileStatus.MODIFIED }
                ],
                unstaged: [],
                untracked: [],
                hasChanges: true
            });
            mockGitService.getStagedDiff.mockResolvedValue([
                { file: 'src/feature.ts', additions: 10, deletions: 5, changes: [] }
            ]);
            mockOrchestrator.sendRequest.mockResolvedValue({
                content: 'Modified feature.ts with minor improvements',
                model: 'test-model',
                usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
                cost: 0.001,
                latency: 100
            });
            const analysis = await analyzer.analyzeStagedChanges();
            expect(analysis.impact).toBeDefined();
            expect(analysis.risk).toBeDefined();
            expect(analysis.metrics.filesChanged).toBe(1);
            expect(analysis.metrics.linesAdded).toBe(10);
            expect(analysis.metrics.linesDeleted).toBe(5);
            expect(analysis.summary).toBeDefined();
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
            await expect(analyzer.analyzeStagedChanges()).rejects.toThrow('No staged changes to analyze');
        });
    });
    describe('calculateMetrics', () => {
        it('should calculate metrics correctly', () => {
            const calculateMetrics = analyzer.calculateMetrics.bind(analyzer);
            const files = [
                { path: 'src/feature.ts', status: gitService_1.GitFileStatus.MODIFIED },
                { path: 'src/__tests__/feature.test.ts', status: gitService_1.GitFileStatus.ADDED }
            ];
            const diffs = [
                { file: 'src/feature.ts', additions: 50, deletions: 20, changes: [] },
                { file: 'src/__tests__/feature.test.ts', additions: 100, deletions: 0, changes: [] }
            ];
            const metrics = calculateMetrics(files, diffs);
            expect(metrics.filesChanged).toBe(2);
            expect(metrics.linesAdded).toBe(150);
            expect(metrics.linesDeleted).toBe(20);
            expect(metrics.linesModified).toBe(170);
            expect(metrics.testCoverage).toBe(true);
            expect(metrics.complexity).toBeGreaterThan(0);
        });
        it('should detect test coverage', () => {
            const calculateMetrics = analyzer.calculateMetrics.bind(analyzer);
            const files = [
                { path: 'src/__tests__/feature.test.ts', status: gitService_1.GitFileStatus.ADDED }
            ];
            const diffs = [
                { file: 'src/__tests__/feature.test.ts', additions: 50, deletions: 0, changes: [] }
            ];
            const metrics = calculateMetrics(files, diffs);
            expect(metrics.testCoverage).toBe(true);
        });
        it('should detect no test coverage', () => {
            const calculateMetrics = analyzer.calculateMetrics.bind(analyzer);
            const files = [
                { path: 'src/feature.ts', status: gitService_1.GitFileStatus.MODIFIED }
            ];
            const diffs = [
                { file: 'src/feature.ts', additions: 50, deletions: 0, changes: [] }
            ];
            const metrics = calculateMetrics(files, diffs);
            expect(metrics.testCoverage).toBe(false);
        });
    });
    describe('determineImpact', () => {
        it('should determine minimal impact', () => {
            const determineImpact = analyzer.determineImpact.bind(analyzer);
            const metrics = {
                filesChanged: 1,
                linesAdded: 5,
                linesDeleted: 2,
                linesModified: 7,
                complexity: 10,
                testCoverage: true,
                hasBreakingChanges: false
            };
            const impact = determineImpact(metrics, []);
            expect(impact).toBe(changeAnalyzer_1.ImpactLevel.MINIMAL);
        });
        it('should determine low impact', () => {
            const determineImpact = analyzer.determineImpact.bind(analyzer);
            const metrics = {
                filesChanged: 3,
                linesAdded: 30,
                linesDeleted: 10,
                linesModified: 40,
                complexity: 30,
                testCoverage: true,
                hasBreakingChanges: false
            };
            const impact = determineImpact(metrics, []);
            expect(impact).toBe(changeAnalyzer_1.ImpactLevel.LOW);
        });
        it('should determine high impact', () => {
            const determineImpact = analyzer.determineImpact.bind(analyzer);
            const metrics = {
                filesChanged: 15,
                linesAdded: 300,
                linesDeleted: 100,
                linesModified: 400,
                complexity: 70,
                testCoverage: false,
                hasBreakingChanges: true
            };
            const impact = determineImpact(metrics, []);
            expect(impact).toBe(changeAnalyzer_1.ImpactLevel.HIGH);
        });
    });
    describe('determineRisk', () => {
        it('should determine safe risk', () => {
            const determineRisk = analyzer.determineRisk.bind(analyzer);
            const metrics = {
                filesChanged: 1,
                linesAdded: 10,
                linesDeleted: 5,
                linesModified: 15,
                complexity: 10,
                testCoverage: true,
                hasBreakingChanges: false
            };
            const risk = determineRisk(metrics, []);
            expect(risk).toBe(changeAnalyzer_1.RiskLevel.SAFE);
        });
        it('should determine high risk for no tests', () => {
            const determineRisk = analyzer.determineRisk.bind(analyzer);
            const metrics = {
                filesChanged: 5,
                linesAdded: 100,
                linesDeleted: 50,
                linesModified: 150,
                complexity: 50,
                testCoverage: false,
                hasBreakingChanges: false
            };
            const risk = determineRisk(metrics, [{ path: 'src/core/engine.ts', status: gitService_1.GitFileStatus.MODIFIED }]);
            expect([changeAnalyzer_1.RiskLevel.MEDIUM, changeAnalyzer_1.RiskLevel.HIGH, changeAnalyzer_1.RiskLevel.CRITICAL]).toContain(risk);
        });
        it('should determine critical risk for breaking changes', () => {
            const determineRisk = analyzer.determineRisk.bind(analyzer);
            const metrics = {
                filesChanged: 10,
                linesAdded: 200,
                linesDeleted: 100,
                linesModified: 300,
                complexity: 80,
                testCoverage: false,
                hasBreakingChanges: true
            };
            const risk = determineRisk(metrics, [{ path: 'src/core/engine.ts', status: gitService_1.GitFileStatus.MODIFIED }]);
            expect([changeAnalyzer_1.RiskLevel.HIGH, changeAnalyzer_1.RiskLevel.CRITICAL]).toContain(risk);
        });
    });
    describe('detectBreakingChanges', () => {
        it('should detect deleted files as breaking', () => {
            const detectBreakingChanges = analyzer.detectBreakingChanges.bind(analyzer);
            const files = [
                { path: 'src/feature.ts', status: gitService_1.GitFileStatus.DELETED }
            ];
            const result = detectBreakingChanges(files, []);
            expect(result).toBe(true);
        });
        it('should detect API changes with significant deletions', () => {
            const detectBreakingChanges = analyzer.detectBreakingChanges.bind(analyzer);
            const files = [
                { path: 'src/api/interface.ts', status: gitService_1.GitFileStatus.MODIFIED }
            ];
            const diffs = [
                { file: 'src/api/interface.ts', additions: 10, deletions: 50, changes: [] }
            ];
            const result = detectBreakingChanges(files, diffs);
            expect(result).toBe(true);
        });
        it('should not detect breaking changes for normal modifications', () => {
            const detectBreakingChanges = analyzer.detectBreakingChanges.bind(analyzer);
            const files = [
                { path: 'src/feature.ts', status: gitService_1.GitFileStatus.MODIFIED }
            ];
            const diffs = [
                { file: 'src/feature.ts', additions: 50, deletions: 10, changes: [] }
            ];
            const result = detectBreakingChanges(files, diffs);
            expect(result).toBe(false);
        });
    });
    describe('generateSuggestions', () => {
        it('should suggest adding tests when missing', () => {
            const generateSuggestions = analyzer.generateSuggestions.bind(analyzer);
            const metrics = {
                filesChanged: 5,
                linesAdded: 100,
                linesDeleted: 50,
                linesModified: 150,
                complexity: 50,
                testCoverage: false,
                hasBreakingChanges: false
            };
            const suggestions = generateSuggestions(metrics, [], []);
            expect(suggestions).toContain('Consider adding tests for these changes');
        });
        it('should suggest breaking into smaller commits for high complexity', () => {
            const generateSuggestions = analyzer.generateSuggestions.bind(analyzer);
            const metrics = {
                filesChanged: 20,
                linesAdded: 500,
                linesDeleted: 200,
                linesModified: 700,
                complexity: 80,
                testCoverage: true,
                hasBreakingChanges: false
            };
            const suggestions = generateSuggestions(metrics, [], []);
            expect(suggestions).toContain('Consider breaking this into smaller commits');
        });
        it('should suggest documenting breaking changes', () => {
            const generateSuggestions = analyzer.generateSuggestions.bind(analyzer);
            const metrics = {
                filesChanged: 5,
                linesAdded: 100,
                linesDeleted: 50,
                linesModified: 150,
                complexity: 50,
                testCoverage: true,
                hasBreakingChanges: true
            };
            const suggestions = generateSuggestions(metrics, [], []);
            expect(suggestions).toContain('Document breaking changes in commit message');
        });
    });
    describe('generateWarnings', () => {
        it('should warn about high risk changes', () => {
            const generateWarnings = analyzer.generateWarnings.bind(analyzer);
            const metrics = {
                filesChanged: 10,
                linesAdded: 200,
                linesDeleted: 100,
                linesModified: 300,
                complexity: 80,
                testCoverage: false,
                hasBreakingChanges: true
            };
            const warnings = generateWarnings(metrics, [], changeAnalyzer_1.RiskLevel.HIGH);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings.some((w) => w.includes('High risk'))).toBe(true);
        });
        it('should warn about file deletions', () => {
            const generateWarnings = analyzer.generateWarnings.bind(analyzer);
            const metrics = {
                filesChanged: 2,
                linesAdded: 10,
                linesDeleted: 50,
                linesModified: 60,
                complexity: 30,
                testCoverage: true,
                hasBreakingChanges: false
            };
            const files = [
                { path: 'src/old-feature.ts', status: gitService_1.GitFileStatus.DELETED }
            ];
            const warnings = generateWarnings(metrics, files, changeAnalyzer_1.RiskLevel.LOW);
            expect(warnings).toContain('Files will be deleted');
        });
    });
});
//# sourceMappingURL=changeAnalyzer.test.js.map