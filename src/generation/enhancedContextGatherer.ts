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

import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../utils/logger';

const logger = createLogger('EnhancedContextGatherer');

export interface EnhancedContext {
 // Project context
 projectType: 'web' | 'api' | 'library' | 'cli' | 'mobile' | 'desktop' | 'unknown';
 languages: string[];
 frameworks: string[];
 dependencies: DependencyInfo[];

 // Code context
 relatedFiles: RelatedFile[];
 codePatterns: CodePattern[];
 conventions: Convention[];

 // API context
 apiDocumentation: APIDoc[];
 externalAPIs: ExternalAPI[];

 // Architecture context
 architecture: ArchitectureInfo;
 designPatterns: string[];
}

export interface DependencyInfo {
 name: string;
 version: string;
 type: 'production' | 'development';
 usage: string[];
 documentation?: string;
}

export interface RelatedFile {
 path: string;
 type: 'similar' | 'dependency' | 'test' | 'config';
 relevance: number; // 0-1
 summary: string;
}

export interface CodePattern {
 pattern: string;
 frequency: number;
 examples: string[];
 category: 'naming' | 'structure' | 'error-handling' | 'testing' | 'other';
}

export interface Convention {
 type: 'naming' | 'structure' | 'formatting' | 'testing';
 rule: string;
 examples: string[];
}

export interface APIDoc {
 name: string;
 description: string;
 methods: APIMethod[];
 examples: string[];
}

export interface APIMethod {
 name: string;
 parameters: Parameter[];
 returnType: string;
 description: string;
 example: string;
}

export interface Parameter {
 name: string;
 type: string;
 required: boolean;
 description: string;
}

export interface ExternalAPI {
 name: string;
 baseUrl: string;
 authentication: string;
 endpoints: APIEndpoint[];
}

export interface APIEndpoint {
 method: string;
 path: string;
 description: string;
 parameters: Parameter[];
 response: string;
}

export interface ArchitectureInfo {
 style: 'mvc' | 'mvvm' | 'clean' | 'layered' | 'microservices' | 'monolithic' | 'unknown';
 layers: string[];
 directories: DirectoryInfo[];
}

export interface DirectoryInfo {
 path: string;
 purpose: string;
 fileCount: number;
}

export class EnhancedContextGatherer {
 /**
 * Gather comprehensive context for code generation
 */
 async gather(workspaceRoot: string, targetFile: string): Promise<EnhancedContext> {
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
 private async detectProjectType(workspaceRoot: string): Promise<EnhancedContext['projectType']> {
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
 private async detectLanguages(workspaceRoot: string): Promise<string[]> {
 const languages = new Set<string>();

 const files = this.getAllFiles(workspaceRoot);
 for (const file of files) {
 const ext = path.extname(file);
 if (ext === '.ts' || ext === '.tsx') languages.add('typescript');
 if (ext === '.js' || ext === '.jsx') languages.add('javascript');
 if (ext === '.py') languages.add('python');
 if (ext === '.rs') languages.add('rust');
 if (ext === '.go') languages.add('go');
 if (ext === '.java') languages.add('java');
 }

 return Array.from(languages);
 }

 /**
 * Detect frameworks
 */
 private async detectFrameworks(workspaceRoot: string): Promise<string[]> {
 const frameworks: string[] = [];
 const packageJsonPath = path.join(workspaceRoot, 'package.json');

 if (fs.existsSync(packageJsonPath)) {
 const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
 const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

 if (deps['react']) frameworks.push('react');
 if (deps['vue']) frameworks.push('vue');
 if (deps['angular']) frameworks.push('angular');
 if (deps['express']) frameworks.push('express');
 if (deps['fastify']) frameworks.push('fastify');
 if (deps['next']) frameworks.push('next');
 if (deps['nest']) frameworks.push('nest');
 }

 return frameworks;
 }

 /**
 * Analyze dependencies
 */
 private async analyzeDependencies(workspaceRoot: string): Promise<DependencyInfo[]> {
 const dependencies: DependencyInfo[] = [];
 const packageJsonPath = path.join(workspaceRoot, 'package.json');

 if (fs.existsSync(packageJsonPath)) {
 const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

 for (const [name, version] of Object.entries(packageJson.dependencies || {})) {
 dependencies.push({
 name,
 version: version as string,
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
 private async findDependencyUsage(workspaceRoot: string, depName: string): Promise<string[]> {
 const usage: string[] = [];
 const files = this.getAllFiles(workspaceRoot).filter(f =>
 f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')
 );

 for (const file of files.slice(0, 50)) { // Limit to 50 files for performance
 try {
 const content = fs.readFileSync(file, 'utf-8');
 if (content.includes(`from '${depName}'`) || content.includes(`require('${depName}')`)) {
 usage.push(path.relative(workspaceRoot, file));
 }
 } catch (error) {
 // Skip files that can't be read (permissions, encoding issues, etc.)
 logger.debug(`Failed to read file ${file} for symbol usage analysis:`, error instanceof Error ? error.message : 'Unknown error');
 }
 }

 return usage;
 }

 /**
 * Find related files
 */
 private async findRelatedFiles(workspaceRoot: string, targetFile: string): Promise<RelatedFile[]> {
 const related: RelatedFile[] = [];
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
 private async detectCodePatterns(workspaceRoot: string, languages: string[]): Promise<CodePattern[]> {
 const patterns: CodePattern[] = [];

 // Detect naming patterns
 const files = this.getAllFiles(workspaceRoot).filter(f =>
 languages.some(lang => f.endsWith(`.${lang === 'typescript' ? 'ts' : lang}`))
 );

 let camelCaseCount = 0;
 let pascalCaseCount = 0;

 for (const file of files.slice(0, 20)) {
 try {
 const content = fs.readFileSync(file, 'utf-8');
 camelCaseCount += (content.match(/function [a-z][a-zA-Z0-9]*/g) || []).length;
 pascalCaseCount += (content.match(/class [A-Z][a-zA-Z0-9]*/g) || []).length;
 } catch (error) {
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
 private async detectConventions(workspaceRoot: string, languages: string[]): Promise<Convention[]> {
 const conventions: Convention[] = [];

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
 private async extractAPIDocumentation(workspaceRoot: string): Promise<APIDoc[]> {
 // Simplified - would parse JSDoc/TSDoc in production
 return [];
 }

 /**
 * Detect external APIs
 */
 private async detectExternalAPIs(workspaceRoot: string): Promise<ExternalAPI[]> {
 // Simplified - would analyze API calls in production
 return [];
 }

 /**
 * Analyze architecture
 */
 private async analyzeArchitecture(workspaceRoot: string): Promise<ArchitectureInfo> {
 const directories: DirectoryInfo[] = [];

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
 } catch (error) {
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
 private inferDirectoryPurpose(dirName: string): string {
 const purposes: Record<string, string> = {
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
 private inferArchitectureStyle(directories: DirectoryInfo[]): ArchitectureInfo['style'] {
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
 private async detectDesignPatterns(workspaceRoot: string): Promise<string[]> {
 const patterns: string[] = [];
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
 } catch (error) {
 // Skip files that can't be read or parsed for design patterns
 logger.debug(`Failed to detect design patterns in ${file}:`, error instanceof Error ? error.message : 'Unknown error');
 }
 }

 return [...new Set(patterns)];
 }

 /**
 * Get all files recursively
 */
 private getAllFiles(dir: string, files: string[] = []): string[] {
 try {
 const entries = fs.readdirSync(dir, { withFileTypes: true });

 for (const entry of entries) {
 const fullPath = path.join(dir, entry.name);

 if (entry.isDirectory()) {
 if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
 this.getAllFiles(fullPath, files);
 }
 } else {
 files.push(fullPath);
 }
 }
 } catch (error) {
 // Skip directories we can't read (permissions, symlinks, etc.)
 logger.debug(`Failed to read directory ${dir}:`, error instanceof Error ? error.message : 'Unknown error');
 }

 return files;
 }
}

