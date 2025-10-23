"use strict";
/**
 * Tests for Symbol Parser
 */
Object.defineProperty(exports, "__esModule", { value: true });
const symbolParser_1 = require("../symbolParser");
const types_1 = require("../../types");
describe('Symbol Parser', () => {
    describe('TypeScript/JavaScript parsing', () => {
        describe('parseTypeScriptSymbols', () => {
            it('should parse class declarations', () => {
                const code = `
export class MyClass {
 constructor() {}
}

class AnotherClass {}
 `;
                const symbols = (0, symbolParser_1.parseTypeScriptSymbols)(code, 'test.ts');
                const classSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.CLASS);
                expect(classSymbols.length).toBe(2);
                expect(classSymbols[0].name).toBe('MyClass');
                expect(classSymbols[1].name).toBe('AnotherClass');
            });
            it('should parse interface declarations', () => {
                const code = `
export interface MyInterface {
 prop: string;
}

interface AnotherInterface {}
 `;
                const symbols = (0, symbolParser_1.parseTypeScriptSymbols)(code, 'test.ts');
                const interfaceSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.INTERFACE);
                expect(interfaceSymbols.length).toBe(2);
                expect(interfaceSymbols[0].name).toBe('MyInterface');
                expect(interfaceSymbols[1].name).toBe('AnotherInterface');
            });
            it('should parse function declarations', () => {
                const code = `
export function myFunction() {}

async function asyncFunction() {}

function regularFunction() {}
 `;
                const symbols = (0, symbolParser_1.parseTypeScriptSymbols)(code, 'test.ts');
                const functionSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.FUNCTION);
                expect(functionSymbols.length).toBe(3);
                expect(functionSymbols[0].name).toBe('myFunction');
                expect(functionSymbols[1].name).toBe('asyncFunction');
                expect(functionSymbols[2].name).toBe('regularFunction');
            });
            it('should parse arrow functions', () => {
                const code = `
export const arrowFunc = () => {};

const asyncArrow = async () => {};

const arrowWithParams = (a: string, b: number) => {};
 `;
                const symbols = (0, symbolParser_1.parseTypeScriptSymbols)(code, 'test.ts');
                const arrowSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.FUNCTION);
                expect(arrowSymbols.length).toBe(3);
                expect(arrowSymbols[0].name).toBe('arrowFunc');
                expect(arrowSymbols[1].name).toBe('asyncArrow');
                expect(arrowSymbols[2].name).toBe('arrowWithParams');
            });
            it('should parse enum declarations', () => {
                const code = `
export enum MyEnum {
 VALUE1,
 VALUE2
}

enum AnotherEnum {}
 `;
                const symbols = (0, symbolParser_1.parseTypeScriptSymbols)(code, 'test.ts');
                const enumSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.ENUM);
                expect(enumSymbols.length).toBe(2);
                expect(enumSymbols[0].name).toBe('MyEnum');
                expect(enumSymbols[1].name).toBe('AnotherEnum');
            });
        });
        describe('parseTypeScriptImports', () => {
            it('should parse ES6 imports', () => {
                const code = `
import { something } from 'module1';
import defaultExport from 'module3';
 `;
                const imports = (0, symbolParser_1.parseTypeScriptImports)(code);
                expect(imports).toContain('module1');
                expect(imports).toContain('module3');
                expect(imports.length).toBe(2);
            });
            it('should parse require statements', () => {
                const code = `
const module1 = require('module1');
const { something } = require('module2');
 `;
                const imports = (0, symbolParser_1.parseTypeScriptImports)(code);
                expect(imports).toContain('module1');
                expect(imports).toContain('module2');
            });
        });
        describe('parseTypeScriptExports', () => {
            it('should parse named exports', () => {
                const code = `
export const myConst = 'value';
export function myFunction() {}
export class MyClass {}
export interface MyInterface {}
 `;
                const exports = (0, symbolParser_1.parseTypeScriptExports)(code);
                expect(exports).toContain('myConst');
                expect(exports).toContain('myFunction');
                expect(exports).toContain('MyClass');
                expect(exports).toContain('MyInterface');
            });
            it('should parse export blocks', () => {
                const code = `
const a = 1;
const b = 2;
export { a, b };
 `;
                const exports = (0, symbolParser_1.parseTypeScriptExports)(code);
                expect(exports).toContain('a');
                expect(exports).toContain('b');
            });
        });
    });
    describe('Python parsing', () => {
        describe('parsePythonSymbols', () => {
            it('should parse class declarations', () => {
                const code = `
class MyClass:
 pass

class AnotherClass(BaseClass):
 pass
 `;
                const symbols = (0, symbolParser_1.parsePythonSymbols)(code, 'test.py');
                const classSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.CLASS);
                expect(classSymbols.length).toBe(2);
                expect(classSymbols[0].name).toBe('MyClass');
                expect(classSymbols[1].name).toBe('AnotherClass');
            });
            it('should parse function declarations', () => {
                const code = `
def my_function():
 pass

async def async_function():
 pass

def function_with_params(a, b):
 pass
 `;
                const symbols = (0, symbolParser_1.parsePythonSymbols)(code, 'test.py');
                const functionSymbols = symbols.filter(s => s.kind === types_1.SymbolKind.FUNCTION);
                expect(functionSymbols.length).toBe(3);
                expect(functionSymbols[0].name).toBe('my_function');
                expect(functionSymbols[1].name).toBe('async_function');
                expect(functionSymbols[2].name).toBe('function_with_params');
            });
        });
        describe('parsePythonImports', () => {
            it('should parse import statements', () => {
                const code = `
import os
import sys
import json
 `;
                const imports = (0, symbolParser_1.parsePythonImports)(code);
                expect(imports).toContain('os');
                expect(imports).toContain('sys');
                expect(imports).toContain('json');
            });
            it('should parse from...import statements', () => {
                const code = `
from os import path
from typing import List, Dict
from .local import something
 `;
                const imports = (0, symbolParser_1.parsePythonImports)(code);
                expect(imports).toContain('os');
                expect(imports).toContain('typing');
                expect(imports).toContain('.local');
            });
        });
    });
    describe('Language-agnostic functions', () => {
        it('should parse symbols based on language', () => {
            const tsCode = 'export class MyClass {}';
            const pyCode = 'class MyClass:\n pass';
            const tsSymbols = (0, symbolParser_1.parseSymbols)(tsCode, 'typescript', 'test.ts');
            const pySymbols = (0, symbolParser_1.parseSymbols)(pyCode, 'python', 'test.py');
            expect(tsSymbols.length).toBeGreaterThan(0);
            expect(pySymbols.length).toBeGreaterThan(0);
        });
        it('should return empty array for unknown languages', () => {
            const symbols = (0, symbolParser_1.parseSymbols)('some code', 'unknown', 'test.txt');
            expect(symbols).toEqual([]);
        });
        it('should parse imports based on language', () => {
            const tsCode = "import { x } from 'module';";
            const pyCode = 'import os';
            const tsImports = (0, symbolParser_1.parseImports)(tsCode, 'typescript');
            const pyImports = (0, symbolParser_1.parseImports)(pyCode, 'python');
            expect(tsImports).toContain('module');
            expect(pyImports).toContain('os');
        });
        it('should parse exports based on language', () => {
            const tsCode = 'export const x = 1;';
            const tsExports = (0, symbolParser_1.parseExports)(tsCode, 'typescript');
            expect(tsExports).toContain('x');
        });
    });
});
//# sourceMappingURL=symbolParser.test.js.map