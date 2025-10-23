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

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const logger = createLogger('DependencyAnalyzer');

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

export class DependencyAnalyzer {
 private dependencyMap: Map<string, Set<string>> = new Map();
 private reverseMap: Map<string, Set<string>> = new Map();

 constructor(
 private readonly workspaceRoot: string
 ) {}

 /**
 * Analyze dependencies for entire workspace
 */
 async analyzeWorkspace(): Promise<DependencyGraph> {
 const files = await this.findAllFiles();
 const nodes: DependencyNode[] = [];
 const edges: DependencyEdge[] = [];

 // Build dependency map
 for (const file of files) {
 const dependencies = await this.analyzeDependencies(file);
 this.dependencyMap.set(file, new Set(dependencies));

 // Build reverse map
 for (const dep of dependencies) {
 if (!this.reverseMap.has(dep)) {
 this.reverseMap.set(dep, new Set());
 }
 this.reverseMap.get(dep)!.add(file);
 }

 // Create node
 nodes.push({
 id: file,
 file,
 type: this.getDependencyType(file),
 imports: dependencies.length,
 exports: this.reverseMap.get(file)?.size || 0
 });

 // Create edges
 for (const dep of dependencies) {
 edges.push({
 from: file,
 to: dep,
 type: 'import',
 count: 1
 });
 }
 }

 // Detect circular dependencies
 const circular = this.detectCircularDependencies();

 // Detect unused dependencies
 const unused = this.detectUnusedDependencies();

 // Calculate metrics
 const metrics = this.calculateMetrics(nodes, edges, circular, unused);

 return {
 nodes,
 edges,
 circular,
 unused,
 metrics
 };
 }

 /**
 * Analyze dependencies for a single file
 */
 async analyzeDependencies(filePath: string): Promise<string[]> {
 try {
 const content = fs.readFileSync(filePath, 'utf8');
 const dependencies: string[] = [];

 // Extract ES6 imports
 const importPattern = /import\s+(?:{[^}]+}|[\w]+|\*\s+as\s+[\w]+)\s+from\s+['"]([^'"]+)['"]/g;
 let match;
 while ((match = importPattern.exec(content)) !== null) {
 dependencies.push(this.resolveDependency(filePath, match[1]));
 }

 // Extract CommonJS requires
 const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
 while ((match = requirePattern.exec(content)) !== null) {
 dependencies.push(this.resolveDependency(filePath, match[1]));
 }

 // Extract dynamic imports
 const dynamicPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
 while ((match = dynamicPattern.exec(content)) !== null) {
 dependencies.push(this.resolveDependency(filePath, match[1]));
 }

 return [...new Set(dependencies)]; // Remove duplicates
 } catch (error) {
 logger.error(`Error analyzing dependencies for ${filePath}`, error);
 return []; // Return empty array on error
 }
 }

 /**
 * Detect circular dependencies
 */
 private detectCircularDependencies(): CircularDependency[] {
 const circular: CircularDependency[] = [];
 const visited = new Set<string>();
 const recursionStack = new Set<string>();

 const dfs = (node: string, path: string[]): void => {
 visited.add(node);
 recursionStack.add(node);
 path.push(node);

 const dependencies = this.dependencyMap.get(node) || new Set();
 for (const dep of dependencies) {
 if (!visited.has(dep)) {
 dfs(dep, [...path]);
 } else if (recursionStack.has(dep)) {
 // Found a cycle
 const cycleStart = path.indexOf(dep);
 const cycle = path.slice(cycleStart);
 cycle.push(dep); // Complete the cycle

 circular.push({
 cycle,
 severity: this.calculateCycleSeverity(cycle)
 });
 }
 }

 recursionStack.delete(node);
 };

 for (const node of this.dependencyMap.keys()) {
 if (!visited.has(node)) {
 dfs(node, []);
 }
 }

 return circular;
 }

 /**
 * Detect unused dependencies
 */
 private detectUnusedDependencies(): string[] {
 const unused: string[] = [];

 // Check package.json dependencies
 const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
 if (!fs.existsSync(packageJsonPath)) {
 return unused;
 }

 const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
 const dependencies = {
 ...packageJson.dependencies,
 ...packageJson.devDependencies
 };

 // Check if each dependency is used
 for (const dep of Object.keys(dependencies)) {
 let isUsed = false;

 for (const deps of this.dependencyMap.values()) {
 if (Array.from(deps).some(d => d.includes(dep))) {
 isUsed = true;
 break;
 }
 }

 if (!isUsed) {
 unused.push(dep);
 }
 }

 return unused;
 }

 /**
 * Calculate dependency metrics
 */
 private calculateMetrics(
 nodes: DependencyNode[],
 edges: DependencyEdge[],
 circular: CircularDependency[],
 unused: string[]
 ): DependencyMetrics {
 const internal = nodes.filter(n => n.type === 'internal').length;
 const external = nodes.filter(n => n.type === 'external').length;
 const total = nodes.length;

 const avgDeps = total > 0
 ? edges.length / total
 : 0;

 const maxDeps = Math.max(...nodes.map(n => n.imports), 0);

 // Calculate coupling score (0-100, lower is better)
 const couplingScore = Math.min(100, Math.round(
 (avgDeps * 10) + (circular.length * 20) + (maxDeps * 2)
 ));

 return {
 totalDependencies: total,
 internalDependencies: internal,
 externalDependencies: external,
 averageDependenciesPerFile: Math.round(avgDeps * 10) / 10,
 maxDependencies: maxDeps,
 circularDependencies: circular.length,
 unusedDependencies: unused.length,
 couplingScore
 };
 }

 /**
 * Find all TypeScript/JavaScript files
 */
 private async findAllFiles(): Promise<string[]> {
 const files: string[] = [];
 const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'];
 const exclude = '**/node_modules/**';

 for (const pattern of patterns) {
 const found = await vscode.workspace.findFiles(pattern, exclude);
 files.push(...found.map(uri => uri.fsPath));
 }

 return files;
 }

 /**
 * Resolve dependency path
 */
 private resolveDependency(fromFile: string, importPath: string): string {
 // External dependency
 if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
 return importPath;
 }

 // Relative dependency
 const dir = path.dirname(fromFile);
 const resolved = path.resolve(dir, importPath);

 // Try different extensions
 const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
 for (const ext of extensions) {
 const withExt = resolved + ext;
 if (fs.existsSync(withExt)) {
 return withExt;
 }
 }

 // Try index file
 const indexPath = path.join(resolved, 'index.ts');
 if (fs.existsSync(indexPath)) {
 return indexPath;
 }

 return resolved;
 }

 /**
 * Get dependency type
 */
 private getDependencyType(filePath: string): 'internal' | 'external' | 'builtin' {
 if (filePath.startsWith(this.workspaceRoot)) {
 return 'internal';
 }

 const builtins = ['fs', 'path', 'http', 'https', 'crypto', 'util', 'events'];
 if (builtins.some(b => filePath.includes(b))) {
 return 'builtin';
 }

 return 'external';
 }

 /**
 * Calculate cycle severity
 */
 private calculateCycleSeverity(cycle: string[]): 'critical' | 'high' | 'medium' {
 if (cycle.length <= 2) {
 return 'critical'; // Direct circular dependency
 } else if (cycle.length <= 4) {
 return 'high';
 } else {
 return 'medium';
 }
 }

 /**
 * Get dependency impact
 */
 async getDependencyImpact(filePath: string): Promise<{
 directDependents: string[];
 indirectDependents: string[];
 totalImpact: number;
 }> {
 const directDependents = Array.from(this.reverseMap.get(filePath) || []);
 const indirectDependents = new Set<string>();

 // Find indirect dependents (BFS)
 const queue = [...directDependents];
 const visited = new Set<string>([filePath, ...directDependents]);

 while (queue.length > 0) {
 const current = queue.shift()!;
 const dependents = this.reverseMap.get(current) || new Set();

 for (const dep of dependents) {
 if (!visited.has(dep)) {
 visited.add(dep);
 indirectDependents.add(dep);
 queue.push(dep);
 }
 }
 }

 return {
 directDependents,
 indirectDependents: Array.from(indirectDependents),
 totalImpact: directDependents.length + indirectDependents.size
 };
 }

 /**
 * Suggest dependency improvements
 */
 suggestImprovements(graph: DependencyGraph): string[] {
 const suggestions: string[] = [];

 // Circular dependencies
 if (graph.circular.length > 0) {
 suggestions.push(
 `Found ${graph.circular.length} circular dependencies. Consider refactoring to break cycles.`
 );
 }

 // Unused dependencies
 if (graph.unused.length > 0) {
 suggestions.push(
 `Found ${graph.unused.length} unused dependencies: ${graph.unused.join(', ')}. Consider removing them.`
 );
 }

 // High coupling
 if (graph.metrics.couplingScore > 70) {
 suggestions.push(
 `High coupling score (${graph.metrics.couplingScore}). Consider reducing dependencies between modules.`
 );
 }

 // Too many dependencies
 if (graph.metrics.maxDependencies > 20) {
 suggestions.push(
 `Some files have too many dependencies (max: ${graph.metrics.maxDependencies}). Consider splitting them.`
 );
 }

 return suggestions;
 }
}

