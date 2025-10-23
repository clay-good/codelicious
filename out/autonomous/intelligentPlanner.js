"use strict";
/**
 * Intelligent Planning System - Create execution plans with dependency mapping
 *
 * Matches Augment's intelligent planning with cross-service dependency mapping
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligentPlanner = void 0;
const orchestrator_1 = require("../models/orchestrator");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('IntelligentPlanner');
class IntelligentPlanner {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
    * Create execution plan from requirements and architectural context
    */
    async createPlan(requirements, context) {
        logger.info('Creating execution plan...');
        const prompt = this.buildPlanningPrompt(requirements, context);
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert software architect. Create detailed execution plans for implementing requirements.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.2,
            maxTokens: 6000
        }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
        const plan = this.parsePlanResponse(response.content, requirements);
        logger.info('Execution plan created');
        return plan;
    }
    /**
    * Build prompt for planning
    */
    buildPlanningPrompt(requirements, context) {
        return `Create a detailed execution plan for implementing these requirements.

REQUIREMENTS:
${JSON.stringify(requirements, null, 2)}

ARCHITECTURAL CONTEXT:
- Relevant Files: ${context.relevantFiles.length}
- Detected Patterns: ${context.patterns.map(p => p.type).join(', ')}
- Dependencies: ${context.dependencies.length}
- Total Context Tokens: ${context.totalTokens}

CODEBASE CONTEXT:
${context.assembledContext.substring(0, 10000)}

Create a comprehensive execution plan with:

1. **File Operations**: Which files to create/modify/delete
2. **Dependencies**: What packages to install
3. **Integration Points**: Where new code connects to existing code
4. **Execution Order**: Step-by-step implementation sequence
5. **Rollback Strategy**: How to undo changes if needed
6. **Patterns**: Which architectural patterns to follow
7. **Risks**: Potential issues and mitigation strategies

Return a JSON object with this structure:
{
 "fileOperations": [
 {
 "type": "create|modify|delete",
 "path": "src/path/to/file.ts",
 "reason": "Why this operation is needed",
 "priority": 1,
 "dependencies": ["other/file.ts"]
 }
 ],
 "dependenciesToInstall": [
 {
 "package": "package-name",
 "version": "^1.0.0",
 "type": "production|development",
 "reason": "Why this dependency is needed"
 }
 ],
 "integrationPoints": [
 {
 "file": "src/existing/file.ts",
 "function": "existingFunction",
 "description": "How new code integrates",
 "risk": "low|medium|high"
 }
 ],
 "executionOrder": [
 "Step 1: Install dependencies",
 "Step 2: Create base files",
 "Step 3: Implement core logic",
 "Step 4: Add tests",
 "Step 5: Integrate with existing code"
 ],
 "rollbackStrategy": {
 "checkpoints": ["After step 1", "After step 3"],
 "rollbackSteps": ["Remove new files", "Uninstall dependencies"],
 "validationTests": ["test1", "test2"]
 },
 "estimatedDuration": 4,
 "patterns": ["pattern1", "pattern2"],
 "risks": ["risk1", "risk2"]
}

Be specific and detailed. Consider the existing codebase architecture.`;
    }
    /**
    * Parse planning response
    */
    parsePlanResponse(content, requirements) {
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                id: `PLAN-${Date.now()}`,
                requirements,
                fileOperations: parsed.fileOperations || [],
                dependenciesToInstall: parsed.dependenciesToInstall || [],
                integrationPoints: parsed.integrationPoints || [],
                executionOrder: parsed.executionOrder || [],
                rollbackStrategy: parsed.rollbackStrategy || {
                    checkpoints: [],
                    rollbackSteps: [],
                    validationTests: []
                },
                estimatedDuration: parsed.estimatedDuration || 4,
                patterns: parsed.patterns || [],
                risks: parsed.risks || []
            };
        }
        catch (error) {
            logger.error('Failed to parse plan response:', error);
            // Return fallback plan
            return {
                id: `PLAN-${Date.now()}`,
                requirements,
                fileOperations: requirements.mainRequirement.affectedFiles.map(file => ({
                    type: 'modify',
                    path: file,
                    reason: 'Implement requirement',
                    priority: 1,
                    dependencies: []
                })),
                dependenciesToInstall: [],
                integrationPoints: [],
                executionOrder: [
                    'Step 1: Analyze existing code',
                    'Step 2: Implement changes',
                    'Step 3: Add tests',
                    'Step 4: Validate'
                ],
                rollbackStrategy: {
                    checkpoints: ['Before changes'],
                    rollbackSteps: ['Revert changes'],
                    validationTests: ['Run existing tests']
                },
                estimatedDuration: 4,
                patterns: [],
                risks: ['Plan parsing failed - manual review needed']
            };
        }
    }
    /**
    * Optimize execution order based on dependencies
    */
    optimizeExecutionOrder(plan) {
        logger.info('Optimizing execution order...');
        // Build dependency graph
        const graph = new Map();
        for (const op of plan.fileOperations) {
            graph.set(op.path, op.dependencies);
        }
        // Topological sort
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = (path) => {
            if (visited.has(path))
                return;
            if (visiting.has(path)) {
                logger.warn(`Circular dependency detected: ${path}`);
                return;
            }
            visiting.add(path);
            const deps = graph.get(path) || [];
            for (const dep of deps) {
                visit(dep);
            }
            visiting.delete(path);
            visited.add(path);
            sorted.push(path);
        };
        for (const op of plan.fileOperations) {
            visit(op.path);
        }
        // Update execution order
        const optimizedOrder = [
            'Step 1: Install dependencies',
            ...sorted.map((path, i) => `Step ${i + 2}: Process ${path}`),
            `Step ${sorted.length + 2}: Run tests`,
            `Step ${sorted.length + 3}: Validate integration`
        ];
        return {
            ...plan,
            executionOrder: optimizedOrder
        };
    }
    /**
    * Validate plan feasibility
    */
    validatePlan(plan) {
        const issues = [];
        let score = 100;
        // Check file operations
        if (plan.fileOperations.length === 0) {
            issues.push('No file operations defined');
            score -= 30;
        }
        // Check execution order
        if (plan.executionOrder.length === 0) {
            issues.push('No execution order defined');
            score -= 20;
        }
        // Check rollback strategy
        if (plan.rollbackStrategy.rollbackSteps.length === 0) {
            issues.push('No rollback strategy defined');
            score -= 15;
        }
        // Check integration points for high-risk operations
        const highRiskOps = plan.fileOperations.filter(op => op.type === 'delete');
        if (highRiskOps.length > 0 && plan.rollbackStrategy.checkpoints.length === 0) {
            issues.push('High-risk operations without checkpoints');
            score -= 25;
        }
        // Check circular dependencies
        const graph = new Map();
        for (const op of plan.fileOperations) {
            graph.set(op.path, op.dependencies);
        }
        const hasCircular = this.detectCircularDependencies(graph);
        if (hasCircular) {
            issues.push('Circular dependencies detected');
            score -= 20;
        }
        return {
            isValid: issues.length === 0,
            issues,
            score: Math.max(0, score)
        };
    }
    /**
    * Detect circular dependencies
    */
    detectCircularDependencies(graph) {
        const visited = new Set();
        const visiting = new Set();
        const visit = (node) => {
            if (visited.has(node))
                return false;
            if (visiting.has(node))
                return true;
            visiting.add(node);
            const deps = graph.get(node) || [];
            for (const dep of deps) {
                if (visit(dep))
                    return true;
            }
            visiting.delete(node);
            visited.add(node);
            return false;
        };
        for (const node of graph.keys()) {
            if (visit(node))
                return true;
        }
        return false;
    }
}
exports.IntelligentPlanner = IntelligentPlanner;
//# sourceMappingURL=intelligentPlanner.js.map