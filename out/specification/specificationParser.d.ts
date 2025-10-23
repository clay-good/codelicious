/**
 * Specification Parser
 *
 * Parses natural language specifications into structured requirements,
 * tasks, constraints, and dependencies.
 */
export interface ParsedSpecification {
    title: string;
    description: string;
    requirements: Requirement[];
    tasks: SpecTask[];
    constraints: Constraint[];
    dependencies: Dependency[];
    metadata: SpecMetadata;
}
export interface Requirement {
    id: string;
    type: RequirementType;
    description: string;
    priority: Priority;
    acceptance: string[];
    tags: string[];
}
export declare enum RequirementType {
    FUNCTIONAL = "functional",
    NON_FUNCTIONAL = "non-functional",
    TECHNICAL = "technical",
    BUSINESS = "business",
    SECURITY = "security",
    PERFORMANCE = "performance"
}
export interface SpecTask {
    id: string;
    name: string;
    description: string;
    type: TaskType;
    priority: Priority;
    estimatedTime: number;
    dependencies: string[];
    requirements: string[];
    files: string[];
    tests: string[];
}
export declare enum TaskType {
    CREATE = "create",
    MODIFY = "modify",
    DELETE = "delete",
    REFACTOR = "refactor",
    TEST = "test",
    DOCUMENT = "document",
    REVIEW = "review"
}
export declare enum Priority {
    CRITICAL = "critical",
    HIGH = "high",
    MEDIUM = "medium",
    LOW = "low"
}
export interface Constraint {
    id: string;
    type: ConstraintType;
    description: string;
    value?: string;
}
export declare enum ConstraintType {
    TIME = "time",
    BUDGET = "budget",
    TECHNOLOGY = "technology",
    COMPATIBILITY = "compatibility",
    SECURITY = "security",
    PERFORMANCE = "performance",
    QUALITY = "quality"
}
export interface Dependency {
    id: string;
    from: string;
    to: string;
    type: DependencyType;
}
export declare enum DependencyType {
    REQUIRES = "requires",
    BLOCKS = "blocks",
    RELATED = "related"
}
export interface SpecMetadata {
    version: string;
    author?: string;
    created: number;
    updated: number;
    tags: string[];
    complexity: number;
}
export declare class SpecificationParser {
    private workspaceRoot;
    constructor(workspaceRoot: string);
    /**
    * Parse a specification from text
    */
    parse(text: string): Promise<ParsedSpecification>;
    /**
    * Extract title from specification
    */
    private extractTitle;
    /**
    * Extract description from specification
    */
    private extractDescription;
    /**
    * Extract requirements from specification
    */
    private extractRequirements;
    /**
    * Extract tasks from specification
    */
    private extractTasks;
    /**
    * Extract constraints from specification
    */
    private extractConstraints;
    /**
    * Extract dependencies between tasks
    */
    private extractDependencies;
    private finalizeRequirement;
    private detectRequirementType;
    private detectTaskType;
    private detectPriority;
    private detectConstraintType;
    private estimateTime;
    private extractFiles;
    private generateMetadata;
}
//# sourceMappingURL=specificationParser.d.ts.map