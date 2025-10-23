/**
 * Model Router - Intelligent routing to select the best model for each task
 *
 * Routes requests based on:
 * - Task complexity
 * - Context size
 * - Cost constraints
 * - Performance requirements
 * - Model availability
 */
import { ModelProvider, ModelRequest } from '../types';
import { BaseModelAdapter } from './baseAdapter';
export declare enum TaskComplexity {
    SIMPLE = "simple",// Code completion, simple questions
    MODERATE = "moderate",// Code explanation, refactoring
    COMPLEX = "complex",// Architecture design, debugging
    REASONING = "reasoning"
}
export interface RoutingContext {
    complexity?: TaskComplexity;
    maxCost?: number;
    preferredProvider?: ModelProvider;
    requiresLargeContext?: boolean;
    requiresStreaming?: boolean;
    requiresVision?: boolean;
    requiresFunctionCalling?: boolean;
}
export interface RoutingDecision {
    provider: ModelProvider;
    model: string;
    reason: string;
    estimatedCost: number;
}
export declare class ModelRouter {
    private adapters;
    private fallbackOrder;
    /**
    * Register an adapter
    */
    registerAdapter(provider: ModelProvider, adapter: BaseModelAdapter): void;
    /**
    * Get all available adapters
    */
    getAvailableAdapters(): BaseModelAdapter[];
    /**
    * Route a request to the best model
    */
    route(request: ModelRequest, context?: RoutingContext): Promise<RoutingDecision>;
    /**
    * Route based on specific requirements
    */
    private routeByRequirements;
    /**
    * Detect task complexity from request
    */
    private detectComplexity;
    /**
    * Select best model for a provider based on context
    *
    * DEFAULT: Claude Sonnet 4/4.5 for all complex tasks
    * This ensures the highest quality AI assistance for code generation,
    * problem solving, refactoring, and troubleshooting.
    */
    private selectModelForProvider;
    /**
    * Detect provider from model name
    */
    private detectProviderFromModel;
    /**
    * Estimate cost for a request
    */
    private estimateCost;
}
//# sourceMappingURL=modelRouter.d.ts.map