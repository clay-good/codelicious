/**
 * Advanced Pattern Recognizer - AST-based pattern extraction and analysis
 *
 * Features:
 * - AST-based structural pattern extraction
 * - Function signature patterns
 * - Class hierarchy patterns
 * - Error handling patterns
 * - Async/await patterns
 * - Design pattern detection
 * - Code smell detection
 * - Pattern similarity analysis
 */

import * as ts from 'typescript';
import { CodePattern } from './patternLearner';

export interface StructuralPattern {
 id: string;
 type: PatternType;
 name: string;
 description: string;

 // Structural information
 structure: {
 kind: string; // AST node kind
 signature?: string; // Function/method signature
 hierarchy?: string[]; // Class hierarchy
 dependencies?: string[]; // Imported dependencies
 complexity?: number; // Cyclomatic complexity
 };

 // Code information
 code: string;
 language: string;

 // Pattern metadata
 confidence: number; // 0-1
 frequency: number; // How often this pattern appears
 quality: number; // 0-100

 // Relationships
 relatedPatterns: string[]; // IDs of related patterns
 antiPatterns: string[]; // IDs of anti-patterns to avoid
}

export enum PatternType {
 FUNCTION_SIGNATURE = 'function_signature',
 CLASS_STRUCTURE = 'class_structure',
 ERROR_HANDLING = 'error_handling',
 ASYNC_PATTERN = 'async_pattern',
 DESIGN_PATTERN = 'design_pattern',
 API_PATTERN = 'api_pattern',
 DATA_STRUCTURE = 'data_structure',
 ALGORITHM = 'algorithm',
 TESTING_PATTERN = 'testing_pattern',
 IMPORT_PATTERN = 'import_pattern'
}

export interface PatternExtractionOptions {
 minComplexity?: number;
 maxComplexity?: number;
 includePrivate?: boolean;
 includeTests?: boolean;
 detectDesignPatterns?: boolean;
 detectAntiPatterns?: boolean;
}

export interface PatternSimilarity {
 pattern1: StructuralPattern;
 pattern2: StructuralPattern;
 similarity: number; // 0-1
 structuralSimilarity: number;
 semanticSimilarity: number;
 commonElements: string[];
}

export class AdvancedPatternRecognizer {
 private patterns: Map<string, StructuralPattern> = new Map();
 private patternIndex: Map<PatternType, Set<string>> = new Map();

 constructor() {
 // Initialize pattern type index
 Object.values(PatternType).forEach(type => {
 this.patternIndex.set(type, new Set());
 });
 }

 /**
 * Extract patterns from TypeScript code using AST
 */
 extractPatterns(
 code: string,
 filePath: string,
 options: PatternExtractionOptions = {}
 ): StructuralPattern[] {
 const sourceFile = ts.createSourceFile(
 filePath,
 code,
 ts.ScriptTarget.Latest,
 true
 );

 const patterns: StructuralPattern[] = [];

 // Extract different types of patterns
 patterns.push(...this.extractFunctionPatterns(sourceFile, options));
 patterns.push(...this.extractClassPatterns(sourceFile, options));
 patterns.push(...this.extractErrorHandlingPatterns(sourceFile, options));
 patterns.push(...this.extractAsyncPatterns(sourceFile, options));

 if (options.detectDesignPatterns) {
 patterns.push(...this.detectDesignPatterns(sourceFile, options));
 }

 // Store patterns
 patterns.forEach(pattern => {
 this.patterns.set(pattern.id, pattern);
 this.patternIndex.get(pattern.type)?.add(pattern.id);
 });

 return patterns;
 }

 /**
 * Extract function signature patterns
 */
 private extractFunctionPatterns(
 sourceFile: ts.SourceFile,
 options: PatternExtractionOptions
 ): StructuralPattern[] {
 const patterns: StructuralPattern[] = [];

 const visit = (node: ts.Node) => {
 if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
 const name = node.name?.getText(sourceFile) || 'anonymous';

 // Skip private methods if not included
 if (!options.includePrivate && this.isPrivate(node)) {
 return;
 }

 const signature = this.extractSignature(node, sourceFile);
 const complexity = this.calculateComplexity(node);

 // Filter by complexity
 if (options.minComplexity && complexity < options.minComplexity) {
 return;
 }
 if (options.maxComplexity && complexity > options.maxComplexity) {
 return;
 }

 const pattern: StructuralPattern = {
 id: this.generatePatternId(name, 'function'),
 type: PatternType.FUNCTION_SIGNATURE,
 name: `Function: ${name}`,
 description: `Function signature pattern for ${name}`,
 structure: {
 kind: ts.SyntaxKind[node.kind],
 signature,
 complexity
 },
 code: node.getText(sourceFile),
 language: 'typescript',
 confidence: this.calculateConfidence(node, complexity),
 frequency: 1,
 quality: this.assessQuality(node, complexity),
 relatedPatterns: [],
 antiPatterns: []
 };

 patterns.push(pattern);
 }

 ts.forEachChild(node, visit);
 };

 visit(sourceFile);
 return patterns;
 }

 /**
 * Extract class structure patterns
 */
 private extractClassPatterns(
 sourceFile: ts.SourceFile,
 options: PatternExtractionOptions
 ): StructuralPattern[] {
 const patterns: StructuralPattern[] = [];

 const visit = (node: ts.Node) => {
 if (ts.isClassDeclaration(node)) {
 const name = node.name?.getText(sourceFile) || 'anonymous';
 const hierarchy = this.extractClassHierarchy(node, sourceFile);
 const methods = this.extractMethods(node, sourceFile);
 const properties = this.extractProperties(node, sourceFile);

 const pattern: StructuralPattern = {
 id: this.generatePatternId(name, 'class'),
 type: PatternType.CLASS_STRUCTURE,
 name: `Class: ${name}`,
 description: `Class structure pattern for ${name}`,
 structure: {
 kind: ts.SyntaxKind[node.kind],
 hierarchy,
 signature: `class ${name} { ${methods.length} methods, ${properties.length} properties }`,
 complexity: this.calculateComplexity(node)
 },
 code: node.getText(sourceFile),
 language: 'typescript',
 confidence: 0.9,
 frequency: 1,
 quality: this.assessQuality(node, this.calculateComplexity(node)),
 relatedPatterns: [],
 antiPatterns: []
 };

 patterns.push(pattern);
 }

 ts.forEachChild(node, visit);
 };

 visit(sourceFile);
 return patterns;
 }

 /**
 * Extract error handling patterns
 */
 private extractErrorHandlingPatterns(
 sourceFile: ts.SourceFile,
 options: PatternExtractionOptions
 ): StructuralPattern[] {
 const patterns: StructuralPattern[] = [];

 const visit = (node: ts.Node) => {
 if (ts.isTryStatement(node)) {
 const hasFinally = node.finallyBlock !== undefined;
 const catchClause = node.catchClause;
 const errorType = catchClause?.variableDeclaration?.type?.getText(sourceFile);

 const pattern: StructuralPattern = {
 id: this.generatePatternId('error-handling', 'try-catch'),
 type: PatternType.ERROR_HANDLING,
 name: 'Try-Catch Pattern',
 description: `Error handling with ${hasFinally ? 'finally' : 'no finally'} block`,
 structure: {
 kind: 'TryStatement',
 signature: `try-catch${hasFinally ? '-finally' : ''}${errorType ? `: ${errorType}` : ''}`,
 complexity: this.calculateComplexity(node)
 },
 code: node.getText(sourceFile),
 language: 'typescript',
 confidence: 0.95,
 frequency: 1,
 quality: hasFinally ? 90 : 75,
 relatedPatterns: [],
 antiPatterns: []
 };

 patterns.push(pattern);
 }

 ts.forEachChild(node, visit);
 };

 visit(sourceFile);
 return patterns;
 }

 /**
 * Extract async/await patterns
 */
 private extractAsyncPatterns(
 sourceFile: ts.SourceFile,
 options: PatternExtractionOptions
 ): StructuralPattern[] {
 const patterns: StructuralPattern[] = [];

 const visit = (node: ts.Node) => {
 if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
 node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {

 const name = node.name?.getText(sourceFile) || 'anonymous';
 const hasAwait = this.containsAwait(node);
 const hasErrorHandling = this.containsTryCatch(node);

 const pattern: StructuralPattern = {
 id: this.generatePatternId(name, 'async'),
 type: PatternType.ASYNC_PATTERN,
 name: `Async Function: ${name}`,
 description: `Async pattern with ${hasAwait ? 'await' : 'no await'}, ${hasErrorHandling ? 'with' : 'without'} error handling`,
 structure: {
 kind: 'AsyncFunction',
 signature: this.extractSignature(node, sourceFile),
 complexity: this.calculateComplexity(node)
 },
 code: node.getText(sourceFile),
 language: 'typescript',
 confidence: 0.9,
 frequency: 1,
 quality: hasErrorHandling ? 90 : 60,
 relatedPatterns: [],
 antiPatterns: hasErrorHandling ? [] : ['missing-error-handling']
 };

 patterns.push(pattern);
 }

 ts.forEachChild(node, visit);
 };

 visit(sourceFile);
 return patterns;
 }

 /**
 * Detect design patterns (Singleton, Factory, Observer, etc.)
 */
 private detectDesignPatterns(
 sourceFile: ts.SourceFile,
 options: PatternExtractionOptions
 ): StructuralPattern[] {
 const patterns: StructuralPattern[] = [];

 // Detect Singleton pattern
 patterns.push(...this.detectSingletonPattern(sourceFile));

 // Detect Factory pattern
 patterns.push(...this.detectFactoryPattern(sourceFile));

 // Detect Observer pattern
 patterns.push(...this.detectObserverPattern(sourceFile));

 return patterns;
 }

 /**
 * Detect Singleton pattern
 */
 private detectSingletonPattern(sourceFile: ts.SourceFile): StructuralPattern[] {
 const patterns: StructuralPattern[] = [];

 const visit = (node: ts.Node) => {
 if (ts.isClassDeclaration(node)) {
 const hasPrivateConstructor = this.hasPrivateConstructor(node);
 const hasStaticInstance = this.hasStaticInstanceProperty(node);
 const hasGetInstance = this.hasGetInstanceMethod(node);

 if (hasPrivateConstructor && (hasStaticInstance || hasGetInstance)) {
 const name = node.name?.getText(sourceFile) || 'Singleton';

 const pattern: StructuralPattern = {
 id: this.generatePatternId(name, 'singleton'),
 type: PatternType.DESIGN_PATTERN,
 name: `Singleton: ${name}`,
 description: 'Singleton design pattern implementation',
 structure: {
 kind: 'Singleton',
 signature: `class ${name} { private constructor, static instance }`,
 complexity: this.calculateComplexity(node)
 },
 code: node.getText(sourceFile),
 language: 'typescript',
 confidence: 0.95,
 frequency: 1,
 quality: 95,
 relatedPatterns: [],
 antiPatterns: []
 };

 patterns.push(pattern);
 }
 }

 ts.forEachChild(node, visit);
 };

 visit(sourceFile);
 return patterns;
 }

 /**
 * Detect Factory pattern
 */
 private detectFactoryPattern(sourceFile: ts.SourceFile): StructuralPattern[] {
 const patterns: StructuralPattern[] = [];

 const visit = (node: ts.Node) => {
 if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) {
 const name = node.name?.getText(sourceFile) || '';

 // Check if method name suggests factory pattern
 if (name.toLowerCase().includes('create') ||
 name.toLowerCase().includes('factory') ||
 name.toLowerCase().includes('build')) {

 // Check if it returns a new instance
 const returnsNewInstance = this.returnsNewInstance(node);

 if (returnsNewInstance) {
 const pattern: StructuralPattern = {
 id: this.generatePatternId(name, 'factory'),
 type: PatternType.DESIGN_PATTERN,
 name: `Factory: ${name}`,
 description: 'Factory pattern for object creation',
 structure: {
 kind: 'Factory',
 signature: this.extractSignature(node, sourceFile),
 complexity: this.calculateComplexity(node)
 },
 code: node.getText(sourceFile),
 language: 'typescript',
 confidence: 0.85,
 frequency: 1,
 quality: 90,
 relatedPatterns: [],
 antiPatterns: []
 };

 patterns.push(pattern);
 }
 }
 }

 ts.forEachChild(node, visit);
 };

 visit(sourceFile);
 return patterns;
 }

 /**
 * Detect Observer pattern
 */
 private detectObserverPattern(sourceFile: ts.SourceFile): StructuralPattern[] {
 const patterns: StructuralPattern[] = [];

 const visit = (node: ts.Node) => {
 if (ts.isClassDeclaration(node)) {
 const hasSubscribe = this.hasMethod(node, 'subscribe') || this.hasMethod(node, 'on');
 const hasUnsubscribe = this.hasMethod(node, 'unsubscribe') || this.hasMethod(node, 'off');
 const hasNotify = this.hasMethod(node, 'notify') || this.hasMethod(node, 'emit');

 if ((hasSubscribe || hasUnsubscribe) && hasNotify) {
 const name = node.name?.getText(sourceFile) || 'Observer';

 const pattern: StructuralPattern = {
 id: this.generatePatternId(name, 'observer'),
 type: PatternType.DESIGN_PATTERN,
 name: `Observer: ${name}`,
 description: 'Observer/Event Emitter pattern implementation',
 structure: {
 kind: 'Observer',
 signature: `class ${name} { subscribe, unsubscribe, notify }`,
 complexity: this.calculateComplexity(node)
 },
 code: node.getText(sourceFile),
 language: 'typescript',
 confidence: 0.9,
 frequency: 1,
 quality: 92,
 relatedPatterns: [],
 antiPatterns: []
 };

 patterns.push(pattern);
 }
 }

 ts.forEachChild(node, visit);
 };

 visit(sourceFile);
 return patterns;
 }

 /**
 * Calculate pattern similarity
 */
 calculateSimilarity(
 pattern1: StructuralPattern,
 pattern2: StructuralPattern
 ): PatternSimilarity {
 // Structural similarity (AST structure)
 const structuralSimilarity = this.compareStructure(pattern1, pattern2);

 // Semantic similarity (would use embeddings in production)
 const semanticSimilarity = this.compareSemantics(pattern1, pattern2);

 // Overall similarity (weighted average)
 const similarity = (structuralSimilarity * 0.6) + (semanticSimilarity * 0.4);

 // Find common elements
 const commonElements = this.findCommonElements(pattern1, pattern2);

 return {
 pattern1,
 pattern2,
 similarity,
 structuralSimilarity,
 semanticSimilarity,
 commonElements
 };
 }

 /**
 * Get patterns by type
 */
 getPatternsByType(type: PatternType): StructuralPattern[] {
 const patternIds = this.patternIndex.get(type) || new Set();
 return Array.from(patternIds)
 .map(id => this.patterns.get(id))
 .filter((p): p is StructuralPattern => p !== undefined);
 }

 /**
 * Find similar patterns
 */
 findSimilarPatterns(
 pattern: StructuralPattern,
 minSimilarity: number = 0.7
 ): PatternSimilarity[] {
 const similarities: PatternSimilarity[] = [];

 for (const candidate of this.patterns.values()) {
 if (candidate.id === pattern.id) continue;

 const similarity = this.calculateSimilarity(pattern, candidate);
 if (similarity.similarity >= minSimilarity) {
 similarities.push(similarity);
 }
 }

 return similarities.sort((a, b) => b.similarity - a.similarity);
 }

 // ========== Helper Methods ==========

 private generatePatternId(name: string, type: string): string {
 return `${type}-${name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
 }

 private isPrivate(node: ts.Node): boolean {
 if (!ts.canHaveModifiers(node)) return false;
 const modifiers = ts.getModifiers(node);
 return modifiers?.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) || false;
 }

 private extractSignature(
 node: ts.FunctionDeclaration | ts.MethodDeclaration,
 sourceFile: ts.SourceFile
 ): string {
 const name = node.name?.getText(sourceFile) || 'anonymous';
 const params = node.parameters.map(p => {
 const paramName = p.name.getText(sourceFile);
 const paramType = p.type?.getText(sourceFile) || 'any';
 return `${paramName}: ${paramType}`;
 }).join(', ');
 const returnType = node.type?.getText(sourceFile) || 'void';
 return `${name}(${params}): ${returnType}`;
 }

 private calculateComplexity(node: ts.Node): number {
 let complexity = 1;

 const visit = (n: ts.Node) => {
 // Increase complexity for control flow statements
 if (ts.isIfStatement(n) ||
 ts.isForStatement(n) ||
 ts.isWhileStatement(n) ||
 ts.isDoStatement(n) ||
 ts.isSwitchStatement(n) ||
 ts.isConditionalExpression(n)) {
 complexity++;
 }

 // Increase for logical operators
 if (ts.isBinaryExpression(n)) {
 if (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
 n.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
 complexity++;
 }
 }

 ts.forEachChild(n, visit);
 };

 visit(node);
 return complexity;
 }

 private calculateConfidence(node: ts.Node, complexity: number): number {
 // Higher confidence for well-structured code
 let confidence = 0.8;

 // Adjust based on complexity
 if (complexity > 20) {
 confidence -= 0.2; // Very complex code is less reliable
 } else if (complexity < 5) {
 confidence += 0.1; // Simple code is more reliable
 }

 // Check for documentation
 const hasJSDoc = this.hasJSDoc(node);
 if (hasJSDoc) {
 confidence += 0.1;
 }

 return Math.min(1, Math.max(0, confidence));
 }

 private assessQuality(node: ts.Node, complexity: number): number {
 let quality = 70;

 // Penalize high complexity
 if (complexity > 15) {
 quality -= 20;
 } else if (complexity > 10) {
 quality -= 10;
 }

 // Reward documentation
 if (this.hasJSDoc(node)) {
 quality += 10;
 }

 // Reward type annotations
 if (this.hasTypeAnnotations(node)) {
 quality += 10;
 }

 // Reward error handling
 if (this.containsTryCatch(node)) {
 quality += 10;
 }

 return Math.min(100, Math.max(0, quality));
 }

 private hasJSDoc(node: ts.Node): boolean {
 const sourceFile = node.getSourceFile();
 const fullText = sourceFile.getFullText();
 const nodeStart = node.getFullStart();
 const leadingComments = ts.getLeadingCommentRanges(fullText, nodeStart);

 return leadingComments?.some(comment => {
 const text = fullText.substring(comment.pos, comment.end);
 return text.startsWith('/**');
 }) || false;
 }

 private hasTypeAnnotations(node: ts.Node): boolean {
 if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
 // Check return type
 if (!node.type) return false;

 // Check parameter types
 return node.parameters.every(p => p.type !== undefined);
 }
 return false;
 }

 private containsAwait(node: ts.Node): boolean {
 let hasAwait = false;

 const visit = (n: ts.Node) => {
 if (ts.isAwaitExpression(n)) {
 hasAwait = true;
 return;
 }
 ts.forEachChild(n, visit);
 };

 visit(node);
 return hasAwait;
 }

 private containsTryCatch(node: ts.Node): boolean {
 let hasTryCatch = false;

 const visit = (n: ts.Node) => {
 if (ts.isTryStatement(n)) {
 hasTryCatch = true;
 return;
 }
 ts.forEachChild(n, visit);
 };

 visit(node);
 return hasTryCatch;
 }

 private extractClassHierarchy(
 node: ts.ClassDeclaration,
 sourceFile: ts.SourceFile
 ): string[] {
 const hierarchy: string[] = [];

 // Get extends clause
 if (node.heritageClauses) {
 for (const clause of node.heritageClauses) {
 if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
 clause.types.forEach(type => {
 hierarchy.push(type.expression.getText(sourceFile));
 });
 }
 }
 }

 return hierarchy;
 }

 private extractMethods(
 node: ts.ClassDeclaration,
 sourceFile: ts.SourceFile
 ): string[] {
 const methods: string[] = [];

 node.members.forEach(member => {
 if (ts.isMethodDeclaration(member) && member.name) {
 methods.push(member.name.getText(sourceFile));
 }
 });

 return methods;
 }

 private extractProperties(
 node: ts.ClassDeclaration,
 sourceFile: ts.SourceFile
 ): string[] {
 const properties: string[] = [];

 node.members.forEach(member => {
 if (ts.isPropertyDeclaration(member) && member.name) {
 properties.push(member.name.getText(sourceFile));
 }
 });

 return properties;
 }

 private hasPrivateConstructor(node: ts.ClassDeclaration): boolean {
 return node.members.some(member => {
 if (ts.isConstructorDeclaration(member)) {
 return this.isPrivate(member);
 }
 return false;
 });
 }

 private hasStaticInstanceProperty(node: ts.ClassDeclaration): boolean {
 return node.members.some(member => {
 if (ts.isPropertyDeclaration(member)) {
 const isStatic = member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
 const name = member.name?.getText();
 return isStatic && name === 'instance';
 }
 return false;
 });
 }

 private hasGetInstanceMethod(node: ts.ClassDeclaration): boolean {
 return node.members.some(member => {
 if (ts.isMethodDeclaration(member)) {
 const isStatic = member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
 const name = member.name?.getText();
 return isStatic && (name === 'getInstance' || name === 'instance');
 }
 return false;
 });
 }

 private returnsNewInstance(node: ts.MethodDeclaration | ts.FunctionDeclaration): boolean {
 let returnsNew = false;

 const visit = (n: ts.Node) => {
 if (ts.isReturnStatement(n) && n.expression) {
 if (ts.isNewExpression(n.expression)) {
 returnsNew = true;
 return;
 }
 }
 ts.forEachChild(n, visit);
 };

 visit(node);
 return returnsNew;
 }

 private hasMethod(node: ts.ClassDeclaration, methodName: string): boolean {
 return node.members.some(member => {
 if (ts.isMethodDeclaration(member) && member.name) {
 return member.name.getText() === methodName;
 }
 return false;
 });
 }

 private compareStructure(p1: StructuralPattern, p2: StructuralPattern): number {
 // Compare pattern types
 if (p1.type !== p2.type) return 0;

 // Compare structural elements
 let similarity = 0;
 let comparisons = 0;

 // Compare kind
 if (p1.structure.kind === p2.structure.kind) {
 similarity += 1;
 }
 comparisons++;

 // Compare complexity (normalized)
 if (p1.structure.complexity && p2.structure.complexity) {
 const complexityDiff = Math.abs(p1.structure.complexity - p2.structure.complexity);
 const maxComplexity = Math.max(p1.structure.complexity, p2.structure.complexity);
 similarity += (1 - (complexityDiff / maxComplexity));
 comparisons++;
 }

 // Compare hierarchy
 if (p1.structure.hierarchy && p2.structure.hierarchy) {
 const commonHierarchy = p1.structure.hierarchy.filter(h =>
 p2.structure.hierarchy?.includes(h)
 );
 const totalHierarchy = new Set([...p1.structure.hierarchy, ...p2.structure.hierarchy]);
 similarity += commonHierarchy.length / totalHierarchy.size;
 comparisons++;
 }

 return comparisons > 0 ? similarity / comparisons : 0;
 }

 private compareSemantics(p1: StructuralPattern, p2: StructuralPattern): number {
 // Simple semantic comparison based on code similarity
 // In production, this would use embeddings
 const code1 = p1.code.toLowerCase();
 const code2 = p2.code.toLowerCase();

 // Jaccard similarity on tokens
 const tokens1 = new Set(code1.split(/\W+/).filter(t => t.length > 2));
 const tokens2 = new Set(code2.split(/\W+/).filter(t => t.length > 2));

 const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
 const union = new Set([...tokens1, ...tokens2]);

 return union.size > 0 ? intersection.size / union.size : 0;
 }

 private findCommonElements(p1: StructuralPattern, p2: StructuralPattern): string[] {
 const elements: string[] = [];

 // Common type
 if (p1.type === p2.type) {
 elements.push(`type:${p1.type}`);
 }

 // Common hierarchy
 if (p1.structure.hierarchy && p2.structure.hierarchy) {
 const common = p1.structure.hierarchy.filter(h =>
 p2.structure.hierarchy?.includes(h)
 );
 elements.push(...common.map(h => `hierarchy:${h}`));
 }

 // Common dependencies
 if (p1.structure.dependencies && p2.structure.dependencies) {
 const common = p1.structure.dependencies.filter(d =>
 p2.structure.dependencies?.includes(d)
 );
 elements.push(...common.map(d => `dependency:${d}`));
 }

 return elements;
 }
}

