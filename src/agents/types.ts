/**
 * Multi-Agent System Types
 *
 * Defines the types and interfaces for the multi-agent AI system.
 */

import { Message } from '../types';

/**
 * Agent roles in the system
 */
export enum AgentRole {
 PRE_FILTER = 'pre_filter',
 CODE_GENERATOR = 'code_generator',
 SECURITY_REVIEWER = 'security_reviewer',
 QUALITY_REVIEWER = 'quality_reviewer',
 TESTING_VALIDATOR = 'testing_validator',
 ORCHESTRATOR = 'orchestrator'
}

/**
 * Agent task types
 */
export enum AgentTaskType {
 OPTIMIZE_PROMPT = 'optimize_prompt',
 GENERATE_CODE = 'generate_code',
 REVIEW_SECURITY = 'review_security',
 REVIEW_QUALITY = 'review_quality',
 GENERATE_TESTS = 'generate_tests',
 VALIDATE_TESTS = 'validate_tests',
 ORCHESTRATE = 'orchestrate'
}

/**
 * Agent task priority
 */
export enum AgentPriority {
 LOW = 'low',
 MEDIUM = 'medium',
 HIGH = 'high',
 CRITICAL = 'critical'
}

/**
 * Agent task status
 */
export enum AgentTaskStatus {
 PENDING = 'pending',
 IN_PROGRESS = 'in_progress',
 COMPLETED = 'completed',
 FAILED = 'failed',
 CANCELLED = 'cancelled'
}

/**
 * Context for agent tasks
 */
export interface AgentContext {
 // Workspace information
 workspaceRoot: string;
 currentFile?: string;
 openFiles: string[];

 // Codebase context
 codebaseContext?: string;
 relevantFiles?: string[];
 dependencies?: string[];

 // User context
 userPrompt: string;
 conversationHistory: Message[];

 // Task context
 taskType: AgentTaskType;
 priority: AgentPriority;

 // Additional metadata
 metadata: Record<string, any>;
}

/**
 * Agent task definition
 */
export interface AgentTask {
 id: string;
 type: AgentTaskType;
 role: AgentRole;
 context: AgentContext;
 priority: AgentPriority;
 status: AgentTaskStatus;
 createdAt: number;
 startedAt?: number;
 completedAt?: number;
 result?: AgentTaskResult;
 error?: string;
}

/**
 * Agent task result
 */
export interface AgentTaskResult {
 success: boolean;
 data: unknown;
 confidence: number; // 0-1
 reasoning?: string;
 suggestions?: string[];
 warnings?: string[];
 errors?: string[];
 metadata?: Record<string, any>;
}

/**
 * Pre-filter agent result
 */
export interface PreFilterResult extends AgentTaskResult {
 data: {
 optimizedPrompt: string;
 clarifications: string[];
 contextAdded: string[];
 estimatedComplexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
 };
}

/**
 * Code generation result
 */
export interface CodeGenerationResult extends AgentTaskResult {
 data: {
 code: string;
 language: string;
 filePath?: string;
 explanation: string;
 dependencies?: string[];
 };
}

/**
 * Security review result
 */
export interface SecurityReviewResult extends AgentTaskResult {
 data: {
 vulnerabilities: SecurityVulnerability[];
 securityScore: number; // 0-100
 recommendations: string[];
 approved: boolean;
 };
}

/**
 * Security vulnerability
 */
export interface SecurityVulnerability {
 severity: 'low' | 'medium' | 'high' | 'critical';
 type: string;
 description: string;
 location?: {
 file?: string;
 line?: number;
 column?: number;
 };
 recommendation: string;
 cwe?: string; // Common Weakness Enumeration ID
}

/**
 * Quality review result
 */
export interface QualityReviewResult extends AgentTaskResult {
 data: {
 issues: QualityIssue[];
 qualityScore: number; // 0-100
 recommendations: string[];
 approved: boolean;
 };
}

/**
 * Quality issue
 */
export interface QualityIssue {
 severity: 'low' | 'medium' | 'high';
 category: 'performance' | 'maintainability' | 'correctness' | 'style' | 'complexity';
 description: string;
 location?: {
 file?: string;
 line?: number;
 column?: number;
 };
 recommendation: string;
}

/**
 * Testing validation result
 */
export interface TestingValidationResult extends AgentTaskResult {
 data: {
 testsGenerated: GeneratedTest[];
 testResults?: TestExecutionResult[];
 coverageEstimate?: number;
 approved: boolean;
 };
}

/**
 * Generated test
 */
export interface GeneratedTest {
 name: string;
 description: string;
 code: string;
 filePath: string;
 framework: string;
}

/**
 * Test execution result
 */
export interface TestExecutionResult {
 testName: string;
 passed: boolean;
 duration: number;
 error?: string;
 output?: string;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
 role: AgentRole;
 enabled: boolean;
 model?: string;
 temperature?: number;
 maxTokens?: number;
 timeout?: number;
 retries?: number;
 systemPrompt?: string;
}

/**
 * Multi-agent workflow
 */
export interface AgentWorkflow {
 id: string;
 name: string;
 description: string;
 steps: AgentWorkflowStep[];
 context: AgentContext;
 status: AgentTaskStatus;
 results: Map<AgentRole, AgentTaskResult>;
 startedAt?: number;
 completedAt?: number;
 tasks?: unknown[]; // For workflow visualization
}

/**
 * Agent workflow step
 */
export interface AgentWorkflowStep {
 role: AgentRole;
 taskType: AgentTaskType;
 dependsOn?: AgentRole[];
 optional?: boolean;
 config?: Partial<AgentConfig>;
}

/**
 * Agent performance metrics
 */
export interface AgentMetrics {
 role: AgentRole;
 tasksCompleted: number;
 tasksFailed: number;
 averageConfidence: number;
 averageDuration: number;
 successRate: number;
 lastUsed?: number;
}

/**
 * Agent collaboration result
 */
export interface AgentCollaborationResult {
 success: boolean;
 finalOutput: unknown;
 agentResults: Map<AgentRole, AgentTaskResult>;
 workflow: AgentWorkflow;
 duration: number;
 totalCost: number;
 summary: string;
}

