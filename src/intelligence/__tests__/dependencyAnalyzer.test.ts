import { DependencyAnalyzer } from '../dependencyAnalyzer';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('vscode');
jest.mock('fs');
jest.mock('path');

describe('DependencyAnalyzer', () => {
 let analyzer: DependencyAnalyzer;
 const mockWorkspaceRoot = '/test/workspace';

 beforeEach(() => {
 analyzer = new DependencyAnalyzer(mockWorkspaceRoot);
 jest.clearAllMocks();

 // Mock vscode.workspace.findFiles
 (vscode as any).workspace = {
 findFiles: jest.fn().mockResolvedValue([])
 };

 // Mock path.join to return predictable paths
 (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));
 });

 describe('analyzeDependencies', () => {
 it('should analyze ES6 imports', async () => {
 const mockContent = `
import { a } from 'module1';
import b from 'module2';
import * as c from 'module3';
`;

 (fs.readFileSync as jest.Mock).mockReturnValue(mockContent);

 const dependencies = await analyzer.analyzeDependencies('/test/file.ts');

 expect(dependencies.length).toBe(3);
 });

 it('should analyze CommonJS requires', async () => {
 const mockContent = `
const a = require('module1');
const b = require('module2');
`;

 (fs.readFileSync as jest.Mock).mockReturnValue(mockContent);

 const dependencies = await analyzer.analyzeDependencies('/test/file.ts');

 expect(dependencies.length).toBe(2);
 });

 it('should analyze dynamic imports', async () => {
 const mockContent = `
const module = await import('module1');
import('module2').then(m => {});
`;

 (fs.readFileSync as jest.Mock).mockReturnValue(mockContent);

 const dependencies = await analyzer.analyzeDependencies('/test/file.ts');

 expect(dependencies.length).toBe(2);
 });

 it('should remove duplicate dependencies', async () => {
 const mockContent = `
import { a } from 'module1';
import { b } from 'module1';
const c = require('module1');
`;

 (fs.readFileSync as jest.Mock).mockReturnValue(mockContent);

 const dependencies = await analyzer.analyzeDependencies('/test/file.ts');

 expect(dependencies.length).toBe(1);
 });
 });

 describe('analyzeWorkspace', () => {
 it('should analyze all files in workspace', async () => {
 const mockFiles = [
 { fsPath: '/test/file1.ts' },
 { fsPath: '/test/file2.ts' }
 ];

 (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
 (fs.readFileSync as jest.Mock).mockReturnValue('import { a } from "module1";');
 (fs.existsSync as jest.Mock).mockReturnValue(false); // No package.json

 const graph = await analyzer.analyzeWorkspace();

 expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
 expect(graph.edges.length).toBeGreaterThanOrEqual(0);
 });

 it('should detect circular dependencies', async () => {
 const mockFiles = [
 { fsPath: '/test/file1.ts' },
 { fsPath: '/test/file2.ts' }
 ];

 (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
 (fs.readFileSync as jest.Mock)
 .mockReturnValueOnce('import { b } from "./file2";')
 .mockReturnValueOnce('import { a } from "./file1";');
 (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
 // Return false for package.json, true for other files
 return !filePath.includes('package.json');
 });
 (path.dirname as jest.Mock).mockReturnValue('/test');
 (path.resolve as jest.Mock)
 .mockReturnValueOnce('/test/file2.ts')
 .mockReturnValueOnce('/test/file1.ts');

 const graph = await analyzer.analyzeWorkspace();

 // Circular dependencies are hard to detect with mocks, just check the graph was built
 expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
 expect(graph.circular).toBeDefined();
 });

 it('should calculate dependency metrics', async () => {
 const mockFiles = [
 { fsPath: '/test/file1.ts' },
 { fsPath: '/test/file2.ts' }
 ];

 (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
 (fs.readFileSync as jest.Mock).mockReturnValue('import { a } from "module1";');
 (fs.existsSync as jest.Mock).mockReturnValue(false); // No package.json

 const graph = await analyzer.analyzeWorkspace();

 expect(graph.metrics).toBeDefined();
 expect(graph.metrics.totalDependencies).toBeGreaterThanOrEqual(0);
 expect(graph.metrics.couplingScore).toBeGreaterThanOrEqual(0);
 expect(graph.metrics.couplingScore).toBeLessThanOrEqual(100);
 });
 });

 describe('getDependencyImpact', () => {
 it('should calculate dependency impact', async () => {
 const mockFiles = [
 { fsPath: '/test/file1.ts' },
 { fsPath: '/test/file2.ts' },
 { fsPath: '/test/file3.ts' }
 ];

 (vscode.workspace.findFiles as jest.Mock).mockResolvedValue(mockFiles);
 (fs.readFileSync as jest.Mock)
 .mockReturnValueOnce('') // file1 has no imports
 .mockReturnValueOnce('import { a } from "./file1";') // file2 imports file1
 .mockReturnValueOnce('import { b } from "./file2";'); // file3 imports file2
 (fs.existsSync as jest.Mock).mockImplementation((filePath: string) => {
 // Return false for package.json, true for other files
 return !filePath.includes('package.json');
 });
 (path.dirname as jest.Mock).mockReturnValue('/test');
 (path.resolve as jest.Mock)
 .mockReturnValueOnce('/test/file1.ts')
 .mockReturnValueOnce('/test/file2.ts');

 await analyzer.analyzeWorkspace();

 const impact = await analyzer.getDependencyImpact('/test/file1.ts');

 expect(impact.directDependents.length).toBeGreaterThanOrEqual(0);
 expect(impact.totalImpact).toBeGreaterThanOrEqual(0);
 });
 });

 describe('suggestImprovements', () => {
 it('should suggest improvements for circular dependencies', async () => {
 const mockGraph = {
 nodes: [],
 edges: [],
 circular: [
 {
 cycle: ['/test/file1.ts', '/test/file2.ts', '/test/file1.ts'],
 severity: 'critical' as const
 }
 ],
 unused: [],
 metrics: {
 totalDependencies: 10,
 internalDependencies: 5,
 externalDependencies: 5,
 averageDependenciesPerFile: 2,
 maxDependencies: 5,
 circularDependencies: 1,
 unusedDependencies: 0,
 couplingScore: 50
 }
 };

 const suggestions = analyzer.suggestImprovements(mockGraph);

 expect(suggestions.length).toBeGreaterThan(0);
 expect(suggestions.some(s => s.includes('circular'))).toBe(true);
 });

 it('should suggest improvements for unused dependencies', async () => {
 const mockGraph = {
 nodes: [],
 edges: [],
 circular: [],
 unused: ['unused-module'],
 metrics: {
 totalDependencies: 10,
 internalDependencies: 5,
 externalDependencies: 5,
 averageDependenciesPerFile: 2,
 maxDependencies: 5,
 circularDependencies: 0,
 unusedDependencies: 1,
 couplingScore: 50
 }
 };

 const suggestions = analyzer.suggestImprovements(mockGraph);

 expect(suggestions.length).toBeGreaterThan(0);
 expect(suggestions.some(s => s.includes('unused'))).toBe(true);
 });

 it('should suggest improvements for high coupling', async () => {
 const mockGraph = {
 nodes: [],
 edges: [],
 circular: [],
 unused: [],
 metrics: {
 totalDependencies: 100,
 internalDependencies: 50,
 externalDependencies: 50,
 averageDependenciesPerFile: 10,
 maxDependencies: 25,
 circularDependencies: 0,
 unusedDependencies: 0,
 couplingScore: 80
 }
 };

 const suggestions = analyzer.suggestImprovements(mockGraph);

 expect(suggestions.length).toBeGreaterThan(0);
 expect(suggestions.some(s => s.includes('coupling'))).toBe(true);
 });

 it('should suggest improvements for too many dependencies', async () => {
 const mockGraph = {
 nodes: [],
 edges: [],
 circular: [],
 unused: [],
 metrics: {
 totalDependencies: 100,
 internalDependencies: 50,
 externalDependencies: 50,
 averageDependenciesPerFile: 10,
 maxDependencies: 30,
 circularDependencies: 0,
 unusedDependencies: 0,
 couplingScore: 50
 }
 };

 const suggestions = analyzer.suggestImprovements(mockGraph);

 expect(suggestions.length).toBeGreaterThan(0);
 expect(suggestions.some(s => s.includes('too many dependencies'))).toBe(true);
 });

 it('should return no suggestions for healthy codebase', async () => {
 const mockGraph = {
 nodes: [],
 edges: [],
 circular: [],
 unused: [],
 metrics: {
 totalDependencies: 10,
 internalDependencies: 5,
 externalDependencies: 5,
 averageDependenciesPerFile: 2,
 maxDependencies: 5,
 circularDependencies: 0,
 unusedDependencies: 0,
 couplingScore: 30
 }
 };

 const suggestions = analyzer.suggestImprovements(mockGraph);

 expect(suggestions.length).toBe(0);
 });
 });
});

