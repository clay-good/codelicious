"use strict";
/**
 * Advanced Testing Orchestrator
 * Coordinates pattern-matching generation, coverage analysis, test fixing, and quality analysis
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdvancedTestingOrchestrator = void 0;
const patternMatchingTestGenerator_1 = require("./patternMatchingTestGenerator");
const coverageAnalyzer_1 = require("./coverageAnalyzer");
const testFixer_1 = require("./testFixer");
const testQualityAnalyzer_1 = require("./testQualityAnalyzer");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AdvancedTestingOrchestrator');
class AdvancedTestingOrchestrator {
    constructor(orchestrator, executionEngine, ragService, workspaceRoot) {
        this.orchestrator = orchestrator;
        this.executionEngine = executionEngine;
        this.ragService = ragService;
        this.workspaceRoot = workspaceRoot;
        this.patternGenerator = new patternMatchingTestGenerator_1.PatternMatchingTestGenerator(orchestrator, workspaceRoot);
        this.coverageAnalyzer = new coverageAnalyzer_1.CoverageAnalyzer(executionEngine, orchestrator, workspaceRoot);
        this.testFixer = new testFixer_1.TestFixer(executionEngine, orchestrator, workspaceRoot);
        this.qualityAnalyzer = new testQualityAnalyzer_1.TestQualityAnalyzer(orchestrator, workspaceRoot);
    }
    /**
    * Execute advanced testing workflow
    */
    async execute(options = {}) {
        const startTime = Date.now();
        const result = {
            phase: 'learning',
            success: false,
            duration: 0,
            errors: []
        };
        try {
            // Phase 1: Learn patterns from existing tests
            if (options.learnPatterns !== false) {
                logger.info('Phase 1: Learning test patterns...');
                result.phase = 'learning';
                await this.patternGenerator.learnPatterns();
                const patterns = this.patternGenerator.getLearnedPatterns();
                result.learning = {
                    patternsLearned: patterns.length,
                    frameworks: patterns.map(p => p.framework)
                };
                logger.info(`Learned ${patterns.length} patterns`);
            }
            // Phase 2: Generate tests
            if (options.generateTests && options.sourceFile && options.sourceCode) {
                logger.info('Phase 2: Generating tests...');
                result.phase = 'generation';
                const context = await this.ragService.queryWithArchitecture(`test generation for ${options.sourceFile}`, { maxTokens: 50000 });
                if (context) {
                    const tests = await this.patternGenerator.generateTests(options.sourceFile, options.sourceCode, context, options.testGenerationOptions);
                    result.generation = {
                        testsGenerated: tests.length,
                        files: tests.map(t => t.filePath),
                        estimatedCoverage: tests.length > 0
                            ? tests.reduce((sum, t) => sum + t.coverage.estimated, 0) / tests.length
                            : 0
                    };
                    logger.info(`Generated ${tests.length} test files`);
                }
            }
            // Phase 3: Analyze coverage
            if (options.analyzeCoverage !== false) {
                logger.info('Phase 3: Analyzing coverage...');
                result.phase = 'coverage';
                result.coverage = await this.coverageAnalyzer.analyze(options.coverageOptions);
                logger.info(`Coverage: ${result.coverage.overall.lines.percentage.toFixed(1)}%`);
            }
            // Phase 4: Fix failing tests
            if (options.fixFailingTests) {
                logger.info('Phase 4: Fixing failing tests...');
                result.phase = 'fixing';
                const context = await this.ragService.queryWithArchitecture('test fixing context', { maxTokens: 50000 });
                if (context) {
                    result.fixing = await this.testFixer.fixTests(context, options.fixOptions);
                    logger.info(`Fixed ${result.fixing.successful}/${result.fixing.applied} tests`);
                }
            }
            // Phase 5: Analyze quality
            if (options.analyzeQuality !== false) {
                logger.info('Phase 5: Analyzing test quality...');
                result.phase = 'quality';
                result.quality = await this.qualityAnalyzer.analyze(options.qualityOptions);
                logger.info(`Quality score: ${result.quality.overall.score}/100 (${result.quality.overall.grade})`);
            }
            result.phase = 'complete';
            result.success = true;
            result.duration = Date.now() - startTime;
            return result;
        }
        catch (error) {
            result.errors.push(error instanceof Error ? error.message : String(error));
            result.duration = Date.now() - startTime;
            return result;
        }
    }
    /**
    * Generate comprehensive test suite for file
    */
    async generateComprehensiveTests(sourceFile, sourceCode, options = {}) {
        logger.info(`Generating comprehensive tests for ${sourceFile}...`);
        // Learn patterns if not already done
        const patterns = this.patternGenerator.getLearnedPatterns();
        if (patterns.length === 0) {
            await this.patternGenerator.learnPatterns();
        }
        // Get architectural context
        const context = await this.ragService.queryWithArchitecture(`test generation for ${sourceFile}`, { maxTokens: 50000 });
        if (!context) {
            throw new Error('Failed to get architectural context');
        }
        // Generate tests
        return await this.patternGenerator.generateTests(sourceFile, sourceCode, context, options);
    }
    /**
    * Analyze and improve test suite
    */
    async analyzeAndImprove() {
        logger.info('Analyzing and improving test suite...');
        // Analyze coverage
        const coverage = await this.coverageAnalyzer.analyze({
            includeGapAnalysis: true,
            includeRecommendations: true
        });
        // Analyze quality
        const quality = await this.qualityAnalyzer.analyze({
            includeRecommendations: true,
            includeBestPractices: true
        });
        // Combine recommendations
        const improvements = [
            ...coverage.recommendations,
            ...quality.recommendations
        ];
        return { coverage, quality, improvements };
    }
    /**
    * Fix all failing tests
    */
    async fixAllFailingTests(options = {}) {
        logger.info('Fixing all failing tests...');
        const context = await this.ragService.queryWithArchitecture('test fixing context', { maxTokens: 50000 });
        if (!context) {
            throw new Error('Failed to get architectural context');
        }
        return await this.testFixer.fixTests(context, options);
    }
    /**
    * Get comprehensive test report
    */
    async getComprehensiveReport() {
        logger.info('Generating comprehensive test report...');
        const coverage = await this.coverageAnalyzer.analyze({
            includeGapAnalysis: true,
            includeRecommendations: true
        });
        const quality = await this.qualityAnalyzer.analyze({
            includeRecommendations: true,
            includeBestPractices: true
        });
        // Calculate overall health
        const overallHealth = Math.round((coverage.score + quality.overall.score) / 2);
        // Identify strengths
        const strengths = [];
        if (coverage.overall.lines.percentage >= 80) {
            strengths.push('Good line coverage');
        }
        if (quality.overall.score >= 80) {
            strengths.push('High test quality');
        }
        if (quality.bestPractices.filter(bp => bp.adopted).length >= 3) {
            strengths.push('Following best practices');
        }
        // Identify weaknesses
        const weaknesses = [];
        if (coverage.overall.lines.percentage < 70) {
            weaknesses.push('Low line coverage');
        }
        if (coverage.overall.branches.percentage < 70) {
            weaknesses.push('Low branch coverage');
        }
        if (quality.overall.score < 70) {
            weaknesses.push('Low test quality');
        }
        if (coverage.gaps.filter(g => g.priority === 'critical').length > 0) {
            weaknesses.push('Critical coverage gaps');
        }
        // Prioritize improvements
        const priorities = [];
        if (coverage.gaps.filter(g => g.priority === 'critical').length > 0) {
            priorities.push('Fix critical coverage gaps');
        }
        if (quality.issues.filter(i => i.severity === 'critical').length > 0) {
            priorities.push('Fix critical quality issues');
        }
        if (coverage.overall.lines.percentage < 80) {
            priorities.push('Increase line coverage to 80%');
        }
        if (quality.overall.score < 80) {
            priorities.push('Improve test quality to 80+');
        }
        return {
            coverage,
            quality,
            summary: {
                overallHealth,
                strengths,
                weaknesses,
                priorities
            }
        };
    }
    /**
    * Get pattern generator
    */
    getPatternGenerator() {
        return this.patternGenerator;
    }
    /**
    * Get coverage analyzer
    */
    getCoverageAnalyzer() {
        return this.coverageAnalyzer;
    }
    /**
    * Get test fixer
    */
    getTestFixer() {
        return this.testFixer;
    }
    /**
    * Get quality analyzer
    */
    getQualityAnalyzer() {
        return this.qualityAnalyzer;
    }
}
exports.AdvancedTestingOrchestrator = AdvancedTestingOrchestrator;
//# sourceMappingURL=advancedTestingOrchestrator.js.map