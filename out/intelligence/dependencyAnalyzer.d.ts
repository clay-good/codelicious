/**
 * Dependency Analyzer - Analyze code dependencies and relationships
 *
 * Features:
 * - Dependency graph generation
 * - Circular dependency detection
 * - Unused dependency detection
 * - Dependency impact analysis
 * - Module coupling analysis
 */
export interface DependencyGraph {
    nodes: DependencyNode[];
    edges: DependencyEdge[];
    circular: CircularDependency[];
    unused: string[];
    metrics: DependencyMetrics;
}
export interface DependencyNode {
    id: string;
    file: string;
    type: 'internal' | 'external' | 'builtin';
    imports: number;
    exports: number;
}
export interface DependencyEdge {
    from: string;
    to: string;
    type: 'import' | 'require' | 'dynamic';
    count: number;
}
export interface CircularDependency {
    cycle: string[];
    severity: 'critical' | 'high' | 'medium';
}
export interface DependencyMetrics {
    totalDependencies: number;
    internalDependencies: number;
    externalDependencies: number;
    averageDependenciesPerFile: number;
    maxDependencies: number;
    circularDependencies: number;
    unusedDependencies: number;
    couplingScore: number;
}
export declare class DependencyAnalyzer {
    private readonly workspaceRoot;
    private dependencyMap;
    private reverseMap;
    constructor(workspaceRoot: string);
    /**
    * Analyze dependencies for entire workspace
    */
    analyzeWorkspace(): Promise<DependencyGraph>;
    /**
    * Analyze dependencies for a single file
    */
    analyzeDependencies(filePath: string): Promise<string[]>;
    /**
    * Detect circular dependencies
    */
    private detectCircularDependencies;
    /**
    * Detect unused dependencies
    */
    private detectUnusedDependencies;
    /**
    * Calculate dependency metrics
    */
    private calculateMetrics;
    /**
    * Find all TypeScript/JavaScript files
    */
    private findAllFiles;
    /**
    * Resolve dependency path
    */
    private resolveDependency;
    /**
    * Get dependency type
    */
    private getDependencyType;
    /**
    * Calculate cycle severity
    */
    private calculateCycleSeverity;
    /**
    * Get dependency impact
    */
    getDependencyImpact(filePath: string): Promise<{
        directDependents: string[];
        indirectDependents: string[];
        totalImpact: number;
    }>;
    /**
    * Suggest dependency improvements
    */
    suggestImprovements(graph: DependencyGraph): string[];
}
//# sourceMappingURL=dependencyAnalyzer.d.ts.map