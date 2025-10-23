"use strict";
/**
 * Automatic Coverage Analyzer
 * Analyzes test coverage and detects gaps
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
exports.CoverageAnalyzer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const orchestrator_1 = require("../models/orchestrator");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CoverageAnalyzer');
class CoverageAnalyzer {
    constructor(executionEngine, orchestrator, workspaceRoot) {
        this.executionEngine = executionEngine;
        this.orchestrator = orchestrator;
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Analyze test coverage
    */
    async analyze(options = {}) {
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
    async runCoverage() {
        try {
            // Detect coverage tool
            const tool = this.detectCoverageTool();
            logger.info(`Using coverage tool: ${tool}`);
            let command;
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
        }
        catch (error) {
            logger.error('Failed to run coverage:', error);
            return null;
        }
    }
    /**
    * Detect coverage tool
    */
    detectCoverageTool() {
        const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            if (deps.vitest)
                return 'vitest';
            if (deps.jest || deps['@jest/globals'])
                return 'jest';
            if (deps.nyc)
                return 'nyc';
        }
        if (fs.existsSync(path.join(this.workspaceRoot, 'pytest.ini'))) {
            return 'pytest';
        }
        return 'jest';
    }
    /**
    * Find coverage file
    */
    findCoverageFile() {
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
    parseCoverageData(data) {
        const report = {
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
                if (filePath === 'total')
                    continue;
                const fd = fileData;
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
    extractUncoveredLines(fileData) {
        const uncovered = [];
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
    extractUncoveredBranches(fileData) {
        const branches = [];
        if (fileData.branchMap && fileData.b) {
            for (const [id, counts] of Object.entries(fileData.b)) {
                const branch = fileData.branchMap[id];
                if (branch && Array.isArray(counts)) {
                    branches.push({
                        line: branch.line,
                        type: branch.type,
                        covered: counts.map((c) => c > 0)
                    });
                }
            }
        }
        return branches;
    }
    /**
    * Extract uncovered functions
    */
    extractUncoveredFunctions(fileData) {
        const functions = [];
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
    async detectGaps(report, focusFiles) {
        const gaps = [];
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
    async generateRecommendations(report) {
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
            const response = await this.orchestrator.sendRequest({
                messages: [
                    { role: 'system', content: 'You are a test coverage expert. Provide actionable recommendations.' },
                    { role: 'user', content: prompt }
                ],
                maxTokens: 1000
            }, { complexity: orchestrator_1.TaskComplexity.SIMPLE });
            const jsonMatch = response.content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        }
        catch (error) {
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
    calculateScore(report, threshold) {
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
        return Math.round(lineScore * weights.lines +
            branchScore * weights.branches +
            functionScore * weights.functions +
            gapScore * weights.gaps);
    }
}
exports.CoverageAnalyzer = CoverageAnalyzer;
//# sourceMappingURL=coverageAnalyzer.js.map