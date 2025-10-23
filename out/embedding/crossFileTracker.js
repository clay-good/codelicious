"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossFileTracker = void 0;
class CrossFileTracker {
    constructor() {
        this.graph = {
            nodes: new Map(),
            edges: [],
            clusters: []
        };
        this.analysisCache = new Map();
    }
    /**
    * Add file analysis to the tracker
    */
    addFile(filePath, analysis) {
        this.analysisCache.set(filePath, analysis);
        // Create or update file node
        const node = {
            path: filePath,
            imports: analysis.imports.map(i => i.module),
            exports: analysis.exports.map(e => e.name),
            dependencies: [],
            dependents: [],
            symbols: analysis.symbols,
            score: 0
        };
        this.graph.nodes.set(filePath, node);
        // Update relationships
        this.updateRelationships(filePath, analysis);
    }
    /**
    * Remove file from tracker
    */
    removeFile(filePath) {
        this.analysisCache.delete(filePath);
        this.graph.nodes.delete(filePath);
        // Remove edges involving this file
        this.graph.edges = this.graph.edges.filter(edge => edge.from !== filePath && edge.to !== filePath);
        // Update dependents
        for (const node of this.graph.nodes.values()) {
            node.dependencies = node.dependencies.filter(d => d !== filePath);
            node.dependents = node.dependents.filter(d => d !== filePath);
        }
    }
    /**
    * Get all files in the graph
    */
    getAllFiles() {
        return Array.from(this.graph.nodes.keys());
    }
    /**
    * Get dependencies for a file
    */
    getDependencies(filePath, options) {
        const node = this.graph.nodes.get(filePath);
        if (!node)
            return [];
        if (options?.direct !== false) {
            return node.dependencies;
        }
        // Get transitive dependencies
        const visited = new Set();
        const queue = [{ path: filePath, depth: 0 }];
        const maxDepth = options?.maxDepth ?? Infinity;
        while (queue.length > 0) {
            const { path, depth } = queue.shift();
            if (visited.has(path) || depth > maxDepth)
                continue;
            visited.add(path);
            const currentNode = this.graph.nodes.get(path);
            if (currentNode) {
                for (const dep of currentNode.dependencies) {
                    if (!visited.has(dep)) {
                        queue.push({ path: dep, depth: depth + 1 });
                    }
                }
            }
        }
        visited.delete(filePath); // Remove self
        return Array.from(visited);
    }
    /**
    * Get dependents for a file (files that depend on this file)
    */
    getDependents(filePath, options) {
        const node = this.graph.nodes.get(filePath);
        if (!node)
            return [];
        if (options?.direct !== false) {
            return node.dependents;
        }
        // Get transitive dependents
        const visited = new Set();
        const queue = [{ path: filePath, depth: 0 }];
        const maxDepth = options?.maxDepth ?? Infinity;
        while (queue.length > 0) {
            const { path, depth } = queue.shift();
            if (visited.has(path) || depth > maxDepth)
                continue;
            visited.add(path);
            const currentNode = this.graph.nodes.get(path);
            if (currentNode) {
                for (const dep of currentNode.dependents) {
                    if (!visited.has(dep)) {
                        queue.push({ path: dep, depth: depth + 1 });
                    }
                }
            }
        }
        visited.delete(filePath); // Remove self
        return Array.from(visited);
    }
    /**
    * Get related files (files that share dependencies or symbols)
    */
    getRelatedFiles(filePath, options) {
        const node = this.graph.nodes.get(filePath);
        if (!node)
            return [];
        const scores = new Map();
        // Score based on shared dependencies
        for (const dep of node.dependencies) {
            const depNode = this.graph.nodes.get(dep);
            if (depNode) {
                for (const dependent of depNode.dependents) {
                    if (dependent !== filePath) {
                        const entry = scores.get(dependent) || { score: 0, reasons: new Set() };
                        entry.score += 0.3;
                        entry.reasons.add('shared dependency');
                        scores.set(dependent, entry);
                    }
                }
            }
        }
        // Score based on shared exports
        for (const [otherPath, otherNode] of this.graph.nodes.entries()) {
            if (otherPath === filePath)
                continue;
            const sharedExports = node.exports.filter(e => otherNode.exports.includes(e));
            if (sharedExports.length > 0) {
                const entry = scores.get(otherPath) || { score: 0, reasons: new Set() };
                entry.score += sharedExports.length * 0.2;
                entry.reasons.add('shared exports');
                scores.set(otherPath, entry);
            }
        }
        // Score based on symbol relationships
        for (const edge of this.graph.edges) {
            if (edge.from === filePath) {
                const entry = scores.get(edge.to) || { score: 0, reasons: new Set() };
                entry.score += edge.weight * 0.5;
                entry.reasons.add(edge.type);
                scores.set(edge.to, entry);
            }
            else if (edge.to === filePath) {
                const entry = scores.get(edge.from) || { score: 0, reasons: new Set() };
                entry.score += edge.weight * 0.5;
                entry.reasons.add(edge.type);
                scores.set(edge.from, entry);
            }
        }
        // Convert to array and sort
        const results = Array.from(scores.entries())
            .map(([path, { score, reasons }]) => ({
            path,
            score,
            reason: Array.from(reasons).join(', ')
        }))
            .filter(r => r.score >= (options?.minScore ?? 0))
            .sort((a, b) => b.score - a.score);
        return options?.maxResults ? results.slice(0, options.maxResults) : results;
    }
    /**
    * Detect circular dependencies
    */
    detectCircularDependencies() {
        const cycles = [];
        const visited = new Set();
        const recursionStack = new Set();
        const dfs = (path, currentPath) => {
            visited.add(path);
            recursionStack.add(path);
            currentPath.push(path);
            const node = this.graph.nodes.get(path);
            if (node) {
                for (const dep of node.dependencies) {
                    if (!visited.has(dep)) {
                        dfs(dep, [...currentPath]);
                    }
                    else if (recursionStack.has(dep)) {
                        // Found a cycle
                        const cycleStart = currentPath.indexOf(dep);
                        if (cycleStart !== -1) {
                            cycles.push(currentPath.slice(cycleStart));
                        }
                    }
                }
            }
            recursionStack.delete(path);
        };
        for (const path of this.graph.nodes.keys()) {
            if (!visited.has(path)) {
                dfs(path, []);
            }
        }
        return cycles;
    }
    /**
    * Calculate importance scores for all files
    */
    calculateImportanceScores() {
        // Use PageRank-like algorithm
        const dampingFactor = 0.85;
        const iterations = 20;
        const nodes = Array.from(this.graph.nodes.values());
        // Initialize scores
        for (const node of nodes) {
            node.score = 1.0 / nodes.length;
        }
        // Iterate
        for (let i = 0; i < iterations; i++) {
            const newScores = new Map();
            for (const node of nodes) {
                let score = (1 - dampingFactor) / nodes.length;
                for (const dependent of node.dependents) {
                    const depNode = this.graph.nodes.get(dependent);
                    if (depNode && depNode.dependencies.length > 0) {
                        score += dampingFactor * (depNode.score / depNode.dependencies.length);
                    }
                }
                newScores.set(node.path, score);
            }
            // Update scores
            for (const node of nodes) {
                node.score = newScores.get(node.path) || node.score;
            }
        }
    }
    /**
    * Detect file clusters (groups of related files)
    */
    detectClusters(options) {
        const minSize = options?.minSize ?? 2;
        const minCohesion = options?.minCohesion ?? 0.5;
        const clusters = [];
        const assigned = new Set();
        // Group by directory structure
        const dirGroups = new Map();
        for (const path of this.graph.nodes.keys()) {
            const dir = path.substring(0, path.lastIndexOf('/'));
            const files = dirGroups.get(dir) || [];
            files.push(path);
            dirGroups.set(dir, files);
        }
        // Create clusters from directory groups
        for (const [dir, files] of dirGroups.entries()) {
            if (files.length >= minSize) {
                const cohesion = this.calculateCohesion(files);
                if (cohesion >= minCohesion) {
                    clusters.push({
                        id: dir,
                        files,
                        type: this.inferClusterType(files),
                        cohesion
                    });
                    files.forEach(f => assigned.add(f));
                }
            }
        }
        // Find additional clusters based on relationships
        const unassigned = Array.from(this.graph.nodes.keys()).filter(p => !assigned.has(p));
        for (const path of unassigned) {
            const related = this.getRelatedFiles(path, { minScore: 0.5, maxResults: 10 });
            const clusterFiles = [path, ...related.map(r => r.path).filter(p => !assigned.has(p))];
            if (clusterFiles.length >= minSize) {
                const cohesion = this.calculateCohesion(clusterFiles);
                if (cohesion >= minCohesion) {
                    clusters.push({
                        id: `cluster-${clusters.length}`,
                        files: clusterFiles,
                        type: this.inferClusterType(clusterFiles),
                        cohesion
                    });
                    clusterFiles.forEach(f => assigned.add(f));
                }
            }
        }
        this.graph.clusters = clusters;
        return clusters;
    }
    /**
    * Get the dependency graph
    */
    getGraph() {
        return this.graph;
    }
    /**
    * Get statistics about the graph
    */
    getStatistics() {
        const nodes = Array.from(this.graph.nodes.values());
        const totalDeps = nodes.reduce((sum, n) => sum + n.dependencies.length, 0);
        const totalDependents = nodes.reduce((sum, n) => sum + n.dependents.length, 0);
        return {
            totalFiles: nodes.length,
            totalRelationships: this.graph.edges.length,
            averageDependencies: nodes.length > 0 ? totalDeps / nodes.length : 0,
            averageDependents: nodes.length > 0 ? totalDependents / nodes.length : 0,
            circularDependencies: this.detectCircularDependencies().length,
            clusters: this.graph.clusters.length
        };
    }
    /**
    * Update relationships for a file
    */
    updateRelationships(filePath, analysis) {
        const node = this.graph.nodes.get(filePath);
        if (!node)
            return;
        // Process imports to create dependencies
        for (const imp of analysis.imports) {
            const targetPath = this.resolveImportPath(filePath, imp.module);
            if (targetPath && this.graph.nodes.has(targetPath)) {
                // Add dependency
                if (!node.dependencies.includes(targetPath)) {
                    node.dependencies.push(targetPath);
                }
                // Add dependent to target
                const targetNode = this.graph.nodes.get(targetPath);
                if (targetNode && !targetNode.dependents.includes(filePath)) {
                    targetNode.dependents.push(filePath);
                }
                // Create edge
                this.graph.edges.push({
                    from: filePath,
                    to: targetPath,
                    type: 'import',
                    symbols: imp.names,
                    confidence: 1.0,
                    weight: 0.8
                });
            }
        }
        // Process symbol relationships
        for (const rel of analysis.relationships) {
            if (rel.type === 'inherits' || rel.type === 'implements') {
                // Find file containing the target symbol
                const targetPath = this.findSymbolFile(rel.to);
                if (targetPath && targetPath !== filePath) {
                    this.graph.edges.push({
                        from: filePath,
                        to: targetPath,
                        type: 'inheritance',
                        symbols: [rel.from, rel.to],
                        confidence: rel.confidence,
                        weight: 0.9
                    });
                }
            }
            else if (rel.type === 'calls') {
                // Find file containing the called function
                const targetPath = this.findSymbolFile(rel.to);
                if (targetPath && targetPath !== filePath) {
                    this.graph.edges.push({
                        from: filePath,
                        to: targetPath,
                        type: 'call',
                        symbols: [rel.from, rel.to],
                        confidence: rel.confidence,
                        weight: 0.6
                    });
                }
            }
        }
    }
    /**
    * Resolve import path to actual file path
    */
    resolveImportPath(fromPath, importPath) {
        // Handle relative imports
        if (importPath.startsWith('.')) {
            const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/'));
            const resolved = this.normalizePath(`${fromDir}/${importPath}`);
            // Try with common extensions
            for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js']) {
                const candidate = resolved + ext;
                if (this.graph.nodes.has(candidate)) {
                    return candidate;
                }
            }
        }
        // Handle absolute imports (node_modules, etc.)
        // For now, we only track local files
        return null;
    }
    /**
    * Find file containing a symbol
    */
    findSymbolFile(symbolName) {
        for (const [path, node] of this.graph.nodes.entries()) {
            if (node.exports.includes(symbolName)) {
                return path;
            }
            if (node.symbols.some(s => s.name === symbolName)) {
                return path;
            }
        }
        return null;
    }
    /**
    * Calculate cohesion of a group of files
    */
    calculateCohesion(files) {
        if (files.length < 2)
            return 1.0;
        let totalConnections = 0;
        let possibleConnections = 0;
        for (let i = 0; i < files.length; i++) {
            for (let j = i + 1; j < files.length; j++) {
                possibleConnections++;
                const node1 = this.graph.nodes.get(files[i]);
                const node2 = this.graph.nodes.get(files[j]);
                if (node1 && node2) {
                    // Check if they're connected
                    if (node1.dependencies.includes(files[j]) ||
                        node1.dependents.includes(files[j]) ||
                        node2.dependencies.includes(files[i]) ||
                        node2.dependents.includes(files[i])) {
                        totalConnections++;
                    }
                }
            }
        }
        return possibleConnections > 0 ? totalConnections / possibleConnections : 0;
    }
    /**
    * Infer cluster type from files
    */
    inferClusterType(files) {
        // Simple heuristic based on directory structure
        const commonPath = this.findCommonPath(files);
        if (commonPath.includes('/components/') || commonPath.includes('/views/')) {
            return 'feature';
        }
        else if (commonPath.includes('/models/') || commonPath.includes('/services/')) {
            return 'layer';
        }
        else if (commonPath.includes('/packages/')) {
            return 'package';
        }
        return 'module';
    }
    /**
    * Find common path prefix
    */
    findCommonPath(files) {
        if (files.length === 0)
            return '';
        const parts = files[0].split('/');
        const commonParts = [];
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (files.every(f => f.split('/')[i] === part)) {
                commonParts.push(part);
            }
            else {
                break;
            }
        }
        return commonParts.join('/');
    }
    /**
    * Normalize path
    */
    normalizePath(path) {
        const parts = path.split('/');
        const normalized = [];
        for (const part of parts) {
            if (part === '..') {
                normalized.pop();
            }
            else if (part !== '.' && part !== '') {
                normalized.push(part);
            }
        }
        return normalized.join('/');
    }
}
exports.CrossFileTracker = CrossFileTracker;
//# sourceMappingURL=crossFileTracker.js.map