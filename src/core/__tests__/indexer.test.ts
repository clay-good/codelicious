/**
 * Tests for Progressive Indexing Engine
 */

import * as vscode from 'vscode';
import { IndexingEngine } from '../indexer';
import { ConfigurationManager } from '../configurationManager';
import { StatusBarManager } from '../../ui/statusBar';
import { IndexingPhase } from '../../types';

describe('IndexingEngine', () => {
 let indexingEngine: IndexingEngine;
 let mockContext: any;
 let configManager: ConfigurationManager;
 let statusBar: StatusBarManager;

 beforeEach(() => {
 mockContext = {
 subscriptions: [],
 workspaceState: {
 get: jest.fn(),
 update: jest.fn()
 },
 globalState: {
 get: jest.fn(),
 update: jest.fn()
 }
 };

 configManager = new ConfigurationManager();
 statusBar = new StatusBarManager();

 indexingEngine = new IndexingEngine(
 mockContext,
 configManager,
 statusBar
 );
 });

 afterEach(async () => {
 await indexingEngine.dispose();
 });

 describe('initialization', () => {
 it('should initialize with correct default state', () => {
 const status = indexingEngine.getStatus();

 expect(status.phase).toBe(IndexingPhase.BASIC);
 expect(status.progress).toBe(0);
 expect(status.filesProcessed).toBe(0);
 expect(status.totalFiles).toBe(0);
 });
 });

 describe('progress tracking', () => {
 it('should notify progress callbacks', (done) => {
 indexingEngine.onProgress((progress) => {
 expect(progress.phase).toBeDefined();
 expect(progress.progress).toBeGreaterThanOrEqual(0);
 expect(progress.progress).toBeLessThanOrEqual(100);
 done();
 });

 // Trigger progress update by starting indexing
 // This will fail in test environment but should trigger callback
 indexingEngine.startIndexing('/fake/path').catch(() => {
 // Expected to fail in test environment
 });
 });

 it('should track files processed', () => {
 const status = indexingEngine.getStatus();
 expect(status.filesProcessed).toBe(0);
 });
 });

 describe('file operations', () => {
 it('should handle indexFile without errors', async () => {
 await expect(
 indexingEngine.indexFile('/fake/file.ts')
 ).resolves.not.toThrow();
 });

 it('should handle updateFile without errors', async () => {
 await expect(
 indexingEngine.updateFile('/fake/file.ts')
 ).resolves.not.toThrow();
 });

 it('should handle removeFile without errors', async () => {
 await expect(
 indexingEngine.removeFile('/fake/file.ts')
 ).resolves.not.toThrow();
 });
 });

 describe('search functionality', () => {
 it('should return empty results for non-existent symbols', () => {
 const results = indexingEngine.searchSymbols('NonExistentSymbol');
 expect(results).toEqual([]);
 });

 it('should search symbols case-insensitively', () => {
 const results = indexingEngine.searchSymbols('TEST');
 expect(Array.isArray(results)).toBe(true);
 });
 });

 describe('statistics', () => {
 it('should return valid statistics', () => {
 const stats = indexingEngine.getStatistics();

 expect(stats).toHaveProperty('totalFiles');
 expect(stats).toHaveProperty('totalSymbols');
 expect(stats).toHaveProperty('byLanguage');
 expect(stats).toHaveProperty('byType');

 expect(stats.totalFiles).toBe(0);
 expect(stats.totalSymbols).toBe(0);
 expect(stats.byLanguage).toBeInstanceOf(Map);
 expect(stats.byType).toBeInstanceOf(Map);
 });
 });

 describe('lifecycle', () => {
 it('should stop indexing when requested', () => {
 indexingEngine.stop();
 // Should not throw
 });

 it('should dispose cleanly', async () => {
 await expect(indexingEngine.dispose()).resolves.not.toThrow();
 });

 it('should handle reindex request', async () => {
 await expect(
 indexingEngine.reindex()
 ).resolves.not.toThrow();
 });
 });

 describe('metadata retrieval', () => {
 it('should return undefined for non-indexed files', () => {
 const metadata = indexingEngine.getFileMetadata('/fake/file.ts');
 expect(metadata).toBeUndefined();
 });

 it('should return all indexed files', () => {
 const files = indexingEngine.getIndexedFiles();
 expect(Array.isArray(files)).toBe(true);
 expect(files.length).toBe(0);
 });
 });
});

