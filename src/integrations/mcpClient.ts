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

import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';
import { ConfigurationManager } from '../core/configurationManager';
import { CacheManager } from '../cache/cacheManager';
import { createLogger } from '../utils/logger';

const logger = createLogger('MCPClient');

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

export class MCPClient {
 private client: AxiosInstance;
 private config: MCPServerConfig;
 private tools: Map<string, MCPTool> = new Map();
 private isInitialized = false;
 private rateLimiters: Map<string, RateLimiter> = new Map();

 constructor(
 private configManager: ConfigurationManager,
 private cacheManager: CacheManager
 ) {
 // Get MCP server configuration from VS Code settings
 const config = vscode.workspace.getConfiguration('codelicious');

 this.config = {
 url: config.get('mcp.server.url', 'http://localhost:3100'),
 apiKey: config.get('mcp.server.apiKey', ''),
 timeout: config.get('mcp.server.timeout', 30000),
 maxRetries: config.get('mcp.server.maxRetries', 3)
 };

 // Create HTTP client
 this.client = axios.create({
 baseURL: this.config.url,
 timeout: this.config.timeout,
 headers: {
 'Content-Type': 'application/json',
 ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
 }
 });
 }

 /**
 * Initialize MCP client and discover available tools
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) {
 return;
 }

 try {
 logger.info(' Initializing MCP Client...');

 // Check server health
 const health = await this.checkHealth();
 if (!health) {
 logger.warn('MCP server not available - external tools will be disabled');
 return;
 }

 // Discover available tools
 await this.discoverTools();

 this.isInitialized = true;
 logger.info(`MCP Client initialized with ${this.tools.size} tools`);
 } catch (error) {
 logger.error('Failed to initialize MCP client:', error);
 throw error;
 }
 }

 /**
 * Check MCP server health
 */
 async checkHealth(): Promise<boolean> {
 try {
 const response = await this.client.get('/health');
 return response.data.status === 'ok';
 } catch (error) {
 return false;
 }
 }

 /**
 * Discover available tools from MCP server
 */
 async discoverTools(): Promise<MCPTool[]> {
 try {
 const response = await this.client.get<{ tools: MCPTool[] }>('/tools');
 const tools = response.data.tools;

 // Register tools
 for (const tool of tools) {
 this.tools.set(tool.id, tool);

 // Initialize rate limiter if needed
 if (tool.rateLimit) {
 this.rateLimiters.set(tool.id, new RateLimiter(
 tool.rateLimit.requests,
 tool.rateLimit.period
 ));
 }
 }

 logger.info(`Discovered ${tools.length} MCP tools`);
 return tools;
 } catch (error) {
 logger.error('Failed to discover tools:', error);
 return [];
 }
 }

 /**
 * Get all available tools
 */
 getTools(): MCPTool[] {
 return Array.from(this.tools.values());
 }

 /**
 * Get tool by ID
 */
 getTool(toolId: string): MCPTool | undefined {
 return this.tools.get(toolId);
 }

 /**
 * Search tools by category or capability
 */
 searchTools(query: {
 category?: string;
 capability?: string;
 name?: string;
 }): MCPTool[] {
 return this.getTools().filter(tool => {
 if (query.category && tool.category !== query.category) {
 return false;
 }
 if (query.capability && !tool.capabilities.includes(query.capability)) {
 return false;
 }
 if (query.name && !tool.name.toLowerCase().includes(query.name.toLowerCase())) {
 return false;
 }
 return true;
 });
 }

 /**
 * Invoke a tool
 */
 async invokeTool(request: MCPRequest): Promise<MCPResponse> {
 const startTime = Date.now();

 try {
 // Validate tool exists
 const tool = this.tools.get(request.toolId);
 if (!tool) {
 throw new Error(`Tool not found: ${request.toolId}`);
 }

 // Check rate limit
 const rateLimiter = this.rateLimiters.get(request.toolId);
 if (rateLimiter && !rateLimiter.tryAcquire()) {
 throw new Error(`Rate limit exceeded for tool: ${request.toolId}`);
 }

 // Check cache if enabled
 if (request.options?.cache !== false) {
 const cacheKey = this.getCacheKey(request);
 const cached = await this.cacheManager.get(cacheKey);
 if (cached) {
 return {
 success: true,
 data: cached,
 metadata: {
 toolId: request.toolId,
 operation: request.operation,
 duration: Date.now() - startTime,
 cached: true,
 timestamp: Date.now()
 }
 };
 }
 }

 // Validate parameters
 this.validateParameters(tool, request.parameters);

 // Invoke tool
 const response = await this.client.post<any>(`/tools/${request.toolId}/invoke`, {
 operation: request.operation,
 parameters: request.parameters,
 authentication: request.authentication
 }, {
 timeout: request.options?.timeout || this.config.timeout
 });

 const result: MCPResponse = {
 success: true,
 data: response.data,
 metadata: {
 toolId: request.toolId,
 operation: request.operation,
 duration: Date.now() - startTime,
 cached: false,
 timestamp: Date.now()
 }
 };

 // Cache result if enabled
 if (request.options?.cache !== false) {
 const cacheKey = this.getCacheKey(request);
 await this.cacheManager.set(cacheKey, result.data, { ttl: 5 * 60 * 1000 }); // 5 minutes
 }

 return result;
 } catch (error: unknown) {
 const err = error as any; // MCP error response structure
 return {
 success: false,
 error: {
 code: err.response?.data?.code || 'INVOCATION_ERROR',
 message: err.response?.data?.message || err.message,
 details: err.response?.data?.details
 },
 metadata: {
 toolId: request.toolId,
 operation: request.operation,
 duration: Date.now() - startTime,
 cached: false,
 timestamp: Date.now()
 }
 };
 }
 }

 /**
 * Validate parameters against tool schema
 */
 private validateParameters(tool: MCPTool, parameters: Record<string, any>): void {
 for (const param of tool.parameters) {
 // Check required parameters
 if (param.required && !(param.name in parameters)) {
 throw new Error(`Missing required parameter: ${param.name}`);
 }

 const value = parameters[param.name];
 if (value === undefined) {
 continue;
 }

 // Type validation
 const actualType = Array.isArray(value) ? 'array' : typeof value;
 if (actualType !== param.type) {
 throw new Error(`Invalid type for ${param.name}: expected ${param.type}, got ${actualType}`);
 }

 // Additional validation
 if (param.validation) {
 if (param.validation.pattern && typeof value === 'string') {
 const regex = new RegExp(param.validation.pattern);
 if (!regex.test(value)) {
 throw new Error(`Invalid format for ${param.name}`);
 }
 }

 if (param.validation.min !== undefined && typeof value === 'number') {
 if (value < param.validation.min) {
 throw new Error(`${param.name} must be >= ${param.validation.min}`);
 }
 }

 if (param.validation.max !== undefined && typeof value === 'number') {
 if (value > param.validation.max) {
 throw new Error(`${param.name} must be <= ${param.validation.max}`);
 }
 }

 if (param.validation.enum && !param.validation.enum.includes(value)) {
 throw new Error(`${param.name} must be one of: ${param.validation.enum.join(', ')}`);
 }
 }
 }
 }

 /**
 * Generate cache key for request
 */
 private getCacheKey(request: MCPRequest): string {
 const key = `mcp:${request.toolId}:${request.operation}:${JSON.stringify(request.parameters)}`;
 return key;
 }

 /**
 * Get statistics
 */
 getStatistics(): {
 toolCount: number;
 categories: Record<string, number>;
 } {
 const categories: Record<string, number> = {};

 for (const tool of this.tools.values()) {
 categories[tool.category] = (categories[tool.category] || 0) + 1;
 }

 return {
 toolCount: this.tools.size,
 categories
 };
 }

 /**
 * Dispose resources
 */
 async dispose(): Promise<void> {
 this.tools.clear();
 this.rateLimiters.clear();
 }
}

/**
 * Simple rate limiter using token bucket algorithm
 */
class RateLimiter {
 private tokens: number;
 private lastRefill: number;
 private readonly maxTokens: number;
 private readonly refillRate: number; // tokens per millisecond

 constructor(requests: number, period: 'second' | 'minute' | 'hour' | 'day') {
 this.maxTokens = requests;
 this.tokens = requests;
 this.lastRefill = Date.now();

 // Calculate refill rate (tokens per millisecond)
 const periodMs = {
 'second': 1000,
 'minute': 60 * 1000,
 'hour': 60 * 60 * 1000,
 'day': 24 * 60 * 60 * 1000
 }[period];

 this.refillRate = requests / periodMs;
 }

 tryAcquire(): boolean {
 this.refill();

 if (this.tokens >= 1) {
 this.tokens -= 1;
 return true;
 }

 return false;
 }

 private refill(): void {
 const now = Date.now();
 const timePassed = now - this.lastRefill;
 const tokensToAdd = timePassed * this.refillRate;

 this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
 this.lastRefill = now;
 }
}

