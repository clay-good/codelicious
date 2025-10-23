/**
 * Advanced Pattern-Matching Test Generator
 * Learns from existing test patterns and generates high-quality tests
 */
import { ModelOrchestrator } from '../models/orchestrator';
import { ArchitecturalContext } from '../context/persistentContextEngine';
export interface TestPattern {
    framework: 'jest' | 'mocha' | 'vitest' | 'pytest' | 'junit';
    patterns: {
        describePattern: string;
        itPattern: string;
        beforeEachPattern: string;
        afterEachPattern: string;
        mockPattern: string;
        assertionPattern: string;
    };
    conventions: {
        fileNaming: string;
        testLocation: string;
        importStyle: string;
        mockingStyle: string;
    };
    examples: TestExample[];
    quality: {
        averageCoverage: number;
        averageAssertions: number;
        edgeCaseHandling: boolean;
        errorHandling: boolean;
    };
}
export interface TestExample {
    sourceFile: string;
    testFile: string;
    sourceCode: string;
    testCode: string;
    coverage: number;
    assertions: number;
}
export interface GeneratedTest {
    filePath: string;
    content: string;
    framework: string;
    coverage: {
        estimated: number;
        lines: number;
        branches: number;
        functions: number;
    };
    quality: {
        score: number;
        assertions: number;
        edgeCases: number;
        errorHandling: boolean;
        mocking: boolean;
    };
    patterns: string[];
}
export interface TestGenerationOptions {
    framework?: 'jest' | 'mocha' | 'vitest' | 'pytest' | 'junit';
    coverageTarget?: number;
    includeEdgeCases?: boolean;
    includeErrorHandling?: boolean;
    includeMocking?: boolean;
    includeIntegration?: boolean;
    includeE2E?: boolean;
}
export declare class PatternMatchingTestGenerator {
    private orchestrator;
    private workspaceRoot;
    private patterns;
    private learnedPatterns;
    constructor(orchestrator: ModelOrchestrator, workspaceRoot: string);
    /**
    * Learn patterns from existing tests
    */
    learnPatterns(): Promise<void>;
    /**
    * Generate tests using learned patterns
    */
    generateTests(sourceFile: string, sourceCode: string, context: ArchitecturalContext, options?: TestGenerationOptions): Promise<GeneratedTest[]>;
    /**
    * Find all test files in workspace
    */
    private findTestFiles;
    /**
    * Find source file for test file
    */
    private findSourceFile;
    /**
    * Count assertions in test code
    */
    private countAssertions;
    /**
    * Detect test framework
    */
    private detectFramework;
    /**
    * Parse pattern response from AI
    */
    private parsePatternResponse;
    /**
    * Parse test response from AI
    */
    private parseTestResponse;
    /**
    * Generate basic tests without learned patterns
    */
    private generateBasicTests;
    /**
    * Get learned patterns
    */
    getLearnedPatterns(): TestPattern[];
}
//# sourceMappingURL=patternMatchingTestGenerator.d.ts.map