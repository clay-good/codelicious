/**
 * Feedback Manager
 *
 * Captures and processes user feedback on generated code to enable
 * continuous learning and improvement. Tracks:
 * - User approvals/rejections
 * - Code corrections and modifications
 * - Test results and quality metrics
 * - Usage patterns and preferences
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { createLogger } from '../utils/logger';

const logger = createLogger('FeedbackManager');

export enum FeedbackType {
 APPROVAL = 'approval',
 REJECTION = 'rejection',
 MODIFICATION = 'modification',
 TEST_PASS = 'test_pass',
 TEST_FAIL = 'test_fail',
 ERROR = 'error',
 MANUAL_FIX = 'manual_fix'
}

export enum FeedbackSentiment {
 POSITIVE = 'positive',
 NEUTRAL = 'neutral',
 NEGATIVE = 'negative'
}

export interface CodeFeedback {
 id: string;
 timestamp: number;
 type: FeedbackType;
 sentiment: FeedbackSentiment;

 // Context
 prompt: string;
 promptHash: string;
 generatedCode: string;
 codeHash: string;
 language: string;
 taskType: string; // 'code_generation', 'refactoring', 'bug_fix', etc.

 // Feedback details
 approved: boolean;
 modifiedCode?: string;
 modifications?: CodeModification[];
 testResults?: TestResults;
 errorMessage?: string;
 userComment?: string;

 // Quality metrics
 qualityScore: number; // 0-100
 timeToApproval?: number; // milliseconds
 iterationCount: number; // How many iterations to get it right

 // Learning metadata
 tags: string[];
 patterns: string[]; // Extracted patterns
 antiPatterns: string[]; // Things to avoid
}

export interface CodeModification {
 type: 'addition' | 'deletion' | 'change';
 lineNumber: number;
 originalCode: string;
 modifiedCode: string;
 reason?: string;
}

export interface TestResults {
 passed: number;
 failed: number;
 total: number;
 coverage?: number;
 duration: number;
 errors: string[];
}

export interface FeedbackSummary {
 totalFeedback: number;
 approvalRate: number;
 averageQualityScore: number;
 averageIterations: number;
 commonPatterns: Array<{ pattern: string; count: number }>;
 commonIssues: Array<{ issue: string; count: number }>;
 improvementTrend: number; // Positive = improving, negative = declining
}

export interface LearningInsight {
 type: 'pattern' | 'anti_pattern' | 'preference' | 'improvement';
 description: string;
 confidence: number; // 0-1
 examples: string[];
 frequency: number;
 impact: 'high' | 'medium' | 'low';
}

export class FeedbackManager {
 private feedback: Map<string, CodeFeedback> = new Map();
 private readonly STORAGE_KEY = 'codelicious.feedback';
 private readonly MAX_FEEDBACK_ENTRIES = 10000;

 constructor(private context: vscode.ExtensionContext) {
 this.loadFeedback();
 }

 /**
 * Record user feedback on generated code
 */
 async recordFeedback(feedback: Omit<CodeFeedback, 'id' | 'timestamp' | 'promptHash' | 'codeHash'>): Promise<string> {
 const id = this.generateId();
 const timestamp = Date.now();
 const promptHash = this.hashContent(feedback.prompt);
 const codeHash = this.hashContent(feedback.generatedCode);

 const completeFeedback: CodeFeedback = {
 id,
 timestamp,
 promptHash,
 codeHash,
 ...feedback
 };

 this.feedback.set(id, completeFeedback);

 // Trim if too large
 if (this.feedback.size > this.MAX_FEEDBACK_ENTRIES) {
 this.trimOldFeedback();
 }

 await this.saveFeedback();

 logger.info(`Recorded ${feedback.type} feedback: ${feedback.sentiment} (quality: ${feedback.qualityScore})`);

 return id;
 }

 /**
 * Record approval
 */
 async recordApproval(
 prompt: string,
 generatedCode: string,
 language: string,
 taskType: string,
 timeToApproval: number,
 iterationCount: number = 1
 ): Promise<string> {
 return this.recordFeedback({
 type: FeedbackType.APPROVAL,
 sentiment: FeedbackSentiment.POSITIVE,
 prompt,
 generatedCode,
 language,
 taskType,
 approved: true,
 qualityScore: 90,
 timeToApproval,
 iterationCount,
 tags: this.extractTags(prompt, generatedCode),
 patterns: this.extractPatterns(generatedCode, language),
 antiPatterns: []
 });
 }

 /**
 * Record rejection
 */
 async recordRejection(
 prompt: string,
 generatedCode: string,
 language: string,
 taskType: string,
 reason?: string
 ): Promise<string> {
 return this.recordFeedback({
 type: FeedbackType.REJECTION,
 sentiment: FeedbackSentiment.NEGATIVE,
 prompt,
 generatedCode,
 language,
 taskType,
 approved: false,
 qualityScore: 20,
 userComment: reason,
 iterationCount: 1,
 tags: this.extractTags(prompt, generatedCode),
 patterns: [],
 antiPatterns: this.extractPatterns(generatedCode, language)
 });
 }

 /**
 * Record modification (user edited the generated code)
 */
 async recordModification(
 prompt: string,
 generatedCode: string,
 modifiedCode: string,
 language: string,
 taskType: string,
 modifications: CodeModification[]
 ): Promise<string> {
 const qualityScore = this.calculateModificationQuality(modifications);

 return this.recordFeedback({
 type: FeedbackType.MODIFICATION,
 sentiment: qualityScore > 70 ? FeedbackSentiment.POSITIVE : FeedbackSentiment.NEUTRAL,
 prompt,
 generatedCode,
 modifiedCode,
 modifications,
 language,
 taskType,
 approved: true,
 qualityScore,
 iterationCount: 1,
 tags: this.extractTags(prompt, modifiedCode),
 patterns: this.extractPatterns(modifiedCode, language),
 antiPatterns: this.extractAntiPatternsFromModifications(modifications)
 });
 }

 /**
 * Record test results
 */
 async recordTestResults(
 prompt: string,
 generatedCode: string,
 language: string,
 taskType: string,
 testResults: TestResults
 ): Promise<string> {
 const passed = testResults.passed === testResults.total;
 const qualityScore = (testResults.passed / testResults.total) * 100;

 return this.recordFeedback({
 type: passed ? FeedbackType.TEST_PASS : FeedbackType.TEST_FAIL,
 sentiment: passed ? FeedbackSentiment.POSITIVE : FeedbackSentiment.NEGATIVE,
 prompt,
 generatedCode,
 language,
 taskType,
 approved: passed,
 testResults,
 qualityScore,
 iterationCount: 1,
 tags: this.extractTags(prompt, generatedCode),
 patterns: passed ? this.extractPatterns(generatedCode, language) : [],
 antiPatterns: passed ? [] : this.extractPatterns(generatedCode, language)
 });
 }

 /**
 * Get feedback summary
 */
 getSummary(options: { language?: string; taskType?: string; days?: number } = {}): FeedbackSummary {
 let feedbackList = Array.from(this.feedback.values());

 // Apply filters
 if (options.language) {
 feedbackList = feedbackList.filter(f => f.language === options.language);
 }
 if (options.taskType) {
 feedbackList = feedbackList.filter(f => f.taskType === options.taskType);
 }
 if (options.days) {
 const cutoff = Date.now() - (options.days * 24 * 60 * 60 * 1000);
 feedbackList = feedbackList.filter(f => f.timestamp > cutoff);
 }

 if (feedbackList.length === 0) {
 return {
 totalFeedback: 0,
 approvalRate: 0,
 averageQualityScore: 0,
 averageIterations: 0,
 commonPatterns: [],
 commonIssues: [],
 improvementTrend: 0
 };
 }

 // Calculate metrics
 const approvals = feedbackList.filter(f => f.approved).length;
 const approvalRate = (approvals / feedbackList.length) * 100;
 const averageQualityScore = feedbackList.reduce((sum, f) => sum + f.qualityScore, 0) / feedbackList.length;
 const averageIterations = feedbackList.reduce((sum, f) => sum + f.iterationCount, 0) / feedbackList.length;

 // Extract common patterns
 const patternCounts = new Map<string, number>();
 feedbackList.forEach(f => {
 f.patterns.forEach(p => {
 patternCounts.set(p, (patternCounts.get(p) || 0) + 1);
 });
 });
 const commonPatterns = Array.from(patternCounts.entries())
 .map(([pattern, count]) => ({ pattern, count }))
 .sort((a, b) => b.count - a.count)
 .slice(0, 10);

 // Extract common issues
 const issueCounts = new Map<string, number>();
 feedbackList.forEach(f => {
 f.antiPatterns.forEach(p => {
 issueCounts.set(p, (issueCounts.get(p) || 0) + 1);
 });
 });
 const commonIssues = Array.from(issueCounts.entries())
 .map(([issue, count]) => ({ issue, count }))
 .sort((a, b) => b.count - a.count)
 .slice(0, 10);

 // Calculate improvement trend
 const improvementTrend = this.calculateImprovementTrend(feedbackList);

 return {
 totalFeedback: feedbackList.length,
 approvalRate,
 averageQualityScore,
 averageIterations,
 commonPatterns,
 commonIssues,
 improvementTrend
 };
 }

 /**
 * Generate learning insights from feedback
 */
 generateInsights(options: { language?: string; taskType?: string; minConfidence?: number } = {}): LearningInsight[] {
 const summary = this.getSummary(options);
 const insights: LearningInsight[] = [];
 const minConfidence = options.minConfidence || 0.7;

 // Pattern insights
 summary.commonPatterns.forEach(({ pattern, count }) => {
 const confidence = Math.min(count / summary.totalFeedback, 1);
 if (confidence >= minConfidence) {
 insights.push({
 type: 'pattern',
 description: `Successful pattern: ${pattern}`,
 confidence,
 examples: this.getExamplesForPattern(pattern, true),
 frequency: count,
 impact: confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low'
 });
 }
 });

 // Anti-pattern insights
 summary.commonIssues.forEach(({ issue, count }) => {
 const confidence = Math.min(count / summary.totalFeedback, 1);
 if (confidence >= minConfidence) {
 insights.push({
 type: 'anti_pattern',
 description: `Avoid: ${issue}`,
 confidence,
 examples: this.getExamplesForPattern(issue, false),
 frequency: count,
 impact: confidence > 0.8 ? 'high' : confidence > 0.6 ? 'medium' : 'low'
 });
 }
 });

 return insights.sort((a, b) => b.confidence - a.confidence);
 }

 // Helper methods
 private generateId(): string {
 return `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 }

 private hashContent(content: string): string {
 return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
 }

 private extractTags(prompt: string, code: string): string[] {
 const tags: string[] = [];

 // Extract from prompt
 if (prompt.toLowerCase().includes('test')) tags.push('testing');
 if (prompt.toLowerCase().includes('api')) tags.push('api');
 if (prompt.toLowerCase().includes('database')) tags.push('database');
 if (prompt.toLowerCase().includes('async')) tags.push('async');

 return [...new Set(tags)];
 }

 private extractPatterns(code: string, language: string): string[] {
 // Simple pattern extraction - can be enhanced with AST parsing
 const patterns: string[] = [];

 if (code.includes('async') && code.includes('await')) patterns.push('async_await');
 if (code.includes('try') && code.includes('catch')) patterns.push('error_handling');
 if (code.includes('class')) patterns.push('oop');
 if (code.includes('interface') || code.includes('type')) patterns.push('type_safety');

 return patterns;
 }

 private extractAntiPatternsFromModifications(modifications: CodeModification[]): string[] {
 // Analyze what user changed to identify anti-patterns
 return [];
 }

 private calculateModificationQuality(modifications: CodeModification[]): number {
 // Fewer modifications = higher quality
 const modCount = modifications.length;
 if (modCount === 0) return 100;
 if (modCount <= 2) return 85;
 if (modCount <= 5) return 70;
 if (modCount <= 10) return 50;
 return 30;
 }

 private calculateImprovementTrend(feedbackList: CodeFeedback[]): number {
 if (feedbackList.length < 10) return 0;

 // Sort by timestamp
 const sorted = feedbackList.sort((a, b) => a.timestamp - b.timestamp);

 // Compare first half vs second half
 const midpoint = Math.floor(sorted.length / 2);
 const firstHalf = sorted.slice(0, midpoint);
 const secondHalf = sorted.slice(midpoint);

 const firstAvg = firstHalf.reduce((sum, f) => sum + f.qualityScore, 0) / firstHalf.length;
 const secondAvg = secondHalf.reduce((sum, f) => sum + f.qualityScore, 0) / secondHalf.length;

 return secondAvg - firstAvg;
 }

 private getExamplesForPattern(pattern: string, positive: boolean): string[] {
 return Array.from(this.feedback.values())
 .filter(f => positive ? f.patterns.includes(pattern) : f.antiPatterns.includes(pattern))
 .slice(0, 3)
 .map(f => f.generatedCode.substring(0, 200));
 }

 private trimOldFeedback(): void {
 const sorted = Array.from(this.feedback.entries())
 .sort((a, b) => b[1].timestamp - a[1].timestamp);

 const toKeep = sorted.slice(0, this.MAX_FEEDBACK_ENTRIES);
 this.feedback = new Map(toKeep);
 }

 private async loadFeedback(): Promise<void> {
 const stored = this.context.globalState.get<Array<[string, CodeFeedback]>>(this.STORAGE_KEY);
 if (stored) {
 this.feedback = new Map(stored);
 logger.info(` Loaded ${this.feedback.size} feedback entries`);
 }
 }

 private async saveFeedback(): Promise<void> {
 await this.context.globalState.update(this.STORAGE_KEY, Array.from(this.feedback.entries()));
 }
}

