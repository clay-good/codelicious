/**
 * ML-Based Fix Ranker - Machine learning-powered ranking for fix suggestions
 *
 * Features:
 * - Historical success rate analysis
 * - Code similarity scoring using embeddings
 * - Multi-factor ranking algorithm
 * - Learning from fix outcomes
 * - Confidence calibration
 * - Feature extraction from fixes and errors
 * - Adaptive weighting based on performance
 */

import { EmbeddingManager } from '../embedding/embeddingManager';
import { DetectedError, Language, SuggestedFix } from './errorDetector';
import { createLogger } from '../utils/logger';

const logger = createLogger('MLFixRanker');

export interface FixHistory {
 errorType: string;
 language: Language;
 fix: SuggestedFix;
 success: boolean;
 timestamp: Date;
 context: string;
}

export interface RankingFeatures {
 // Historical features
 historicalSuccessRate: number;
 historicalUsageCount: number;
 recentSuccessRate: number; // Last 10 fixes

 // Similarity features
 codeSimilarity: number;
 errorSimilarity: number;
 contextSimilarity: number;

 // Fix characteristics
 fixComplexity: number; // Number of changes
 fixConfidence: number; // Original confidence
 fixType: 'add' | 'remove' | 'replace' | 'refactor';

 // Error characteristics
 errorSeverity: 'critical' | 'error' | 'warning' | 'info';
 errorType: string;
 language: Language;

 // Temporal features
 recency: number; // How recent is the historical fix
 timeOfDay: number; // 0-23 (some errors more common at certain times)

 // Context features
 fileSize: number;
 linesOfCode: number;
 hasTests: boolean;
 inProduction: boolean;
}

export interface RankedFix {
 fix: SuggestedFix;
 score: number;
 features: RankingFeatures;
 explanation: string[];
 confidence: number; // Calibrated confidence
}

export interface RankingWeights {
 historicalSuccessRate: number;
 historicalUsageCount: number;
 recentSuccessRate: number;
 codeSimilarity: number;
 errorSimilarity: number;
 contextSimilarity: number;
 fixComplexity: number;
 fixConfidence: number;
 recency: number;
 errorSeverity: number;
}

export interface RankingMetrics {
 totalRankings: number;
 averageAccuracy: number;
 topKAccuracy: { k: number; accuracy: number }[];
 calibrationError: number;
 featureImportance: Map<string, number>;
}

export class MLFixRanker {
 private embeddingManager: EmbeddingManager;
 private fixHistory: FixHistory[] = [];
 private rankingHistory: Array<{
 features: RankingFeatures;
 predictedScore: number;
 actualSuccess: boolean;
 timestamp: Date;
 }> = [];

 // Adaptive weights (start with reasonable defaults)
 private weights: RankingWeights = {
 historicalSuccessRate: 0.25,
 historicalUsageCount: 0.10,
 recentSuccessRate: 0.20,
 codeSimilarity: 0.15,
 errorSimilarity: 0.10,
 contextSimilarity: 0.05,
 fixComplexity: -0.05, // Negative: simpler is better
 fixConfidence: 0.10,
 recency: 0.05,
 errorSeverity: 0.05
 };

 private metrics: RankingMetrics = {
 totalRankings: 0,
 averageAccuracy: 0,
 topKAccuracy: [
 { k: 1, accuracy: 0 },
 { k: 3, accuracy: 0 },
 { k: 5, accuracy: 0 }
 ],
 calibrationError: 0,
 featureImportance: new Map()
 };

 constructor(embeddingManager: EmbeddingManager) {
 this.embeddingManager = embeddingManager;
 }

 /**
 * Rank fixes using ML-based scoring
 */
 async rankFixes(
 fixes: SuggestedFix[],
 error: DetectedError,
 context: {
 fileContent: string;
 fileSize: number;
 linesOfCode: number;
 hasTests: boolean;
 inProduction: boolean;
 }
 ): Promise<RankedFix[]> {
 const rankedFixes: RankedFix[] = [];

 for (const fix of fixes) {
 // Extract features
 const features = await this.extractFeatures(fix, error, context);

 // Calculate ML score
 const score = this.calculateScore(features);

 // Calibrate confidence
 const calibratedConfidence = this.calibrateConfidence(fix.confidence, features);

 // Generate explanation
 const explanation = this.generateExplanation(features, score);

 rankedFixes.push({
 fix,
 score,
 features,
 explanation,
 confidence: calibratedConfidence
 });
 }

 // Sort by score (descending)
 rankedFixes.sort((a, b) => b.score - a.score);

 this.metrics.totalRankings++;

 return rankedFixes;
 }

 /**
 * Extract features for ML ranking
 */
 private async extractFeatures(
 fix: SuggestedFix,
 error: DetectedError,
 context: {
 fileContent: string;
 fileSize: number;
 linesOfCode: number;
 hasTests: boolean;
 inProduction: boolean;
 }
 ): Promise<RankingFeatures> {
 // Historical features
 const historicalFixes = this.getHistoricalFixes(error, fix);
 const historicalSuccessRate = this.calculateSuccessRate(historicalFixes);
 const recentSuccessRate = this.calculateSuccessRate(historicalFixes.slice(-10));

 // Similarity features
 const codeSimilarity = await this.calculateCodeSimilarity(fix, context.fileContent);
 const errorSimilarity = this.calculateErrorSimilarity(error, historicalFixes);
 const contextSimilarity = await this.calculateContextSimilarity(fix, context.fileContent);

 // Fix complexity
 const fixComplexity = this.calculateFixComplexity(fix);

 // Temporal features
 const recency = this.calculateRecency(historicalFixes);
 const timeOfDay = new Date().getHours();

 // Error severity weight
 const severityWeights = { critical: 1.0, error: 0.8, warning: 0.5, info: 0.3 };
 const errorSeverityWeight = severityWeights[error.severity];

 return {
 historicalSuccessRate,
 historicalUsageCount: historicalFixes.length,
 recentSuccessRate,
 codeSimilarity,
 errorSimilarity,
 contextSimilarity,
 fixComplexity,
 fixConfidence: fix.confidence,
 fixType: fix.type,
 errorSeverity: error.severity,
 errorType: error.type,
 language: error.language,
 recency,
 timeOfDay,
 fileSize: context.fileSize,
 linesOfCode: context.linesOfCode,
 hasTests: context.hasTests,
 inProduction: context.inProduction
 };
 }

 /**
 * Calculate ML-based score
 */
 private calculateScore(features: RankingFeatures): number {
 let score = 0;

 // Weighted sum of features
 score += features.historicalSuccessRate * this.weights.historicalSuccessRate;
 score += Math.min(features.historicalUsageCount / 20, 1) * this.weights.historicalUsageCount;
 score += features.recentSuccessRate * this.weights.recentSuccessRate;
 score += features.codeSimilarity * this.weights.codeSimilarity;
 score += features.errorSimilarity * this.weights.errorSimilarity;
 score += features.contextSimilarity * this.weights.contextSimilarity;
 score += (1 - features.fixComplexity) * Math.abs(this.weights.fixComplexity);
 score += features.fixConfidence * this.weights.fixConfidence;
 score += features.recency * this.weights.recency;

 // Error severity boost
 const severityBoost = { critical: 0.1, error: 0.05, warning: 0.02, info: 0.01 };
 score += severityBoost[features.errorSeverity];

 // Normalize to 0-1
 return Math.max(0, Math.min(1, score));
 }

 /**
 * Calibrate confidence based on historical performance
 */
 private calibrateConfidence(originalConfidence: number, features: RankingFeatures): number {
 // If we have historical data, adjust confidence
 if (features.historicalUsageCount > 5) {
 // Blend original confidence with historical success rate
 const alpha = Math.min(features.historicalUsageCount / 20, 0.7);
 return (1 - alpha) * originalConfidence + alpha * features.historicalSuccessRate;
 }

 // Apply calibration based on overall metrics
 if (this.metrics.calibrationError > 0) {
 // If we tend to be overconfident, reduce confidence
 return originalConfidence * (1 - this.metrics.calibrationError * 0.5);
 }

 return originalConfidence;
 }

 /**
 * Generate human-readable explanation
 */
 private generateExplanation(features: RankingFeatures, score: number): string[] {
 const explanation: string[] = [];

 explanation.push(`Overall score: ${(score * 100).toFixed(1)}%`);

 if (features.historicalSuccessRate > 0.8) {
 explanation.push(`High historical success rate: ${(features.historicalSuccessRate * 100).toFixed(0)}%`);
 } else if (features.historicalSuccessRate > 0) {
 explanation.push(`Moderate historical success rate: ${(features.historicalSuccessRate * 100).toFixed(0)}%`);
 }

 if (features.historicalUsageCount > 10) {
 explanation.push(`Used ${features.historicalUsageCount} times before`);
 } else if (features.historicalUsageCount === 0) {
 explanation.push(` New fix pattern (no history)`);
 }

 if (features.codeSimilarity > 0.8) {
 explanation.push(`Very similar to successful past fixes`);
 }

 if (features.fixComplexity < 0.3) {
 explanation.push(` Simple fix (low complexity)`);
 } else if (features.fixComplexity > 0.7) {
 explanation.push(`Complex fix (multiple changes)`);
 }

 if (features.errorSeverity === 'critical') {
 explanation.push(` Critical error - high priority`);
 }

 return explanation;
 }

 /**
 * Get historical fixes for similar errors
 */
 private getHistoricalFixes(error: DetectedError, fix: SuggestedFix): FixHistory[] {
 return this.fixHistory.filter(h =>
 h.errorType === error.type &&
 h.language === error.language &&
 h.fix.type === fix.type
 );
 }

 /**
 * Calculate success rate from historical fixes
 */
 private calculateSuccessRate(fixes: FixHistory[]): number {
 if (fixes.length === 0) return 0;
 const successCount = fixes.filter(f => f.success).length;
 return successCount / fixes.length;
 }

 /**
 * Calculate code similarity using embeddings
 */
 private async calculateCodeSimilarity(fix: SuggestedFix, fileContent: string): Promise<number> {
 try {
 // Get embeddings for fix code and file content
 const fixCode = fix.changes.map((c: any) => c.newCode).join('\n'); // Fix change structure
 const fixEmbedding = await this.embeddingManager.generateEmbedding(fixCode);

 // Sample relevant portion of file (around the fix location)
 const contextWindow = 500; // characters
 const fileEmbedding = await this.embeddingManager.generateEmbedding(
 fileContent.substring(0, contextWindow)
 );

 // Calculate cosine similarity
 return this.cosineSimilarity(fixEmbedding, fileEmbedding);
 } catch (error) {
 logger.warn('Code similarity calculation failed:', error);
 return 0.5; // Default to neutral
 }
 }

 /**
 * Calculate error similarity with historical errors
 */
 private calculateErrorSimilarity(error: DetectedError, historicalFixes: FixHistory[]): number {
 if (historicalFixes.length === 0) return 0;

 // Simple text similarity for now (could use embeddings)
 const errorText = `${error.type} ${error.message}`.toLowerCase();
 let totalSimilarity = 0;

 for (const hist of historicalFixes) {
 const histText = `${hist.errorType} ${hist.context}`.toLowerCase();
 const similarity = this.textSimilarity(errorText, histText);
 totalSimilarity += similarity;
 }

 return totalSimilarity / historicalFixes.length;
 }

 /**
 * Calculate context similarity
 */
 private async calculateContextSimilarity(fix: SuggestedFix, fileContent: string): Promise<number> {
 try {
 // Extract context from fix
 const fixContext = fix.reasoning || fix.description;
 const fixEmbedding = await this.embeddingManager.generateEmbedding(fixContext);

 // Extract imports and key identifiers from file
 const fileContext = this.extractFileContext(fileContent);
 const fileEmbedding = await this.embeddingManager.generateEmbedding(fileContext);

 return this.cosineSimilarity(fixEmbedding, fileEmbedding);
 } catch (error) {
 logger.warn('Context similarity calculation failed:', error);
 return 0.5;
 }
 }

 /**
 * Calculate fix complexity (0-1, higher = more complex)
 */
 private calculateFixComplexity(fix: SuggestedFix): number {
 const changeCount = fix.changes.length;
 const totalLines = fix.changes.reduce((sum: number, c: any) => { // Fix change structure
 const lines = c.newCode.split('\n').length;
 return sum + lines;
 }, 0);

 // Normalize: 1 change with 5 lines = 0.3, 5 changes with 50 lines = 1.0
 const complexityScore = (changeCount * 0.3) + (totalLines / 100);
 return Math.min(1, complexityScore);
 }

 /**
 * Calculate recency score (0-1, higher = more recent)
 */
 private calculateRecency(fixes: FixHistory[]): number {
 if (fixes.length === 0) return 0;

 const now = Date.now();
 const recentFixes = fixes.filter(f => {
 const age = now - f.timestamp.getTime();
 return age < 30 * 24 * 60 * 60 * 1000; // Last 30 days
 });

 return recentFixes.length / fixes.length;
 }

 /**
 * Extract file context (imports, key identifiers)
 */
 private extractFileContext(fileContent: string): string {
 const lines = fileContent.split('\n');
 const contextLines: string[] = [];

 // Extract imports
 for (const line of lines.slice(0, 50)) {
 if (line.includes('import') || line.includes('require') || line.includes('from')) {
 contextLines.push(line);
 }
 }

 // Extract class/function names
 const identifierRegex = /(?:class|function|const|let|var|interface|type)\s+(\w+)/g;
 const matches = fileContent.matchAll(identifierRegex);
 for (const match of matches) {
 contextLines.push(match[1]);
 }

 return contextLines.join(' ');
 }

 /**
 * Cosine similarity between two embeddings
 */
 private cosineSimilarity(embedding1: number[], embedding2: number[]): number {
 if (embedding1.length !== embedding2.length) {
 return 0;
 }

 let dotProduct = 0;
 let norm1 = 0;
 let norm2 = 0;

 for (let i = 0; i < embedding1.length; i++) {
 dotProduct += embedding1[i] * embedding2[i];
 norm1 += embedding1[i] * embedding1[i];
 norm2 += embedding2[i] * embedding2[i];
 }

 const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
 return denominator === 0 ? 0 : dotProduct / denominator;
 }

 /**
 * Text similarity (Jaccard similarity)
 */
 private textSimilarity(text1: string, text2: string): number {
 const words1 = new Set(text1.split(/\s+/));
 const words2 = new Set(text2.split(/\s+/));

 const intersection = new Set([...words1].filter(w => words2.has(w)));
 const union = new Set([...words1, ...words2]);

 return union.size === 0 ? 0 : intersection.size / union.size;
 }
 /**
 * Record fix outcome for learning
 */
 recordFixOutcome(
 fix: SuggestedFix,
 error: DetectedError,
 features: RankingFeatures,
 predictedScore: number,
 actualSuccess: boolean
 ): void {
 // Add to fix history
 this.fixHistory.push({
 errorType: error.type,
 language: error.language,
 fix,
 success: actualSuccess,
 timestamp: new Date(),
 context: error.message
 });

 // Add to ranking history
 this.rankingHistory.push({
 features,
 predictedScore,
 actualSuccess,
 timestamp: new Date()
 });

 // Update metrics
 this.updateMetrics();

 // Adapt weights if we have enough data
 if (this.rankingHistory.length >= 50 && this.rankingHistory.length % 10 === 0) {
 this.adaptWeights();
 }

 // Keep history manageable
 if (this.fixHistory.length > 1000) {
 this.fixHistory = this.fixHistory.slice(-1000);
 }
 if (this.rankingHistory.length > 500) {
 this.rankingHistory = this.rankingHistory.slice(-500);
 }
 }

 /**
 * Update ranking metrics
 */
 private updateMetrics(): void {
 if (this.rankingHistory.length === 0) return;

 // Calculate average accuracy
 const correctPredictions = this.rankingHistory.filter(h => {
 const predicted = h.predictedScore > 0.5;
 return predicted === h.actualSuccess;
 }).length;

 this.metrics.averageAccuracy = correctPredictions / this.rankingHistory.length;

 // Calculate calibration error
 let calibrationError = 0;
 for (const hist of this.rankingHistory) {
 const expected = hist.predictedScore;
 const actual = hist.actualSuccess ? 1 : 0;
 calibrationError += Math.abs(expected - actual);
 }
 this.metrics.calibrationError = calibrationError / this.rankingHistory.length;

 // Calculate feature importance (simple correlation)
 this.calculateFeatureImportance();
 }

 /**
 * Calculate feature importance
 */
 private calculateFeatureImportance(): void {
 const features = [
 'historicalSuccessRate',
 'codeSimilarity',
 'errorSimilarity',
 'fixComplexity',
 'fixConfidence'
 ];

 for (const feature of features) {
 let correlation = 0;
 let count = 0;

 for (const hist of this.rankingHistory) {
 const featureValue = (hist.features as any)[feature] || 0;
 const outcome = hist.actualSuccess ? 1 : 0;
 correlation += featureValue * outcome;
 count++;
 }

 this.metrics.featureImportance.set(feature, count > 0 ? correlation / count : 0);
 }
 }

 /**
 * Adapt weights based on performance
 */
 private adaptWeights(): void {
 logger.info(' Adapting ML weights based on performance...');

 // Simple gradient-based adaptation
 const learningRate = 0.1;

 for (const hist of this.rankingHistory.slice(-50)) {
 const error = (hist.actualSuccess ? 1 : 0) - hist.predictedScore;

 // Update weights proportional to feature values and error
 this.weights.historicalSuccessRate += learningRate * error * hist.features.historicalSuccessRate;
 this.weights.codeSimilarity += learningRate * error * hist.features.codeSimilarity;
 this.weights.errorSimilarity += learningRate * error * hist.features.errorSimilarity;
 this.weights.fixConfidence += learningRate * error * hist.features.fixConfidence;
 this.weights.fixComplexity += learningRate * error * (1 - hist.features.fixComplexity);
 }

 // Normalize weights to sum to 1
 const totalWeight = Object.values(this.weights).reduce((sum, w) => sum + Math.abs(w), 0);
 for (const key in this.weights) {
 (this.weights as any)[key] = (this.weights as any)[key] / totalWeight;
 }

 logger.info('Weights adapted:', this.weights);
 }

 /**
 * Get current metrics
 */
 getMetrics(): RankingMetrics {
 return { ...this.metrics };
 }

 /**
 * Get current weights
 */
 getWeights(): RankingWeights {
 return { ...this.weights };
 }

 /**
 * Load fix history (for persistence)
 */
 loadHistory(history: FixHistory[]): void {
 this.fixHistory = history;
 }

 /**
 * Get fix history (for persistence)
 */
 getHistory(): FixHistory[] {
 return this.fixHistory;
 }
}
