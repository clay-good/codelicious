/**
 * Advanced Testing Orchestrator
 * Coordinates pattern-matching generation, coverage analysis, test fixing, and quality analysis
 */

import * as vscode from 'vscode';
import { ModelOrchestrator } from '../models/orchestrator';
import { ExecutionEngine } from '../core/executionEngine';
import { RAGService } from '../rag/ragService';
import { PatternMatchingTestGenerator, GeneratedTest, TestGenerationOptions } from './patternMatchingTestGenerator';
import { CoverageAnalyzer, CoverageReport, CoverageAnalysisOptions } from './coverageAnalyzer';
import { TestFixer, TestFixResult, TestFixOptions } from './testFixer';
import { TestQualityAnalyzer, TestQualityReport, TestQualityOptions } from './testQualityAnalyzer';
import { createLogger } from '../utils/logger';

const logger = createLogger('AdvancedTestingOrchestrator');

export interface AdvancedTestingResult {
 phase: 'learning' | 'generation' | 'coverage' | 'fixing' | 'quality' | 'complete';
 success: boolean;
 learning?: {
 patternsLearned: number;
 frameworks: string[];
 };
 generation?: {
 testsGenerated: number;
 files: string[];
 estimatedCoverage: number;
 };
 coverage?: CoverageReport;
 fixing?: TestFixResult;
 quality?: TestQualityReport;
 duration: number;
 errors: string[];
}

export interface AdvancedTestingOptions {
 sourceFile?: string;
 sourceCode?: string;
 learnPatterns?: boolean;
 generateTests?: boolean;
 analyzeCoverage?: boolean;
 fixFailingTests?: boolean;
 analyzeQuality?: boolean;
 testGenerationOptions?: TestGenerationOptions;
 coverageOptions?: CoverageAnalysisOptions;
 fixOptions?: TestFixOptions;
 qualityOptions?: TestQualityOptions;
}

export class AdvancedTestingOrchestrator {
 private patternGenerator: PatternMatchingTestGenerator;
 private coverageAnalyzer: CoverageAnalyzer;
 private testFixer: TestFixer;
 private qualityAnalyzer: TestQualityAnalyzer;

 constructor(
 private orchestrator: ModelOrchestrator,
 private executionEngine: ExecutionEngine,
 private ragService: RAGService,
 private workspaceRoot: string
 ) {
 this.patternGenerator = new PatternMatchingTestGenerator(orchestrator, workspaceRoot);
 this.coverageAnalyzer = new CoverageAnalyzer(executionEngine, orchestrator, workspaceRoot);
 this.testFixer = new TestFixer(executionEngine, orchestrator, workspaceRoot);
 this.qualityAnalyzer = new TestQualityAnalyzer(orchestrator, workspaceRoot);
 }

 /**
 * Execute advanced testing workflow
 */
 async execute(options: AdvancedTestingOptions = {}): Promise<AdvancedTestingResult> {
 const startTime = Date.now();
 const result: AdvancedTestingResult = {
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

 const context = await this.ragService.queryWithArchitecture(
 `test generation for ${options.sourceFile}`,
 { maxTokens: 50000 }
 );

 if (context) {
 const tests = await this.patternGenerator.generateTests(
 options.sourceFile,
 options.sourceCode,
 context,
 options.testGenerationOptions
 );

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

 const context = await this.ragService.queryWithArchitecture(
 'test fixing context',
 { maxTokens: 50000 }
 );

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
 } catch (error) {
 result.errors.push(error instanceof Error ? error.message : String(error));
 result.duration = Date.now() - startTime;
 return result;
 }
 }

 /**
 * Generate comprehensive test suite for file
 */
 async generateComprehensiveTests(
 sourceFile: string,
 sourceCode: string,
 options: TestGenerationOptions = {}
 ): Promise<GeneratedTest[]> {
 logger.info(`Generating comprehensive tests for ${sourceFile}...`);

 // Learn patterns if not already done
 const patterns = this.patternGenerator.getLearnedPatterns();
 if (patterns.length === 0) {
 await this.patternGenerator.learnPatterns();
 }

 // Get architectural context
 const context = await this.ragService.queryWithArchitecture(
 `test generation for ${sourceFile}`,
 { maxTokens: 50000 }
 );

 if (!context) {
 throw new Error('Failed to get architectural context');
 }

 // Generate tests
 return await this.patternGenerator.generateTests(
 sourceFile,
 sourceCode,
 context,
 options
 );
 }

 /**
 * Analyze and improve test suite
 */
 async analyzeAndImprove(): Promise<{
 coverage: CoverageReport;
 quality: TestQualityReport;
 improvements: string[];
 }> {
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
 async fixAllFailingTests(options: TestFixOptions = {}): Promise<TestFixResult> {
 logger.info('Fixing all failing tests...');

 const context = await this.ragService.queryWithArchitecture(
 'test fixing context',
 { maxTokens: 50000 }
 );

 if (!context) {
 throw new Error('Failed to get architectural context');
 }

 return await this.testFixer.fixTests(context, options);
 }

 /**
 * Get comprehensive test report
 */
 async getComprehensiveReport(): Promise<{
 coverage: CoverageReport;
 quality: TestQualityReport;
 summary: {
 overallHealth: number;
 strengths: string[];
 weaknesses: string[];
 priorities: string[];
 };
 }> {
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
 const strengths: string[] = [];
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
 const weaknesses: string[] = [];
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
 const priorities: string[] = [];
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
 getPatternGenerator(): PatternMatchingTestGenerator {
 return this.patternGenerator;
 }

 /**
 * Get coverage analyzer
 */
 getCoverageAnalyzer(): CoverageAnalyzer {
 return this.coverageAnalyzer;
 }

 /**
 * Get test fixer
 */
 getTestFixer(): TestFixer {
 return this.testFixer;
 }

 /**
 * Get quality analyzer
 */
 getQualityAnalyzer(): TestQualityAnalyzer {
 return this.qualityAnalyzer;
 }
}

