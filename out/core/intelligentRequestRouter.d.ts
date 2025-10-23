/**
 * Intelligent Request Router - Automatically detects build requests and routes appropriately
 *
 * This is the KEY component that makes autonomous building automatic!
 * No more special trigger phrases - just natural language.
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { TaskComplexity } from '../models/modelRouter';
export declare enum RequestType {
    BUILD_REQUEST = "BUILD_REQUEST",// User wants to build something
    CODE_QUESTION = "CODE_QUESTION",// User has a question about code
    CODE_EXPLANATION = "CODE_EXPLANATION",// User wants code explained
    CODE_REVIEW = "CODE_REVIEW",// User wants code reviewed
    DEBUGGING = "DEBUGGING",// User needs help debugging
    GENERAL_CHAT = "GENERAL_CHAT"
}
export interface IntentAnalysis {
    type: RequestType;
    confidence: number;
    specification: string;
    projectType?: string;
    languages?: string[];
    frameworks?: string[];
    complexity: TaskComplexity;
    estimatedTasks?: number;
    reasoning: string;
}
export declare class IntelligentRequestRouter {
    private orchestrator;
    constructor(orchestrator: ModelOrchestrator);
    /**
    * Analyze user intent and determine request type
    * Uses lightweight model (Gemini Flash) for cost efficiency
    */
    analyzeIntent(userMessage: string, conversationHistory?: Array<{
        role: string;
        content: string;
    }>): Promise<IntentAnalysis>;
    /**
    * Quick keyword-based analysis (FREE, instant)
    * BUILDER MODE: Aggressively detect ANY code-related request
    */
    private quickAnalyze;
    /**
    * AI-based analysis for ambiguous cases
    * Uses Gemini Flash for cost efficiency (~$0.01 per analysis)
    * BUILDER MODE: Bias towards building/creating files
    */
    private aiAnalyze;
    /**
    * Estimate task complexity based on message
    */
    private estimateComplexity;
    /**
    * Estimate number of tasks based on message
    */
    private estimateTaskCount;
    /**
    * Enhance specification with context
    */
    enhanceSpecification(originalSpec: string, projectType?: string, languages?: string[]): Promise<string>;
}
//# sourceMappingURL=intelligentRequestRouter.d.ts.map