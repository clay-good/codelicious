/**
 * MCP Tool Registry
 *
 * Central registry for managing MCP tools and their invocations.
 * Provides high-level interface for autonomous agents to discover and use external tools.
 */
import { MCPTool, MCPResponse } from './mcpClient';
import { ConfigurationManager } from '../core/configurationManager';
import { CacheManager } from '../cache/cacheManager';
export interface ToolInvocationContext {
    workspaceRoot?: string;
    currentFile?: string;
    projectType?: string;
    language?: string;
}
export interface ToolRecommendation {
    tool: MCPTool;
    relevance: number;
    reason: string;
    suggestedParameters?: Record<string, any>;
}
export declare class MCPToolRegistry {
    private configManager;
    private cacheManager;
    private mcpClient;
    private invocationHistory;
    private maxHistorySize;
    constructor(configManager: ConfigurationManager, cacheManager: CacheManager);
    /**
    * Initialize the registry
    */
    initialize(): Promise<void>;
    /**
    * Get all available tools
    */
    getAvailableTools(): MCPTool[];
    /**
    * Get tool by ID
    */
    getTool(toolId: string): MCPTool | undefined;
    /**
    * Search tools by query
    */
    searchTools(query: string): MCPTool[];
    /**
    * Get tools by category
    */
    getToolsByCategory(category: string): MCPTool[];
    /**
    * Recommend tools based on context
    */
    recommendTools(task: string, context: ToolInvocationContext): Promise<ToolRecommendation[]>;
    /**
    * Invoke a tool
    */
    invokeTool(toolId: string, operation: string, parameters: Record<string, any>, options?: {
        authentication?: Record<string, string>;
        timeout?: number;
        retries?: number;
        cache?: boolean;
    }): Promise<MCPResponse>;
    /**
    * Invoke tool with automatic parameter inference
    */
    invokeToolSmart(toolId: string, operation: string, context: ToolInvocationContext, userParameters?: Record<string, any>): Promise<MCPResponse>;
    /**
    * Infer parameters from context
    */
    private inferParameters;
    /**
    * Record tool invocation
    */
    private recordInvocation;
    /**
    * Get tool success rate
    */
    private getToolSuccessRate;
    /**
    * Get invocation history for a tool
    */
    getToolHistory(toolId: string): ToolInvocation[];
    /**
    * Get statistics
    */
    getStatistics(): {
        totalTools: number;
        totalInvocations: number;
        successRate: number;
        averageDuration: number;
        toolsByCategory: Record<string, number>;
        mostUsedTools: Array<{
            toolId: string;
            count: number;
        }>;
    };
    /**
    * Clear invocation history
    */
    clearHistory(): void;
    /**
    * Export invocation history
    */
    exportHistory(): ToolInvocation[];
    /**
    * Dispose resources
    */
    dispose(): Promise<void>;
}
interface ToolInvocation {
    toolId: string;
    operation: string;
    parameters: Record<string, any>;
    success: boolean;
    duration: number;
    timestamp: number;
    error?: string;
}
export {};
//# sourceMappingURL=mcpToolRegistry.d.ts.map