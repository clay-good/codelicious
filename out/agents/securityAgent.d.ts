/**
 * Security Review Agent
 *
 * Reviews generated code for security vulnerabilities, correctness, and performance issues.
 * Provides recommendations for improvements.
 */
import { BaseAgent } from './baseAgent';
import { ModelOrchestrator } from '../models/orchestrator';
import { AgentContext, AgentConfig, SecurityReviewResult } from './types';
export declare class SecurityReviewAgent extends BaseAgent {
    constructor(orchestrator: ModelOrchestrator, config?: Partial<AgentConfig>);
    protected getDefaultSystemPrompt(): string;
    protected buildPrompt(context: AgentContext): Promise<string>;
    protected parseResponse(response: string, context: AgentContext): Promise<SecurityReviewResult>;
    /**
    * Calculate security score based on vulnerabilities
    */
    private calculateSecurityScore;
    /**
    * Calculate quality score based on issues
    */
    private calculateQualityScore;
    /**
    * Quick security check without full AI call
    */
    quickSecurityCheck(code: string, language: string): Promise<string[]>;
    /**
    * Check for common anti-patterns
    */
    checkAntiPatterns(code: string): string[];
}
//# sourceMappingURL=securityAgent.d.ts.map