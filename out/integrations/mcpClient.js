"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPClient = void 0;
const axios_1 = __importDefault(require("axios"));
const vscode = __importStar(require("vscode"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('MCPClient');
class MCPClient {
    constructor(configManager, cacheManager) {
        this.configManager = configManager;
        this.cacheManager = cacheManager;
        this.tools = new Map();
        this.isInitialized = false;
        this.rateLimiters = new Map();
        // Get MCP server configuration from VS Code settings
        const config = vscode.workspace.getConfiguration('codelicious');
        this.config = {
            url: config.get('mcp.server.url', 'http://localhost:3100'),
            apiKey: config.get('mcp.server.apiKey', ''),
            timeout: config.get('mcp.server.timeout', 30000),
            maxRetries: config.get('mcp.server.maxRetries', 3)
        };
        // Create HTTP client
        this.client = axios_1.default.create({
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
    async initialize() {
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
        }
        catch (error) {
            logger.error('Failed to initialize MCP client:', error);
            throw error;
        }
    }
    /**
    * Check MCP server health
    */
    async checkHealth() {
        try {
            const response = await this.client.get('/health');
            return response.data.status === 'ok';
        }
        catch (error) {
            return false;
        }
    }
    /**
    * Discover available tools from MCP server
    */
    async discoverTools() {
        try {
            const response = await this.client.get('/tools');
            const tools = response.data.tools;
            // Register tools
            for (const tool of tools) {
                this.tools.set(tool.id, tool);
                // Initialize rate limiter if needed
                if (tool.rateLimit) {
                    this.rateLimiters.set(tool.id, new RateLimiter(tool.rateLimit.requests, tool.rateLimit.period));
                }
            }
            logger.info(`Discovered ${tools.length} MCP tools`);
            return tools;
        }
        catch (error) {
            logger.error('Failed to discover tools:', error);
            return [];
        }
    }
    /**
    * Get all available tools
    */
    getTools() {
        return Array.from(this.tools.values());
    }
    /**
    * Get tool by ID
    */
    getTool(toolId) {
        return this.tools.get(toolId);
    }
    /**
    * Search tools by category or capability
    */
    searchTools(query) {
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
    async invokeTool(request) {
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
            const response = await this.client.post(`/tools/${request.toolId}/invoke`, {
                operation: request.operation,
                parameters: request.parameters,
                authentication: request.authentication
            }, {
                timeout: request.options?.timeout || this.config.timeout
            });
            const result = {
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
        }
        catch (error) {
            const err = error; // MCP error response structure
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
    validateParameters(tool, parameters) {
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
    getCacheKey(request) {
        const key = `mcp:${request.toolId}:${request.operation}:${JSON.stringify(request.parameters)}`;
        return key;
    }
    /**
    * Get statistics
    */
    getStatistics() {
        const categories = {};
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
    async dispose() {
        this.tools.clear();
        this.rateLimiters.clear();
    }
}
exports.MCPClient = MCPClient;
/**
 * Simple rate limiter using token bucket algorithm
 */
class RateLimiter {
    constructor(requests, period) {
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
    tryAcquire() {
        this.refill();
        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }
        return false;
    }
    refill() {
        const now = Date.now();
        const timePassed = now - this.lastRefill;
        const tokensToAdd = timePassed * this.refillRate;
        this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }
}
//# sourceMappingURL=mcpClient.js.map