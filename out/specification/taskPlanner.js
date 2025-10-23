"use strict";
/**
 * Task Planner
 *
 * Plans and schedules tasks from parsed specifications,
 * handling dependencies and optimizing execution order.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskPlanner = void 0;
const specificationParser_1 = require("./specificationParser");
class TaskPlanner {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Create an execution plan from a parsed specification
    */
    async plan(spec) {
        // Validate specification
        this.validateSpecification(spec);
        // Sort tasks by dependencies
        const sortedTasks = this.topologicalSort(spec.tasks);
        // Group tasks into phases
        const phases = this.groupIntoPhases(sortedTasks);
        // Calculate critical path
        const criticalPath = this.calculateCriticalPath(sortedTasks);
        // Find parallelizable tasks
        const parallelizable = this.findParallelizableTasks(sortedTasks);
        // Calculate total time
        const totalTime = this.calculateTotalTime(phases);
        // Generate warnings
        const warnings = this.generateWarnings(spec, phases);
        return {
            phases,
            totalTime,
            criticalPath,
            parallelizable,
            warnings
        };
    }
    /**
    * Validate specification for planning
    */
    validateSpecification(spec) {
        if (spec.tasks.length === 0) {
            throw new Error('Specification has no tasks');
        }
        // Check for circular dependencies
        const circular = this.detectCircularDependencies(spec.tasks);
        if (circular.length > 0) {
            throw new Error(`Circular dependencies detected: ${circular.join(', ')}`);
        }
        // Check for missing dependencies
        const taskIds = new Set(spec.tasks.map(t => t.id));
        for (const task of spec.tasks) {
            for (const depId of task.dependencies) {
                if (!taskIds.has(depId)) {
                    throw new Error(`Task ${task.id} depends on non-existent task ${depId}`);
                }
            }
        }
    }
    /**
    * Topological sort of tasks based on dependencies
    */
    topologicalSort(tasks) {
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = (task, order) => {
            if (visited.has(task.id)) {
                return order;
            }
            if (visiting.has(task.id)) {
                throw new Error(`Circular dependency detected at task ${task.id}`);
            }
            visiting.add(task.id);
            // Visit dependencies first
            let currentOrder = order;
            for (const depId of task.dependencies) {
                const depTask = tasks.find(t => t.id === depId);
                if (depTask) {
                    currentOrder = visit(depTask, currentOrder);
                }
            }
            visiting.delete(task.id);
            visited.add(task.id);
            // Add to sorted list
            sorted.push({
                ...task,
                order: currentOrder,
                canParallelize: task.dependencies.length === 0
            });
            return currentOrder + 1;
        };
        let order = 0;
        for (const task of tasks) {
            if (!visited.has(task.id)) {
                order = visit(task, order);
            }
        }
        return sorted;
    }
    /**
    * Group tasks into execution phases
    */
    groupIntoPhases(tasks) {
        const phases = [];
        const taskToPhase = new Map();
        // Calculate phase for each task based on dependencies
        for (const task of tasks) {
            let maxDepPhase = -1;
            for (const depId of task.dependencies) {
                const depPhase = taskToPhase.get(depId);
                if (depPhase !== undefined && depPhase > maxDepPhase) {
                    maxDepPhase = depPhase;
                }
            }
            const taskPhase = maxDepPhase + 1;
            taskToPhase.set(task.id, taskPhase);
            // Add to phase
            if (!phases[taskPhase]) {
                phases[taskPhase] = {
                    id: `phase-${taskPhase + 1}`,
                    name: this.getPhaseNameForType(task.type),
                    tasks: [],
                    estimatedTime: 0,
                    dependencies: []
                };
            }
            phases[taskPhase].tasks.push(task);
            phases[taskPhase].estimatedTime += task.estimatedTime;
        }
        // Set phase dependencies
        for (let i = 1; i < phases.length; i++) {
            phases[i].dependencies.push(phases[i - 1].id);
        }
        // Name phases based on dominant task type
        for (const phase of phases) {
            phase.name = this.getPhaseNameForTasks(phase.tasks);
        }
        return phases;
    }
    /**
    * Calculate critical path (longest path through dependencies)
    */
    calculateCriticalPath(tasks) {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const memo = new Map();
        const findLongestPath = (taskId) => {
            if (memo.has(taskId)) {
                return memo.get(taskId);
            }
            const task = taskMap.get(taskId);
            let maxTime = 0;
            let maxPath = [];
            // Find longest path through dependencies
            for (const depId of task.dependencies) {
                const depResult = findLongestPath(depId);
                if (depResult.time > maxTime) {
                    maxTime = depResult.time;
                    maxPath = depResult.path;
                }
            }
            const result = {
                time: maxTime + task.estimatedTime,
                path: [...maxPath, taskId]
            };
            memo.set(taskId, result);
            return result;
        };
        // Find the longest path from all leaf tasks
        let longestPath = [];
        let longestTime = 0;
        for (const task of tasks) {
            const result = findLongestPath(task.id);
            if (result.time > longestTime) {
                longestTime = result.time;
                longestPath = result.path;
            }
        }
        return longestPath;
    }
    /**
    * Find tasks that can be executed in parallel
    */
    findParallelizableTasks(tasks) {
        const groups = [];
        const processed = new Set();
        // Group tasks by their dependency level
        const levels = new Map();
        for (const task of tasks) {
            const level = task.order;
            if (!levels.has(level)) {
                levels.set(level, []);
            }
            levels.get(level).push(task.id);
        }
        // Each level can potentially run in parallel
        for (const [_, taskIds] of levels) {
            if (taskIds.length > 1) {
                groups.push(taskIds);
            }
        }
        return groups;
    }
    /**
    * Calculate total execution time
    */
    calculateTotalTime(phases) {
        // Sequential execution: sum of all phase times
        return phases.reduce((sum, phase) => sum + phase.estimatedTime, 0);
    }
    /**
    * Detect circular dependencies
    */
    detectCircularDependencies(tasks) {
        const circular = [];
        const visited = new Set();
        const visiting = new Set();
        const visit = (task, path) => {
            if (visited.has(task.id)) {
                return;
            }
            if (visiting.has(task.id)) {
                circular.push(path.join(' -> ') + ' -> ' + task.id);
                return;
            }
            visiting.add(task.id);
            path.push(task.id);
            for (const depId of task.dependencies) {
                const depTask = tasks.find(t => t.id === depId);
                if (depTask) {
                    visit(depTask, [...path]);
                }
            }
            visiting.delete(task.id);
            visited.add(task.id);
        };
        for (const task of tasks) {
            if (!visited.has(task.id)) {
                visit(task, []);
            }
        }
        return circular;
    }
    /**
    * Generate warnings about the plan
    */
    generateWarnings(spec, phases) {
        const warnings = [];
        // Check for long phases
        for (const phase of phases) {
            if (phase.estimatedTime > 480) { // 8 hours
                warnings.push(`Phase "${phase.name}" is estimated to take ${Math.round(phase.estimatedTime / 60)} hours`);
            }
        }
        // Check for high complexity
        if (spec.metadata.complexity > 7) {
            warnings.push(`High complexity specification (${spec.metadata.complexity}/10)`);
        }
        // Check for many dependencies
        const avgDeps = spec.tasks.reduce((sum, t) => sum + t.dependencies.length, 0) / spec.tasks.length;
        if (avgDeps > 3) {
            warnings.push(`High average dependencies per task (${avgDeps.toFixed(1)})`);
        }
        // Check for critical constraints
        for (const constraint of spec.constraints) {
            if (constraint.type === 'time' || constraint.type === 'budget') {
                warnings.push(`Critical constraint: ${constraint.description}`);
            }
        }
        return warnings;
    }
    /**
    * Get phase name for task type
    */
    getPhaseNameForType(type) {
        switch (type) {
            case specificationParser_1.TaskType.CREATE:
                return 'Creation';
            case specificationParser_1.TaskType.MODIFY:
                return 'Modification';
            case specificationParser_1.TaskType.DELETE:
                return 'Cleanup';
            case specificationParser_1.TaskType.REFACTOR:
                return 'Refactoring';
            case specificationParser_1.TaskType.TEST:
                return 'Testing';
            case specificationParser_1.TaskType.DOCUMENT:
                return 'Documentation';
            case specificationParser_1.TaskType.REVIEW:
                return 'Review';
            default:
                return 'Execution';
        }
    }
    /**
    * Get phase name based on dominant task types
    */
    getPhaseNameForTasks(tasks) {
        const typeCounts = new Map();
        for (const task of tasks) {
            typeCounts.set(task.type, (typeCounts.get(task.type) || 0) + 1);
        }
        let maxType = specificationParser_1.TaskType.CREATE;
        let maxCount = 0;
        for (const [type, count] of typeCounts) {
            if (count > maxCount) {
                maxCount = count;
                maxType = type;
            }
        }
        return this.getPhaseNameForType(maxType);
    }
}
exports.TaskPlanner = TaskPlanner;
//# sourceMappingURL=taskPlanner.js.map