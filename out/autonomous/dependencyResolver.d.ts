/**
 * Dependency Resolver
 *
 * Automatically detects, installs, and resolves dependency conflicts.
 * Critical for autonomous building - the system needs to manage dependencies without user intervention.
 *
 * Features:
 * - Detect missing dependencies from import statements
 * - Resolve version conflicts
 * - Auto-install dependencies
 * - Update package.json
 * - Handle peer dependencies
 * - Suggest alternatives for deprecated packages
 */
import { ExecutionEngine } from '../core/executionEngine';
import { ModelOrchestrator } from '../models/orchestrator';
export interface DependencyInfo {
    name: string;
    version: string;
    type: 'dependency' | 'devDependency' | 'peerDependency';
    required: boolean;
    installedVersion?: string;
    latestVersion?: string;
    deprecated?: boolean;
    alternative?: string;
}
export interface VersionConflict {
    package: string;
    requiredVersions: string[];
    resolvedVersion: string;
    reason: string;
}
export interface ResolveResult {
    success: boolean;
    installed: DependencyInfo[];
    conflicts: VersionConflict[];
    errors: string[];
    packageJsonUpdated: boolean;
    installOutput?: string;
}
export declare class DependencyResolver {
    private executionEngine;
    private orchestrator;
    private workspaceRoot;
    constructor(executionEngine: ExecutionEngine, orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Resolve and install all dependencies
    */
    resolveDependencies(requiredPackages: string[], sourceFiles?: string[]): Promise<ResolveResult>;
    /**
    * Load package.json
    */
    private loadPackageJson;
    /**
    * Save package.json
    */
    private savePackageJson;
    /**
    * Detect dependencies from source files
    */
    private detectDependenciesFromSource;
    /**
    * Find missing dependencies
    */
    private findMissingDependencies;
    /**
    * Resolve versions for packages
    */
    private resolveVersions;
    /**
    * Get latest version from npm
    */
    private getLatestVersion;
    /**
    * Determine dependency type
    */
    private determineDepType;
    /**
    * Detect version conflicts
    */
    private detectConflicts;
    /**
    * Auto-resolve conflicts
    */
    private resolveConflicts;
    /**
    * Update package.json with new dependencies
    */
    private updatePackageJson;
    /**
    * Install dependencies
    */
    private installDependencies;
    /**
    * Check if dependencies are installed
    */
    checkInstalled(): Promise<boolean>;
    /**
    * Get installed version of a package
    */
    getInstalledVersion(packageName: string): Promise<string | null>;
}
//# sourceMappingURL=dependencyResolver.d.ts.map