/**
 * Tests for FileAttachmentManager
 */

import { FileAttachmentManager } from '../fileAttachmentManager';
import * as fs from 'fs';
import * as path from 'path';

// Mock vscode
jest.mock('vscode');

// Mock fs
jest.mock('fs', () => ({
 existsSync: jest.fn(),
 readFileSync: jest.fn(),
 statSync: jest.fn()
}));

const fs_mock = fs as jest.Mocked<typeof fs>;

describe('FileAttachmentManager', () => {
 let manager: FileAttachmentManager;
 const workspaceRoot = '/test/workspace';

 beforeEach(() => {
 manager = new FileAttachmentManager(workspaceRoot);
 jest.clearAllMocks();

 // Default mock implementations
 fs_mock.existsSync.mockReturnValue(true);
 fs_mock.readFileSync.mockReturnValue('test content');
 fs_mock.statSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() } as any);
 });

 describe('attachFile', () => {
 it('should attach a valid file', async () => {
 const filePath = '/test/workspace/src/test.ts';
 fs_mock.readFileSync.mockReturnValue('const x = 1;');

 const result = await manager.attachFile(filePath);

 expect(result).not.toBeNull();
 expect(result?.name).toBe('test.ts');
 expect(result?.language).toBe('typescript');
 expect(result?.content).toBe('const x = 1;');
 });

 it('should return null for non-existent file', async () => {
 const filePath = '/test/workspace/missing.ts';
 fs_mock.existsSync.mockReturnValue(false);

 const result = await manager.attachFile(filePath);

 expect(result).toBeNull();
 });

 it('should return null for file exceeding size limit', async () => {
 const filePath = '/test/workspace/large.ts';
 fs_mock.statSync.mockReturnValue({ size: 2 * 1024 * 1024, mtimeMs: Date.now() } as any);

 const result = await manager.attachFile(filePath);

 expect(result).toBeNull();
 });

 it('should not attach duplicate files', async () => {
 const filePath = '/test/workspace/test.ts';
 fs_mock.readFileSync.mockReturnValue('const x = 1;');

 await manager.attachFile(filePath);
 const result = await manager.attachFile(filePath);

 expect(result).not.toBeNull();
 expect(manager.getCount()).toBe(1);
 });

 it('should enforce maximum file limit', async () => {
 fs_mock.readFileSync.mockReturnValue('test');

 // Attach 10 files (max)
 for (let i = 0; i < 10; i++) {
 await manager.attachFile(`/test/workspace/file${i}.ts`);
 }

 // Try to attach 11th file
 const result = await manager.attachFile('/test/workspace/file11.ts');

 expect(result).toBeNull();
 expect(manager.getCount()).toBe(10);
 });
 });

 describe('attachFiles', () => {
 it('should attach multiple files', async () => {
 const filePaths = [
 '/test/workspace/file1.ts',
 '/test/workspace/file2.js',
 '/test/workspace/file3.py'
 ];
 fs_mock.readFileSync.mockReturnValue('test content');

 const results = await manager.attachFiles(filePaths);

 expect(results).toHaveLength(3);
 expect(manager.getCount()).toBe(3);
 });

 it('should skip invalid files', async () => {
 const filePaths = [
 '/test/workspace/valid.ts',
 '/test/workspace/invalid.ts'
 ];

 fs_mock.existsSync.mockImplementation((path: any) => {
 return path === '/test/workspace/valid.ts';
 });
 fs_mock.readFileSync.mockReturnValue('test');

 const results = await manager.attachFiles(filePaths);

 expect(results).toHaveLength(1);
 expect(results[0].name).toBe('valid.ts');
 });
 });

 describe('removeFile', () => {
 it('should remove attached file', async () => {
 const filePath = '/test/workspace/test.ts';
 fs_mock.readFileSync.mockReturnValue('test');

 await manager.attachFile(filePath);
 expect(manager.getCount()).toBe(1);

 const removed = manager.removeFile(filePath);

 expect(removed).toBe(true);
 expect(manager.getCount()).toBe(0);
 });

 it('should return false for non-existent file', () => {
 const removed = manager.removeFile('/test/workspace/missing.ts');
 expect(removed).toBe(false);
 });
 });

 describe('clearAll', () => {
 it('should clear all attached files', async () => {
 fs_mock.readFileSync.mockReturnValue('test');

 await manager.attachFile('/test/workspace/file1.ts');
 await manager.attachFile('/test/workspace/file2.ts');
 expect(manager.getCount()).toBe(2);

 manager.clearAll();

 expect(manager.getCount()).toBe(0);
 });
 });

 describe('getAttachedFiles', () => {
 it('should return all attached files', async () => {
 fs_mock.readFileSync.mockReturnValue('test');

 await manager.attachFile('/test/workspace/file1.ts');
 await manager.attachFile('/test/workspace/file2.js');

 const files = manager.getAttachedFiles();

 expect(files).toHaveLength(2);
 expect(files[0].name).toBe('file1.ts');
 expect(files[1].name).toBe('file2.js');
 });
 });

 describe('isAttached', () => {
 it('should return true for attached file', async () => {
 const filePath = '/test/workspace/test.ts';
 fs_mock.readFileSync.mockReturnValue('test');

 await manager.attachFile(filePath);

 expect(manager.isAttached(filePath)).toBe(true);
 });

 it('should return false for non-attached file', () => {
 expect(manager.isAttached('/test/workspace/missing.ts')).toBe(false);
 });
 });

 describe('getTotalSize', () => {
 it('should calculate total size of attached files', async () => {
 fs_mock.readFileSync.mockReturnValue('test');
 fs_mock.statSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() } as any);

 await manager.attachFile('/test/workspace/file1.ts');
 await manager.attachFile('/test/workspace/file2.ts');

 const totalSize = manager.getTotalSize();

 expect(totalSize).toBe(2048); // 2 * 1024
 });
 });

 describe('formatForContext', () => {
 it('should format attached files for AI context', async () => {
 const filePath = '/test/workspace/src/test.ts';
 fs_mock.readFileSync.mockReturnValue('const x = 1;');

 await manager.attachFile(filePath);

 const context = manager.formatForContext();

 expect(context).toContain('## Attached Files');
 expect(context).toContain('File: src/test.ts');
 expect(context).toContain('Language: typescript');
 expect(context).toContain('const x = 1;');
 });

 it('should return empty string when no files attached', () => {
 const context = manager.formatForContext();
 expect(context).toBe('');
 });

 it('should format multiple files', async () => {
 fs_mock.readFileSync.mockImplementation((path: any) => {
 if (path.includes('test1')) return 'file 1 content';
 if (path.includes('test2')) return 'file 2 content';
 return 'default';
 });

 await manager.attachFile('/test/workspace/test1.ts');
 await manager.attachFile('/test/workspace/test2.js');

 const context = manager.formatForContext();

 expect(context).toContain('test1.ts');
 expect(context).toContain('test2.js');
 expect(context).toContain('file 1 content');
 expect(context).toContain('file 2 content');
 });
 });

 describe('getStatistics', () => {
 it('should return statistics for attached files', async () => {
 fs_mock.readFileSync.mockReturnValue('test');
 fs_mock.statSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() } as any);

 await manager.attachFile('/test/workspace/file1.ts');
 await manager.attachFile('/test/workspace/file2.js');
 await manager.attachFile('/test/workspace/file3.py');

 const stats = manager.getStatistics();

 expect(stats.count).toBe(3);
 expect(stats.totalSize).toBe(3072);
 expect(stats.languages).toContain('typescript');
 expect(stats.languages).toContain('javascript');
 expect(stats.languages).toContain('python');
 });
 });

 describe('validateFile', () => {
 it('should validate existing file', () => {
 const filePath = '/test/workspace/test.ts';
 fs_mock.existsSync.mockReturnValue(true);
 fs_mock.statSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() } as any);

 const result = manager.validateFile(filePath);

 expect(result.valid).toBe(true);
 expect(result.error).toBeUndefined();
 });

 it('should reject non-existent file', () => {
 const filePath = '/test/workspace/missing.ts';
 fs_mock.existsSync.mockReturnValue(false);

 const result = manager.validateFile(filePath);

 expect(result.valid).toBe(false);
 expect(result.error).toBe('File not found');
 });

 it('should reject file exceeding size limit', () => {
 const filePath = '/test/workspace/large.ts';
 fs_mock.existsSync.mockReturnValue(true);
 fs_mock.statSync.mockReturnValue({ size: 2 * 1024 * 1024, mtimeMs: Date.now() } as any);

 const result = manager.validateFile(filePath);

 expect(result.valid).toBe(false);
 expect(result.error).toContain('File too large');
 });

 it('should reject binary files', () => {
 const filePath = '/test/workspace/image.png';
 fs_mock.existsSync.mockReturnValue(true);
 fs_mock.statSync.mockReturnValue({ size: 1024, mtimeMs: Date.now() } as any);

 const result = manager.validateFile(filePath);

 expect(result.valid).toBe(false);
 expect(result.error).toBe('Binary files are not supported');
 });
 });
});

