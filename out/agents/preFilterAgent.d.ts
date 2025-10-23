/**
 * Pre-Filter Agent
 *
 * Optimizes user prompts before sending to the main code generation agent.
 * Adds context, clarifies requirements, and structures requests for better results.
 */
import { BaseAgent } from './baseAgent';
import { ModelOrchestrator } from '../models/orchestrator';
import { AgentContext, AgentConfig, PreFilterResult } from './types';
export declare class PreFilterAgent extends BaseAgent {
    constructor(orchestrator: ModelOrchestrator, config?: Partial<AgentConfig>);
    protected getDefaultSystemPrompt(): string;
    protected buildPrompt(context: AgentContext): Promise<string>;
    protected parseResponse(response: string, context: AgentContext): Promise<PreFilterResult>;
    /**
    * Quick optimization without full AI call (for simple cases)
    */
    quickOptimize(userPrompt: string, context: Partial<AgentContext>): Promise<string>;
    /**
    * Estimate complexity without full AI call
    */
    estimateComplexity(userPrompt: string, context: Partial<AgentContext>): 'simple' | 'moderate' | 'complex' | 'very_complex';
    /**
    * Add codebase context to prompt
    */
    addCodebaseContext(prompt: string, codebaseContext: string, maxLength?: number): string;
    /**
    * Extract key requirements from prompt
    */
    extractRequirements(prompt: string): string[];
}
//# sourceMappingURL=preFilterAgent.d.ts.map