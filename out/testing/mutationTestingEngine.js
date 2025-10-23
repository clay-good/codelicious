"use strict";
/**
 * Mutation Testing Engine - Test the tests to ensure they catch bugs
 *
 * Features:
 * - Automatic mutation generation (change operators, remove conditions, etc.)
 * - Test execution against mutations
 * - Mutation score calculation
 * - Weak test detection
 * - Test improvement suggestions
 *
 * Goal: Ensure tests actually catch bugs (95%+ mutation score)
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
exports.MutationTestingEngine = void 0;
const ts = __importStar(require("typescript"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('MutationTestingEngine');
class MutationTestingEngine {
    constructor(executionEngine, orchestrator, workspaceRoot) {
        this.executionEngine = executionEngine;
        this.orchestrator = orchestrator;
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Run mutation testing on code
    */
    async test(sourceFile, testFile, code) {
        logger.info(' Running mutation testing...');
        // Step 1: Generate mutations
        const mutations = this.generateMutations(code, sourceFile);
        logger.info(`Generated ${mutations.length} mutations`);
        if (mutations.length === 0) {
            return {
                mutationScore: 100,
                totalMutations: 0,
                killedMutations: 0,
                survivedMutations: 0,
                weakTests: [],
                recommendations: [],
                grade: 'A+'
            };
        }
        // Step 2: Run tests against each mutation
        let killedCount = 0;
        const survivedMutations = [];
        for (const mutation of mutations) {
            const killed = await this.testMutation(sourceFile, testFile, code, mutation);
            mutation.killed = killed;
            if (killed) {
                killedCount++;
            }
            else {
                survivedMutations.push(mutation);
            }
        }
        // Step 3: Calculate mutation score
        const mutationScore = Math.round((killedCount / mutations.length) * 100);
        const grade = this.getGrade(mutationScore);
        // Step 4: Identify weak tests
        const weakTests = await this.identifyWeakTests(survivedMutations, testFile);
        // Step 5: Generate recommendations
        const recommendations = this.generateRecommendations(survivedMutations, weakTests, mutationScore);
        logger.info(`Mutation testing complete: ${grade} (${mutationScore}% killed)`);
        return {
            mutationScore,
            totalMutations: mutations.length,
            killedMutations: killedCount,
            survivedMutations: survivedMutations.length,
            weakTests,
            recommendations,
            grade
        };
    }
    /**
    * Generate mutations from code
    */
    generateMutations(code, filePath) {
        const mutations = [];
        try {
            const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);
            const visit = (node) => {
                // Arithmetic operators
                if (ts.isBinaryExpression(node)) {
                    const operator = node.operatorToken.kind;
                    const mutatedOperators = this.getMutatedArithmeticOperators(operator);
                    for (const mutatedOp of mutatedOperators) {
                        mutations.push({
                            id: `mut_${mutations.length + 1}`,
                            type: 'arithmetic-operator',
                            original: ts.tokenToString(operator) || '',
                            mutated: mutatedOp,
                            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                            killed: false
                        });
                    }
                }
                // Comparison operators
                if (ts.isBinaryExpression(node) && this.isComparisonOperator(node.operatorToken.kind)) {
                    const operator = node.operatorToken.kind;
                    const mutatedOperators = this.getMutatedComparisonOperators(operator);
                    for (const mutatedOp of mutatedOperators) {
                        mutations.push({
                            id: `mut_${mutations.length + 1}`,
                            type: 'comparison-operator',
                            original: ts.tokenToString(operator) || '',
                            mutated: mutatedOp,
                            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                            killed: false
                        });
                    }
                }
                // Logical operators
                if (ts.isBinaryExpression(node) && this.isLogicalOperator(node.operatorToken.kind)) {
                    mutations.push({
                        id: `mut_${mutations.length + 1}`,
                        type: 'logical-operator',
                        original: node.operatorToken.getText(sourceFile),
                        mutated: node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? '||' : '&&',
                        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                        killed: false
                    });
                }
                // Return values
                if (ts.isReturnStatement(node) && node.expression) {
                    const text = node.expression.getText(sourceFile);
                    if (text === 'true') {
                        mutations.push({
                            id: `mut_${mutations.length + 1}`,
                            type: 'return-value',
                            original: 'true',
                            mutated: 'false',
                            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                            killed: false
                        });
                    }
                    else if (text === 'false') {
                        mutations.push({
                            id: `mut_${mutations.length + 1}`,
                            type: 'return-value',
                            original: 'false',
                            mutated: 'true',
                            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                            killed: false
                        });
                    }
                }
                // Negate conditions
                if (ts.isIfStatement(node)) {
                    mutations.push({
                        id: `mut_${mutations.length + 1}`,
                        type: 'negate-condition',
                        original: node.expression.getText(sourceFile),
                        mutated: `!(${node.expression.getText(sourceFile)})`,
                        line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                        killed: false
                    });
                }
                ts.forEachChild(node, visit);
            };
            visit(sourceFile);
        }
        catch (error) {
            logger.error('Failed to generate mutations:', error);
        }
        return mutations;
    }
    /**
    * Test a single mutation
    */
    async testMutation(sourceFile, testFile, originalCode, mutation) {
        try {
            // Apply mutation to code
            const mutatedCode = this.applyMutation(originalCode, mutation);
            // Write mutated code to temp file
            const fs = require('fs/promises');
            const path = require('path');
            const tempFile = path.join(this.workspaceRoot, '.mutation-temp', path.basename(sourceFile));
            await fs.mkdir(path.dirname(tempFile), { recursive: true });
            await fs.writeFile(tempFile, mutatedCode);
            // Run tests
            const result = await this.executionEngine.execute(`npm test -- ${testFile}`, {
                workingDirectory: this.workspaceRoot,
                timeout: 30000,
                requireConfirmation: false
            });
            // Clean up
            await fs.unlink(tempFile);
            // If tests fail, mutation was killed (good!)
            return result.exitCode !== 0;
        }
        catch (error) {
            logger.error(`Failed to test mutation ${mutation.id}:`, error);
            return false;
        }
    }
    /**
    * Apply mutation to code
    */
    applyMutation(code, mutation) {
        const lines = code.split('\n');
        const line = lines[mutation.line - 1];
        if (!line)
            return code;
        // Simple string replacement (can be improved with AST transformation)
        const mutatedLine = line.replace(mutation.original, mutation.mutated);
        lines[mutation.line - 1] = mutatedLine;
        return lines.join('\n');
    }
    /**
    * Identify weak tests that didn't catch mutations
    */
    async identifyWeakTests(survivedMutations, testFile) {
        const weakTests = [];
        // Group mutations by line (approximate test location)
        const mutationsByLine = new Map();
        for (const mutation of survivedMutations) {
            const mutations = mutationsByLine.get(mutation.line) || [];
            mutations.push(mutation);
            mutationsByLine.set(mutation.line, mutations);
        }
        // Create weak test entries
        for (const [line, mutations] of mutationsByLine) {
            const severity = mutations.length > 3 ? 'critical' : mutations.length > 1 ? 'high' : 'medium';
            weakTests.push({
                testFile,
                testName: `Tests for line ${line}`,
                survivedMutations: mutations,
                severity,
                suggestion: this.generateTestSuggestion(mutations)
            });
        }
        return weakTests;
    }
    /**
    * Generate test improvement suggestion
    */
    generateTestSuggestion(mutations) {
        const types = new Set(mutations.map(m => m.type));
        if (types.has('return-value')) {
            return 'Add assertions to verify return values (both true and false cases)';
        }
        if (types.has('comparison-operator')) {
            return 'Add boundary value tests (test edge cases like 0, -1, max values)';
        }
        if (types.has('logical-operator')) {
            return 'Add tests for all logical branches (both && and || conditions)';
        }
        if (types.has('arithmetic-operator')) {
            return 'Add tests to verify arithmetic operations with different inputs';
        }
        return 'Add more comprehensive test cases to catch these mutations';
    }
    /**
    * Generate recommendations
    */
    generateRecommendations(survivedMutations, weakTests, mutationScore) {
        const recommendations = [];
        if (mutationScore < 80) {
            recommendations.push(` Mutation score is ${mutationScore}% (target: 80%+) - tests are not catching bugs effectively`);
        }
        const criticalWeakTests = weakTests.filter(t => t.severity === 'critical');
        if (criticalWeakTests.length > 0) {
            recommendations.push(`${criticalWeakTests.length} critical weak tests found - add comprehensive test cases`);
        }
        const mutationTypes = new Set(survivedMutations.map(m => m.type));
        if (mutationTypes.has('return-value')) {
            recommendations.push('Add assertions for return values (test both success and failure cases)');
        }
        if (mutationTypes.has('comparison-operator')) {
            recommendations.push(' Add boundary value tests (test edge cases: 0, -1, max, min)');
        }
        if (mutationTypes.has('logical-operator')) {
            recommendations.push(' Add tests for all logical branches (test all && and || combinations)');
        }
        if (survivedMutations.length > 10) {
            recommendations.push('Consider using property-based testing for better coverage');
        }
        return recommendations;
    }
    // Helper methods
    getMutatedArithmeticOperators(operator) {
        const map = {
            [ts.SyntaxKind.PlusToken]: ['-', '*', '/'],
            [ts.SyntaxKind.MinusToken]: ['+', '*', '/'],
            [ts.SyntaxKind.AsteriskToken]: ['+', '-', '/'],
            [ts.SyntaxKind.SlashToken]: ['+', '-', '*']
        };
        return map[operator] || [];
    }
    getMutatedComparisonOperators(operator) {
        const map = {
            [ts.SyntaxKind.GreaterThanToken]: ['<', '>=', '<='],
            [ts.SyntaxKind.LessThanToken]: ['>', '>=', '<='],
            [ts.SyntaxKind.GreaterThanEqualsToken]: ['<', '>', '<='],
            [ts.SyntaxKind.LessThanEqualsToken]: ['<', '>', '>='],
            [ts.SyntaxKind.EqualsEqualsEqualsToken]: ['!=='],
            [ts.SyntaxKind.ExclamationEqualsEqualsToken]: ['===']
        };
        return map[operator] || [];
    }
    isComparisonOperator(kind) {
        return [
            ts.SyntaxKind.GreaterThanToken,
            ts.SyntaxKind.LessThanToken,
            ts.SyntaxKind.GreaterThanEqualsToken,
            ts.SyntaxKind.LessThanEqualsToken,
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.SyntaxKind.ExclamationEqualsEqualsToken
        ].includes(kind);
    }
    isLogicalOperator(kind) {
        return [
            ts.SyntaxKind.AmpersandAmpersandToken,
            ts.SyntaxKind.BarBarToken
        ].includes(kind);
    }
    getGrade(score) {
        if (score >= 95)
            return 'A+';
        if (score >= 90)
            return 'A';
        if (score >= 80)
            return 'B';
        if (score >= 70)
            return 'C';
        if (score >= 60)
            return 'D';
        return 'F';
    }
}
exports.MutationTestingEngine = MutationTestingEngine;
//# sourceMappingURL=mutationTestingEngine.js.map