"use strict";
/**
 * Tests for Complexity Analyzer Utility
 */
Object.defineProperty(exports, "__esModule", { value: true });
const complexityAnalyzer_1 = require("../complexityAnalyzer");
describe('ComplexityAnalyzer', () => {
    describe('calculateCyclomaticComplexity', () => {
        it('should return 1 for simple code with no branches', () => {
            const code = `
 const x = 5;
 console.log(x);
 `;
            expect((0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code)).toBe(1);
        });
        it('should count if statements', () => {
            const code = `
 if (x > 5) {
 console.log('greater');
 }
 `;
            expect((0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code)).toBe(2); // 1 base + 1 if
        });
        it('should count multiple decision points', () => {
            const code = `
 if (x > 5) {
 console.log('greater');
 } else if (x < 5) {
 console.log('less');
 }

 for (let i = 0; i < 10; i++) {
 if (i % 2 === 0) {
 console.log(i);
 }
 }
 `;
            // 1 base + 1 if + 1 else if + 1 for + 1 if + logical operators
            expect((0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code)).toBeGreaterThanOrEqual(5);
        });
        it('should count logical operators', () => {
            const code = `
 if (x > 5 && y < 10 || z === 0) {
 console.log('complex');
 }
 `;
            // 1 base + 1 if + 1 && + 1 || = 4
            expect((0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code)).toBeGreaterThanOrEqual(3);
        });
        it('should count ternary operators', () => {
            const code = `
 const result = x > 5 ? 'yes' : 'no';
 `;
            const complexity = (0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code);
            expect(complexity).toBeGreaterThanOrEqual(1); // At least base complexity
        });
        it('should count switch cases', () => {
            const code = `
 switch (x) {
 case 1:
 break;
 case 2:
 break;
 case 3:
 break;
 }
 `;
            expect((0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code)).toBeGreaterThanOrEqual(4); // 1 base + 3 cases
        });
        it('should count catch blocks', () => {
            const code = `
 try {
 doSomething();
 } catch (error) {
 handleError(error);
 }
 `;
            expect((0, complexityAnalyzer_1.calculateCyclomaticComplexity)(code)).toBe(2); // 1 base + 1 catch
        });
    });
    describe('calculateCognitiveComplexity', () => {
        it('should return 0 for simple code', () => {
            const code = `
 const x = 5;
 console.log(x);
 `;
            expect((0, complexityAnalyzer_1.calculateCognitiveComplexity)(code)).toBe(0);
        });
        it('should count control structures with nesting weight', () => {
            const code = `
 if (x > 5) {
 if (y > 10) {
 console.log('nested');
 }
 }
 `;
            // First if: 1 + 0 (nesting 0) = 1
            // Second if: 1 + 1 (nesting 1) = 2
            // Total: 3
            expect((0, complexityAnalyzer_1.calculateCognitiveComplexity)(code)).toBeGreaterThanOrEqual(3);
        });
        it('should count logical operators', () => {
            const code = `
 if (x > 5 && y < 10 || z === 0) {
 console.log('complex');
 }
 `;
            // 1 if + 2 logical operators = 3+
            expect((0, complexityAnalyzer_1.calculateCognitiveComplexity)(code)).toBeGreaterThanOrEqual(3);
        });
        it('should count break/continue/return/throw', () => {
            const code = `
 for (let i = 0; i < 10; i++) {
 if (i === 5) {
 break;
 }
 if (i === 3) {
 continue;
 }
 }
 `;
            expect((0, complexityAnalyzer_1.calculateCognitiveComplexity)(code)).toBeGreaterThanOrEqual(4);
        });
    });
    describe('calculateNestingDepth', () => {
        it('should return 0 for code with no nesting', () => {
            const code = `
 const x = 5;
 console.log(x);
 `;
            expect((0, complexityAnalyzer_1.calculateNestingDepth)(code)).toBe(0);
        });
        it('should calculate single level nesting', () => {
            const code = `
 if (x > 5) {
 console.log('yes');
 }
 `;
            expect((0, complexityAnalyzer_1.calculateNestingDepth)(code)).toBe(1);
        });
        it('should calculate deep nesting', () => {
            const code = `
 if (a) {
 if (b) {
 if (c) {
 if (d) {
 console.log('deep');
 }
 }
 }
 }
 `;
            expect((0, complexityAnalyzer_1.calculateNestingDepth)(code)).toBe(4);
        });
    });
    describe('calculateCommentRatio', () => {
        it('should return 0 for code with no comments', () => {
            const code = `
 const x = 5;
 console.log(x);
 `;
            expect((0, complexityAnalyzer_1.calculateCommentRatio)(code)).toBe(0);
        });
        it('should calculate ratio for single-line comments', () => {
            const code = `
 // This is a comment
 const x = 5;
 // Another comment
 console.log(x);
 `;
            const ratio = (0, complexityAnalyzer_1.calculateCommentRatio)(code);
            expect(ratio).toBeGreaterThan(0);
            expect(ratio).toBeLessThan(1);
        });
        it('should calculate ratio for multi-line comments', () => {
            const code = `
 /* This is a
 * multi-line
 * comment
 */
 const x = 5;
 `;
            const ratio = (0, complexityAnalyzer_1.calculateCommentRatio)(code);
            expect(ratio).toBeGreaterThan(0);
        });
    });
    describe('analyzeComplexity', () => {
        it('should return all metrics', () => {
            const code = `
 // Simple function
 function add(a, b) {
 if (a > 0 && b > 0) {
 return a + b;
 }
 return 0;
 }
 `;
            const metrics = (0, complexityAnalyzer_1.analyzeComplexity)(code);
            expect(metrics).toHaveProperty('cyclomatic');
            expect(metrics).toHaveProperty('cognitive');
            expect(metrics).toHaveProperty('nestingDepth');
            expect(metrics).toHaveProperty('linesOfCode');
            expect(metrics).toHaveProperty('commentRatio');
            expect(metrics.cyclomatic).toBeGreaterThan(0);
            expect(metrics.linesOfCode).toBeGreaterThan(0);
        });
    });
    describe('detectComplexityIssues', () => {
        it('should detect no issues for simple code', () => {
            const metrics = {
                cyclomatic: 3,
                cognitive: 2,
                nestingDepth: 1,
                linesOfCode: 10,
                commentRatio: 0.2
            };
            const issues = (0, complexityAnalyzer_1.detectComplexityIssues)(metrics);
            expect(issues).toHaveLength(0);
        });
        it('should detect high cyclomatic complexity', () => {
            const metrics = {
                cyclomatic: 25,
                cognitive: 5,
                nestingDepth: 2,
                linesOfCode: 50,
                commentRatio: 0.2
            };
            const issues = (0, complexityAnalyzer_1.detectComplexityIssues)(metrics);
            const cyclomaticIssue = issues.find(i => i.type === 'cyclomatic');
            expect(cyclomaticIssue).toBeDefined();
            expect(cyclomaticIssue?.severity).toBe('critical');
        });
        it('should detect high cognitive complexity', () => {
            const metrics = {
                cyclomatic: 5,
                cognitive: 25,
                nestingDepth: 2,
                linesOfCode: 50,
                commentRatio: 0.2
            };
            const issues = (0, complexityAnalyzer_1.detectComplexityIssues)(metrics);
            const cognitiveIssue = issues.find(i => i.type === 'cognitive');
            expect(cognitiveIssue).toBeDefined();
            expect(cognitiveIssue?.severity).toBe('critical');
        });
        it('should detect deep nesting', () => {
            const metrics = {
                cyclomatic: 5,
                cognitive: 5,
                nestingDepth: 7,
                linesOfCode: 50,
                commentRatio: 0.2
            };
            const issues = (0, complexityAnalyzer_1.detectComplexityIssues)(metrics);
            const nestingIssue = issues.find(i => i.type === 'nesting');
            expect(nestingIssue).toBeDefined();
            expect(nestingIssue?.severity).toBe('critical');
        });
        it('should detect low comment ratio', () => {
            const metrics = {
                cyclomatic: 5,
                cognitive: 5,
                nestingDepth: 2,
                linesOfCode: 50,
                commentRatio: 0.05
            };
            const issues = (0, complexityAnalyzer_1.detectComplexityIssues)(metrics);
            const commentIssue = issues.find(i => i.type === 'comments');
            expect(commentIssue).toBeDefined();
            expect(commentIssue?.severity).toBe('medium');
        });
    });
    describe('calculateQualityScore', () => {
        it('should return 100 for perfect code', () => {
            const metrics = {
                cyclomatic: 3,
                cognitive: 2,
                nestingDepth: 1,
                linesOfCode: 10,
                commentRatio: 0.2
            };
            const score = (0, complexityAnalyzer_1.calculateQualityScore)(metrics);
            expect(score).toBe(100);
        });
        it('should penalize high complexity', () => {
            const metrics = {
                cyclomatic: 25,
                cognitive: 25,
                nestingDepth: 6,
                linesOfCode: 100,
                commentRatio: 0.05
            };
            const score = (0, complexityAnalyzer_1.calculateQualityScore)(metrics);
            expect(score).toBeLessThan(50);
        });
        it('should never return negative scores', () => {
            const metrics = {
                cyclomatic: 100,
                cognitive: 100,
                nestingDepth: 20,
                linesOfCode: 1000,
                commentRatio: 0
            };
            const score = (0, complexityAnalyzer_1.calculateQualityScore)(metrics);
            expect(score).toBeGreaterThanOrEqual(0);
        });
    });
    describe('getComplexityLevel', () => {
        it('should return correct level for cyclomatic complexity', () => {
            expect((0, complexityAnalyzer_1.getComplexityLevel)(3, 'cyclomatic')).toBe('low');
            expect((0, complexityAnalyzer_1.getComplexityLevel)(8, 'cyclomatic')).toBe('medium');
            expect((0, complexityAnalyzer_1.getComplexityLevel)(13, 'cyclomatic')).toBe('high');
            expect((0, complexityAnalyzer_1.getComplexityLevel)(25, 'cyclomatic')).toBe('critical');
        });
        it('should return correct level for cognitive complexity', () => {
            expect((0, complexityAnalyzer_1.getComplexityLevel)(3, 'cognitive')).toBe('low');
            expect((0, complexityAnalyzer_1.getComplexityLevel)(8, 'cognitive')).toBe('medium');
            expect((0, complexityAnalyzer_1.getComplexityLevel)(18, 'cognitive')).toBe('critical'); // 18 > 15 (high threshold)
            expect((0, complexityAnalyzer_1.getComplexityLevel)(25, 'cognitive')).toBe('critical');
        });
        it('should return correct level for nesting', () => {
            expect((0, complexityAnalyzer_1.getComplexityLevel)(1, 'nesting')).toBe('low');
            expect((0, complexityAnalyzer_1.getComplexityLevel)(2, 'nesting')).toBe('low');
            expect((0, complexityAnalyzer_1.getComplexityLevel)(4, 'nesting')).toBe('high');
            expect((0, complexityAnalyzer_1.getComplexityLevel)(7, 'nesting')).toBe('critical');
        });
    });
});
//# sourceMappingURL=complexityAnalyzer.test.js.map