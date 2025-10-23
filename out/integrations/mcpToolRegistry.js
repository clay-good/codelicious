"use strict";
/**
 * MCP Tool Registry
 *
 * Central registry for managing MCP tools and their invocations.
 * Provides high-level interface for autonomous agents to discover and use external tools.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPToolRegistry = void 0;
const mcpClient_1 = require("./mcpClient");
class MCPToolRegistry {
    constructor(configManager, cacheManager) {
        this.configManager = configManager;
        this.cacheManager = cacheManager;
        this.invocationHistory = [];
        this.maxHistorySize = 100;
        this.mcpClient = new mcpClient_1.MCPClient(configManager, cacheManager);
    }
    /**
    * Initialize the registry
    */
    async initialize() {
        await this.mcpClient.initialize();
    }
    /**
    * Get all available tools
    */
    getAvailableTools() {
        return this.mcpClient.getTools();
    }
    /**
    * Get tool by ID
    */
    getTool(toolId) {
        return this.mcpClient.getTool(toolId);
    }
    /**
    * Search tools by query
    */
    searchTools(query) {
        const lowerQuery = query.toLowerCase();
        return this.getAvailableTools().filter(tool => tool.name.toLowerCase().includes(lowerQuery) ||
            tool.description.toLowerCase().includes(lowerQuery) ||
            tool.capabilities.some(cap => cap.toLowerCase().includes(lowerQuery)));
    }
    /**
    * Get tools by category
    */
    getToolsByCategory(category) {
        return this.mcpClient.searchTools({ category });
    }
    /**
    * Recommend tools based on context
    */
    async recommendTools(task, context) {
        const tools = this.getAvailableTools();
        const recommendations = [];
        const taskLower = task.toLowerCase();
        for (const tool of tools) {
            let relevance = 0;
            const reasons = [];
            // Check if tool name/description matches task
            if (tool.name.toLowerCase().includes(taskLower)) {
                relevance += 0.5;
                reasons.push('Tool name matches task');
            }
            if (tool.description.toLowerCase().includes(taskLower)) {
                relevance += 0.3;
                reasons.push('Tool description matches task');
            }
            // Check capabilities
            for (const capability of tool.capabilities) {
                if (taskLower.includes(capability.toLowerCase())) {
                    relevance += 0.2;
                    reasons.push(`Has capability: ${capability}`);
                }
            }
            // Context-based relevance
            if (context.projectType) {
                if (tool.description.toLowerCase().includes(context.projectType.toLowerCase())) {
                    relevance += 0.2;
                    reasons.push(`Relevant to ${context.projectType} projects`);
                }
            }
            if (context.language) {
                if (tool.description.toLowerCase().includes(context.language.toLowerCase())) {
                    relevance += 0.2;
                    reasons.push(`Supports ${context.language}`);
                }
            }
            // Historical success
            const successRate = this.getToolSuccessRate(tool.id);
            if (successRate > 0.8) {
                relevance += 0.1;
                reasons.push(`High success rate (${(successRate * 100).toFixed(0)}%)`);
            }
            if (relevance > 0.3) {
                recommendations.push({
                    tool,
                    relevance: Math.min(1, relevance),
                    reason: reasons.join('; ')
                });
            }
        }
        // Sort by relevance
        recommendations.sort((a, b) => b.relevance - a.relevance);
        return recommendations.slice(0, 5); // Top 5 recommendations
    }
    /**
    * Invoke a tool
    */
    async invokeTool(toolId, operation, parameters, options) {
        const request = {
            toolId,
            operation,
            parameters,
            authentication: options?.authentication,
            options: {
                timeout: options?.timeout,
                retries: options?.retries,
                cache: options?.cache
            }
        };
        const response = await this.mcpClient.invokeTool(request);
        // Record invocation
        this.recordInvocation({
            toolId,
            operation,
            parameters,
            success: response.success,
            duration: response.metadata.duration,
            timestamp: response.metadata.timestamp,
            error: response.error?.message
        });
        return response;
    }
    /**
    * Invoke tool with automatic parameter inference
    */
    async invokeToolSmart(toolId, operation, context, userParameters) {
        const tool = this.getTool(toolId);
        if (!tool) {
            throw new Error(`Tool not found: ${toolId}`);
        }
        // Infer parameters from context
        const inferredParameters = this.inferParameters(tool, context);
        // Merge with user parameters (user parameters take precedence)
        const parameters = {
            ...inferredParameters,
            ...userParameters
        };
        return this.invokeTool(toolId, operation, parameters);
    }
    /**
    * Infer parameters from context
    */
    inferParameters(tool, context) {
        const parameters = {};
        for (const param of tool.parameters) {
            // Try to infer from context
            if (param.name === 'workspaceRoot' && context.workspaceRoot) {
                parameters[param.name] = context.workspaceRoot;
            }
            else if (param.name === 'file' && context.currentFile) {
                parameters[param.name] = context.currentFile;
            }
            else if (param.name === 'language' && context.language) {
                parameters[param.name] = context.language;
            }
            else if (param.name === 'projectType' && context.projectType) {
                parameters[param.name] = context.projectType;
            }
            else if (param.default !== undefined) {
                // Use default value
                parameters[param.name] = param.default;
            }
        }
        return parameters;
    }
    /**
    * Record tool invocation
    */
    recordInvocation(invocation) {
        this.invocationHistory.push(invocation);
        // Limit history size
        if (this.invocationHistory.length > this.maxHistorySize) {
            this.invocationHistory.shift();
        }
    }
    /**
    * Get tool success rate
    */
    getToolSuccessRate(toolId) {
        const invocations = this.invocationHistory.filter(inv => inv.toolId === toolId);
        if (invocations.length === 0) {
            return 0.5; // Neutral for unknown tools
        }
        const successful = invocations.filter(inv => inv.success).length;
        return successful / invocations.length;
    }
    /**
    * Get invocation history for a tool
    */
    getToolHistory(toolId) {
        return this.invocationHistory.filter(inv => inv.toolId === toolId);
    }
    /**
    * Get statistics
    */
    getStatistics() {
        const stats = this.mcpClient.getStatistics();
        const totalInvocations = this.invocationHistory.length;
        const successful = this.invocationHistory.filter(inv => inv.success).length;
        const successRate = totalInvocations > 0 ? successful / totalInvocations : 0;
        const totalDuration = this.invocationHistory.reduce((sum, inv) => sum + inv.duration, 0);
        const averageDuration = totalInvocations > 0 ? totalDuration / totalInvocations : 0;
        // Count tool usage
        const toolUsage = new Map();
        for (const inv of this.invocationHistory) {
            toolUsage.set(inv.toolId, (toolUsage.get(inv.toolId) || 0) + 1);
        }
        const mostUsedTools = Array.from(toolUsage.entries())
            .map(([toolId, count]) => ({ toolId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        return {
            totalTools: stats.toolCount,
            totalInvocations,
            successRate,
            averageDuration,
            toolsByCategory: stats.categories,
            mostUsedTools
        };
    }
    /**
    * Clear invocation history
    */
    clearHistory() {
        this.invocationHistory = [];
    }
    /**
    * Export invocation history
    */
    exportHistory() {
        return [...this.invocationHistory];
    }
    /**
    * Dispose resources
    */
    async dispose() {
        await this.mcpClient.dispose();
        this.invocationHistory = [];
    }
}
exports.MCPToolRegistry = MCPToolRegistry;
//# sourceMappingURL=mcpToolRegistry.js.map