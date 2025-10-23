/**
 * Cross-File Relationship Tracker
 *
 * Tracks relationships between files including:
 * - Import/export dependencies
 * - Inheritance relationships
 * - Function call relationships
 * - Type usage relationships
 * - Indirect dependencies
 */
import { ASTSymbol, ASTAnalysisResult } from './astAnalyzer';
export interface FileNode {
    path: string;
    imports: string[];
    exports: string[];
    dependencies: string[];
    dependents: string[];
    symbols: ASTSymbol[];
    score: number;
}
export interface CrossFileRelationship {
    from: string;
    to: string;
    type: 'import' | 'inheritance' | 'call' | 'type' | 'indirect';
    symbols: string[];
    confidence: number;
    weight: number;
}
export interface DependencyGraph {
    nodes: Map<string, FileNode>;
    edges: CrossFileRelationship[];
    clusters: FileCluster[];
}
export interface FileCluster {
    id: string;
    files: string[];
    type: 'module' | 'feature' | 'layer' | 'package';
    cohesion: number;
}
export declare class CrossFileTracker {
    private graph;
    private analysisCache;
    constructor();
    /**
    * Add file analysis to the tracker
    */
    addFile(filePath: string, analysis: ASTAnalysisResult): void;
    /**
    * Remove file from tracker
    */
    removeFile(filePath: string): void;
    /**
    * Get all files in the graph
    */
    getAllFiles(): string[];
    /**
    * Get dependencies for a file
    */
    getDependencies(filePath: string, options?: {
        direct?: boolean;
        maxDepth?: number;
    }): string[];
    /**
    * Get dependents for a file (files that depend on this file)
    */
    getDependents(filePath: string, options?: {
        direct?: boolean;
        maxDepth?: number;
    }): string[];
    /**
    * Get related files (files that share dependencies or symbols)
    */
    getRelatedFiles(filePath: string, options?: {
        minScore?: number;
        maxResults?: number;
    }): Array<{
        path: string;
        score: number;
        reason: string;
    }>;
    /**
    * Detect circular dependencies
    */
    detectCircularDependencies(): string[][];
    /**
    * Calculate importance scores for all files
    */
    calculateImportanceScores(): void;
    /**
    * Detect file clusters (groups of related files)
    */
    detectClusters(options?: {
        minSize?: number;
        minCohesion?: number;
    }): FileCluster[];
    /**
    * Get the dependency graph
    */
    getGraph(): DependencyGraph;
    /**
    * Get statistics about the graph
    */
    getStatistics(): {
        totalFiles: number;
        totalRelationships: number;
        averageDependencies: number;
        averageDependents: number;
        circularDependencies: number;
        clusters: number;
    };
    /**
    * Update relationships for a file
    */
    private updateRelationships;
    /**
    * Resolve import path to actual file path
    */
    private resolveImportPath;
    /**
    * Find file containing a symbol
    */
    private findSymbolFile;
    /**
    * Calculate cohesion of a group of files
    */
    private calculateCohesion;
    /**
    * Infer cluster type from files
    */
    private inferClusterType;
    /**
    * Find common path prefix
    */
    private findCommonPath;
    /**
    * Normalize path
    */
    private normalizePath;
}
//# sourceMappingURL=crossFileTracker.d.ts.map