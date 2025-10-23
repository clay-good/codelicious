"use strict";
/**
 * Automatic Test Generator - Generate tests matching existing patterns
 *
 * Matches Augment's automatic test generation with pattern matching
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
exports.AutomaticTestGenerator = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const orchestrator_1 = require("../models/orchestrator");
const comprehensiveTestGenerator_1 = require("../testing/comprehensiveTestGenerator");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('AutomaticTestGenerator');
class AutomaticTestGenerator {
    constructor(orchestrator, workspaceRoot) {
        this.orchestrator = orchestrator;
        this.workspaceRoot = workspaceRoot;
        this.comprehensiveGenerator = new comprehensiveTestGenerator_1.ComprehensiveTestGenerator(orchestrator);
    }
    /**
    * Generate tests for generated code
    * OPTIMIZED: Parallel test generation for 40-60% faster execution
    * ENHANCED: Uses comprehensive test generator for high-quality tests
    */
    async generate(generatedCode, context) {
        logger.info(' Generating comprehensive tests...');
        // Detect existing test patterns
        const testPattern = await this.detectTestPattern(context);
        const tests = [];
        const warnings = [];
        let totalTests = 0;
        // PERFORMANCE: Generate tests in parallel (40-60% faster)
        const testPromises = generatedCode
            .filter(code => code.operation !== 'delete')
            .map(async (code) => {
            try {
                // Use comprehensive test generator for better quality
                const test = await this.generateComprehensiveTestForFile(code, testPattern, context);
                return { success: true, test };
            }
            catch (error) {
                const warning = `Failed to generate test for ${code.filePath}: ${error}`;
                logger.error(`Test generation error for ${code.filePath}:`, error);
                return { success: false, warning };
            }
        });
        // Wait for all test generation to complete
        const results = await Promise.all(testPromises);
        // Collect results
        for (const result of results) {
            if (result.success && result.test) {
                tests.push(result.test);
                totalTests += result.test.testCount;
            }
            else if (result.warning) {
                warnings.push(result.warning);
            }
        }
        const estimatedCoverage = this.estimateCoverage(tests, generatedCode);
        logger.info(`Generated ${totalTests} tests across ${tests.length} files`);
        return {
            tests,
            totalTests,
            estimatedCoverage,
            warnings
        };
    }
    /**
    * Detect existing test patterns in codebase
    */
    async detectTestPattern(context) {
        // Look for existing test files in context
        const testFiles = context.relevantFiles.filter(f => f.path.includes('.test.') ||
            f.path.includes('.spec.') ||
            f.path.includes('__tests__'));
        if (testFiles.length === 0) {
            // Return default Jest pattern
            return {
                framework: 'jest',
                structure: 'describe/it',
                imports: ["import { describe, it, expect } from '@jest/globals';"],
                setupPattern: 'beforeEach/afterEach',
                testPattern: 'it("should ...", () => { ... })',
                assertionStyle: 'expect'
            };
        }
        // Analyze first test file to detect pattern
        const firstTest = testFiles[0];
        const content = firstTest.symbols.map(s => s.name).join(' ');
        // Detect framework
        let framework = 'jest';
        if (content.includes('pytest') || firstTest.path.endsWith('.py')) {
            framework = 'pytest';
        }
        else if (content.includes('mocha')) {
            framework = 'mocha';
        }
        else if (content.includes('vitest')) {
            framework = 'vitest';
        }
        else if (content.includes('junit') || firstTest.path.endsWith('.java')) {
            framework = 'junit';
        }
        return {
            framework,
            structure: 'describe/it',
            imports: this.getFrameworkImports(framework),
            setupPattern: 'beforeEach/afterEach',
            testPattern: 'it("should ...", () => { ... })',
            assertionStyle: 'expect'
        };
    }
    /**
    * Get framework-specific imports
    */
    getFrameworkImports(framework) {
        switch (framework) {
            case 'jest':
                return ["import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';"];
            case 'vitest':
                return ["import { describe, it, expect, beforeEach, afterEach } from 'vitest';"];
            case 'mocha':
                return ["import { describe, it, before, after } from 'mocha';", "import { expect } from 'chai';"];
            case 'pytest':
                return ["import pytest"];
            case 'junit':
                return ["import org.junit.Test;", "import static org.junit.Assert.*;"];
            default:
                return [];
        }
    }
    /**
    * Generate comprehensive test for a single file
    * Uses ComprehensiveTestGenerator for high-quality tests
    */
    async generateComprehensiveTestForFile(code, pattern, context) {
        // Detect language and framework
        const language = this.detectLanguage(code.filePath);
        const framework = this.detectFramework(code.filePath, pattern);
        // Determine test types based on code type
        const testTypes = ['unit'];
        if (this.isAPICode(code.content)) {
            testTypes.push('integration');
        }
        if (this.isUICode(code.content)) {
            testTypes.push('e2e');
        }
        // Generate comprehensive tests
        const request = {
            code: code.content,
            language,
            framework,
            filePath: code.filePath,
            description: code.documentation || `Code for ${code.filePath}`,
            testTypes
        };
        const result = await this.comprehensiveGenerator.generate(request);
        // Combine all test types into one file
        const combinedCode = result.tests.map(t => t.code).join('\n\n');
        const totalTestCount = result.tests.reduce((sum, t) => sum + t.testCount, 0);
        logger.info(` ${code.filePath}: ${totalTestCount} tests (Quality: ${result.quality.grade})`);
        return {
            filePath: this.getTestPath(code.filePath, pattern),
            content: this.formatTestFile(combinedCode, pattern),
            framework: pattern.framework,
            testCount: totalTestCount,
            coverage: result.coverage.lines,
            testTypes
        };
    }
    /**
    * Generate test for a single file (fallback)
    */
    async generateTestForFile(code, pattern, context) {
        const prompt = this.buildTestGenerationPrompt(code, pattern, context);
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert test engineer. Generate comprehensive tests that match existing patterns.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.2,
            maxTokens: 6000
        }, { complexity: orchestrator_1.TaskComplexity.MODERATE });
        return this.parseGeneratedTest(response.content, code, pattern);
    }
    /**
    * Build test generation prompt
    */
    buildTestGenerationPrompt(code, pattern, context) {
        return `Generate comprehensive tests for this code.

FILE: ${code.filePath}

CODE:
\`\`\`typescript
${code.content}
\`\`\`

EXISTING TEST PATTERN:
- Framework: ${pattern.framework}
- Structure: ${pattern.structure}
- Imports: ${pattern.imports.join('\n')}
- Setup: ${pattern.setupPattern}
- Test Pattern: ${pattern.testPattern}
- Assertions: ${pattern.assertionStyle}

REQUIREMENTS:
1. Match the existing test pattern exactly
2. Generate unit tests for all exported functions/classes
3. Test edge cases and error conditions
4. Aim for 80%+ code coverage
5. Include setup/teardown if needed
6. Use descriptive test names
7. Test both success and failure paths

Generate tests in this format:
\`\`\`typescript
// Test code here
\`\`\`

Be thorough and comprehensive.`;
    }
    /**
    * Parse generated test
    */
    parseGeneratedTest(content, code, pattern) {
        // Extract code block
        const codeMatch = content.match(/```(?:typescript|javascript|python|java|ts|js|py)?\n([\s\S]*?)```/);
        const testContent = codeMatch ? codeMatch[1].trim() : content;
        // Count tests
        const testCount = this.countTests(testContent, pattern.framework);
        // Determine test file path
        const testPath = this.getTestPath(code.filePath, pattern);
        // Estimate coverage
        const coverage = this.estimateFileCoverage(testContent, code.content);
        // Determine test types
        const testTypes = ['unit'];
        if (testContent.includes('integration') || testContent.includes('Integration')) {
            testTypes.push('integration');
        }
        if (testContent.includes('e2e') || testContent.includes('E2E')) {
            testTypes.push('e2e');
        }
        return {
            filePath: testPath,
            content: testContent,
            framework: pattern.framework,
            testCount,
            coverage,
            testTypes
        };
    }
    /**
    * Count tests in generated content
    */
    countTests(content, framework) {
        switch (framework) {
            case 'jest':
            case 'vitest':
            case 'mocha':
                return (content.match(/\bit\(/g) || []).length +
                    (content.match(/\btest\(/g) || []).length;
            case 'pytest':
                return (content.match(/def test_/g) || []).length;
            case 'junit':
                return (content.match(/@Test/g) || []).length;
            default:
                return 0;
        }
    }
    /**
    * Detect language from file path
    */
    detectLanguage(filePath) {
        const ext = path.extname(filePath);
        const langMap = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php'
        };
        return langMap[ext] || 'typescript';
    }
    /**
    * Detect framework from file path and pattern
    */
    detectFramework(filePath, pattern) {
        const content = filePath.toLowerCase();
        if (content.includes('react') || content.includes('component'))
            return 'react';
        if (content.includes('vue'))
            return 'vue';
        if (content.includes('express') || content.includes('route'))
            return 'express';
        if (content.includes('fastapi'))
            return 'fastapi';
        return undefined;
    }
    /**
    * Check if code is API code
    */
    isAPICode(content) {
        const apiPatterns = [
            /router\./,
            /app\.(get|post|put|delete|patch)/,
            /@(Get|Post|Put|Delete|Patch)/,
            /express\.Router/,
            /FastAPI/
        ];
        return apiPatterns.some(pattern => pattern.test(content));
    }
    /**
    * Check if code is UI code
    */
    isUICode(content) {
        const uiPatterns = [
            /React\.FC/,
            /useState/,
            /useEffect/,
            /return\s*\(/,
            /<[A-Z][a-zA-Z]*/, // JSX components
            /Vue\.component/,
            /<template>/
        ];
        return uiPatterns.some(pattern => pattern.test(content));
    }
    /**
    * Format test file with imports
    */
    formatTestFile(testCode, pattern) {
        const imports = pattern.imports.join('\n');
        return `${imports}\n\n${testCode}`;
    }
    /**
    * Get test file path
    */
    getTestPath(sourcePath, pattern) {
        const ext = path.extname(sourcePath);
        const base = sourcePath.replace(ext, '');
        if (pattern.framework === 'pytest') {
            return `${base}_test.py`;
        }
        else if (pattern.framework === 'junit') {
            return `${base}Test.java`;
        }
        else {
            return `${base}.test${ext}`;
        }
    }
    /**
    * Estimate coverage for a single file
    */
    estimateFileCoverage(testContent, sourceContent) {
        // Count functions/methods in source
        const sourceFunctions = (sourceContent.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length +
            (sourceContent.match(/\w+\s*\([^)]*\)\s*{/g) || []).length;
        // Count test cases
        const testCases = (testContent.match(/\bit\(|test\(|def test_|@Test/g) || []).length;
        if (sourceFunctions === 0) {
            return 0;
        }
        // Rough estimate: each test covers ~1-2 functions
        const estimatedCoverage = Math.min(100, (testCases / sourceFunctions) * 100);
        return Math.round(estimatedCoverage);
    }
    /**
    * Estimate overall coverage
    */
    estimateCoverage(tests, generatedCode) {
        if (tests.length === 0 || generatedCode.length === 0) {
            return 0;
        }
        const totalCoverage = tests.reduce((sum, test) => sum + test.coverage, 0);
        return Math.round(totalCoverage / tests.length);
    }
    /**
    * Write tests to disk
    */
    async writeTests(tests) {
        for (const test of tests) {
            const fullPath = path.join(this.workspaceRoot, test.filePath);
            // Ensure directory exists
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            // Write test file
            await fs.writeFile(fullPath, test.content, 'utf-8');
            logger.info(` Created test: ${test.filePath} (${test.testCount} tests)`);
        }
    }
}
exports.AutomaticTestGenerator = AutomaticTestGenerator;
//# sourceMappingURL=automaticTestGenerator.js.map