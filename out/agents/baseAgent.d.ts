/**
 * Base Agent Class
 *
 * Abstract base class for all AI agents in the multi-agent system.
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { TaskComplexity } from '../models/modelRouter';
import { AgentRole, AgentTask, AgentTaskResult, AgentContext, AgentConfig, AgentMetrics } from './types';
export declare abstract class BaseAgent {
    protected readonly role: AgentRole;
    protected readonly orchestrator: ModelOrchestrator;
    protected readonly config: AgentConfig;
    protected metrics: AgentMetrics;
    protected effectiveModel: string;
    protected fallbackModels: string[];
    constructor(role: AgentRole, orchestrator: ModelOrchestrator, config: AgentConfig);
    /**
    * Execute an agent task
    */
    execute(task: AgentTask): Promise<AgentTaskResult>;
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
    protected getSystemPrompt(): string;
    /**
    * Get the default system prompt (can be overridden by subclasses)
    */
    protected abstract getDefaultSystemPrompt(): string;
    /**
    * Query the AI model
    * If no model specified in config, ModelOrchestrator will use its default routing logic
    */
    protected queryAI(prompt: string, context: AgentContext): Promise<string>;
    /**
    * Determine task complexity
    */
    protected determineComplexity(context: AgentContext): TaskComplexity;
    /**
    * Update agent metrics
    */
    protected updateMetrics(success: boolean, confidence: number, duration: number): void;
    /**
    * Get agent metrics
    */
    getMetrics(): AgentMetrics;
    /**
    * Get agent role
    */
    getRole(): AgentRole;
    /**
    * Get agent configuration
    */
    getConfig(): AgentConfig;
    /**
    * Update agent configuration
    */
    updateConfig(config: Partial<AgentConfig>): void;
    /**
    * Get the model currently being used (empty string = orchestrator decides)
    */
    getEffectiveModel(): string;
    /**
    * Set model for this agent
    */
    setModel(model: string): void;
    /**
    * Extract JSON from markdown code blocks
    */
    protected extractJSON(text: string): unknown;
    /**
    * Extract code from markdown code blocks
    */
    protected extractCode(text: string, language?: string): string;
    /**
    * Calculate confidence score based on response quality
    */
    protected calculateConfidence(response: string, expectedPatterns: string[]): number;
}
//# sourceMappingURL=baseAgent.d.ts.map