/**
 * Automatic Coverage Analyzer
 * Analyzes test coverage and detects gaps
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExecutionEngine } from '../core/executionEngine';
import { ModelOrchestrator, TaskComplexity } from '../models/orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('CoverageAnalyzer');

export interface CoverageReport {
 overall: {
 lines: { total: number; covered: number; percentage: number };
 branches: { total: number; covered: number; percentage: number };
 functions: { total: number; covered: number; percentage: number };
 statements: { total: number; covered: number; percentage: number };
 };
 files: FileCoverage[];
 gaps: CoverageGap[];
 recommendations: string[];
 score: number;
}

export interface FileCoverage {
 path: string;
 lines: { total: number; covered: number; percentage: number };
 branches: { total: number; covered: number; percentage: number };
 functions: { total: number; covered: number; percentage: number };
 uncoveredLines: number[];
 uncoveredBranches: BranchInfo[];
 uncoveredFunctions: FunctionInfo[];
}

export interface BranchInfo {
 line: number;
 type: 'if' | 'switch' | 'ternary' | 'logical';
 covered: boolean[];
}

export interface FunctionInfo {
 name: string;
 line: number;
 covered: boolean;
}

export interface CoverageGap {
 file: string;
 type: 'line' | 'branch' | 'function';
 location: { line: number; column?: number };
 description: string;
 priority: 'critical' | 'high' | 'medium' | 'low';
 suggestion: string;
}

export interface CoverageAnalysisOptions {
 threshold?: number;
 includeGapAnalysis?: boolean;
 includeRecommendations?: boolean;
 focusFiles?: string[];
}

export class CoverageAnalyzer {
 constructor(
 private executionEngine: ExecutionEngine,
 private orchestrator: ModelOrchestrator,
 private workspaceRoot: string
 ) {}

 /**
 * Analyze test coverage
 */
 async analyze(options: CoverageAnalysisOptions = {}): Promise<CoverageReport> {
 logger.info('Analyzing test coverage...');

 // Run coverage
 const coverageData = await this.runCoverage();
 if (!coverageData) {
 throw new Error('Failed to run coverage');
 }

 // Parse coverage data
 const report = this.parseCoverageData(coverageData);

 // Detect gaps
 if (options.includeGapAnalysis !== false) {
 report.gaps = await this.detectGaps(report, options.focusFiles);
 }

 // Generate recommendations
 if (options.includeRecommendations !== false) {
 report.recommendations = await this.generateRecommendations(report);
 }

 // Calculate score
 report.score = this.calculateScore(report, options.threshold || 80);

 logger.info(`Coverage analysis complete: ${report.overall.lines.percentage.toFixed(1)}%`);
 return report;
 }

 /**
 * Run coverage tool
 */
 private async runCoverage(): Promise<any> {
 try {
 // Detect coverage tool
 const tool = this.detectCoverageTool();
 logger.info(`Using coverage tool: ${tool}`);

 let command: string;
 switch (tool) {
 case 'jest':
 command = 'npm test -- --coverage --coverageReporters=json';
 break;
 case 'vitest':
 command = 'npm test -- --coverage --coverage.reporter=json';
 break;
 case 'nyc':
 command = 'nyc --reporter=json npm test';
 break;
 case 'pytest':
 command = 'pytest --cov --cov-report=json';
 break;
 default:
 command = 'npm test -- --coverage --coverageReporters=json';
 }

 const result = await this.executionEngine.execute(command, {
 workingDirectory: this.workspaceRoot,
 timeout: 120000,
 requireConfirmation: false
 });

 if (!result.success) {
 logger.error('Coverage command failed:', result.stderr);
 return null;
 }

 // Read coverage file
 const coverageFile = this.findCoverageFile();
 if (!coverageFile) {
 logger.error('Coverage file not found');
 return null;
 }

 return JSON.parse(fs.readFileSync(coverageFile, 'utf-8'));
 } catch (error) {
 logger.error('Failed to run coverage:', error);
 return null;
 }
 }

 /**
 * Detect coverage tool
 */
 private detectCoverageTool(): string {
 const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
 if (fs.existsSync(packageJsonPath)) {
 const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
 const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

 if (deps.vitest) return 'vitest';
 if (deps.jest || deps['@jest/globals']) return 'jest';
 if (deps.nyc) return 'nyc';
 }

 if (fs.existsSync(path.join(this.workspaceRoot, 'pytest.ini'))) {
 return 'pytest';
 }

 return 'jest';
 }

 /**
 * Find coverage file
 */
 private findCoverageFile(): string | null {
 const possiblePaths = [
 path.join(this.workspaceRoot, 'coverage', 'coverage-final.json'),
 path.join(this.workspaceRoot, 'coverage', 'coverage.json'),
 path.join(this.workspaceRoot, '.coverage', 'coverage.json'),
 path.join(this.workspaceRoot, 'coverage.json')
 ];

 for (const p of possiblePaths) {
 if (fs.existsSync(p)) {
 return p;
 }
 }

 return null;
 }

 /**
 * Parse coverage data
 */
 private parseCoverageData(data: any): CoverageReport { // Coverage data structure from jest/istanbul
 const report: CoverageReport = {
 overall: {
 lines: { total: 0, covered: 0, percentage: 0 },
 branches: { total: 0, covered: 0, percentage: 0 },
 functions: { total: 0, covered: 0, percentage: 0 },
 statements: { total: 0, covered: 0, percentage: 0 }
 },
 files: [],
 gaps: [],
 recommendations: [],
 score: 0
 };

 // Parse Jest/Istanbul format
 if (data.total) {
 report.overall.lines = {
 total: data.total.lines.total,
 covered: data.total.lines.covered,
 percentage: data.total.lines.pct
 };
 report.overall.branches = {
 total: data.total.branches.total,
 covered: data.total.branches.covered,
 percentage: data.total.branches.pct
 };
 report.overall.functions = {
 total: data.total.functions.total,
 covered: data.total.functions.covered,
 percentage: data.total.functions.pct
 };
 report.overall.statements = {
 total: data.total.statements.total,
 covered: data.total.statements.covered,
 percentage: data.total.statements.pct
 };

 // Parse file coverage
 for (const [filePath, fileData] of Object.entries(data)) {
 if (filePath === 'total') continue;

 const fd = fileData as any;
 report.files.push({
 path: filePath,
 lines: {
 total: fd.lines?.total || 0,
 covered: fd.lines?.covered || 0,
 percentage: fd.lines?.pct || 0
 },
 branches: {
 total: fd.branches?.total || 0,
 covered: fd.branches?.covered || 0,
 percentage: fd.branches?.pct || 0
 },
 functions: {
 total: fd.functions?.total || 0,
 covered: fd.functions?.covered || 0,
 percentage: fd.functions?.pct || 0
 },
 uncoveredLines: this.extractUncoveredLines(fd),
 uncoveredBranches: this.extractUncoveredBranches(fd),
 uncoveredFunctions: this.extractUncoveredFunctions(fd)
 });
 }
 }

 return report;
 }

 /**
 * Extract uncovered lines
 */
 private extractUncoveredLines(fileData: any): number[] { // Coverage file data structure
 const uncovered: number[] = [];

 if (fileData.statementMap && fileData.s) {
 for (const [id, count] of Object.entries(fileData.s)) {
 if (count === 0) {
 const stmt = fileData.statementMap[id];
 if (stmt?.start?.line) {
 uncovered.push(stmt.start.line);
 }
 }
 }
 }

 return uncovered.sort((a, b) => a - b);
 }

 /**
 * Extract uncovered branches
 */
 private extractUncoveredBranches(fileData: any): BranchInfo[] { // Coverage file data structure
 const branches: BranchInfo[] = [];

 if (fileData.branchMap && fileData.b) {
 for (const [id, counts] of Object.entries(fileData.b)) {
 const branch = fileData.branchMap[id];
 if (branch && Array.isArray(counts)) {
 branches.push({
 line: branch.line,
 type: branch.type,
 covered: counts.map((c: number) => c > 0)
 });
 }
 }
 }

 return branches;
 }

 /**
 * Extract uncovered functions
 */
 private extractUncoveredFunctions(fileData: any): FunctionInfo[] { // Coverage file data structure
 const functions: FunctionInfo[] = [];

 if (fileData.fnMap && fileData.f) {
 for (const [id, count] of Object.entries(fileData.f)) {
 const fn = fileData.fnMap[id];
 if (fn && count === 0) {
 functions.push({
 name: fn.name,
 line: fn.line,
 covered: false
 });
 }
 }
 }

 return functions;
 }

 /**
 * Detect coverage gaps
 */
 private async detectGaps(report: CoverageReport, focusFiles?: string[]): Promise<CoverageGap[]> {
 const gaps: CoverageGap[] = [];

 for (const file of report.files) {
 if (focusFiles && !focusFiles.some(f => file.path.includes(f))) {
 continue;
 }

 // Uncovered functions (critical)
 for (const fn of file.uncoveredFunctions) {
 gaps.push({
 file: file.path,
 type: 'function',
 location: { line: fn.line },
 description: `Function '${fn.name}' is not covered by tests`,
 priority: 'critical',
 suggestion: `Add test case for function '${fn.name}'`
 });
 }

 // Uncovered branches (high)
 for (const branch of file.uncoveredBranches) {
 if (branch.covered.some(c => !c)) {
 gaps.push({
 file: file.path,
 type: 'branch',
 location: { line: branch.line },
 description: `${branch.type} branch not fully covered`,
 priority: 'high',
 suggestion: `Add test cases for all ${branch.type} branches`
 });
 }
 }

 // Low coverage files (medium)
 if (file.lines.percentage < 50) {
 gaps.push({
 file: file.path,
 type: 'line',
 location: { line: 1 },
 description: `File has low coverage: ${file.lines.percentage.toFixed(1)}%`,
 priority: 'medium',
 suggestion: 'Add comprehensive test suite for this file'
 });
 }
 }

 return gaps.sort((a, b) => {
 const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
 return priorityOrder[a.priority] - priorityOrder[b.priority];
 });
 }

 /**
 * Generate recommendations using AI
 */
 private async generateRecommendations(report: CoverageReport): Promise<string[]> {
 const prompt = `Analyze this test coverage report and provide recommendations:

Overall Coverage:
- Lines: ${report.overall.lines.percentage.toFixed(1)}%
- Branches: ${report.overall.branches.percentage.toFixed(1)}%
- Functions: ${report.overall.functions.percentage.toFixed(1)}%

Gaps Found: ${report.gaps.length}
- Critical: ${report.gaps.filter(g => g.priority === 'critical').length}
- High: ${report.gaps.filter(g => g.priority === 'high').length}
- Medium: ${report.gaps.filter(g => g.priority === 'medium').length}

Top gaps:
${report.gaps.slice(0, 5).map(g => `- ${g.description} (${g.priority})`).join('\n')}

Provide 5 actionable recommendations to improve coverage.
Return as JSON array of strings.`;

 try {
 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 { role: 'system', content: 'You are a test coverage expert. Provide actionable recommendations.' },
 { role: 'user', content: prompt }
 ],
 maxTokens: 1000
 },
 { complexity: TaskComplexity.SIMPLE }
 );

 const jsonMatch = response.content.match(/\[[\s\S]*\]/);
 if (jsonMatch) {
 return JSON.parse(jsonMatch[0]);
 }
 } catch (error) {
 logger.error('Failed to generate recommendations:', error);
 }

 return [
 'Increase overall coverage to at least 80%',
 'Focus on covering critical functions first',
 'Add tests for edge cases and error handling',
 'Improve branch coverage for conditional logic',
 'Add integration tests for complex workflows'
 ];
 }

 /**
 * Calculate coverage score
 */
 private calculateScore(report: CoverageReport, threshold: number): number {
 const weights = {
 lines: 0.3,
 branches: 0.3,
 functions: 0.3,
 gaps: 0.1
 };

 const lineScore = Math.min(report.overall.lines.percentage / threshold, 1) * 100;
 const branchScore = Math.min(report.overall.branches.percentage / threshold, 1) * 100;
 const functionScore = Math.min(report.overall.functions.percentage / threshold, 1) * 100;

 // Penalize for critical gaps
 const criticalGaps = report.gaps.filter(g => g.priority === 'critical').length;
 const gapPenalty = Math.min(criticalGaps * 5, 50);
 const gapScore = Math.max(100 - gapPenalty, 0);

 return Math.round(
 lineScore * weights.lines +
 branchScore * weights.branches +
 functionScore * weights.functions +
 gapScore * weights.gaps
 );
 }
}

