"use strict";
/**
 * Enhanced Context Gatherer - Deep context for better code generation
 * Goal: Gather comprehensive context for high-quality code generation
 *
 * Features:
 * - Dependency analysis
 * - API documentation extraction
 * - Code pattern detection
 * - Framework conventions
 * - Project structure analysis
 * - Related code discovery
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
exports.EnhancedContextGatherer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('EnhancedContextGatherer');
class EnhancedContextGatherer {
    /**
    * Gather comprehensive context for code generation
    */
    async gather(workspaceRoot, targetFile) {
        const projectType = await this.detectProjectType(workspaceRoot);
        const languages = await this.detectLanguages(workspaceRoot);
        const frameworks = await this.detectFrameworks(workspaceRoot);
        const dependencies = await this.analyzeDependencies(workspaceRoot);
        const relatedFiles = await this.findRelatedFiles(workspaceRoot, targetFile);
        const codePatterns = await this.detectCodePatterns(workspaceRoot, languages);
        const conventions = await this.detectConventions(workspaceRoot, languages);
        const apiDocumentation = await this.extractAPIDocumentation(workspaceRoot);
        const externalAPIs = await this.detectExternalAPIs(workspaceRoot);
        const architecture = await this.analyzeArchitecture(workspaceRoot);
        const designPatterns = await this.detectDesignPatterns(workspaceRoot);
        return {
            projectType,
            languages,
            frameworks,
            dependencies,
            relatedFiles,
            codePatterns,
            conventions,
            apiDocumentation,
            externalAPIs,
            architecture,
            designPatterns
        };
    }
    /**
    * Detect project type
    */
    async detectProjectType(workspaceRoot) {
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            if (packageJson.dependencies?.['express'] || packageJson.dependencies?.['fastify']) {
                return 'api';
            }
            if (packageJson.dependencies?.['react'] || packageJson.dependencies?.['vue'] || packageJson.dependencies?.['angular']) {
                return 'web';
            }
            if (packageJson.bin) {
                return 'cli';
            }
        }
        return 'unknown';
    }
    /**
    * Detect languages used in project
    */
    async detectLanguages(workspaceRoot) {
        const languages = new Set();
        const files = this.getAllFiles(workspaceRoot);
        for (const file of files) {
            const ext = path.extname(file);
            if (ext === '.ts' || ext === '.tsx')
                languages.add('typescript');
            if (ext === '.js' || ext === '.jsx')
                languages.add('javascript');
            if (ext === '.py')
                languages.add('python');
            if (ext === '.rs')
                languages.add('rust');
            if (ext === '.go')
                languages.add('go');
            if (ext === '.java')
                languages.add('java');
        }
        return Array.from(languages);
    }
    /**
    * Detect frameworks
    */
    async detectFrameworks(workspaceRoot) {
        const frameworks = [];
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
            if (deps['react'])
                frameworks.push('react');
            if (deps['vue'])
                frameworks.push('vue');
            if (deps['angular'])
                frameworks.push('angular');
            if (deps['express'])
                frameworks.push('express');
            if (deps['fastify'])
                frameworks.push('fastify');
            if (deps['next'])
                frameworks.push('next');
            if (deps['nest'])
                frameworks.push('nest');
        }
        return frameworks;
    }
    /**
    * Analyze dependencies
    */
    async analyzeDependencies(workspaceRoot) {
        const dependencies = [];
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
                dependencies.push({
                    name,
                    version: version,
                    type: 'production',
                    usage: await this.findDependencyUsage(workspaceRoot, name)
                });
            }
        }
        return dependencies;
    }
    /**
    * Find where a dependency is used
    */
    async findDependencyUsage(workspaceRoot, depName) {
        const usage = [];
        const files = this.getAllFiles(workspaceRoot).filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx'));
        for (const file of files.slice(0, 50)) { // Limit to 50 files for performance
            try {
                const content = fs.readFileSync(file, 'utf-8');
                if (content.includes(`from '${depName}'`) || content.includes(`require('${depName}')`)) {
                    usage.push(path.relative(workspaceRoot, file));
                }
            }
            catch (error) {
                // Skip files that can't be read (permissions, encoding issues, etc.)
                logger.debug(`Failed to read file ${file} for symbol usage analysis:`, error instanceof Error ? error.message : 'Unknown error');
            }
        }
        return usage;
    }
    /**
    * Find related files
    */
    async findRelatedFiles(workspaceRoot, targetFile) {
        const related = [];
        const targetName = path.basename(targetFile, path.extname(targetFile));
        const targetDir = path.dirname(targetFile);
        // Find test files
        const testFile = path.join(targetDir, `${targetName}.test.ts`);
        if (fs.existsSync(testFile)) {
            related.push({
                path: testFile,
                type: 'test',
                relevance: 1.0,
                summary: 'Test file for this module'
            });
        }
        // Find files in same directory
        if (fs.existsSync(targetDir)) {
            const files = fs.readdirSync(targetDir);
            for (const file of files) {
                if (file !== path.basename(targetFile) && !file.includes('.test.')) {
                    related.push({
                        path: path.join(targetDir, file),
                        type: 'similar',
                        relevance: 0.7,
                        summary: 'File in same directory'
                    });
                }
            }
        }
        return related;
    }
    /**
    * Detect code patterns
    */
    async detectCodePatterns(workspaceRoot, languages) {
        const patterns = [];
        // Detect naming patterns
        const files = this.getAllFiles(workspaceRoot).filter(f => languages.some(lang => f.endsWith(`.${lang === 'typescript' ? 'ts' : lang}`)));
        let camelCaseCount = 0;
        let pascalCaseCount = 0;
        for (const file of files.slice(0, 20)) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                camelCaseCount += (content.match(/function [a-z][a-zA-Z0-9]*/g) || []).length;
                pascalCaseCount += (content.match(/class [A-Z][a-zA-Z0-9]*/g) || []).length;
            }
            catch (error) {
                // Skip files that can't be read or parsed
                logger.debug(`Failed to analyze naming conventions in ${file}:`, error instanceof Error ? error.message : 'Unknown error');
            }
        }
        if (camelCaseCount > 0) {
            patterns.push({
                pattern: 'camelCase for functions',
                frequency: camelCaseCount,
                examples: ['function getUserData()', 'const handleClick'],
                category: 'naming'
            });
        }
        if (pascalCaseCount > 0) {
            patterns.push({
                pattern: 'PascalCase for classes',
                frequency: pascalCaseCount,
                examples: ['class UserService', 'class DataManager'],
                category: 'naming'
            });
        }
        return patterns;
    }
    /**
    * Detect conventions
    */
    async detectConventions(workspaceRoot, languages) {
        const conventions = [];
        // Check for ESLint config
        if (fs.existsSync(path.join(workspaceRoot, '.eslintrc.js')) ||
            fs.existsSync(path.join(workspaceRoot, '.eslintrc.json'))) {
            conventions.push({
                type: 'formatting',
                rule: 'ESLint configuration present',
                examples: ['Follow ESLint rules']
            });
        }
        // Check for Prettier config
        if (fs.existsSync(path.join(workspaceRoot, '.prettierrc'))) {
            conventions.push({
                type: 'formatting',
                rule: 'Prettier configuration present',
                examples: ['Use Prettier for formatting']
            });
        }
        return conventions;
    }
    /**
    * Extract API documentation
    */
    async extractAPIDocumentation(workspaceRoot) {
        // Simplified - would parse JSDoc/TSDoc in production
        return [];
    }
    /**
    * Detect external APIs
    */
    async detectExternalAPIs(workspaceRoot) {
        // Simplified - would analyze API calls in production
        return [];
    }
    /**
    * Analyze architecture
    */
    async analyzeArchitecture(workspaceRoot) {
        const directories = [];
        try {
            const srcDir = path.join(workspaceRoot, 'src');
            if (fs.existsSync(srcDir)) {
                const subdirs = fs.readdirSync(srcDir, { withFileTypes: true })
                    .filter(d => d.isDirectory());
                for (const dir of subdirs) {
                    const dirPath = path.join(srcDir, dir.name);
                    const files = this.getAllFiles(dirPath);
                    directories.push({
                        path: dir.name,
                        purpose: this.inferDirectoryPurpose(dir.name),
                        fileCount: files.length
                    });
                }
            }
        }
        catch (error) {
            // Skip directories that can't be read (permissions, etc.)
            logger.debug(`Failed to analyze project structure in ${workspaceRoot}:`, error instanceof Error ? error.message : 'Unknown error');
        }
        const style = this.inferArchitectureStyle(directories);
        return {
            style,
            layers: directories.map(d => d.path),
            directories
        };
    }
    /**
    * Infer directory purpose
    */
    inferDirectoryPurpose(dirName) {
        const purposes = {
            'controllers': 'HTTP request handlers',
            'services': 'Business logic',
            'models': 'Data models',
            'repositories': 'Data access',
            'utils': 'Utility functions',
            'components': 'UI components',
            'pages': 'Page components',
            'api': 'API routes',
            'lib': 'Library code',
            'config': 'Configuration'
        };
        return purposes[dirName.toLowerCase()] || 'Unknown';
    }
    /**
    * Infer architecture style
    */
    inferArchitectureStyle(directories) {
        const dirNames = directories.map(d => d.path.toLowerCase());
        if (dirNames.includes('controllers') && dirNames.includes('models') && dirNames.includes('views')) {
            return 'mvc';
        }
        if (dirNames.includes('domain') && dirNames.includes('application') && dirNames.includes('infrastructure')) {
            return 'clean';
        }
        if (dirNames.includes('services') && dirNames.includes('repositories')) {
            return 'layered';
        }
        return 'unknown';
    }
    /**
    * Detect design patterns
    */
    async detectDesignPatterns(workspaceRoot) {
        const patterns = [];
        const files = this.getAllFiles(workspaceRoot).filter(f => f.endsWith('.ts') || f.endsWith('.js'));
        for (const file of files.slice(0, 20)) {
            try {
                const content = fs.readFileSync(file, 'utf-8');
                if (content.includes('getInstance') || content.includes('private constructor')) {
                    patterns.push('Singleton');
                }
                if (content.includes('Factory') || content.includes('create')) {
                    patterns.push('Factory');
                }
                if (content.includes('Observer') || content.includes('subscribe')) {
                    patterns.push('Observer');
                }
            }
            catch (error) {
                // Skip files that can't be read or parsed for design patterns
                logger.debug(`Failed to detect design patterns in ${file}:`, error instanceof Error ? error.message : 'Unknown error');
            }
        }
        return [...new Set(patterns)];
    }
    /**
    * Get all files recursively
    */
    getAllFiles(dir, files = []) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                        this.getAllFiles(fullPath, files);
                    }
                }
                else {
                    files.push(fullPath);
                }
            }
        }
        catch (error) {
            // Skip directories we can't read (permissions, symlinks, etc.)
            logger.debug(`Failed to read directory ${dir}:`, error instanceof Error ? error.message : 'Unknown error');
        }
        return files;
    }
}
exports.EnhancedContextGatherer = EnhancedContextGatherer;
//# sourceMappingURL=enhancedContextGatherer.js.map