"use strict";
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
const codeAnalyzer_1 = require("../codeAnalyzer");
const fs = __importStar(require("fs"));
jest.mock('fs');
jest.mock('path');
describe('CodeAnalyzer', () => {
    let analyzer;
    const mockWorkspaceRoot = '/test/workspace';
    beforeEach(() => {
        analyzer = new codeAnalyzer_1.CodeAnalyzer(mockWorkspaceRoot);
        jest.clearAllMocks();
    });
    describe('analyzeFile', () => {
        it('should analyze a simple file', async () => {
            const mockContent = `
function hello() {
 console.log('hello');
}

class MyClass {
 method() {
 return 42;
 }
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result).toBeDefined();
            expect(result.metrics).toBeDefined();
            expect(result.issues).toBeDefined();
            expect(result.suggestions).toBeDefined();
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
        });
        it('should calculate correct metrics', async () => {
            const mockContent = `
// Comment
function test() {
 if (true) {
 return 1;
 }
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.metrics.lines).toBeGreaterThan(0);
            expect(result.metrics.linesOfCode).toBeGreaterThan(0);
            expect(result.metrics.comments).toBeGreaterThan(0);
            expect(result.metrics.complexity).toBeGreaterThan(0);
        });
        it('should detect high complexity', async () => {
            const mockContent = `
function complex() {
 if (a) {
 if (b) {
 if (c) {
 if (d) {
 if (e) {
 if (f) {
 return 1;
 }
 }
 }
 }
 }
 }
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.issues.some(i => i.category === 'complexity')).toBe(true);
        });
        it('should detect code smells', async () => {
            const mockContent = `
function test() {
 const x = 12345; // Magic number
 // TODO: fix this
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.issues.length).toBeGreaterThan(0);
        });
        it('should generate suggestions', async () => {
            const mockContent = `
function veryComplexFunction() {
 if (a && b && c && d && e) {
 if (f || g || h) {
 while (i < 100) {
 for (let j = 0; j < 10; j++) {
 if (k) {
 return 1;
 }
 }
 }
 }
 }
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.suggestions.length).toBeGreaterThan(0);
        });
        it('should calculate quality score', async () => {
            const mockContent = `
// Well-documented function
function simple() {
 return 42;
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.score).toBeGreaterThan(50);
        });
    });
    describe('metrics calculation', () => {
        it('should count lines of code correctly', async () => {
            const mockContent = `
// Comment
function test() {
 return 1;
}

// Another comment
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.metrics.linesOfCode).toBeLessThan(result.metrics.lines);
        });
        it('should count comments correctly', async () => {
            const mockContent = `
// Single line comment
/* Block comment
 line 2 */
function test() {
 return 1;
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.metrics.comments).toBeGreaterThan(0);
        });
        it('should calculate cyclomatic complexity', async () => {
            const mockContent = `
function test() {
 if (a) return 1;
 if (b) return 2;
 if (c) return 3;
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.metrics.complexity).toBeGreaterThan(1);
        });
        it('should calculate cognitive complexity', async () => {
            const mockContent = `
function test() {
 if (a) {
 if (b) {
 if (c) {
 return 1;
 }
 }
 }
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.metrics.cognitiveComplexity).toBeGreaterThan(0);
        });
        it('should count functions', async () => {
            const mockContent = `
function test1() {}
function test2() {}
const test3 = () => {};
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.metrics.functions).toBeGreaterThan(0);
        });
        it('should count classes', async () => {
            const mockContent = `
class Test1 {}
class Test2 {}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.metrics.classes).toBe(2);
        });
        it('should count dependencies', async () => {
            const mockContent = `
import { a } from 'module1';
import { b } from 'module2';
const c = require('module3');
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.metrics.dependencies).toBe(3);
        });
    });
    describe('issue detection', () => {
        it('should detect long files', async () => {
            const mockContent = 'function test() {}\n'.repeat(600);
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.issues.some(i => i.message.includes('too long'))).toBe(true);
        });
        it('should detect long lines', async () => {
            const mockContent = 'const x = ' + 'a'.repeat(150) + ';';
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.issues.some(i => i.message.includes('too long'))).toBe(true);
        });
        it('should detect TODO comments', async () => {
            const mockContent = `
function test() {
 // TODO: implement this
 return 1;
}
`;
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.issues.some(i => i.message.includes('TODO'))).toBe(true);
        });
        it('should detect low maintainability', async () => {
            const mockContent = `
function test() {
 if (a && b && c && d && e && f && g && h) {
 while (i < 100) {
 for (let j = 0; j < 10; j++) {
 if (k || l || m || n) {
 return 1;
 }
 }
 }
 }
}
`.repeat(10);
            fs.readFileSync.mockReturnValue(mockContent);
            const result = await analyzer.analyzeFile('/test/file.ts');
            expect(result.issues.some(i => i.category === 'complexity' || i.category === 'smell')).toBe(true);
        });
    });
});
//# sourceMappingURL=codeAnalyzer.test.js.map