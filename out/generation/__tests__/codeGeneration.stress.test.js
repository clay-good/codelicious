"use strict";
/**
 * Comprehensive Stress Tests for Code Generation System
 *
 * Tests:
 * 1. Complex multi-file generation
 * 2. Self-healing under various error conditions
 * 3. RAG/embedding efficiency
 * 4. Token usage optimization
 * 5. Performance benchmarks
 * 6. Edge cases and error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
const masterCodeGenerator_1 = require("../masterCodeGenerator");
const selfHealingGenerator_1 = require("../selfHealingGenerator");
const orchestrator_1 = require("../../models/orchestrator");
const executionEngine_1 = require("../../core/executionEngine");
const configurationManager_1 = require("../../core/configurationManager");
const secureStorage_1 = require("../../core/secureStorage");
// Mock dependencies
jest.mock('vscode');
jest.mock('../../models/orchestrator');
jest.mock('../../core/executionEngine');
jest.mock('../../core/secureStorage');
jest.mock('../../cache/cacheManager');
describe.skip('Code Generation Stress Tests', () => {
    let masterGenerator;
    let selfHealingGenerator;
    let orchestrator;
    let executionEngine;
    beforeEach(() => {
        const mockContext = {
            subscriptions: [],
            workspaceState: { get: jest.fn(), update: jest.fn() },
            globalState: { get: jest.fn(), update: jest.fn() },
            extensionPath: '/test',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global',
            logPath: '/test/logs',
            secrets: { get: jest.fn(), store: jest.fn(), delete: jest.fn() }
        };
        const configManager = new configurationManager_1.ConfigurationManager();
        const storageManager = new secureStorage_1.SecureStorageManager(mockContext);
        const cacheManager = {};
        orchestrator = new orchestrator_1.ModelOrchestrator(mockContext, configManager, storageManager, cacheManager);
        executionEngine = new executionEngine_1.ExecutionEngine(mockContext);
        masterGenerator = new masterCodeGenerator_1.MasterCodeGenerator();
        selfHealingGenerator = new selfHealingGenerator_1.SelfHealingGenerator(orchestrator, executionEngine);
    });
    describe('Complex Code Generation', () => {
        it('should generate a complete REST API with authentication', async () => {
            const request = {
                description: 'Create a REST API with JWT authentication, user management, and rate limiting',
                language: 'typescript',
                framework: 'express',
                filePath: 'src/api/server.ts',
                workspaceRoot: '/test/workspace',
                options: {
                    useTemplates: true,
                    targetQuality: 95,
                    maxRefinementPasses: 3,
                    includeTests: true,
                    includeDocumentation: true,
                    strictValidation: true
                }
            };
            const result = await masterGenerator.generate(request);
            expect(result.success).toBe(true);
            expect(result.code).toContain('express');
            expect(result.code).toContain('jwt');
            expect(result.code).toContain('rateLimit');
            expect(result.testCode).toBeDefined();
            expect(result.quality.score).toBeGreaterThanOrEqual(90);
            expect(result.metadata.validationPassed).toBe(true);
        }, 60000);
        it('should generate a React component with hooks and TypeScript', async () => {
            const request = {
                description: 'Create a data table component with sorting, filtering, pagination, and export functionality',
                language: 'typescript',
                framework: 'react',
                filePath: 'src/components/DataTable.tsx',
                workspaceRoot: '/test/workspace',
                options: {
                    useTemplates: true,
                    targetQuality: 95,
                    maxRefinementPasses: 3,
                    includeTests: true,
                    includeDocumentation: true,
                    strictValidation: true
                }
            };
            const result = await masterGenerator.generate(request);
            expect(result.success).toBe(true);
            expect(result.code).toContain('useState');
            expect(result.code).toContain('useEffect');
            expect(result.code).toContain('interface');
            expect(result.testCode).toContain('@testing-library/react');
            expect(result.quality.score).toBeGreaterThanOrEqual(90);
        }, 60000);
        it('should generate a Python ML pipeline with data preprocessing', async () => {
            const request = {
                description: 'Create a machine learning pipeline with data preprocessing, feature engineering, model training, and evaluation',
                language: 'python',
                framework: 'scikit-learn',
                filePath: 'src/ml/pipeline.py',
                workspaceRoot: '/test/workspace',
                options: {
                    useTemplates: true,
                    targetQuality: 95,
                    maxRefinementPasses: 3,
                    includeTests: true,
                    includeDocumentation: true,
                    strictValidation: true
                }
            };
            const result = await masterGenerator.generate(request);
            expect(result.success).toBe(true);
            expect(result.code).toContain('sklearn');
            expect(result.code).toContain('fit');
            expect(result.code).toContain('transform');
            expect(result.testCode).toContain('pytest');
            expect(result.quality.score).toBeGreaterThanOrEqual(85);
        }, 60000);
    });
    describe('Self-Healing Capabilities', () => {
        it('should automatically fix syntax errors', async () => {
            const mockContext = {
                projectType: 'typescript',
                dependencies: [],
                recentFiles: [],
                symbols: [],
                imports: [],
                exports: []
            };
            const request = {
                description: 'Create a function with intentional syntax errors',
                language: 'typescript',
                filePath: 'src/test.ts',
                context: mockContext,
                maxIterations: 5,
                targetQuality: 95,
                autoFix: true
            };
            const result = await selfHealingGenerator.generate(request);
            expect(result.success).toBe(true);
            expect(result.finalQuality).toBeGreaterThanOrEqual(90);
            expect(result.healingHistory.length).toBeGreaterThan(1);
            expect(result.healingHistory.some(h => h.action === 'fixed')).toBe(true);
        }, 60000);
        it('should fix type errors in TypeScript', async () => {
            const mockContext = {
                projectType: 'typescript',
                dependencies: [],
                recentFiles: [],
                symbols: [],
                imports: [],
                exports: []
            };
            const request = {
                description: 'Create a complex TypeScript class with generic types and interfaces',
                language: 'typescript',
                filePath: 'src/complex.ts',
                context: mockContext,
                maxIterations: 5,
                targetQuality: 95,
                autoFix: true
            };
            const result = await selfHealingGenerator.generate(request);
            expect(result.success).toBe(true);
            expect(result.code).toContain('interface');
            expect(result.code).toContain('class');
            expect(result.finalQuality).toBeGreaterThanOrEqual(90);
        }, 60000);
        it('should fix linting issues', async () => {
            const mockContext = {
                projectType: 'typescript',
                dependencies: [],
                recentFiles: [],
                symbols: [],
                imports: [],
                exports: []
            };
            const request = {
                description: 'Create code that may have linting issues',
                language: 'typescript',
                filePath: 'src/lint-test.ts',
                context: mockContext,
                maxIterations: 5,
                targetQuality: 95,
                autoFix: true
            };
            const result = await selfHealingGenerator.generate(request);
            expect(result.success).toBe(true);
            expect(result.healingHistory.some(h => h.issuesFixed > 0)).toBe(true);
        }, 60000);
        it('should handle and fix runtime errors', async () => {
            const mockContext = {
                projectType: 'typescript',
                dependencies: [],
                recentFiles: [],
                symbols: [],
                imports: [],
                exports: []
            };
            const request = {
                description: 'Create a function that processes data with error handling',
                language: 'typescript',
                filePath: 'src/processor.ts',
                context: mockContext,
                maxIterations: 5,
                targetQuality: 95,
                autoFix: true
            };
            const result = await selfHealingGenerator.generate(request);
            expect(result.success).toBe(true);
            expect(result.code).toContain('try');
            expect(result.code).toContain('catch');
            expect(result.finalQuality).toBeGreaterThanOrEqual(90);
        }, 60000);
    });
    describe('Performance Benchmarks', () => {
        it('should generate code within acceptable time limits', async () => {
            const startTime = Date.now();
            const request = {
                description: 'Create a simple utility function',
                language: 'typescript',
                filePath: 'src/utils.ts',
                workspaceRoot: '/test/workspace',
                options: {
                    useTemplates: true,
                    targetQuality: 90,
                    maxRefinementPasses: 2,
                    includeTests: false,
                    includeDocumentation: false,
                    strictValidation: false
                }
            };
            const result = await masterGenerator.generate(request);
            const duration = Date.now() - startTime;
            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(30000); // Should complete in under 30 seconds
            expect(result.metadata.duration).toBeLessThan(30000);
        }, 35000);
        it('should handle concurrent generation requests', async () => {
            const requests = Array(5).fill(null).map((_, i) => ({
                description: `Create utility function ${i}`,
                language: 'typescript',
                filePath: `src/utils${i}.ts`,
                workspaceRoot: '/test/workspace',
                options: {
                    useTemplates: true,
                    targetQuality: 85,
                    maxRefinementPasses: 1,
                    includeTests: false,
                    includeDocumentation: false,
                    strictValidation: false
                }
            }));
            const startTime = Date.now();
            const results = await Promise.all(requests.map(r => masterGenerator.generate(r)));
            const duration = Date.now() - startTime;
            expect(results.every(r => r.success)).toBe(true);
            expect(duration).toBeLessThan(60000); // All 5 should complete in under 60 seconds
        }, 65000);
    });
    describe('Edge Cases', () => {
        it('should handle empty descriptions gracefully', async () => {
            const request = {
                description: '',
                language: 'typescript',
                filePath: 'src/empty.ts',
                workspaceRoot: '/test/workspace'
            };
            const result = await masterGenerator.generate(request);
            expect(result.success).toBe(false);
            expect(result.quality.issues).toContain('Empty description provided');
        });
        it('should handle unsupported languages', async () => {
            const request = {
                description: 'Create a function',
                language: 'unsupported-lang',
                filePath: 'src/test.xyz',
                workspaceRoot: '/test/workspace'
            };
            const result = await masterGenerator.generate(request);
            expect(result.success).toBe(false);
            expect(result.quality.issues.length).toBeGreaterThan(0);
        });
        it('should handle very long descriptions', async () => {
            const longDescription = 'Create a function that ' + 'does something '.repeat(1000);
            const request = {
                description: longDescription,
                language: 'typescript',
                filePath: 'src/long.ts',
                workspaceRoot: '/test/workspace'
            };
            const result = await masterGenerator.generate(request);
            expect(result).toBeDefined();
            // Should either succeed or fail gracefully
            expect(typeof result.success).toBe('boolean');
        });
    });
});
//# sourceMappingURL=codeGeneration.stress.test.js.map