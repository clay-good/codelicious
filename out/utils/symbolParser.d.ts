/**
 * Symbol parser for extracting code symbols
 * Uses regex-based parsing for now, will be enhanced with Tree-sitter later
 */
import { Symbol } from '../types';
/**
 * Parse symbols from TypeScript/JavaScript code
 */
export declare function parseTypeScriptSymbols(content: string, filePath: string): Symbol[];
/**
 * Parse symbols from Python code
 */
export declare function parsePythonSymbols(content: string, filePath: string): Symbol[];
/**
 * Parse imports from TypeScript/JavaScript
 */
export declare function parseTypeScriptImports(content: string): string[];
/**
 * Parse imports from Python
 */
export declare function parsePythonImports(content: string): string[];
/**
 * Parse exports from TypeScript/JavaScript
 */
export declare function parseTypeScriptExports(content: string): string[];
/**
 * Parse symbols based on language
 */
export declare function parseSymbols(content: string, language: string, filePath: string): Symbol[];
/**
 * Parse imports based on language
 */
export declare function parseImports(content: string, language: string): string[];
/**
 * Parse exports based on language
 */
export declare function parseExports(content: string, language: string): string[];
//# sourceMappingURL=symbolParser.d.ts.map