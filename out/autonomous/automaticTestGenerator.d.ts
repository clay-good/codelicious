/**
 * Automatic Test Generator - Generate tests matching existing patterns
 *
 * Matches Augment's automatic test generation with pattern matching
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { ArchitecturalContext } from '../context/persistentContextEngine';
export interface TestPattern {
    framework: 'jest' | 'mocha' | 'vitest' | 'pytest' | 'junit';
    structure: string;
    imports: string[];
    setupPattern: string;
    testPattern: string;
    assertionStyle: string;
}
export interface GeneratedTest {
    filePath: string;
    content: string;
    framework: string;
    testCount: number;
    coverage: number;
    testTypes: ('unit' | 'integration' | 'e2e')[];
}
export interface TestGenerationResult {
    tests: GeneratedTest[];
    totalTests: number;
    estimatedCoverage: number;
    warnings: string[];
}
export declare class AutomaticTestGenerator {
    private orchestrator;
    private workspaceRoot;
    private comprehensiveGenerator;
    constructor(orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Generate tests for generated code
    * OPTIMIZED: Parallel test generation for 40-60% faster execution
    * ENHANCED: Uses comprehensive test generator for high-quality tests
    */
    generate(generatedCode: GeneratedCode[], context: ArchitecturalContext): Promise<TestGenerationResult>;
    /**
    * Detect existing test patterns in codebase
    */
    private detectTestPattern;
    /**
    * Get framework-specific imports
    */
    private getFrameworkImports;
    /**
    * Generate comprehensive test for a single file
    * Uses ComprehensiveTestGenerator for high-quality tests
    */
    private generateComprehensiveTestForFile;
    /**
    * Generate test for a single file (fallback)
    */
    private generateTestForFile;
    /**
    * Build test generation prompt
    */
    private buildTestGenerationPrompt;
    /**
    * Parse generated test
    */
    private parseGeneratedTest;
    /**
    * Count tests in generated content
    */
    private countTests;
    /**
    * Detect language from file path
    */
    private detectLanguage;
    /**
    * Detect framework from file path and pattern
    */
    private detectFramework;
    /**
    * Check if code is API code
    */
    private isAPICode;
    /**
    * Check if code is UI code
    */
    private isUICode;
    /**
    * Format test file with imports
    */
    private formatTestFile;
    /**
    * Get test file path
    */
    private getTestPath;
    /**
    * Estimate coverage for a single file
    */
    private estimateFileCoverage;
    /**
    * Estimate overall coverage
    */
    private estimateCoverage;
    /**
    * Write tests to disk
    */
    writeTests(tests: GeneratedTest[]): Promise<void>;
}
//# sourceMappingURL=automaticTestGenerator.d.ts.map