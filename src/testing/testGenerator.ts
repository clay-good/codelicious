/**
 * Test Generator - Automatically generate tests from code
 *
 * Features:
 * - Analyze code structure and generate test cases
 * - Support for functions, classes, and methods
 * - Generate mocks for dependencies
 * - Create test fixtures
 * - Support multiple testing frameworks (Jest, Mocha, etc.)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface TestCase {
 name: string;
 description: string;
 code: string;
 type: 'unit' | 'integration' | 'e2e';
}

export interface TestSuite {
 fileName: string;
 testFilePath: string;
 imports: string[];
 testCases: TestCase[];
 mocks: string[];
 setup: string;
 teardown: string;
}

export interface CodeAnalysis {
 functions: FunctionInfo[];
 classes: ClassInfo[];
 imports: string[];
 exports: string[];
}

export interface FunctionInfo {
 name: string;
 params: string[];
 returnType?: string;
 isAsync: boolean;
 isExported: boolean;
}

export interface ClassInfo {
 name: string;
 methods: MethodInfo[];
 properties: string[];
 isExported: boolean;
}

export interface MethodInfo {
 name: string;
 params: string[];
 returnType?: string;
 isAsync: boolean;
 isStatic: boolean;
 isPrivate: boolean;
}

export class TestGenerator {
 private framework: 'jest' | 'mocha' = 'jest';

 constructor(
 private readonly workspaceRoot: string,
 framework?: 'jest' | 'mocha'
 ) {
 if (framework) {
 this.framework = framework;
 }
 }

 /**
 * Generate tests for a file
 */
 async generateTestsForFile(filePath: string): Promise<TestSuite> {
 const content = fs.readFileSync(filePath, 'utf8');
 const analysis = this.analyzeCode(content, filePath);

 const testFilePath = this.getTestFilePath(filePath);
 const imports = this.generateImports(filePath, analysis);
 const mocks = this.generateMocks(analysis);
 const setup = this.generateSetup(analysis);
 const teardown = this.generateTeardown(analysis);
 const testCases = this.generateTestCases(analysis);

 return {
 fileName: path.basename(filePath),
 testFilePath,
 imports,
 testCases,
 mocks,
 setup,
 teardown
 };
 }

 /**
 * Analyze code structure
 */
 private analyzeCode(content: string, filePath: string): CodeAnalysis {
 const functions: FunctionInfo[] = [];
 const classes: ClassInfo[] = [];
 const imports: string[] = [];
 const exports: string[] = [];

 // Extract imports
 const importRegex = /import\s+(?:{[^}]+}|[\w]+)\s+from\s+['"]([^'"]+)['"]/g;
 let match;
 while ((match = importRegex.exec(content)) !== null) {
 imports.push(match[1]);
 }

 // Extract exported functions
 const functionRegex = /export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;
 while ((match = functionRegex.exec(content)) !== null) {
 const isAsync = !!match[1];
 const name = match[2];
 const params = match[3].split(',').map(p => p.trim()).filter(p => p);
 const returnType = match[4]?.trim();

 functions.push({
 name,
 params,
 returnType,
 isAsync,
 isExported: true
 });
 exports.push(name);
 }

 // Extract exported classes
 const classRegex = /export\s+class\s+(\w+)/g;
 while ((match = classRegex.exec(content)) !== null) {
 const className = match[1];
 const classContent = this.extractClassContent(content, className);
 const methods = this.extractMethods(classContent);
 const properties = this.extractProperties(classContent);

 classes.push({
 name: className,
 methods,
 properties,
 isExported: true
 });
 exports.push(className);
 }

 return { functions, classes, imports, exports };
 }

 /**
 * Extract class content
 */
 private extractClassContent(content: string, className: string): string {
 const classStart = content.indexOf(`class ${className}`);
 if (classStart === -1) return '';

 let braceCount = 0;
 let inClass = false;
 let classContent = '';

 for (let i = classStart; i < content.length; i++) {
 const char = content[i];

 if (char === '{') {
 braceCount++;
 inClass = true;
 } else if (char === '}') {
 braceCount--;
 if (braceCount === 0 && inClass) {
 classContent += char;
 break;
 }
 }

 if (inClass) {
 classContent += char;
 }
 }

 return classContent;
 }

 /**
 * Extract methods from class content
 */
 private extractMethods(classContent: string): MethodInfo[] {
 const methods: MethodInfo[] = [];
 const methodRegex = /(private\s+|public\s+)?(static\s+)?(async\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+))?/g;

 let match;
 while ((match = methodRegex.exec(classContent)) !== null) {
 const isPrivate = match[1]?.includes('private') || false;
 const isStatic = !!match[2];
 const isAsync = !!match[3];
 const name = match[4];
 const params = match[5].split(',').map(p => p.trim()).filter(p => p);
 const returnType = match[6]?.trim();

 // Skip constructor
 if (name === 'constructor') continue;

 methods.push({
 name,
 params,
 returnType,
 isAsync,
 isStatic,
 isPrivate
 });
 }

 return methods;
 }

 /**
 * Extract properties from class content
 */
 private extractProperties(classContent: string): string[] {
 const properties: string[] = [];
 const propertyRegex = /(private\s+|public\s+)?(\w+)\s*:\s*([^;=]+)/g;

 let match;
 while ((match = propertyRegex.exec(classContent)) !== null) {
 properties.push(match[2]);
 }

 return properties;
 }

 /**
 * Generate imports for test file
 */
 private generateImports(filePath: string, analysis: CodeAnalysis): string[] {
 const imports: string[] = [];
 const relativePath = this.getRelativeImportPath(filePath);

 // Import the module being tested
 if (analysis.exports.length > 0) {
 imports.push(`import { ${analysis.exports.join(', ')} } from '${relativePath}';`);
 }

 // Import testing framework
 if (this.framework === 'jest') {
 // Jest globals are available by default
 } else if (this.framework === 'mocha') {
 imports.push(`import { describe, it, expect, beforeEach, afterEach } from 'mocha';`);
 }

 // Import mocking libraries if needed
 if (analysis.imports.some(imp => imp.includes('vscode'))) {
 imports.push(`import * as vscode from 'vscode';`);
 }

 return imports;
 }

 /**
 * Generate mocks
 */
 private generateMocks(analysis: CodeAnalysis): string[] {
 const mocks: string[] = [];

 // Mock VS Code if needed
 if (analysis.imports.some(imp => imp.includes('vscode'))) {
 mocks.push(`jest.mock('vscode');`);
 }

 // Mock fs if needed
 if (analysis.imports.some(imp => imp.includes('fs'))) {
 mocks.push(`jest.mock('fs');`);
 }

 return mocks;
 }

 /**
 * Generate setup code
 */
 private generateSetup(analysis: CodeAnalysis): string {
 let setup = '';

 if (this.framework === 'jest') {
 setup = ` beforeEach(() => {\n`;
 setup += ` jest.clearAllMocks();\n`;
 setup += ` });\n`;
 }

 return setup;
 }

 /**
 * Generate teardown code
 */
 private generateTeardown(analysis: CodeAnalysis): string {
 let teardown = '';

 if (this.framework === 'jest') {
 teardown = ` afterEach(() => {\n`;
 teardown += ` jest.restoreAllMocks();\n`;
 teardown += ` });\n`;
 }

 return teardown;
 }

 /**
 * Generate test cases
 */
 private generateTestCases(analysis: CodeAnalysis): TestCase[] {
 const testCases: TestCase[] = [];

 // Generate tests for functions
 for (const func of analysis.functions) {
 testCases.push(...this.generateFunctionTests(func));
 }

 // Generate tests for classes
 for (const cls of analysis.classes) {
 testCases.push(...this.generateClassTests(cls));
 }

 return testCases;
 }

 /**
 * Generate tests for a function
 */
 private generateFunctionTests(func: FunctionInfo): TestCase[] {
 const testCases: TestCase[] = [];

 // Basic test
 testCases.push({
 name: `should call ${func.name} successfully`,
 description: `Test that ${func.name} executes without errors`,
 code: this.generateFunctionTestCode(func, 'success'),
 type: 'unit'
 });

 // Error handling test
 if (func.isAsync) {
 testCases.push({
 name: `should handle errors in ${func.name}`,
 description: `Test error handling in ${func.name}`,
 code: this.generateFunctionTestCode(func, 'error'),
 type: 'unit'
 });
 }

 return testCases;
 }

 /**
 * Generate test code for a function
 */
 private generateFunctionTestCode(func: FunctionInfo, scenario: 'success' | 'error'): string {
 const mockParams = func.params.map((p, i) => `param${i + 1}`).join(', ');

 if (scenario === 'success') {
 if (func.isAsync) {
 return ` const result = await ${func.name}(${mockParams});\n expect(result).toBeDefined();`;
 } else {
 return ` const result = ${func.name}(${mockParams});\n expect(result).toBeDefined();`;
 }
 } else {
 return ` await expect(${func.name}(${mockParams})).rejects.toThrow();`;
 }
 }

 /**
 * Generate tests for a class
 */
 private generateClassTests(cls: ClassInfo): TestCase[] {
 const testCases: TestCase[] = [];

 // Constructor test
 testCases.push({
 name: `should create ${cls.name} instance`,
 description: `Test ${cls.name} instantiation`,
 code: ` const instance = new ${cls.name}();\n expect(instance).toBeInstanceOf(${cls.name});`,
 type: 'unit'
 });

 // Method tests
 for (const method of cls.methods) {
 if (!method.isPrivate) {
 testCases.push(...this.generateMethodTests(cls.name, method));
 }
 }

 return testCases;
 }

 /**
 * Generate tests for a method
 */
 private generateMethodTests(className: string, method: MethodInfo): TestCase[] {
 const testCases: TestCase[] = [];
 const mockParams = method.params.map((p, i) => `param${i + 1}`).join(', ');

 testCases.push({
 name: `should call ${className}.${method.name} successfully`,
 description: `Test ${className}.${method.name} execution`,
 code: method.isAsync
 ? ` const instance = new ${className}();\n const result = await instance.${method.name}(${mockParams});\n expect(result).toBeDefined();`
 : ` const instance = new ${className}();\n const result = instance.${method.name}(${mockParams});\n expect(result).toBeDefined();`,
 type: 'unit'
 });

 return testCases;
 }

 /**
 * Get test file path
 */
 private getTestFilePath(filePath: string): string {
 const dir = path.dirname(filePath);
 const fileName = path.basename(filePath, path.extname(filePath));
 return path.join(dir, '__tests__', `${fileName}.test.ts`);
 }

 /**
 * Get relative import path
 */
 private getRelativeImportPath(filePath: string): string {
 const testFilePath = this.getTestFilePath(filePath);
 const relative = path.relative(path.dirname(testFilePath), filePath);
 return relative.replace(/\\/g, '/').replace(/\.ts$/, '');
 }
}

