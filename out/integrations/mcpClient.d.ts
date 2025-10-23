/**
 * MCP (Model Context Protocol) Client
 *
 * Implements the Model Context Protocol for connecting to 100+ external tools:
 * - Databases (PostgreSQL, MongoDB, Redis, etc.)
 * - APIs (REST, GraphQL, gRPC)
 * - Cloud Services (AWS, GCP, Azure)
 * - Development Tools (Git, Docker, Kubernetes)
 * - File Systems (Local, S3, FTP)
 * - Communication (Slack, Discord, Email)
 *
 * Features:
 * - Dynamic tool discovery
 * - Secure authentication
 * - Result caching
 * - Error recovery
 * - Rate limiting
 */
import { ConfigurationManager } from '../core/configurationManager';
import { CacheManager } from '../cache/cacheManager';
export interface MCPTool {
    id: string;
    name: string;
    description: string;
    category: 'database' | 'api' | 'cloud' | 'devtools' | 'filesystem' | 'communication' | 'other';
    version: string;
    capabilities: string[];
    authentication: {
        type: 'none' | 'api-key' | 'oauth' | 'basic' | 'token';
        required: boolean;
    };
    parameters: MCPParameter[];
    rateLimit?: {
        requests: number;
        period: 'second' | 'minute' | 'hour' | 'day';
    };
}
export interface MCPParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    required: boolean;
    default?: unknown;
    validation?: {
        pattern?: string;
        min?: number;
        max?: number;
        enum?: unknown[];
    };
}
export interface MCPRequest {
    toolId: string;
    operation: string;
    parameters: Record<string, unknown>;
    authentication?: Record<string, string>;
    options?: {
        timeout?: number;
        retries?: number;
        cache?: boolean;
    };
}
export interface MCPResponse {
    success: boolean;
    data?: unknown;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    metadata: {
        toolId: string;
        operation: string;
        duration: number;
        cached: boolean;
        timestamp: number;
    };
}
export interface MCPServerConfig {
    url: string;
    apiKey?: string;
    timeout: number;
    maxRetries: number;
}
export declare class MCPClient {
    private configManager;
    private cacheManager;
    private client;
    private config;
    private tools;
    private isInitialized;
    private rateLimiters;
    constructor(configManager: ConfigurationManager, cacheManager: CacheManager);
    /**
    * Initialize MCP client and discover available tools
    */
    initialize(): Promise<void>;
    /**
    * Check MCP server health
    */
    checkHealth(): Promise<boolean>;
    /**
    * Discover available tools from MCP server
    */
    discoverTools(): Promise<MCPTool[]>;
    /**
    * Get all available tools
    */
    getTools(): MCPTool[];
    /**
    * Get tool by ID
    */
    getTool(toolId: string): MCPTool | undefined;
    /**
    * Search tools by category or capability
    */
    searchTools(query: {
        category?: string;
        capability?: string;
        name?: string;
    }): MCPTool[];
    /**
    * Invoke a tool
    */
    invokeTool(request: MCPRequest): Promise<MCPResponse>;
    /**
    * Validate parameters against tool schema
    */
    private validateParameters;
    /**
    * Generate cache key for request
    */
    private getCacheKey;
    /**
    * Get statistics
    */
    getStatistics(): {
        toolCount: number;
        categories: Record<string, number>;
    };
    /**
    * Dispose resources
    */
    dispose(): Promise<void>;
}
//# sourceMappingURL=mcpClient.d.ts.map