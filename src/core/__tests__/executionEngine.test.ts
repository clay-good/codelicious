import { ExecutionEngine, ExecutionOptions } from '../executionEngine';
import { ConfigurationManager } from '../configurationManager';
import * as vscode from 'vscode';
import { ChildProcess } from 'child_process';

// Mock VS Code
jest.mock('vscode');

// Mock child_process
jest.mock('child_process', () => ({
 spawn: jest.fn()
}));

// Mock fs
jest.mock('fs', () => ({
 existsSync: jest.fn().mockReturnValue(true),
 statSync: jest.fn().mockReturnValue({ isDirectory: () => true })
}));

// Import the mocked spawn
import { spawn } from 'child_process';

describe('ExecutionEngine', () => {
 let engine: ExecutionEngine;
 let mockConfigManager: ConfigurationManager;
 let mockChildProcess: any;

 beforeEach(() => {
 // Reset mocks
 jest.clearAllMocks();

 // Mock config manager
 mockConfigManager = {
 get: jest.fn(),
 set: jest.fn(),
 has: jest.fn()
 } as any;

 // Mock child process
 mockChildProcess = {
 stdout: {
 on: jest.fn()
 },
 stderr: {
 on: jest.fn()
 },
 on: jest.fn(),
 kill: jest.fn(),
 killed: false
 };

 (spawn as jest.Mock).mockReturnValue(mockChildProcess);

 // Mock vscode.window.showWarningMessage
 (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Execute');

 // Mock vscode.workspace.workspaceFolders
 (vscode.workspace as any).workspaceFolders = [{
 uri: { fsPath: '/test/workspace' }
 }];

 engine = new ExecutionEngine(mockConfigManager);
 });

 afterEach(() => {
 jest.restoreAllMocks();
 });

 describe('execute', () => {
 it('should execute a simple command successfully', async () => {
 // Setup mock to simulate successful execution
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 mockChildProcess.stdout.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
 if (event === 'data') {
 setTimeout(() => callback(Buffer.from('Hello World')), 5);
 }
 return mockChildProcess.stdout;
 });

 const result = await engine.execute('echo "Hello World"');

 expect(result.success).toBe(true);
 expect(result.exitCode).toBe(0);
 expect(result.stdout).toBe('Hello World');
 expect(result.stderr).toBe('');
 expect(result.command).toBe('echo "Hello World"');
 expect(result.duration).toBeGreaterThan(0);
 });

 it('should capture stderr on command failure', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(1), 10);
 }
 return mockChildProcess;
 });

 mockChildProcess.stderr.on.mockImplementation((event: string, callback: (data: Buffer) => void) => {
 if (event === 'data') {
 setTimeout(() => callback(Buffer.from('Command not found')), 5);
 }
 return mockChildProcess.stderr;
 });

 const result = await engine.execute('invalid-command');

 expect(result.success).toBe(false);
 expect(result.exitCode).toBe(1);
 expect(result.stderr).toBe('Command not found');
 });

 it('should handle command timeout', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 // Simulate long-running command
 setTimeout(() => callback(0), 200);
 }
 return mockChildProcess;
 });

 const result = await engine.execute('sleep 10', { timeout: 100 });

 expect(result.success).toBe(false);
 expect(result.stderr).toBe('Command timed out');
 expect(result.exitCode).toBe(-1);
 expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
 });

 it('should handle process errors', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (error: Error) => void) => {
 if (event === 'error') {
 setTimeout(() => callback(new Error('ENOENT: command not found')), 10);
 }
 return mockChildProcess;
 });

 const result = await engine.execute('nonexistent-command');

 expect(result.success).toBe(false);
 expect(result.exitCode).toBe(-1);
 expect(result.stderr).toContain('ENOENT');
 });

 it('should use custom working directory', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('pwd', { workingDirectory: '/custom/path' });

 expect(spawn).toHaveBeenCalledWith(
 expect.any(String),
 expect.any(Array),
 expect.objectContaining({
 cwd: '/custom/path'
 })
 );
 });

 it('should use custom environment variables', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('env', {
 environment: { CUSTOM_VAR: 'test-value' }
 });

 expect(spawn).toHaveBeenCalledWith(
 expect.any(String),
 expect.any(Array),
 expect.objectContaining({
 env: expect.objectContaining({
 CUSTOM_VAR: 'test-value'
 })
 })
 );
 });

 it('should confirm destructive commands', async () => {
 (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Execute');

 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('rm -rf /important/data');

 expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
 expect.stringContaining('destructive'),
 expect.any(Object),
 'Execute',
 'Cancel'
 );
 });

 it('should cancel destructive command if user declines', async () => {
 (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

 const result = await engine.execute('rm -rf /important/data');

 expect(result.success).toBe(false);
 expect(result.stderr).toBe('Command cancelled by user');
 expect(result.exitCode).toBe(-1);
 expect(spawn).not.toHaveBeenCalled();
 });

 it('should skip confirmation when requireConfirmation is false', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('rm -rf /test', { requireConfirmation: false });

 expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
 expect(spawn).toHaveBeenCalled();
 });

 it('should use sandbox mode by default', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('echo test');

 expect(spawn).toHaveBeenCalled();
 const spawnCall = (spawn as jest.Mock).mock.calls[0];
 expect(spawnCall).toBeDefined();
 expect(spawnCall[2]).toBeDefined();

 const env = spawnCall[2].env;

 // Should only have safe environment variables
 expect(env).toHaveProperty('PATH');
 expect(env).toHaveProperty('HOME');
 expect(env).toHaveProperty('NODE_ENV', 'development');
 });

 it('should allow disabling sandbox mode', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('echo test', { sandbox: false });

 expect(spawn).toHaveBeenCalled();
 const spawnCall = (spawn as jest.Mock).mock.calls[0];
 expect(spawnCall).toBeDefined();
 expect(spawnCall[2]).toBeDefined();

 const env = spawnCall[2].env;

 // Should include all process.env variables
 expect(Object.keys(env).length).toBeGreaterThan(5);
 });
 });

 describe('getHistory', () => {
 it('should track execution history', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('echo test1');
 await engine.execute('echo test2');

 const history = engine.getHistory();

 expect(history).toHaveLength(2);
 expect(history[0].command).toBe('echo test1');
 expect(history[1].command).toBe('echo test2');
 });

 it('should limit history size', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 5);
 }
 return mockChildProcess;
 });

 // Execute 105 commands (max is 100)
 for (let i = 0; i < 105; i++) {
 await engine.execute(`echo test${i}`);
 }

 const history = engine.getHistory();

 expect(history).toHaveLength(100);
 // Should have removed oldest entries
 expect(history[0].command).toBe('echo test5');
 expect(history[99].command).toBe('echo test104');
 });
 });

 describe('clearHistory', () => {
 it('should clear execution history', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('echo test');
 expect(engine.getHistory()).toHaveLength(1);

 engine.clearHistory();
 expect(engine.getHistory()).toHaveLength(0);
 });
 });

 describe('getRunningCount', () => {
 it('should return 0 when no commands are running', () => {
 expect(engine.getRunningCount()).toBe(0);
 });

 it('should return 0 after command completes', async () => {
 mockChildProcess.on.mockImplementation((event: string, callback: (code: number) => void) => {
 if (event === 'close') {
 setTimeout(() => callback(0), 10);
 }
 return mockChildProcess;
 });

 await engine.execute('echo test');

 expect(engine.getRunningCount()).toBe(0);
 });
 });
});

