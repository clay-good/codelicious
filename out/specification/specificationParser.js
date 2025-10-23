"use strict";
/**
 * Specification Parser
 *
 * Parses natural language specifications into structured requirements,
 * tasks, constraints, and dependencies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpecificationParser = exports.DependencyType = exports.ConstraintType = exports.Priority = exports.TaskType = exports.RequirementType = void 0;
var RequirementType;
(function (RequirementType) {
    RequirementType["FUNCTIONAL"] = "functional";
    RequirementType["NON_FUNCTIONAL"] = "non-functional";
    RequirementType["TECHNICAL"] = "technical";
    RequirementType["BUSINESS"] = "business";
    RequirementType["SECURITY"] = "security";
    RequirementType["PERFORMANCE"] = "performance";
})(RequirementType || (exports.RequirementType = RequirementType = {}));
var TaskType;
(function (TaskType) {
    TaskType["CREATE"] = "create";
    TaskType["MODIFY"] = "modify";
    TaskType["DELETE"] = "delete";
    TaskType["REFACTOR"] = "refactor";
    TaskType["TEST"] = "test";
    TaskType["DOCUMENT"] = "document";
    TaskType["REVIEW"] = "review";
})(TaskType || (exports.TaskType = TaskType = {}));
var Priority;
(function (Priority) {
    Priority["CRITICAL"] = "critical";
    Priority["HIGH"] = "high";
    Priority["MEDIUM"] = "medium";
    Priority["LOW"] = "low";
})(Priority || (exports.Priority = Priority = {}));
var ConstraintType;
(function (ConstraintType) {
    ConstraintType["TIME"] = "time";
    ConstraintType["BUDGET"] = "budget";
    ConstraintType["TECHNOLOGY"] = "technology";
    ConstraintType["COMPATIBILITY"] = "compatibility";
    ConstraintType["SECURITY"] = "security";
    ConstraintType["PERFORMANCE"] = "performance";
    ConstraintType["QUALITY"] = "quality";
})(ConstraintType || (exports.ConstraintType = ConstraintType = {}));
var DependencyType;
(function (DependencyType) {
    DependencyType["REQUIRES"] = "requires";
    DependencyType["BLOCKS"] = "blocks";
    DependencyType["RELATED"] = "related";
})(DependencyType || (exports.DependencyType = DependencyType = {}));
class SpecificationParser {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Parse a specification from text
    */
    async parse(text) {
        const lines = text.split('\n');
        const title = this.extractTitle(lines);
        const description = this.extractDescription(lines);
        const requirements = this.extractRequirements(lines);
        const tasks = this.extractTasks(lines, requirements);
        const constraints = this.extractConstraints(lines);
        const dependencies = this.extractDependencies(lines, tasks);
        const metadata = this.generateMetadata(requirements, tasks, constraints);
        return {
            title,
            description,
            requirements,
            tasks,
            constraints,
            dependencies,
            metadata
        };
    }
    /**
    * Extract title from specification
    */
    extractTitle(lines) {
        // Look for markdown heading or first non-empty line
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('# ')) {
                return trimmed.substring(2).trim();
            }
            if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
                return trimmed;
            }
        }
        return 'Untitled Specification';
    }
    /**
    * Extract description from specification
    */
    extractDescription(lines) {
        const descLines = [];
        let inDescription = false;
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip title
            if (trimmed.startsWith('# ')) {
                inDescription = true;
                continue;
            }
            // Stop at first section
            if (trimmed.startsWith('## ')) {
                break;
            }
            if (inDescription && trimmed) {
                descLines.push(trimmed);
            }
        }
        return descLines.join(' ').trim() || 'No description provided';
    }
    /**
    * Extract requirements from specification
    */
    extractRequirements(lines) {
        const requirements = [];
        let inRequirements = false;
        let currentReq = null;
        for (const line of lines) {
            const trimmed = line.trim();
            // Check for requirements section
            if (trimmed.startsWith('##') && trimmed.toLowerCase().includes('requirement')) {
                inRequirements = true;
                continue;
            }
            // Stop at next section
            if (trimmed.startsWith('##') && !trimmed.toLowerCase().includes('requirement')) {
                if (currentReq) {
                    requirements.push(this.finalizeRequirement(currentReq));
                    currentReq = null;
                }
                inRequirements = false;
                continue;
            }
            if (inRequirements && trimmed) {
                // Numbered or bulleted requirement
                if (/^[\d\-\*]+\.?\s/.test(trimmed)) {
                    if (currentReq) {
                        requirements.push(this.finalizeRequirement(currentReq));
                    }
                    currentReq = {
                        id: `req-${requirements.length + 1}`,
                        description: trimmed.replace(/^[\d\-\*]+\.?\s/, ''),
                        type: this.detectRequirementType(trimmed),
                        priority: this.detectPriority(trimmed),
                        acceptance: [],
                        tags: []
                    };
                }
                else if (currentReq && trimmed) {
                    // Add to current requirement description
                    currentReq.description += ' ' + trimmed;
                }
            }
        }
        if (currentReq) {
            requirements.push(this.finalizeRequirement(currentReq));
        }
        return requirements;
    }
    /**
    * Extract tasks from specification
    */
    extractTasks(lines, requirements) {
        const tasks = [];
        let inTasks = false;
        for (const line of lines) {
            const trimmed = line.trim();
            // Check for tasks section
            if (trimmed.startsWith('##') && (trimmed.toLowerCase().includes('task') || trimmed.toLowerCase().includes('step'))) {
                inTasks = true;
                continue;
            }
            // Stop at next section
            if (trimmed.startsWith('##') && !trimmed.toLowerCase().includes('task') && !trimmed.toLowerCase().includes('step')) {
                inTasks = false;
                continue;
            }
            if (inTasks && trimmed && /^[\d\-\*]+\.?\s/.test(trimmed)) {
                const taskDesc = trimmed.replace(/^[\d\-\*]+\.?\s/, '');
                tasks.push({
                    id: `task-${tasks.length + 1}`,
                    name: taskDesc.split(':')[0] || taskDesc,
                    description: taskDesc,
                    type: this.detectTaskType(taskDesc),
                    priority: this.detectPriority(taskDesc),
                    estimatedTime: this.estimateTime(taskDesc),
                    dependencies: [],
                    requirements: [],
                    files: this.extractFiles(taskDesc),
                    tests: []
                });
            }
        }
        return tasks;
    }
    /**
    * Extract constraints from specification
    */
    extractConstraints(lines) {
        const constraints = [];
        let inConstraints = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('##') && (trimmed.toLowerCase().includes('constraint') || trimmed.toLowerCase().includes('limitation'))) {
                inConstraints = true;
                continue;
            }
            if (trimmed.startsWith('##') && !trimmed.toLowerCase().includes('constraint') && !trimmed.toLowerCase().includes('limitation')) {
                inConstraints = false;
                continue;
            }
            if (inConstraints && trimmed && /^[\d\-\*]+\.?\s/.test(trimmed)) {
                const desc = trimmed.replace(/^[\d\-\*]+\.?\s/, '');
                constraints.push({
                    id: `constraint-${constraints.length + 1}`,
                    type: this.detectConstraintType(desc),
                    description: desc
                });
            }
        }
        return constraints;
    }
    /**
    * Extract dependencies between tasks
    */
    extractDependencies(lines, tasks) {
        const dependencies = [];
        // Analyze task descriptions for dependency keywords
        for (const task of tasks) {
            const desc = task.description.toLowerCase();
            // Look for "after", "before", "requires", "depends on"
            if (desc.includes('after') || desc.includes('requires') || desc.includes('depends')) {
                // Find referenced tasks
                for (const otherTask of tasks) {
                    if (task.id !== otherTask.id && desc.includes(otherTask.name.toLowerCase())) {
                        dependencies.push({
                            id: `dep-${dependencies.length + 1}`,
                            from: task.id,
                            to: otherTask.id,
                            type: DependencyType.REQUIRES
                        });
                        task.dependencies.push(otherTask.id);
                    }
                }
            }
        }
        return dependencies;
    }
    // Helper methods
    finalizeRequirement(req) {
        return {
            id: req.id || 'req-unknown',
            type: req.type || RequirementType.FUNCTIONAL,
            description: req.description || '',
            priority: req.priority || Priority.MEDIUM,
            acceptance: req.acceptance || [],
            tags: req.tags || []
        };
    }
    detectRequirementType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('performance') || lower.includes('speed') || lower.includes('latency')) {
            return RequirementType.PERFORMANCE;
        }
        if (lower.includes('security') || lower.includes('auth') || lower.includes('permission')) {
            return RequirementType.SECURITY;
        }
        if (lower.includes('technical') || lower.includes('architecture')) {
            return RequirementType.TECHNICAL;
        }
        return RequirementType.FUNCTIONAL;
    }
    detectTaskType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('create') || lower.includes('add') || lower.includes('new')) {
            return TaskType.CREATE;
        }
        if (lower.includes('modify') || lower.includes('update') || lower.includes('change')) {
            return TaskType.MODIFY;
        }
        if (lower.includes('delete') || lower.includes('remove')) {
            return TaskType.DELETE;
        }
        if (lower.includes('refactor') || lower.includes('restructure')) {
            return TaskType.REFACTOR;
        }
        if (lower.includes('test')) {
            return TaskType.TEST;
        }
        if (lower.includes('document') || lower.includes('doc')) {
            return TaskType.DOCUMENT;
        }
        return TaskType.CREATE;
    }
    detectPriority(text) {
        const lower = text.toLowerCase();
        if (lower.includes('critical') || lower.includes('urgent') || lower.includes('must')) {
            return Priority.CRITICAL;
        }
        if (lower.includes('high') || lower.includes('important')) {
            return Priority.HIGH;
        }
        if (lower.includes('low') || lower.includes('nice to have')) {
            return Priority.LOW;
        }
        return Priority.MEDIUM;
    }
    detectConstraintType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('time') || lower.includes('deadline') || lower.includes('schedule')) {
            return ConstraintType.TIME;
        }
        if (lower.includes('budget') || lower.includes('cost')) {
            return ConstraintType.BUDGET;
        }
        if (lower.includes('technology') || lower.includes('stack') || lower.includes('framework')) {
            return ConstraintType.TECHNOLOGY;
        }
        if (lower.includes('security')) {
            return ConstraintType.SECURITY;
        }
        if (lower.includes('performance')) {
            return ConstraintType.PERFORMANCE;
        }
        return ConstraintType.QUALITY;
    }
    estimateTime(text) {
        const lower = text.toLowerCase();
        // Look for explicit time estimates
        const hourMatch = lower.match(/(\d+)\s*hour/);
        if (hourMatch) {
            return parseInt(hourMatch[1]) * 60;
        }
        const minMatch = lower.match(/(\d+)\s*min/);
        if (minMatch) {
            return parseInt(minMatch[1]);
        }
        // Estimate based on task type
        if (lower.includes('create') || lower.includes('implement')) {
            return 120; // 2 hours
        }
        if (lower.includes('modify') || lower.includes('update')) {
            return 60; // 1 hour
        }
        if (lower.includes('test')) {
            return 30; // 30 minutes
        }
        if (lower.includes('document')) {
            return 20; // 20 minutes
        }
        return 60; // Default 1 hour
    }
    extractFiles(text) {
        const files = [];
        // Look for file patterns
        const filePattern = /[\w\/\-\.]+\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h)/g;
        const matches = text.match(filePattern);
        if (matches) {
            files.push(...matches);
        }
        return files;
    }
    generateMetadata(requirements, tasks, constraints) {
        // Calculate complexity based on number of requirements, tasks, and constraints
        const complexity = Math.min(10, Math.ceil((requirements.length * 0.3 + tasks.length * 0.5 + constraints.length * 0.2)));
        return {
            version: '1.0.0',
            created: Date.now(),
            updated: Date.now(),
            tags: [],
            complexity
        };
    }
}
exports.SpecificationParser = SpecificationParser;
//# sourceMappingURL=specificationParser.js.map