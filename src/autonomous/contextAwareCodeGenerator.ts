/**
 * Context-Aware Code Generator - Generate production-ready code with full context
 *
 * Matches Augment's context-aware generation with architectural understanding
 * ENHANCED: Now uses Master Code Generator for world-class code quality
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ModelOrchestrator, TaskComplexity } from '../models/orchestrator';
import { ExecutionPlan, FileOperation } from './intelligentPlanner';
import { ArchitecturalContext } from '../context/persistentContextEngine';
import { MasterCodeGenerator, GenerationRequest } from '../generation/masterCodeGenerator';
import { EnhancedCodeGenerator, EnhancedGenerationRequest } from '../generation/enhancedCodeGenerator';
import { EnhancedContext } from '../generation/enhancedContextGatherer';
import { createLogger } from '../utils/logger';

const logger = createLogger('ContextAwareCodeGenerator');

export interface GeneratedCode {
 filePath: string;
 content: string;
 operation: 'create' | 'modify' | 'delete';
 imports: string[];
 exports: string[];
 documentation: string;
 tests: string;
}

export interface GenerationOptions {
 includeTests: boolean;
 includeDocumentation: boolean;
 followPatterns: boolean;
 errorHandling: 'basic' | 'comprehensive';
 codeStyle: 'functional' | 'oop' | 'auto';
}

export interface GenerationResult {
 generatedFiles: GeneratedCode[];
 totalLines: number;
 estimatedQuality: number;
 warnings: string[];
}

export class ContextAwareCodeGenerator {
 private masterGenerator: MasterCodeGenerator;
 private enhancedGenerator: EnhancedCodeGenerator;

 constructor(
 private orchestrator: ModelOrchestrator,
 private workspaceRoot: string
 ) {
 this.masterGenerator = new MasterCodeGenerator();
 this.enhancedGenerator = new EnhancedCodeGenerator(orchestrator);
 }

 /**
 * Generate code for execution plan
 * OPTIMIZED: Parallel code generation with dependency-aware batching
 */
 async generate(
 plan: ExecutionPlan,
 context: ArchitecturalContext,
 options: GenerationOptions
 ): Promise<GenerationResult> {
 logger.info('Generating code...');

 const generatedFiles: GeneratedCode[] = [];
 const warnings: string[] = [];
 let totalLines = 0;

 // PERFORMANCE: Group operations by dependency level for parallel execution
 const batches = this.groupOperationsByDependencies(plan.fileOperations);

 logger.info(`Processing ${batches.length} batches in parallel...`);

 // Process each batch in parallel
 for (const batch of batches) {
 const batchPromises = batch.map(async (operation) => {
 try {
 const generated = await this.generateForOperation(
 operation,
 plan,
 context,
 options
 );
 return { success: true, generated };
 } catch (error) {
 const warning = `Failed to generate ${operation.path}: ${error}`;
 logger.error(`Generation error for ${operation.path}`, error);
 return { success: false, warning };
 }
 });

 // Wait for batch to complete before moving to next
 const results = await Promise.all(batchPromises);

 // Collect results
 for (const result of results) {
 if (result.success && result.generated) {
 generatedFiles.push(result.generated);
 totalLines += result.generated.content.split('\n').length;
 } else if (result.warning) {
 warnings.push(result.warning);
 }
 }
 }

 const estimatedQuality = this.estimateQuality(generatedFiles, warnings);

 logger.info(`Generated ${generatedFiles.length} files (${totalLines} lines)`);

 return {
 generatedFiles,
 totalLines,
 estimatedQuality,
 warnings
 };
 }

 /**
 * Generate code for a single file operation
 * ENHANCED: Now uses Master Code Generator for superior quality
 */
 private async generateForOperation(
 operation: FileOperation,
 plan: ExecutionPlan,
 context: ArchitecturalContext,
 options: GenerationOptions
 ): Promise<GeneratedCode> {
 if (operation.type === 'delete') {
 return {
 filePath: operation.path,
 content: '',
 operation: 'delete',
 imports: [],
 exports: [],
 documentation: `Deleted: ${operation.reason}`,
 tests: ''
 };
 }

 // Try using Master Code Generator for new files
 if (operation.type === 'create') {
 try {
 const language = this.detectLanguage(operation.path);
 const framework = this.detectFramework(context);

 const request: GenerationRequest = {
 description: operation.reason,
 language,
 framework,
 filePath: operation.path,
 workspaceRoot: this.workspaceRoot,
 options: {
 useTemplates: true,
 targetQuality: 85,
 maxRefinementPasses: 3,
 includeTests: options.includeTests,
 includeDocumentation: options.includeDocumentation,
 strictValidation: false
 }
 };

 const result = await this.masterGenerator.generate(request);

 if (result.success && result.quality.score >= 70) {
 logger.info(`Master Generator: ${result.quality.grade} quality (${result.quality.score}/100)`);
 return {
 filePath: operation.path,
 content: result.code,
 operation: 'create',
 imports: this.extractImports(result.code),
 exports: this.extractExports(result.code),
 documentation: result.documentation || '',
 tests: result.testCode || ''
 };
 }
 } catch (error) {
 logger.warn('Master Generator failed, falling back to standard generation', error);
 }
 }

 // Use enhanced generator for modifications or if master generator fails
 let existingContent = '';
 if (operation.type === 'modify') {
 try {
 const fullPath = path.join(this.workspaceRoot, operation.path);
 existingContent = await fs.readFile(fullPath, 'utf-8');
 } catch (error) {
 logger.warn(`Could not read existing file ${operation.path}, treating as create`);
 }
 }

 // Use enhanced generator with quality enforcement
 const language = this.detectLanguage(operation.path);
 const framework = this.detectFramework(context);

 const enhancedRequest: EnhancedGenerationRequest = {
 description: operation.reason,
 language,
 framework,
 filePath: operation.path,
 context: this.convertToEnhancedContext(context),
 existingCode: existingContent || undefined,
 requirements: plan.requirements.mainRequirement.acceptanceCriteria,
 constraints: plan.requirements.mainRequirement.technicalConstraints
 };

 const enhancedResult = await this.enhancedGenerator.generate(enhancedRequest);

 logger.info(`Enhanced Generator: Quality ${enhancedResult.quality}/100`);
 if (enhancedResult.issues.length > 0) {
 logger.info(`Issues resolved: ${enhancedResult.issues.length}`);
 }

 return {
 filePath: operation.path,
 content: enhancedResult.code,
 operation: operation.type,
 imports: this.extractImports(enhancedResult.code),
 exports: this.extractExports(enhancedResult.code),
 documentation: this.extractDocumentation(enhancedResult.code),
 tests: options.includeTests ? await this.generateTestsForCode(enhancedResult.code, operation, context) : ''
 };
 }

 /**
 * Detect language from file path
 */
 private detectLanguage(filePath: string): string {
 const ext = path.extname(filePath);
 const langMap: Record<string, string> = {
 '.ts': 'typescript',
 '.tsx': 'typescript',
 '.js': 'javascript',
 '.jsx': 'javascript',
 '.py': 'python',
 '.rs': 'rust',
 '.go': 'go',
 '.java': 'java'
 };
 return langMap[ext] || 'typescript';
 }

 /**
 * Detect framework from context
 */
 private detectFramework(context: ArchitecturalContext): string | undefined {
 for (const pattern of context.patterns) {
 if (pattern.description.toLowerCase().includes('react')) return 'react';
 if (pattern.description.toLowerCase().includes('vue')) return 'vue';
 if (pattern.description.toLowerCase().includes('express')) return 'express';
 if (pattern.description.toLowerCase().includes('next')) return 'next';
 }
 return undefined;
 }

 /**
 * Extract imports from code
 */
 private extractImports(code: string): string[] {
 const imports: string[] = [];
 const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
 let match;
 while ((match = importRegex.exec(code)) !== null) {
 imports.push(match[1]);
 }
 return imports;
 }

 /**
 * Extract exports from code
 */
 private extractExports(code: string): string[] {
 const exports: string[] = [];
 const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g;
 let match;
 while ((match = exportRegex.exec(code)) !== null) {
 exports.push(match[1]);
 }
 return exports;
 }

 /**
 * Build generation prompt
 */
 private buildGenerationPrompt(
 operation: FileOperation,
 plan: ExecutionPlan,
 context: ArchitecturalContext,
 existingContent: string,
 options: GenerationOptions
 ): string {
 const isModify = operation.type === 'modify' && existingContent;

 return `${isModify ? 'Modify' : 'Create'} the file: ${operation.path}

REASON: ${operation.reason}

REQUIREMENTS:
${JSON.stringify(plan.requirements.mainRequirement, null, 2)}

ARCHITECTURAL PATTERNS:
${context.patterns.map(p => `- ${p.type}: ${p.description}`).join('\n')}

${isModify ? `EXISTING CODE:\n\`\`\`\n${existingContent}\n\`\`\`\n` : ''}

INTEGRATION POINTS:
${plan.integrationPoints
 .filter(ip => ip.file === operation.path)
 .map(ip => `- ${ip.function}: ${ip.description}`)
 .join('\n')}

DEPENDENCIES:
${operation.dependencies.map(d => `- ${d}`).join('\n')}

GENERATION OPTIONS:
- Include Tests: ${options.includeTests}
- Include Documentation: ${options.includeDocumentation}
- Follow Patterns: ${options.followPatterns}
- Error Handling: ${options.errorHandling}
- Code Style: ${options.codeStyle}

Generate ${isModify ? 'modified' : 'new'} code that:
1. Follows the detected architectural patterns
2. Integrates seamlessly with existing code
3. Includes proper error handling (${options.errorHandling})
4. Has comprehensive documentation
5. Is production-ready and maintainable
6. Follows TypeScript/JavaScript best practices

Return the code in this format:
\`\`\`typescript
// Generated code here
\`\`\`

${options.includeTests ? `
Also provide unit tests:
\`\`\`typescript
// Test code here
\`\`\`
` : ''}`;
 }

 /**
 * Parse generated code from AI response
 */
 private parseGeneratedCode(
 content: string,
 operation: FileOperation,
 options: GenerationOptions
 ): GeneratedCode {
 // Extract code blocks
 const codeBlocks = content.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/g) || [];

 let mainCode = '';
 let testCode = '';

 if (codeBlocks.length > 0 && codeBlocks[0]) {
 mainCode = codeBlocks[0].replace(/```(?:typescript|javascript|ts|js)?\n/, '').replace(/```$/, '').trim();
 if (codeBlocks.length > 1 && options.includeTests && codeBlocks[1]) {
 testCode = codeBlocks[1].replace(/```(?:typescript|javascript|ts|js)?\n/, '').replace(/```$/, '').trim();
 }
 } else {
 mainCode = content;
 }

 // Extract imports and exports
 const imports = this.extractImports(mainCode);
 const exports = this.extractExports(mainCode);

 // Extract documentation
 const documentation = this.extractDocumentation(content);

 return {
 filePath: operation.path,
 content: mainCode,
 operation: operation.type,
 imports,
 exports,
 documentation,
 tests: testCode
 };
 }

 /**
 * Extract documentation
 */
 private extractDocumentation(content: string): string {
 const docMatch = content.match(/\/\*\*[\s\S]*?\*\//);
 return docMatch ? docMatch[0] : '';
 }

 /**
 * Group operations by dependency level for parallel execution
 * PERFORMANCE: Enables parallel generation while respecting dependencies
 */
 private groupOperationsByDependencies(operations: FileOperation[]): FileOperation[][] {
 const batches: FileOperation[][] = [];
 const processed = new Set<string>();
 const remaining = [...operations];

 while (remaining.length > 0) {
 const batch: FileOperation[] = [];

 // Find operations with no unprocessed dependencies
 for (let i = remaining.length - 1; i >= 0; i--) {
 const op = remaining[i];
 const hasPendingDeps = op.dependencies?.some(dep => !processed.has(dep)) ?? false;

 if (!hasPendingDeps) {
 batch.push(op);
 processed.add(op.path);
 remaining.splice(i, 1);
 }
 }

 // If no operations can be processed, break to avoid infinite loop
 if (batch.length === 0) {
 // Add remaining operations to final batch (circular dependencies)
 batches.push(remaining);
 break;
 }

 batches.push(batch);
 }

 return batches;
 }

 /**
 * Estimate code quality
 */
 private estimateQuality(files: GeneratedCode[], warnings: string[]): number {
 let score = 100;

 // Penalize for warnings
 score -= warnings.length * 10;

 // Check for documentation
 const filesWithDocs = files.filter(f => f.documentation).length;
 if (filesWithDocs < files.length * 0.8) {
 score -= 10;
 }

 // Check for tests
 const filesWithTests = files.filter(f => f.tests).length;
 if (filesWithTests < files.length * 0.5) {
 score -= 15;
 }

 // Check for error handling
 const filesWithErrorHandling = files.filter(f =>
 f.content.includes('try') || f.content.includes('catch') || f.content.includes('throw')
 ).length;
 if (filesWithErrorHandling < files.length * 0.6) {
 score -= 10;
 }

 return Math.max(0, Math.min(100, score));
 }

 /**
 * Write generated code to disk
 */
 async writeCode(generated: GeneratedCode): Promise<void> {
 const fullPath = path.join(this.workspaceRoot, generated.filePath);

 if (generated.operation === 'delete') {
 await fs.unlink(fullPath);
 logger.info(`Deleted: ${generated.filePath}`);
 return;
 }

 // Ensure directory exists
 await fs.mkdir(path.dirname(fullPath), { recursive: true });

 // Write main code
 await fs.writeFile(fullPath, generated.content, 'utf-8');
 logger.info(`${generated.operation === 'create' ? 'Created' : 'Modified'}: ${generated.filePath}`);

 // Write tests if available
 if (generated.tests) {
 const testPath = this.getTestPath(generated.filePath);
 await fs.mkdir(path.dirname(testPath), { recursive: true });
 await fs.writeFile(testPath, generated.tests, 'utf-8');
 logger.info(`Created test: ${testPath}`);
 }
 }

 /**
 * Get test file path for a source file
 */
 private getTestPath(sourcePath: string): string {
 const ext = path.extname(sourcePath);
 const base = sourcePath.replace(ext, '');
 return `${base}.test${ext}`;
 }

 /**
 * Generate tests for code using enhanced generator
 */
 private async generateTestsForCode(
 code: string,
 operation: FileOperation,
 context: ArchitecturalContext
 ): Promise<string> {
 try {
 const language = this.detectLanguage(operation.path);
 const framework = this.detectFramework(context);

 const testRequest: EnhancedGenerationRequest = {
 description: `Generate comprehensive tests for: ${operation.reason}`,
 language,
 framework,
 filePath: this.getTestPath(operation.path),
 context: this.convertToEnhancedContext(context),
 existingCode: code,
 requirements: [
 'Test all public methods',
 'Test edge cases and boundary conditions',
 'Test error handling',
 'Use proper assertions',
 'Mock external dependencies'
 ]
 };

 const testResult = await this.enhancedGenerator.generate(testRequest);
 return testResult.code;
 } catch (error) {
 logger.warn('Failed to generate tests with enhanced generator', error);
 return '';
 }
 }

 /**
 * Convert ArchitecturalContext to EnhancedContext
 */
 private convertToEnhancedContext(context: ArchitecturalContext): EnhancedContext {
 // Extract architectural patterns
 const architecturalPatterns = context.patterns
 .filter(p => p.type === 'mvc' || p.type === 'layered' || p.type === 'microservice')
 .map(p => p.description);

 return {
 projectType: this.detectProjectType(context),
 languages: this.extractLanguages(context),
 frameworks: this.extractFrameworks(context),
 dependencies: context.dependencies.map(dep => ({
 name: dep.to,
 version: '1.0.0', // Version not available in ArchitecturalContext
 type: 'production' as const,
 usage: [dep.from]
 })),
 relatedFiles: context.relevantFiles.map(file => ({
 path: file.path,
 type: 'similar' as const,
 relevance: 0.8,
 summary: file.path
 })),
 codePatterns: context.patterns.map(pattern => ({
 pattern: pattern.description,
 frequency: pattern.confidence,
 examples: pattern.files.slice(0, 3),
 category: 'structure' as const
 })),
 conventions: [],
 apiDocumentation: [],
 externalAPIs: [],
 architecture: {
 style: this.detectArchitectureStyle(architecturalPatterns),
 layers: this.extractLayers(context),
 directories: []
 },
 designPatterns: architecturalPatterns
 };
 }

 /**
 * Detect architecture style from patterns
 */
 private detectArchitectureStyle(patterns: string[]): 'mvc' | 'mvvm' | 'clean' | 'layered' | 'microservices' | 'monolithic' | 'unknown' {
 const patternsLower = patterns.map(p => p.toLowerCase()).join(' ');
 if (patternsLower.includes('mvc')) return 'mvc';
 if (patternsLower.includes('mvvm')) return 'mvvm';
 if (patternsLower.includes('clean')) return 'clean';
 if (patternsLower.includes('layered') || patternsLower.includes('layer')) return 'layered';
 if (patternsLower.includes('microservice')) return 'microservices';
 if (patternsLower.includes('monolith')) return 'monolithic';
 return 'unknown';
 }

 /**
 * Extract layers from context
 */
 private extractLayers(context: ArchitecturalContext): string[] {
 const layers = new Set<string>();
 for (const pattern of context.patterns) {
 const desc = pattern.description.toLowerCase();
 if (desc.includes('controller') || desc.includes('presentation')) layers.add('presentation');
 if (desc.includes('service') || desc.includes('business')) layers.add('business');
 if (desc.includes('repository') || desc.includes('data')) layers.add('data');
 if (desc.includes('model') || desc.includes('entity')) layers.add('model');
 }
 return Array.from(layers);
 }

 /**
 * Detect project type from context
 */
 private detectProjectType(context: ArchitecturalContext): 'web' | 'api' | 'library' | 'cli' | 'mobile' | 'desktop' | 'unknown' {
 for (const pattern of context.patterns) {
 const desc = pattern.description.toLowerCase();
 if (desc.includes('web') || desc.includes('frontend') || desc.includes('react') || desc.includes('vue')) return 'web';
 if (desc.includes('api') || desc.includes('backend') || desc.includes('express') || desc.includes('fastapi')) return 'api';
 if (desc.includes('library')) return 'library';
 if (desc.includes('cli')) return 'cli';
 if (desc.includes('mobile')) return 'mobile';
 if (desc.includes('desktop')) return 'desktop';
 }
 return 'unknown';
 }

 /**
 * Extract languages from context
 */
 private extractLanguages(context: ArchitecturalContext): string[] {
 const languages = new Set<string>();
 for (const pattern of context.patterns) {
 if (pattern.description.toLowerCase().includes('typescript')) languages.add('typescript');
 if (pattern.description.toLowerCase().includes('javascript')) languages.add('javascript');
 if (pattern.description.toLowerCase().includes('python')) languages.add('python');
 if (pattern.description.toLowerCase().includes('java')) languages.add('java');
 if (pattern.description.toLowerCase().includes('go')) languages.add('go');
 if (pattern.description.toLowerCase().includes('rust')) languages.add('rust');
 }
 return Array.from(languages);
 }

 /**
 * Extract frameworks from context
 */
 private extractFrameworks(context: ArchitecturalContext): string[] {
 const frameworks = new Set<string>();
 for (const pattern of context.patterns) {
 const desc = pattern.description.toLowerCase();
 if (desc.includes('react')) frameworks.add('react');
 if (desc.includes('vue')) frameworks.add('vue');
 if (desc.includes('angular')) frameworks.add('angular');
 if (desc.includes('express')) frameworks.add('express');
 if (desc.includes('fastapi')) frameworks.add('fastapi');
 if (desc.includes('django')) frameworks.add('django');
 if (desc.includes('next')) frameworks.add('next');
 }
 return Array.from(frameworks);
 }
}

