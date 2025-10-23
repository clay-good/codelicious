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
export declare class TestGenerator {
    private readonly workspaceRoot;
    private framework;
    constructor(workspaceRoot: string, framework?: 'jest' | 'mocha');
    /**
    * Generate tests for a file
    */
    generateTestsForFile(filePath: string): Promise<TestSuite>;
    /**
    * Analyze code structure
    */
    private analyzeCode;
    /**
    * Extract class content
    */
    private extractClassContent;
    /**
    * Extract methods from class content
    */
    private extractMethods;
    /**
    * Extract properties from class content
    */
    private extractProperties;
    /**
    * Generate imports for test file
    */
    private generateImports;
    /**
    * Generate mocks
    */
    private generateMocks;
    /**
    * Generate setup code
    */
    private generateSetup;
    /**
    * Generate teardown code
    */
    private generateTeardown;
    /**
    * Generate test cases
    */
    private generateTestCases;
    /**
    * Generate tests for a function
    */
    private generateFunctionTests;
    /**
    * Generate test code for a function
    */
    private generateFunctionTestCode;
    /**
    * Generate tests for a class
    */
    private generateClassTests;
    /**
    * Generate tests for a method
    */
    private generateMethodTests;
    /**
    * Get test file path
    */
    private getTestFilePath;
    /**
    * Get relative import path
    */
    private getRelativeImportPath;
}
//# sourceMappingURL=testGenerator.d.ts.map