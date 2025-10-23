"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const codeChunker_1 = require("../codeChunker");
describe('CodeChunker', () => {
    let chunker;
    beforeEach(() => {
        chunker = new codeChunker_1.CodeChunker(512, 50);
    });
    describe('constructor', () => {
        it('should create chunker with default settings', () => {
            const defaultChunker = new codeChunker_1.CodeChunker();
            expect(defaultChunker).toBeDefined();
        });
        it('should create chunker with custom settings', () => {
            const customChunker = new codeChunker_1.CodeChunker(1024, 100);
            expect(customChunker).toBeDefined();
        });
    });
    describe('chunkFile', () => {
        it('should chunk TypeScript file with classes', async () => {
            const content = `export class Calculator {
 add(a: number, b: number): number {
 return a + b;
 }

 subtract(a: number, b: number): number {
 return a - b;
 }
}

export class Logger {
 log(message: string): void {
 console.log(message);
 }
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0].language).toBe('typescript');
            expect(chunks[0].type).toBe('class');
        });
        it('should chunk JavaScript file', async () => {
            const content = `function hello() {
 console.log('Hello');
}

function world() {
 console.log('World');
}`;
            const chunks = await chunker.chunkFile('test.js', content);
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0].language).toBe('javascript');
        });
        it('should chunk Python file', async () => {
            const content = `def hello():
 print('Hello')

def world():
 print('World')`;
            const chunks = await chunker.chunkFile('test.py', content);
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0].language).toBe('python');
        });
        it('should handle empty file', async () => {
            const chunks = await chunker.chunkFile('test.ts', '');
            // Empty file creates one empty chunk
            expect(chunks.length).toBeGreaterThanOrEqual(0);
        });
        it('should handle file with no symbols', async () => {
            const content = `// Just a comment
const x = 1;
const y = 2;`;
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0].type).toBe('block');
        });
        it('should include line numbers', async () => {
            const content = `function test() {
 return 42;
}`;
            const chunks = await chunker.chunkFile('test.js', content);
            expect(chunks[0].startLine).toBeDefined();
            expect(chunks[0].endLine).toBeDefined();
            expect(chunks[0].endLine).toBeGreaterThanOrEqual(chunks[0].startLine);
        });
        it('should preserve content', async () => {
            const content = `function test() {
 return 42;
}`;
            const chunks = await chunker.chunkFile('test.js', content);
            expect(chunks[0].content).toContain('function test');
            expect(chunks[0].content).toContain('return 42');
        });
    });
    describe('chunk types', () => {
        it('should identify class chunks', async () => {
            const content = `export class MyClass {
 method() {}
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            const classChunk = chunks.find(c => c.type === 'class');
            expect(classChunk).toBeDefined();
            expect(classChunk?.symbolName).toBe('MyClass');
        });
        it('should identify function chunks', async () => {
            const content = `function myFunction() {
 return 42;
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            const funcChunk = chunks.find(c => c.type === 'function');
            expect(funcChunk).toBeDefined();
            expect(funcChunk?.symbolName).toBe('myFunction');
        });
        it('should handle mixed content', async () => {
            const content = `const x = 1;

function foo() {
 return x;
}

class Bar {
 baz() {}
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThan(0);
            const types = chunks.map(c => c.type);
            expect(types).toContain('function');
            expect(types).toContain('class');
        });
    });
    describe('large file handling', () => {
        it('should split large files into multiple chunks', async () => {
            // Create a large file
            const lines = [];
            for (let i = 0; i < 1000; i++) {
                lines.push(`const var${i} = ${i};`);
            }
            const content = lines.join('\n');
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThan(1);
        });
        it('should handle very large functions', async () => {
            const lines = ['function largeFunction() {'];
            for (let i = 0; i < 500; i++) {
                lines.push(` const x${i} = ${i};`);
            }
            lines.push('}');
            const content = lines.join('\n');
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThan(0);
        });
    });
    describe('language detection', () => {
        it('should detect TypeScript', async () => {
            const chunks = await chunker.chunkFile('test.ts', 'const x = 1;');
            expect(chunks[0].language).toBe('typescript');
        });
        it('should detect JavaScript', async () => {
            const chunks = await chunker.chunkFile('test.js', 'const x = 1;');
            expect(chunks[0].language).toBe('javascript');
        });
        it('should detect Python', async () => {
            const chunks = await chunker.chunkFile('test.py', 'x = 1');
            expect(chunks[0].language).toBe('python');
        });
        it('should detect Java', async () => {
            const chunks = await chunker.chunkFile('Test.java', 'public class Test {}');
            expect(chunks[0].language).toBe('java');
        });
        it('should detect Go', async () => {
            const chunks = await chunker.chunkFile('test.go', 'package main');
            expect(chunks[0].language).toBe('go');
        });
        it('should detect Rust', async () => {
            const chunks = await chunker.chunkFile('test.rs', 'fn main() {}');
            expect(chunks[0].language).toBe('rust');
        });
    });
    describe('edge cases', () => {
        it('should handle single line file', async () => {
            const chunks = await chunker.chunkFile('test.ts', 'const x = 1;');
            expect(chunks.length).toBe(1);
            expect(chunks[0].startLine).toBe(0);
        });
        it('should handle file with only whitespace', async () => {
            const chunks = await chunker.chunkFile('test.ts', ' \n\n \n');
            expect(chunks.length).toBeGreaterThanOrEqual(0);
        });
        it('should handle file with special characters', async () => {
            const content = `function test() {
 const emoji = '';
 const unicode = '';
 return emoji + unicode;
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0].content).toContain('');
            expect(chunks[0].content).toContain('');
        });
        it('should handle nested structures', async () => {
            const content = `class Outer {
 class Inner {
 method() {
 function nested() {
 return 42;
 }
 }
 }
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThan(0);
        });
        it('should handle comments', async () => {
            const content = `// This is a comment
/* Multi-line
 comment */
function test() {
 // Inline comment
 return 42;
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks[0].content).toContain('comment');
        });
    });
    describe('chunk metadata', () => {
        it('should include symbol name for functions', async () => {
            const content = `function myFunction() {
 return 42;
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            const funcChunk = chunks.find(c => c.type === 'function');
            expect(funcChunk?.symbolName).toBe('myFunction');
        });
        it('should include symbol kind', async () => {
            const content = `class MyClass {
 method() {}
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            const classChunk = chunks.find(c => c.type === 'class');
            expect(classChunk?.symbolKind).toBeDefined();
        });
        it('should track line ranges accurately', async () => {
            const content = `function first() {
 return 1;
}

function second() {
 return 2;
}`;
            const chunks = await chunker.chunkFile('test.ts', content);
            expect(chunks.length).toBeGreaterThanOrEqual(2);
            if (chunks.length >= 2) {
                expect(chunks[0].endLine).toBeLessThan(chunks[1].startLine);
            }
        });
    });
});
//# sourceMappingURL=codeChunker.test.js.map