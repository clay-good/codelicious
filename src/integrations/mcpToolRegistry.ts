/**
 * MCP Tool Registry
 *
 * Central registry for managing MCP tools and their invocations.
 * Provides high-level interface for autonomous agents to discover and use external tools.
 */

import * as vscode from 'vscode';
import { MCPClient, MCPTool, MCPRequest, MCPResponse } from './mcpClient';
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
 relevance: number; // 0-1
 reason: string;
 suggestedParameters?: Record<string, any>;
}

export class MCPToolRegistry {
 private mcpClient: MCPClient;
 private invocationHistory: ToolInvocation[] = [];
 private maxHistorySize = 100;

 constructor(
 private configManager: ConfigurationManager,
 private cacheManager: CacheManager
 ) {
 this.mcpClient = new MCPClient(configManager, cacheManager);
 }

 /**
 * Initialize the registry
 */
 async initialize(): Promise<void> {
 await this.mcpClient.initialize();
 }

 /**
 * Get all available tools
 */
 getAvailableTools(): MCPTool[] {
 return this.mcpClient.getTools();
 }

 /**
 * Get tool by ID
 */
 getTool(toolId: string): MCPTool | undefined {
 return this.mcpClient.getTool(toolId);
 }

 /**
 * Search tools by query
 */
 searchTools(query: string): MCPTool[] {
 const lowerQuery = query.toLowerCase();
 return this.getAvailableTools().filter(tool =>
 tool.name.toLowerCase().includes(lowerQuery) ||
 tool.description.toLowerCase().includes(lowerQuery) ||
 tool.capabilities.some(cap => cap.toLowerCase().includes(lowerQuery))
 );
 }

 /**
 * Get tools by category
 */
 getToolsByCategory(category: string): MCPTool[] {
 return this.mcpClient.searchTools({ category });
 }

 /**
 * Recommend tools based on context
 */
 async recommendTools(
 task: string,
 context: ToolInvocationContext
 ): Promise<ToolRecommendation[]> {
 const tools = this.getAvailableTools();
 const recommendations: ToolRecommendation[] = [];

 const taskLower = task.toLowerCase();

 for (const tool of tools) {
 let relevance = 0;
 const reasons: string[] = [];

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
 async invokeTool(
 toolId: string,
 operation: string,
 parameters: Record<string, any>,
 options?: {
 authentication?: Record<string, string>;
 timeout?: number;
 retries?: number;
 cache?: boolean;
 }
 ): Promise<MCPResponse> {
 const request: MCPRequest = {
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
 async invokeToolSmart(
 toolId: string,
 operation: string,
 context: ToolInvocationContext,
 userParameters?: Record<string, any>
 ): Promise<MCPResponse> {
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
 private inferParameters(
 tool: MCPTool,
 context: ToolInvocationContext
 ): Record<string, any> {
 const parameters: Record<string, any> = {};

 for (const param of tool.parameters) {
 // Try to infer from context
 if (param.name === 'workspaceRoot' && context.workspaceRoot) {
 parameters[param.name] = context.workspaceRoot;
 } else if (param.name === 'file' && context.currentFile) {
 parameters[param.name] = context.currentFile;
 } else if (param.name === 'language' && context.language) {
 parameters[param.name] = context.language;
 } else if (param.name === 'projectType' && context.projectType) {
 parameters[param.name] = context.projectType;
 } else if (param.default !== undefined) {
 // Use default value
 parameters[param.name] = param.default;
 }
 }

 return parameters;
 }

 /**
 * Record tool invocation
 */
 private recordInvocation(invocation: ToolInvocation): void {
 this.invocationHistory.push(invocation);

 // Limit history size
 if (this.invocationHistory.length > this.maxHistorySize) {
 this.invocationHistory.shift();
 }
 }

 /**
 * Get tool success rate
 */
 private getToolSuccessRate(toolId: string): number {
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
 getToolHistory(toolId: string): ToolInvocation[] {
 return this.invocationHistory.filter(inv => inv.toolId === toolId);
 }

 /**
 * Get statistics
 */
 getStatistics(): {
 totalTools: number;
 totalInvocations: number;
 successRate: number;
 averageDuration: number;
 toolsByCategory: Record<string, number>;
 mostUsedTools: Array<{ toolId: string; count: number }>;
 } {
 const stats = this.mcpClient.getStatistics();

 const totalInvocations = this.invocationHistory.length;
 const successful = this.invocationHistory.filter(inv => inv.success).length;
 const successRate = totalInvocations > 0 ? successful / totalInvocations : 0;

 const totalDuration = this.invocationHistory.reduce((sum, inv) => sum + inv.duration, 0);
 const averageDuration = totalInvocations > 0 ? totalDuration / totalInvocations : 0;

 // Count tool usage
 const toolUsage = new Map<string, number>();
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
 clearHistory(): void {
 this.invocationHistory = [];
 }

 /**
 * Export invocation history
 */
 exportHistory(): ToolInvocation[] {
 return [...this.invocationHistory];
 }

 /**
 * Dispose resources
 */
 async dispose(): Promise<void> {
 await this.mcpClient.dispose();
 this.invocationHistory = [];
 }
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

