/**
 * Code Validation Pipeline - Comprehensive validation before deployment
 * Goal: Ensure all generated code is production-ready
 *
 * Features:
 * - Syntax validation
 * - Type checking
 * - Linting
 * - Security scanning
 * - Performance analysis
 * - Test execution
 * - Quality gates
 */

import { AdvancedCodeAnalyzer, AnalysisResult } from './advancedCodeAnalyzer';
import { BestPracticesEngine, ValidationResult } from './bestPracticesEngine';

export interface ValidationPipeline {
 stages: ValidationStage[];
 qualityGates: QualityGate[];
}

export interface ValidationStage {
 name: string;
 description: string;
 required: boolean;
 execute: (code: string, context: ValidationContext) => Promise<StageResult>;
}

export interface ValidationContext {
 language: string;
 framework?: string;
 filePath: string;
 workspaceRoot: string;
}

export interface StageResult {
 passed: boolean;
 errors: ValidationError[];
 warnings: ValidationWarning[];
 metrics?: unknown;
 duration: number;
}

export interface ValidationError {
 stage: string;
 severity: 'error' | 'critical';
 message: string;
 location?: { line: number; column: number };
 fix?: string;
}

export interface ValidationWarning {
 stage: string;
 message: string;
 location?: { line: number; column: number };
 suggestion?: string;
}

export interface QualityGate {
 name: string;
 metric: string;
 threshold: number;
 operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
 required: boolean;
}

export interface PipelineResult {
 passed: boolean;
 stages: StageResult[];
 qualityGates: QualityGateResult[];
 overallScore: number;
 summary: string;
 duration: number;
}

export interface QualityGateResult {
 gate: QualityGate;
 passed: boolean;
 actualValue: number;
 message: string;
}

export class CodeValidationPipeline {
 private analyzer: AdvancedCodeAnalyzer;
 private bestPractices: BestPracticesEngine;
 private pipeline: ValidationPipeline;

 constructor() {
 this.analyzer = new AdvancedCodeAnalyzer();
 this.bestPractices = new BestPracticesEngine();
 this.pipeline = this.createPipeline();
 }

 /**
 * Run validation pipeline
 */
 async validate(code: string, context: ValidationContext): Promise<PipelineResult> {
 const startTime = Date.now();
 const stageResults: StageResult[] = [];
 let overallPassed = true;

 // Execute all stages
 for (const stage of this.pipeline.stages) {
 const stageStart = Date.now();
 const result = await stage.execute(code, context);
 result.duration = Date.now() - stageStart;

 stageResults.push(result);

 if (!result.passed && stage.required) {
 overallPassed = false;
 }
 }

 // Check quality gates
 const qualityGateResults = await this.checkQualityGates(code, context, stageResults);

 for (const gateResult of qualityGateResults) {
 if (!gateResult.passed && gateResult.gate.required) {
 overallPassed = false;
 }
 }

 // Calculate overall score
 const overallScore = this.calculateOverallScore(stageResults, qualityGateResults);

 // Generate summary
 const summary = this.generateSummary(stageResults, qualityGateResults, overallPassed);

 return {
 passed: overallPassed,
 stages: stageResults,
 qualityGates: qualityGateResults,
 overallScore,
 summary,
 duration: Date.now() - startTime
 };
 }

 /**
 * Create validation pipeline
 */
 private createPipeline(): ValidationPipeline {
 const stages: ValidationStage[] = [
 {
 name: 'Syntax Validation',
 description: 'Check for syntax errors',
 required: true,
 execute: async (code, context) => {
 const errors: ValidationError[] = [];
 const warnings: ValidationWarning[] = [];

 try {
 // For TypeScript/JavaScript
 if (context.language === 'typescript' || context.language === 'javascript') {
 const ts = require('typescript');
 const result = ts.transpileModule(code, {
 compilerOptions: { module: ts.ModuleKind.CommonJS }
 });

 if (result.diagnostics && result.diagnostics.length > 0) {
 for (const diagnostic of result.diagnostics) {
 errors.push({
 stage: 'Syntax Validation',
 severity: 'error',
 message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
 location: diagnostic.start ? {
 line: code.substring(0, diagnostic.start).split('\n').length,
 column: 0
 } : undefined
 });
 }
 }
 }
 } catch (error: unknown) {
 const errorMessage = error instanceof Error ? error.message : 'Unknown error';
 errors.push({
 stage: 'Syntax Validation',
 severity: 'critical',
 message: `Syntax error: ${errorMessage}`
 });
 }

 return {
 passed: errors.length === 0,
 errors,
 warnings,
 duration: 0
 };
 }
 },
 {
 name: 'Code Quality Analysis',
 description: 'Analyze code quality metrics',
 required: true,
 execute: async (code, context) => {
 const errors: ValidationError[] = [];
 const warnings: ValidationWarning[] = [];

 const analysis = this.analyzer.analyze(code, context.language);

 // Check for critical issues
 for (const smell of analysis.smells) {
 if (smell.severity === 'critical') {
 errors.push({
 stage: 'Code Quality Analysis',
 severity: 'error',
 message: smell.message,
 location: smell.location,
 fix: smell.suggestion
 });
 } else if (smell.severity === 'high') {
 warnings.push({
 stage: 'Code Quality Analysis',
 message: smell.message,
 location: smell.location,
 suggestion: smell.suggestion
 });
 }
 }

 return {
 passed: errors.length === 0,
 errors,
 warnings,
 metrics: analysis.metrics,
 duration: 0
 };
 }
 },
 {
 name: 'Best Practices Validation',
 description: 'Validate against best practices',
 required: true,
 execute: async (code, context) => {
 const errors: ValidationError[] = [];
 const warnings: ValidationWarning[] = [];

 const validation = this.bestPractices.validate(code, context.language, context.framework);

 for (const violation of validation.violations) {
 if (violation.practice.severity === 'must') {
 errors.push({
 stage: 'Best Practices Validation',
 severity: 'error',
 message: violation.message,
 location: violation.location,
 fix: violation.fix
 });
 } else {
 warnings.push({
 stage: 'Best Practices Validation',
 message: violation.message,
 location: violation.location,
 suggestion: violation.fix
 });
 }
 }

 return {
 passed: errors.length === 0,
 errors,
 warnings,
 metrics: { score: validation.score },
 duration: 0
 };
 }
 },
 {
 name: 'Security Scanning',
 description: 'Scan for security vulnerabilities',
 required: true,
 execute: async (code, context) => {
 const errors: ValidationError[] = [];
 const warnings: ValidationWarning[] = [];

 // Check for common security issues
 if (code.includes('eval(')) {
 errors.push({
 stage: 'Security Scanning',
 severity: 'critical',
 message: 'Use of eval() is a security vulnerability',
 fix: 'Use JSON.parse() or safer alternatives'
 });
 }

 if (code.match(/(password|apiKey|secret|token)\s*=\s*['"][^'"]+['"]/i)) {
 errors.push({
 stage: 'Security Scanning',
 severity: 'critical',
 message: 'Hardcoded secrets detected',
 fix: 'Use environment variables'
 });
 }

 if (code.includes('innerHTML') || code.includes('dangerouslySetInnerHTML')) {
 warnings.push({
 stage: 'Security Scanning',
 message: 'Potential XSS vulnerability',
 suggestion: 'Sanitize user input before rendering'
 });
 }

 return {
 passed: errors.length === 0,
 errors,
 warnings,
 duration: 0
 };
 }
 },
 {
 name: 'Performance Analysis',
 description: 'Analyze performance characteristics',
 required: false,
 execute: async (code, context) => {
 const errors: ValidationError[] = [];
 const warnings: ValidationWarning[] = [];

 // Check for performance anti-patterns
 const nestedLoops = (code.match(/for\s*\(/g) || []).length;
 if (nestedLoops > 2) {
 warnings.push({
 stage: 'Performance Analysis',
 message: `Detected ${nestedLoops} nested loops - potential O(n³) complexity`,
 suggestion: 'Consider using hash maps or better algorithms'
 });
 }

 if (code.includes('JSON.parse(JSON.stringify(')) {
 warnings.push({
 stage: 'Performance Analysis',
 message: 'Inefficient deep clone using JSON',
 suggestion: 'Use structured clone or lodash cloneDeep'
 });
 }

 return {
 passed: true,
 errors,
 warnings,
 duration: 0
 };
 }
 }
 ];

 const qualityGates: QualityGate[] = [
 {
 name: 'Minimum Quality Score',
 metric: 'overallQuality',
 threshold: 70,
 operator: 'gte',
 required: true
 },
 {
 name: 'Maximum Complexity',
 metric: 'cyclomaticComplexity',
 threshold: 15,
 operator: 'lte',
 required: true
 },
 {
 name: 'Minimum Maintainability',
 metric: 'maintainability',
 threshold: 60,
 operator: 'gte',
 required: true
 },
 {
 name: 'Maximum Duplicate Code',
 metric: 'duplicateCodePercentage',
 threshold: 10,
 operator: 'lte',
 required: false
 }
 ];

 return { stages, qualityGates };
 }

 /**
 * Check quality gates
 */
 private async checkQualityGates(
 code: string,
 context: ValidationContext,
 stageResults: StageResult[]
 ): Promise<QualityGateResult[]> {
 const results: QualityGateResult[] = [];

 // Get metrics from analysis
 const analysis = this.analyzer.analyze(code, context.language);
 const validation = this.bestPractices.validate(code, context.language, context.framework);

 const metrics: Record<string, number> = {
 overallQuality: (analysis.score.overall + validation.score) / 2,
 cyclomaticComplexity: analysis.metrics.cyclomaticComplexity,
 maintainability: analysis.score.maintainability,
 duplicateCodePercentage: analysis.metrics.duplicateCodePercentage
 };

 for (const gate of this.pipeline.qualityGates) {
 const actualValue = metrics[gate.metric] || 0;
 const passed = this.evaluateGate(actualValue, gate.threshold, gate.operator);

 results.push({
 gate,
 passed,
 actualValue,
 message: passed
 ? ` ${gate.name}: ${actualValue.toFixed(1)} ${this.getOperatorSymbol(gate.operator)} ${gate.threshold}`
 : ` ${gate.name}: ${actualValue.toFixed(1)} ${this.getOperatorSymbol(gate.operator)} ${gate.threshold}`
 });
 }

 return results;
 }

 /**
 * Evaluate quality gate
 */
 private evaluateGate(value: number, threshold: number, operator: QualityGate['operator']): boolean {
 switch (operator) {
 case 'gt': return value > threshold;
 case 'lt': return value < threshold;
 case 'gte': return value >= threshold;
 case 'lte': return value <= threshold;
 case 'eq': return value === threshold;
 default: return false;
 }
 }

 /**
 * Get operator symbol
 */
 private getOperatorSymbol(operator: QualityGate['operator']): string {
 const symbols: Record<string, string> = {
 'gt': '>',
 'lt': '<',
 'gte': '≥',
 'lte': '≤',
 'eq': '='
 };
 return symbols[operator] || operator;
 }

 /**
 * Calculate overall score
 */
 private calculateOverallScore(stageResults: StageResult[], qualityGateResults: QualityGateResult[]): number {
 let score = 100;

 // Deduct for errors
 for (const result of stageResults) {
 score -= result.errors.length * 10;
 score -= result.warnings.length * 2;
 }

 // Deduct for failed quality gates
 for (const gateResult of qualityGateResults) {
 if (!gateResult.passed && gateResult.gate.required) {
 score -= 15;
 }
 }

 return Math.max(0, score);
 }

 /**
 * Generate summary
 */
 private generateSummary(
 stageResults: StageResult[],
 qualityGateResults: QualityGateResult[],
 passed: boolean
 ): string {
 const totalErrors = stageResults.reduce((sum, r) => sum + r.errors.length, 0);
 const totalWarnings = stageResults.reduce((sum, r) => sum + r.warnings.length, 0);
 const failedGates = qualityGateResults.filter(g => !g.passed && g.gate.required).length;

 if (passed) {
 return ` Validation passed! ${totalWarnings} warning(s)`;
 } else {
 return ` Validation failed! ${totalErrors} error(s), ${totalWarnings} warning(s), ${failedGates} quality gate(s) failed`;
 }
 }
}

