"use strict";
/**
 * Comprehensive Test Generator - Generate high-quality, behavior-focused tests
 *
 * Features:
 * - Edge case generation (boundary values, null/undefined, empty arrays)
 * - Integration test generation (API, database, external services)
 * - E2E test generation (user flows, visual regression)
 * - Behavior-focused assertions (verify behavior, not just structure)
 * - Test quality scoring
 *
 * Goal: Generate tests that actually catch bugs
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComprehensiveTestGenerator = void 0;
const orchestrator_1 = require("../models/orchestrator");
const mutationTestingEngine_1 = require("./mutationTestingEngine");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ComprehensiveTestGenerator');
class ComprehensiveTestGenerator {
    constructor(orchestrator, executionEngine, workspaceRoot) {
        this.orchestrator = orchestrator;
        this.executionEngine = executionEngine;
        this.workspaceRoot = workspaceRoot;
        if (executionEngine && workspaceRoot) {
            this.mutationEngine = new mutationTestingEngine_1.MutationTestingEngine(executionEngine, orchestrator, workspaceRoot);
        }
    }
    /**
    * Generate comprehensive tests
    */
    async generate(request) {
        logger.info(' Generating comprehensive tests...');
        const tests = [];
        // Generate unit tests (always)
        if (request.testTypes.includes('unit')) {
            const unitTests = await this.generateUnitTests(request);
            tests.push(unitTests);
        }
        // Generate integration tests (if requested)
        if (request.testTypes.includes('integration')) {
            const integrationTests = await this.generateIntegrationTests(request);
            tests.push(integrationTests);
        }
        // Generate E2E tests (if requested)
        if (request.testTypes.includes('e2e')) {
            const e2eTests = await this.generateE2ETests(request);
            tests.push(e2eTests);
        }
        // Calculate quality and coverage
        const quality = this.calculateQuality(tests, request);
        const coverage = this.estimateCoverage(tests, request);
        const totalTests = tests.reduce((sum, t) => sum + t.testCount, 0);
        logger.info(`Generated ${tests.length} test suites (Quality: ${quality.grade})`);
        // Run mutation testing if enabled
        let mutationScore;
        if (request.enableMutationTesting && this.mutationEngine && tests.length > 0) {
            logger.info('\n Running mutation testing to verify test quality...');
            try {
                const testFile = this.getTestFilePath(request.filePath);
                const mutationResult = await this.mutationEngine.test(request.filePath, testFile, request.code);
                mutationScore = mutationResult.mutationScore;
                logger.info(`Mutation Score: ${mutationResult.grade} (${mutationScore}%)`);
                // Update quality based on mutation score
                if (mutationScore < 80) {
                    quality.weaknesses.push(`Low mutation score (${mutationScore}%) - tests may not catch bugs effectively`);
                    quality.recommendations.push(...mutationResult.recommendations);
                }
            }
            catch (error) {
                logger.error('Mutation testing failed:', error);
            }
        }
        return { tests, quality, coverage, mutationScore, totalTests };
    }
    /**
    * Generate unit tests with edge cases
    */
    async generateUnitTests(request) {
        const prompt = this.buildUnitTestPrompt(request);
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: this.getUnitTestSystemPrompt(request)
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.2,
            maxTokens: 8000
        }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
        const code = this.extractCode(response.content);
        const edgeCases = this.extractEdgeCases(response.content);
        const testCount = this.countTests(code);
        const assertions = this.countAssertions(code);
        return {
            type: 'unit',
            code,
            description: 'Unit tests with edge cases',
            testCount,
            edgeCases,
            assertions
        };
    }
    /**
    * Generate integration tests
    */
    async generateIntegrationTests(request) {
        const prompt = this.buildIntegrationTestPrompt(request);
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: this.getIntegrationTestSystemPrompt(request)
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.2,
            maxTokens: 8000
        }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
        const code = this.extractCode(response.content);
        const testCount = this.countTests(code);
        const assertions = this.countAssertions(code);
        return {
            type: 'integration',
            code,
            description: 'Integration tests for API/database',
            testCount,
            edgeCases: [],
            assertions
        };
    }
    /**
    * Generate E2E tests
    */
    async generateE2ETests(request) {
        const prompt = this.buildE2ETestPrompt(request);
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: this.getE2ETestSystemPrompt(request)
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.2,
            maxTokens: 8000
        }, { complexity: orchestrator_1.TaskComplexity.COMPLEX });
        const code = this.extractCode(response.content);
        const testCount = this.countTests(code);
        const assertions = this.countAssertions(code);
        return {
            type: 'e2e',
            code,
            description: 'E2E tests for user flows',
            testCount,
            edgeCases: [],
            assertions
        };
    }
    /**
    * Get unit test system prompt
    */
    getUnitTestSystemPrompt(request) {
        return `You are a world-class test engineer specializing in comprehensive unit testing.

Your tests MUST:
1. Test ALL public methods and functions
2. Test ALL edge cases:
 - Boundary values (min, max, zero, negative)
 - Null and undefined inputs
 - Empty arrays and objects
 - Invalid inputs
 - Error conditions
3. Use behavior-focused assertions:
 - Verify outputs match expected values
 - Verify side effects (state changes, function calls)
 - Verify error messages
 - Verify return types
4. Mock external dependencies properly
5. Use proper setup and teardown
6. Have descriptive test names
7. Have at least 3-5 assertions per test

${this.getFrameworkSpecificGuidelines(request)}

Generate tests that would catch real bugs, not just pass.`;
    }
    /**
    * Get integration test system prompt
    */
    getIntegrationTestSystemPrompt(request) {
        return `You are a world-class test engineer specializing in integration testing.

Your tests MUST:
1. Test API endpoints end-to-end
2. Test database operations (CRUD)
3. Test external service integrations
4. Test authentication and authorization
5. Test error responses (400, 401, 403, 404, 500)
6. Test request validation
7. Test response formats
8. Use proper test data setup and cleanup
9. Mock external services (not database)
10. Verify HTTP status codes and response bodies

${this.getFrameworkSpecificGuidelines(request)}

Generate tests that verify the system works as a whole.`;
    }
    /**
    * Get E2E test system prompt
    */
    getE2ETestSystemPrompt(request) {
        return `You are a world-class test engineer specializing in E2E testing.

Your tests MUST:
1. Test complete user flows (login → action → logout)
2. Test UI interactions (click, type, navigate)
3. Test form submissions
4. Test error messages displayed to users
5. Test loading states
6. Test navigation between pages
7. Use Playwright or Cypress
8. Use proper selectors (data-testid preferred)
9. Wait for elements properly (no hardcoded delays)
10. Take screenshots on failure

${this.getFrameworkSpecificGuidelines(request)}

Generate tests that verify the user experience.`;
    }
    /**
    * Get framework-specific guidelines
    */
    getFrameworkSpecificGuidelines(request) {
        if (request.framework === 'react') {
            return `React Testing Guidelines:
- Use React Testing Library
- Use screen.getByRole() for accessibility
- Use userEvent for interactions
- Test component behavior, not implementation
- Mock API calls with MSW or jest.mock()`;
        }
        if (request.framework === 'express') {
            return `Express Testing Guidelines:
- Use Supertest for HTTP testing
- Use Jest for assertions
- Test all routes (GET, POST, PUT, DELETE)
- Test middleware (auth, validation, error handling)
- Use test database or mock database`;
        }
        if (request.framework === 'vue') {
            return `Vue Testing Guidelines:
- Use Vue Test Utils
- Use mount() or shallowMount()
- Test component behavior, not implementation
- Mock API calls with jest.mock()
- Test emitted events`;
        }
        return '';
    }
    /**
    * Build unit test prompt
    */
    buildUnitTestPrompt(request) {
        return `Generate comprehensive unit tests for this code:

\`\`\`${request.language}
${request.code}
\`\`\`

Description: ${request.description}

Requirements:
1. Test ALL public methods/functions
2. Test ALL edge cases (see system prompt)
3. Use behavior-focused assertions
4. Mock external dependencies
5. Use descriptive test names
6. Include setup and teardown

Edge Cases to Test:
- Boundary values (min, max, zero, negative)
- Null and undefined inputs
- Empty arrays and objects
- Invalid inputs (wrong types, out of range)
- Error conditions (network errors, validation errors)

Output Format:
\`\`\`${request.language}
// Your comprehensive unit tests here
\`\`\`

Generate ONLY the test code, no explanations.`;
    }
    /**
    * Build integration test prompt
    */
    buildIntegrationTestPrompt(request) {
        return `Generate integration tests for this code:

\`\`\`${request.language}
${request.code}
\`\`\`

Description: ${request.description}

Requirements:
1. Test API endpoints end-to-end
2. Test database operations
3. Test authentication/authorization
4. Test error responses (400, 401, 403, 404, 500)
5. Test request validation
6. Verify HTTP status codes and response bodies

Output Format:
\`\`\`${request.language}
// Your integration tests here
\`\`\`

Generate ONLY the test code, no explanations.`;
    }
    /**
    * Build E2E test prompt
    */
    buildE2ETestPrompt(request) {
        return `Generate E2E tests for this code:

\`\`\`${request.language}
${request.code}
\`\`\`

Description: ${request.description}

Requirements:
1. Test complete user flows
2. Test UI interactions (click, type, navigate)
3. Test form submissions
4. Test error messages
5. Test loading states
6. Use Playwright or Cypress
7. Use proper selectors (data-testid)

Output Format:
\`\`\`${request.language}
// Your E2E tests here
\`\`\`

Generate ONLY the test code, no explanations.`;
    }
    /**
    * Extract code from response
    */
    extractCode(response) {
        const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/;
        const match = response.match(codeBlockRegex);
        return match && match[1] ? match[1].trim() : response.trim();
    }
    /**
    * Extract edge cases from response
    */
    extractEdgeCases(response) {
        const edgeCases = [];
        const lines = response.split('\n');
        for (const line of lines) {
            if (line.includes('edge case') || line.includes('boundary') || line.includes('null') || line.includes('empty')) {
                edgeCases.push(line.trim());
            }
        }
        return edgeCases;
    }
    /**
    * Count tests in code
    */
    countTests(code) {
        const testPatterns = [
            /\bit\s*\(/g,
            /\btest\s*\(/g,
            /\bTest\s*\(/g,
            /def\s+test_/g
        ];
        let count = 0;
        for (const pattern of testPatterns) {
            const matches = code.match(pattern);
            if (matches) {
                count += matches.length;
            }
        }
        return count;
    }
    /**
    * Count assertions in code
    */
    countAssertions(code) {
        const assertionPatterns = [
            /expect\s*\(/g,
            /assert/g,
            /toBe/g,
            /toEqual/g,
            /toHaveBeenCalled/g
        ];
        let count = 0;
        for (const pattern of assertionPatterns) {
            const matches = code.match(pattern);
            if (matches) {
                count += matches.length;
            }
        }
        return count;
    }
    /**
    * Calculate test quality
    */
    calculateQuality(tests, request) {
        let score = 100;
        const strengths = [];
        const weaknesses = [];
        const recommendations = [];
        const totalTests = tests.reduce((sum, t) => sum + t.testCount, 0);
        const totalAssertions = tests.reduce((sum, t) => sum + t.assertions, 0);
        const avgAssertionsPerTest = totalTests > 0 ? totalAssertions / totalTests : 0;
        // Check test count
        if (totalTests < 5) {
            weaknesses.push('Too few tests');
            score -= 20;
            recommendations.push('Add more test cases');
        }
        else {
            strengths.push(`${totalTests} tests generated`);
        }
        // Check assertions per test
        if (avgAssertionsPerTest < 2) {
            weaknesses.push('Too few assertions per test');
            score -= 15;
            recommendations.push('Add more assertions to verify behavior');
        }
        else if (avgAssertionsPerTest >= 3) {
            strengths.push('Good assertion coverage');
        }
        // Check edge cases
        const unitTest = tests.find(t => t.type === 'unit');
        if (unitTest && unitTest.edgeCases.length < 3) {
            weaknesses.push('Missing edge case tests');
            score -= 15;
            recommendations.push('Add tests for boundary values, null, empty arrays');
        }
        else if (unitTest && unitTest.edgeCases.length >= 5) {
            strengths.push('Comprehensive edge case coverage');
        }
        // Check test types
        if (tests.length === 1) {
            recommendations.push('Consider adding integration or E2E tests');
        }
        else {
            strengths.push('Multiple test types (unit, integration, E2E)');
        }
        const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
        return {
            score: Math.max(0, score),
            grade,
            strengths,
            weaknesses,
            recommendations
        };
    }
    /**
    * Get test file path
    */
    getTestFilePath(sourceFile) {
        const path = require('path');
        const dir = path.dirname(sourceFile);
        const base = path.basename(sourceFile, path.extname(sourceFile));
        return path.join(dir, `${base}.test${path.extname(sourceFile)}`);
    }
    /**
    * Estimate coverage
    */
    estimateCoverage(tests, request) {
        const unitTest = tests.find(t => t.type === 'unit');
        const hasIntegration = tests.some(t => t.type === 'integration');
        const hasE2E = tests.some(t => t.type === 'e2e');
        let lines = 0;
        let branches = 0;
        let functions = 0;
        let edgeCases = 0;
        if (unitTest) {
            lines += 70;
            branches += 60;
            functions += 80;
            edgeCases += unitTest.edgeCases.length >= 5 ? 80 : 50;
        }
        if (hasIntegration) {
            lines += 15;
            branches += 20;
            functions += 10;
        }
        if (hasE2E) {
            lines += 10;
            branches += 15;
        }
        return {
            lines: Math.min(100, lines),
            branches: Math.min(100, branches),
            functions: Math.min(100, functions),
            edgeCases: Math.min(100, edgeCases)
        };
    }
}
exports.ComprehensiveTestGenerator = ComprehensiveTestGenerator;
//# sourceMappingURL=comprehensiveTestGenerator.js.map