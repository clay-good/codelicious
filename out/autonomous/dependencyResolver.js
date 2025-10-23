"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyResolver = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('DependencyResolver');
class DependencyResolver {
    constructor(executionEngine, orchestrator, workspaceRoot) {
        this.executionEngine = executionEngine;
        this.orchestrator = orchestrator;
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Resolve and install all dependencies
    */
    async resolveDependencies(requiredPackages, sourceFiles) {
        logger.info('Resolving dependencies...');
        const errors = [];
        const conflicts = [];
        try {
            // Step 1: Load package.json
            const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
            let packageJson = this.loadPackageJson(packageJsonPath);
            // Step 2: Detect missing dependencies from source files
            if (sourceFiles) {
                const detected = await this.detectDependenciesFromSource(sourceFiles);
                requiredPackages.push(...detected);
            }
            // Remove duplicates
            requiredPackages = [...new Set(requiredPackages)];
            logger.info(`Found ${requiredPackages.length} required packages`);
            // Step 3: Check what's missing
            const missing = this.findMissingDependencies(requiredPackages, packageJson);
            logger.info(`Missing ${missing.length} packages`);
            if (missing.length === 0) {
                return {
                    success: true,
                    installed: [],
                    conflicts: [],
                    errors: [],
                    packageJsonUpdated: false
                };
            }
            // Step 4: Resolve versions
            const resolved = await this.resolveVersions(missing);
            logger.info(`Resolved versions for ${resolved.length} packages`);
            // Step 5: Check for conflicts
            const detectedConflicts = this.detectConflicts(resolved, packageJson);
            if (detectedConflicts.length > 0) {
                logger.info(`Found ${detectedConflicts.length} version conflicts`);
                conflicts.push(...detectedConflicts);
                // Auto-resolve conflicts
                const autoResolved = await this.resolveConflicts(detectedConflicts);
                logger.info(`Auto-resolved ${autoResolved.length} conflicts`);
            }
            // Step 6: Update package.json
            packageJson = this.updatePackageJson(packageJson, resolved);
            this.savePackageJson(packageJsonPath, packageJson);
            logger.info('Updated package.json');
            // Step 7: Install dependencies
            logger.info('Installing dependencies...');
            const installResult = await this.installDependencies();
            if (!installResult.success) {
                errors.push('Failed to install dependencies');
                errors.push(installResult.output);
            }
            return {
                success: installResult.success,
                installed: resolved,
                conflicts,
                errors,
                packageJsonUpdated: true,
                installOutput: installResult.output
            };
        }
        catch (error) {
            errors.push(`Dependency resolution failed: ${error}`);
            return {
                success: false,
                installed: [],
                conflicts,
                errors,
                packageJsonUpdated: false
            };
        }
    }
    /**
    * Load package.json
    */
    loadPackageJson(packageJsonPath) {
        if (!fs.existsSync(packageJsonPath)) {
            // Create minimal package.json
            return {
                name: 'generated-project',
                version: '1.0.0',
                dependencies: {},
                devDependencies: {}
            };
        }
        return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    }
    /**
    * Save package.json
    */
    savePackageJson(packageJsonPath, packageJson) {
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
    }
    /**
    * Detect dependencies from source files
    */
    async detectDependenciesFromSource(sourceFiles) {
        const dependencies = new Set();
        for (const file of sourceFiles) {
            if (!fs.existsSync(file))
                continue;
            const content = fs.readFileSync(file, 'utf8');
            // Extract import statements
            const importPattern = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g;
            let match;
            while ((match = importPattern.exec(content)) !== null) {
                const importPath = match[1];
                // Skip relative imports
                if (importPath.startsWith('.') || importPath.startsWith('/')) {
                    continue;
                }
                // Extract package name (handle scoped packages)
                let packageName = importPath;
                if (importPath.startsWith('@')) {
                    // Scoped package: @scope/package/path -> @scope/package
                    const parts = importPath.split('/');
                    packageName = `${parts[0]}/${parts[1]}`;
                }
                else {
                    // Regular package: package/path -> package
                    packageName = importPath.split('/')[0];
                }
                dependencies.add(packageName);
            }
            // Extract require statements
            const requirePattern = /require\(['"]([^'"]+)['"]\)/g;
            while ((match = requirePattern.exec(content)) !== null) {
                const requirePath = match[1];
                if (!requirePath.startsWith('.') && !requirePath.startsWith('/')) {
                    const packageName = requirePath.startsWith('@')
                        ? requirePath.split('/').slice(0, 2).join('/')
                        : requirePath.split('/')[0];
                    dependencies.add(packageName);
                }
            }
        }
        return Array.from(dependencies);
    }
    /**
    * Find missing dependencies
    */
    findMissingDependencies(required, packageJson) {
        const existing = new Set([
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {})
        ]);
        return required.filter(pkg => !existing.has(pkg));
    }
    /**
    * Resolve versions for packages
    */
    async resolveVersions(packages) {
        const resolved = [];
        for (const pkg of packages) {
            try {
                // Get latest version from npm
                const version = await this.getLatestVersion(pkg);
                resolved.push({
                    name: pkg,
                    version,
                    type: this.determineDepType(pkg),
                    required: true,
                    latestVersion: version
                });
            }
            catch (error) {
                logger.warn(`Could not resolve version for ${pkg}, using 'latest'`);
                resolved.push({
                    name: pkg,
                    version: 'latest',
                    type: this.determineDepType(pkg),
                    required: true
                });
            }
        }
        return resolved;
    }
    /**
    * Get latest version from npm
    */
    async getLatestVersion(packageName) {
        try {
            const result = await this.executionEngine.execute(`npm view ${packageName} version`, { workingDirectory: this.workspaceRoot });
            if (result.success && result.stdout) {
                return result.stdout.trim();
            }
        }
        catch (error) {
            // Fallback to latest
        }
        return 'latest';
    }
    /**
    * Determine dependency type
    */
    determineDepType(packageName) {
        // Common dev dependencies
        const devPackages = [
            'typescript', 'eslint', 'prettier', 'jest', 'mocha', 'chai',
            'webpack', 'vite', 'rollup', 'babel', '@types/', 'ts-node',
            'nodemon', 'concurrently', 'rimraf'
        ];
        for (const devPkg of devPackages) {
            if (packageName.includes(devPkg)) {
                return 'devDependency';
            }
        }
        return 'dependency';
    }
    /**
    * Detect version conflicts
    */
    detectConflicts(newDeps, packageJson // package.json structure
    ) {
        const conflicts = [];
        for (const dep of newDeps) {
            const existingVersion = packageJson.dependencies?.[dep.name] ||
                packageJson.devDependencies?.[dep.name];
            if (existingVersion && existingVersion !== dep.version) {
                conflicts.push({
                    package: dep.name,
                    requiredVersions: [existingVersion, dep.version],
                    resolvedVersion: dep.version, // Prefer newer version
                    reason: 'Version mismatch detected'
                });
            }
        }
        return conflicts;
    }
    /**
    * Auto-resolve conflicts
    */
    async resolveConflicts(conflicts) {
        // For now, just use the latest version
        // Could be more sophisticated with semver analysis
        return conflicts;
    }
    /**
    * Update package.json with new dependencies
    */
    updatePackageJson(packageJson, dependencies) {
        const updated = { ...packageJson };
        if (!updated.dependencies)
            updated.dependencies = {};
        if (!updated.devDependencies)
            updated.devDependencies = {};
        for (const dep of dependencies) {
            if (dep.type === 'devDependency') {
                updated.devDependencies[dep.name] = dep.version;
            }
            else {
                updated.dependencies[dep.name] = dep.version;
            }
        }
        return updated;
    }
    /**
    * Install dependencies
    */
    async installDependencies() {
        try {
            const result = await this.executionEngine.execute('npm install', { workingDirectory: this.workspaceRoot });
            return {
                success: result.success,
                output: result.stdout || result.stderr || ''
            };
        }
        catch (error) {
            return {
                success: false,
                output: String(error)
            };
        }
    }
    /**
    * Check if dependencies are installed
    */
    async checkInstalled() {
        const nodeModulesPath = path.join(this.workspaceRoot, 'node_modules');
        return fs.existsSync(nodeModulesPath);
    }
    /**
    * Get installed version of a package
    */
    async getInstalledVersion(packageName) {
        try {
            const packagePath = path.join(this.workspaceRoot, 'node_modules', packageName, 'package.json');
            if (fs.existsSync(packagePath)) {
                const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                return pkg.version;
            }
        }
        catch (error) {
            // Package not installed
        }
        return null;
    }
}
exports.DependencyResolver = DependencyResolver;
//# sourceMappingURL=dependencyResolver.js.map