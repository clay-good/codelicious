/**
 * Base Agent Class
 *
 * Abstract base class for all AI agents in the multi-agent system.
 */

import { ModelOrchestrator } from '../models/orchestrator';
import { Message, ModelRequest } from '../types';
import { TaskComplexity } from '../models/modelRouter';
import {
 AgentRole,
 AgentTask,
 AgentTaskResult,
 AgentTaskStatus,
 AgentContext,
 AgentConfig,
 AgentMetrics
} from './types';

export abstract class BaseAgent {
 protected metrics: AgentMetrics;
 protected effectiveModel: string;
 protected fallbackModels: string[];

 constructor(
 protected readonly role: AgentRole,
 protected readonly orchestrator: ModelOrchestrator,
 protected readonly config: AgentConfig
 ) {
 this.metrics = {
 role,
 tasksCompleted: 0,
 tasksFailed: 0,
 averageConfidence: 0,
 averageDuration: 0,
 successRate: 0
 };

 // Use model from config, or undefined to let ModelOrchestrator decide
 this.effectiveModel = this.config.model || '';
 this.fallbackModels = this.config.model ? [] : []; // No automatic fallbacks - let user configure
 }

 /**
 * Execute an agent task
 */
 async execute(task: AgentTask): Promise<AgentTaskResult> {
 if (!this.config.enabled) {
 return {
 success: false,
 data: null,
 confidence: 0,
 errors: ['Agent is disabled']
 };
 }

 const startTime = Date.now();
 task.startedAt = startTime;
 task.status = AgentTaskStatus.IN_PROGRESS;

 try {
 // Build the prompt for this agent
 const prompt = await this.buildPrompt(task.context);

 // Get AI response
 const response = await this.queryAI(prompt, task.context);

 // Parse the response
 const result = await this.parseResponse(response, task.context);

 // Update metrics
 const duration = Date.now() - startTime;
 this.updateMetrics(true, result.confidence, duration);

 task.status = AgentTaskStatus.COMPLETED;
 task.completedAt = Date.now();
 task.result = result;

 return result;

 } catch (error) {
 const duration = Date.now() - startTime;
 this.updateMetrics(false, 0, duration);

 task.status = AgentTaskStatus.FAILED;
 task.completedAt = Date.now();
 task.error = error instanceof Error ? error.message : String(error);

 return {
 success: false,
 data: null,
 confidence: 0,
 errors: [task.error]
 };
 }
 }

 /**
 * Build the prompt for this agent (must be implemented by subclasses)
 */
 protected abstract buildPrompt(context: AgentContext): Promise<string>;

 /**
 * Parse the AI response (must be implemented by subclasses)
 */
 protected abstract parseResponse(response: string, context: AgentContext): Promise<AgentTaskResult>;

 /**
 * Get the system prompt for this agent
 */
 protected getSystemPrompt(): string {
 return this.config.systemPrompt || this.getDefaultSystemPrompt();
 }

 /**
 * Get the default system prompt (can be overridden by subclasses)
 */
 protected abstract getDefaultSystemPrompt(): string;

 /**
 * Query the AI model
 * If no model specified in config, ModelOrchestrator will use its default routing logic
 */
 protected async queryAI(prompt: string, context: AgentContext): Promise<string> {
 const messages: Message[] = [
 { role: 'system', content: this.getSystemPrompt() },
 ...context.conversationHistory.slice(-5), // Include recent history
 { role: 'user', content: prompt }
 ];

 const request: ModelRequest = {
 messages,
 model: this.effectiveModel || undefined, // undefined = let orchestrator decide
 temperature: this.config.temperature || 0.7,
 maxTokens: this.config.maxTokens
 };

 const response = await this.orchestrator.sendRequest(request, {
 complexity: this.determineComplexity(context)
 });

 return response.content;
 }

 /**
 * Determine task complexity
 */
 protected determineComplexity(context: AgentContext): TaskComplexity {
 // Simple heuristic based on prompt length and context
 const promptLength = context.userPrompt.length;
 const hasCodebaseContext = !!context.codebaseContext;
 const hasMultipleFiles = (context.relevantFiles?.length || 0) > 3;

 if (promptLength > 1000 || (hasCodebaseContext && hasMultipleFiles)) {
 return TaskComplexity.COMPLEX;
 } else if (promptLength > 500 || hasCodebaseContext) {
 return TaskComplexity.MODERATE;
 } else {
 return TaskComplexity.SIMPLE;
 }
 }

 /**
 * Update agent metrics
 */
 protected updateMetrics(success: boolean, confidence: number, duration: number): void {
 if (success) {
 this.metrics.tasksCompleted++;

 // Update average confidence
 const totalTasks = this.metrics.tasksCompleted;
 this.metrics.averageConfidence =
 (this.metrics.averageConfidence * (totalTasks - 1) + confidence) / totalTasks;

 // Update average duration
 this.metrics.averageDuration =
 (this.metrics.averageDuration * (totalTasks - 1) + duration) / totalTasks;
 } else {
 this.metrics.tasksFailed++;
 }

 // Update success rate
 const total = this.metrics.tasksCompleted + this.metrics.tasksFailed;
 this.metrics.successRate = this.metrics.tasksCompleted / total;

 this.metrics.lastUsed = Date.now();
 }

 /**
 * Get agent metrics
 */
 getMetrics(): AgentMetrics {
 return { ...this.metrics };
 }

 /**
 * Get agent role
 */
 getRole(): AgentRole {
 return this.role;
 }

 /**
 * Get agent configuration
 */
 getConfig(): AgentConfig {
 return { ...this.config };
 }

 /**
 * Update agent configuration
 */
 updateConfig(config: Partial<AgentConfig>): void {
 Object.assign(this.config, config);

 // Update effective model if model config changed
 if (config.model !== undefined) {
 this.effectiveModel = config.model || '';
 }
 }

 /**
 * Get the model currently being used (empty string = orchestrator decides)
 */
 getEffectiveModel(): string {
 return this.effectiveModel || 'default';
 }

 /**
 * Set model for this agent
 */
 setModel(model: string): void {
 this.config.model = model;
 this.effectiveModel = model;
 }

 /**
 * Extract JSON from markdown code blocks
 */
 protected extractJSON(text: string): unknown {
 // Try to find JSON in code blocks
 const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
 if (jsonMatch) {
 return JSON.parse(jsonMatch[1]);
 }

 // Try to find JSON without code blocks
 const jsonStart = text.indexOf('{');
 const jsonEnd = text.lastIndexOf('}');
 if (jsonStart !== -1 && jsonEnd !== -1) {
 return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
 }

 throw new Error('No JSON found in response');
 }

 /**
 * Extract code from markdown code blocks
 */
 protected extractCode(text: string, language?: string): string {
 const pattern = language
 ? new RegExp(`\`\`\`${language}\\s*([\\s\\S]*?)\\s*\`\`\``)
 : /```[\w]*\s*([\s\S]*?)\s*```/;

 const match = text.match(pattern);
 if (match) {
 return match[1].trim();
 }

 return text.trim();
 }

 /**
 * Calculate confidence score based on response quality
 */
 protected calculateConfidence(response: string, expectedPatterns: string[]): number {
 let confidence = 0.5; // Base confidence

 // Check for expected patterns
 for (const pattern of expectedPatterns) {
 if (response.toLowerCase().includes(pattern.toLowerCase())) {
 confidence += 0.1;
 }
 }

 // Check for uncertainty markers
 const uncertaintyMarkers = ['maybe', 'perhaps', 'might', 'possibly', 'not sure'];
 for (const marker of uncertaintyMarkers) {
 if (response.toLowerCase().includes(marker)) {
 confidence -= 0.1;
 }
 }

 // Check for detailed explanations (longer responses tend to be more confident)
 if (response.length > 500) {
 confidence += 0.1;
 }

 return Math.max(0, Math.min(1, confidence));
 }
}

