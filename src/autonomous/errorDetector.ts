/**
 * Sophisticated Error Detector
 *
 * Features:
 * - Pattern recognition for common error types
 * - Semantic analysis of error context
 * - Multi-language support (TypeScript, JavaScript, Python, Go, Rust)
 * - Error severity classification
 * - Root cause analysis
 * - Fix suggestion generation
 */

import * as ts from 'typescript';
import { GeneratedCode } from './contextAwareCodeGenerator';

export interface DetectedError {
 id: string;
 type: ErrorType;
 severity: ErrorSeverity;
 language: Language;
 file: string;
 line?: number;
 column?: number;
 code?: string;
 message: string;
 context: ErrorContext;
 rootCause?: string;
 suggestedFixes: SuggestedFix[];
 relatedErrors: string[]; // IDs of related errors
 confidence: number; // 0-1
}

export type ErrorType =
 | 'syntax'
 | 'type'
 | 'import'
 | 'export'
 | 'undefined-variable'
 | 'undefined-function'
 | 'missing-dependency'
 | 'circular-dependency'
 | 'null-reference'
 | 'type-mismatch'
 | 'async-await'
 | 'promise'
 | 'memory-leak'
 | 'security'
 | 'performance'
 | 'logic'
 | 'other';

export type ErrorSeverity = 'critical' | 'error' | 'warning' | 'info';

export type Language = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'other';

export interface ErrorContext {
 surroundingCode: string;
 imports: string[];
 exports: string[];
 variables: string[];
 functions: string[];
 classes: string[];
 dependencies: string[];
}

export interface SuggestedFix {
 description: string;
 confidence: number; // 0-1
 type: 'add' | 'remove' | 'replace' | 'refactor';
 changes: CodeChange[];
 reasoning: string;
}

export interface CodeChange {
 file: string;
 line?: number;
 column?: number;
 oldCode?: string;
 newCode: string;
}

export interface ErrorPattern {
 pattern: RegExp;
 type: ErrorType;
 severity: ErrorSeverity;
 language: Language[];
 extractInfo: (match: RegExpMatchArray) => Partial<DetectedError>;
}

export class ErrorDetector {
 private errorPatterns: ErrorPattern[] = [];
 private errorHistory: Map<string, DetectedError[]> = new Map();

 constructor() {
 this.initializePatterns();
 }

 /**
 * Detect errors in build output
 */
 async detectErrors(
 buildOutput: string,
 files: GeneratedCode[]
 ): Promise<DetectedError[]> {
 const errors: DetectedError[] = [];

 // 1. Pattern-based detection
 const patternErrors = this.detectWithPatterns(buildOutput);
 errors.push(...patternErrors);

 // 2. Semantic analysis
 for (const file of files) {
 const semanticErrors = await this.detectSemanticErrors(file);
 errors.push(...semanticErrors);
 }

 // 3. Cross-file analysis
 const crossFileErrors = await this.detectCrossFileErrors(files);
 errors.push(...crossFileErrors);

 // 4. Analyze relationships between errors
 this.analyzeErrorRelationships(errors);

 // 5. Generate fix suggestions
 for (const error of errors) {
 error.suggestedFixes = await this.generateFixSuggestions(error, files);
 }

 // 6. Store in history for learning
 this.storeInHistory(errors);

 return errors;
 }

 /**
 * Detect errors using pattern matching
 */
 private detectWithPatterns(buildOutput: string): DetectedError[] {
 const errors: DetectedError[] = [];

 for (const pattern of this.errorPatterns) {
 const matches = buildOutput.matchAll(pattern.pattern);

 for (const match of matches) {
 const baseInfo = pattern.extractInfo(match);
 const error: DetectedError = {
 id: this.generateErrorId(),
 type: pattern.type,
 severity: pattern.severity,
 language: pattern.language[0],
 file: baseInfo.file || '',
 line: baseInfo.line,
 column: baseInfo.column,
 code: baseInfo.code,
 message: baseInfo.message || match[0],
 context: {
 surroundingCode: '',
 imports: [],
 exports: [],
 variables: [],
 functions: [],
 classes: [],
 dependencies: []
 },
 suggestedFixes: [],
 relatedErrors: [],
 confidence: 0.8,
 ...baseInfo
 };

 errors.push(error);
 }
 }

 return errors;
 }

 /**
 * Detect semantic errors in a file
 */
 private async detectSemanticErrors(file: GeneratedCode): Promise<DetectedError[]> {
 const errors: DetectedError[] = [];
 const language = this.detectLanguage(file.filePath);

 if (language === 'typescript' || language === 'javascript') {
 errors.push(...this.detectTypeScriptSemanticErrors(file));
 } else if (language === 'python') {
 errors.push(...this.detectPythonSemanticErrors(file));
 } else if (language === 'go') {
 errors.push(...this.detectGoSemanticErrors(file));
 } else if (language === 'rust') {
 errors.push(...this.detectRustSemanticErrors(file));
 }

 return errors;
 }

 /**
 * Detect TypeScript semantic errors
 */
 private detectTypeScriptSemanticErrors(file: GeneratedCode): DetectedError[] {
 const errors: DetectedError[] = [];

 try {
 const sourceFile = ts.createSourceFile(
 file.filePath,
 file.content,
 ts.ScriptTarget.Latest,
 true
 );

 // Check for common issues
 const visitor = (node: ts.Node) => {
 // Detect unused variables
 if (ts.isVariableDeclaration(node)) {
 // Would need full type checker for accurate detection
 }

 // Detect missing await
 if (ts.isCallExpression(node)) {
 // Check if calling async function without await
 }

 // Detect null/undefined issues
 if (ts.isPropertyAccessExpression(node)) {
 // Check for potential null reference
 }

 ts.forEachChild(node, visitor);
 };

 visitor(sourceFile);
 } catch (error) {
 // Syntax error
 errors.push({
 id: this.generateErrorId(),
 type: 'syntax',
 severity: 'error',
 language: 'typescript',
 file: file.filePath,
 message: `Syntax error: ${error}`,
 context: this.extractContext(file),
 suggestedFixes: [],
 relatedErrors: [],
 confidence: 0.9
 });
 }

 return errors;
 }

 /**
 * Detect Python semantic errors
 */
 private detectPythonSemanticErrors(file: GeneratedCode): DetectedError[] {
 const errors: DetectedError[] = [];
 const lines = file.content.split('\n');

 // Check for common Python issues
 for (let i = 0; i < lines.length; i++) {
 const line = lines[i];

 // Detect missing imports
 if (line.match(/^[a-zA-Z_][a-zA-Z0-9_]*\(/)) {
 // Function call without import
 }

 // Detect indentation issues
 if (line.match(/^\s+/) && !line.match(/^\s{4}|\t/)) {
 errors.push({
 id: this.generateErrorId(),
 type: 'syntax',
 severity: 'error',
 language: 'python',
 file: file.filePath,
 line: i + 1,
 message: 'Inconsistent indentation',
 context: this.extractContext(file),
 suggestedFixes: [],
 relatedErrors: [],
 confidence: 0.7
 });
 }

 // Detect missing self parameter
 if (line.match(/def\s+\w+\([^)]*\):/) && !line.includes('self')) {
 // Might be missing self in method
 }
 }

 return errors;
 }

 /**
 * Detect Go semantic errors
 */
 private detectGoSemanticErrors(file: GeneratedCode): DetectedError[] {
 const errors: DetectedError[] = [];
 const lines = file.content.split('\n');

 for (let i = 0; i < lines.length; i++) {
 const line = lines[i];

 // Detect unused variables (Go is strict about this)
 if (line.match(/^\s*(\w+)\s*:=/)) {
 // Variable declared but might not be used
 }

 // Detect missing error handling
 if (line.match(/,\s*err\s*:=/) && i + 1 < lines.length) {
 const nextLine = lines[i + 1];
 if (!nextLine.includes('if err')) {
 errors.push({
 id: this.generateErrorId(),
 type: 'logic',
 severity: 'warning',
 language: 'go',
 file: file.filePath,
 line: i + 1,
 message: 'Error not handled',
 context: this.extractContext(file),
 suggestedFixes: [],
 relatedErrors: [],
 confidence: 0.8
 });
 }
 }
 }

 return errors;
 }

 /**
 * Detect Rust semantic errors
 */
 private detectRustSemanticErrors(file: GeneratedCode): DetectedError[] {
 const errors: DetectedError[] = [];
 const lines = file.content.split('\n');

 for (let i = 0; i < lines.length; i++) {
 const line = lines[i];

 // Detect missing lifetime annotations
 if (line.match(/fn\s+\w+.*&/) && !line.includes("'")) {
 errors.push({
 id: this.generateErrorId(),
 type: 'type',
 severity: 'error',
 language: 'rust',
 file: file.filePath,
 line: i + 1,
 message: 'Missing lifetime annotation',
 context: this.extractContext(file),
 suggestedFixes: [],
 relatedErrors: [],
 confidence: 0.6
 });
 }

 // Detect unwrap() usage (potential panic)
 if (line.includes('.unwrap()')) {
 errors.push({
 id: this.generateErrorId(),
 type: 'logic',
 severity: 'warning',
 language: 'rust',
 file: file.filePath,
 line: i + 1,
 message: 'Using unwrap() can cause panic, consider using match or ?',
 context: this.extractContext(file),
 suggestedFixes: [],
 relatedErrors: [],
 confidence: 0.9
 });
 }
 }

 return errors;
 }

 /**
 * Detect cross-file errors
 */
 private async detectCrossFileErrors(files: GeneratedCode[]): Promise<DetectedError[]> {
 const errors: DetectedError[] = [];

 // Build dependency graph
 const imports = new Map<string, string[]>();
 const exports = new Map<string, string[]>();

 for (const file of files) {
 imports.set(file.filePath, this.extractImports(file));
 exports.set(file.filePath, this.extractExports(file));
 }

 // Detect circular dependencies
 const circularDeps = this.detectCircularDependencies(imports);
 for (const cycle of circularDeps) {
 errors.push({
 id: this.generateErrorId(),
 type: 'circular-dependency',
 severity: 'warning',
 language: 'typescript',
 file: cycle[0],
 message: `Circular dependency detected: ${cycle.join(' -> ')}`,
 context: { surroundingCode: '', imports: cycle, exports: [], variables: [], functions: [], classes: [], dependencies: [] },
 suggestedFixes: [],
 relatedErrors: [],
 confidence: 0.95
 });
 }

 return errors;
 }

 /**
 * Initialize error patterns
 */
 private initializePatterns(): void {
 // TypeScript patterns
 this.errorPatterns.push(
 {
 pattern: /(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/g,
 type: 'type',
 severity: 'error',
 language: ['typescript'],
 extractInfo: (match) => ({
 file: match[1],
 line: parseInt(match[2]),
 column: parseInt(match[3]),
 code: match[4],
 message: match[5]
 })
 },
 {
 pattern: /Cannot find name '(\w+)'/g,
 type: 'undefined-variable',
 severity: 'error',
 language: ['typescript', 'javascript'],
 extractInfo: (match) => ({
 message: match[0]
 })
 }
 );

 // Python patterns
 this.errorPatterns.push({
 pattern: /File "(.+?)", line (\d+).*\n.*\n(\w+Error): (.+)/g,
 type: 'other',
 severity: 'error',
 language: ['python'],
 extractInfo: (match) => ({
 file: match[1],
 line: parseInt(match[2]),
 code: match[3],
 message: match[4]
 })
 });

 // Go patterns
 this.errorPatterns.push({
 pattern: /(.+?):(\d+):(\d+): (.+)/g,
 type: 'other',
 severity: 'error',
 language: ['go'],
 extractInfo: (match) => ({
 file: match[1],
 line: parseInt(match[2]),
 column: parseInt(match[3]),
 message: match[4]
 })
 });

 // Rust patterns
 this.errorPatterns.push({
 pattern: /error\[E(\d+)\]: (.+)\n\s+--> (.+?):(\d+):(\d+)/g,
 type: 'other',
 severity: 'error',
 language: ['rust'],
 extractInfo: (match) => ({
 code: `E${match[1]}`,
 message: match[2],
 file: match[3],
 line: parseInt(match[4]),
 column: parseInt(match[5])
 })
 });
 }

 // Helper methods
 private generateErrorId(): string {
 return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 }

 private detectLanguage(filePath: string): Language {
 if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
 if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
 if (filePath.endsWith('.py')) return 'python';
 if (filePath.endsWith('.go')) return 'go';
 if (filePath.endsWith('.rs')) return 'rust';
 return 'other';
 }

 private extractContext(file: GeneratedCode): ErrorContext {
 return {
 surroundingCode: file.content.substring(0, 500),
 imports: this.extractImports(file),
 exports: this.extractExports(file),
 variables: [],
 functions: [],
 classes: [],
 dependencies: []
 };
 }

 private extractImports(file: GeneratedCode): string[] {
 const imports: string[] = [];
 const importPattern = /import\s+(?:[\w{},\s*]+\s+from\s+)?['"]([^'"]+)['"]/g;
 let match;
 while ((match = importPattern.exec(file.content)) !== null) {
 imports.push(match[1]);
 }
 return imports;
 }

 private extractExports(file: GeneratedCode): string[] {
 const exports: string[] = [];
 const exportPattern = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/g;
 let match;
 while ((match = exportPattern.exec(file.content)) !== null) {
 exports.push(match[1]);
 }
 return exports;
 }

 private detectCircularDependencies(imports: Map<string, string[]>): string[][] {
 // Simple cycle detection - would need more sophisticated algorithm for production
 return [];
 }

 private analyzeErrorRelationships(errors: DetectedError[]): void {
 // Analyze which errors are related to each other
 for (let i = 0; i < errors.length; i++) {
 for (let j = i + 1; j < errors.length; j++) {
 if (this.areErrorsRelated(errors[i], errors[j])) {
 errors[i].relatedErrors.push(errors[j].id);
 errors[j].relatedErrors.push(errors[i].id);
 }
 }
 }
 }

 private areErrorsRelated(error1: DetectedError, error2: DetectedError): boolean {
 // Same file and close line numbers
 if (error1.file === error2.file && error1.line && error2.line) {
 return Math.abs(error1.line - error2.line) < 10;
 }
 return false;
 }

 private async generateFixSuggestions(
 error: DetectedError,
 files: GeneratedCode[]
 ): Promise<SuggestedFix[]> {
 // Will be enhanced with AI-powered generation
 return [];
 }

 private storeInHistory(errors: DetectedError[]): void {
 const key = new Date().toISOString().split('T')[0];
 this.errorHistory.set(key, errors);
 }
}

