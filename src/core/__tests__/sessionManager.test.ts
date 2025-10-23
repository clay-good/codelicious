/**
 * Tests for Session Manager
 */

import { SessionManager, SessionMetadata } from '../sessionManager';
import { Session, Message } from '../../types';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Mock VS Code API
jest.mock('vscode', () => ({
 ExtensionContext: jest.fn(),
 Uri: {
 file: jest.fn((p) => ({ fsPath: p }))
 }
}));

// Mock fs
jest.mock('fs');

describe('SessionManager', () => {
 let sessionManager: SessionManager;
 let mockContext: any;
 const testSessionsDir = '/test/sessions';

 beforeEach(() => {
 jest.clearAllMocks();

 // Setup mock context
 mockContext = {
 globalStorageUri: {
 fsPath: '/test'
 },
 globalState: {
 get: jest.fn(),
 update: jest.fn()
 }
 };

 // Setup default fs mocks
 (fs.existsSync as jest.Mock).mockReturnValue(false);
 (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
 (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
 (fs.readFileSync as jest.Mock).mockReturnValue('{}');
 (fs.readdirSync as jest.Mock).mockReturnValue([]);
 (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);

 sessionManager = new SessionManager(mockContext);
 });

 afterEach(async () => {
 await sessionManager.dispose();
 });

 describe('initialize', () => {
 it('should initialize successfully', async () => {
 await sessionManager.initialize();

 expect(mockContext.globalState.get).toHaveBeenCalledWith('lastSessionId');
 });

 it('should restore last session if exists', async () => {
 const sessionId = 'session_123';
 const mockSession: Session = {
 id: sessionId,
 startTime: Date.now(),
 lastActivity: Date.now(),
 messages: [],
 context: {
 workspaceRoot: '',
 activeFiles: [],
 recentEdits: [],
 executionHistory: []
 },
 snapshots: []
 };

 mockContext.globalState.get.mockReturnValue(sessionId);
 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSession));

 await sessionManager.initialize();

 const currentSession = sessionManager.getCurrentSession();
 expect(currentSession).toBeDefined();
 expect(currentSession?.id).toBe(sessionId);
 });

 it('should handle missing last session gracefully', async () => {
 mockContext.globalState.get.mockReturnValue('missing_session');
 (fs.existsSync as jest.Mock).mockReturnValue(false);

 await sessionManager.initialize();

 const currentSession = sessionManager.getCurrentSession();
 expect(currentSession).toBeUndefined();
 });
 });

 describe('createSession', () => {
 it('should create a new session', async () => {
 const session = await sessionManager.createSession('Test Session', '/workspace');

 expect(session).toBeDefined();
 expect(session.id).toMatch(/^session_/);
 expect(session.messages).toEqual([]);
 expect(session.context.workspaceRoot).toBe('/workspace');
 expect(mockContext.globalState.update).toHaveBeenCalledWith('lastSessionId', session.id);
 });

 it('should set current session', async () => {
 const session = await sessionManager.createSession();

 const currentSession = sessionManager.getCurrentSession();
 expect(currentSession).toBe(session);
 });
 });

 describe('addMessage', () => {
 it('should add message to current session', async () => {
 await sessionManager.createSession();

 const message: Message = {
 role: 'user',
 content: 'Hello, world!'
 };

 sessionManager.addMessage(message);

 const currentSession = sessionManager.getCurrentSession();
 expect(currentSession?.messages).toHaveLength(1);
 expect(currentSession?.messages[0]).toEqual(message);
 });

 it('should create session if none exists', () => {
 const message: Message = {
 role: 'user',
 content: 'Hello!'
 };

 sessionManager.addMessage(message);

 const currentSession = sessionManager.getCurrentSession();
 expect(currentSession).toBeDefined();
 expect(currentSession?.messages).toHaveLength(1);
 });

 it('should update lastActivity timestamp', async () => {
 await sessionManager.createSession();
 const initialTime = sessionManager.getCurrentSession()!.lastActivity;

 // Wait a bit
 await new Promise(resolve => setTimeout(resolve, 10));

 const message: Message = {
 role: 'user',
 content: 'Test'
 };

 sessionManager.addMessage(message);

 const updatedTime = sessionManager.getCurrentSession()!.lastActivity;
 expect(updatedTime).toBeGreaterThan(initialTime);
 });
 });

 describe('saveSession and loadSession', () => {
 it('should save session to disk', async () => {
 const session = await sessionManager.createSession();
 session.messages.push({ role: 'user', content: 'Test' });

 await sessionManager.saveSession(session);

 expect(fs.writeFileSync).toHaveBeenCalled();
 const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
 expect(writeCall[0]).toContain(session.id);
 expect(writeCall[1]).toContain('"Test"');
 });

 it('should load session from disk', async () => {
 const mockSession: Session = {
 id: 'test_session',
 startTime: Date.now(),
 lastActivity: Date.now(),
 messages: [{ role: 'user', content: 'Test' }],
 context: {
 workspaceRoot: '',
 activeFiles: [],
 recentEdits: [],
 executionHistory: []
 },
 snapshots: []
 };

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSession));

 const loaded = await sessionManager.loadSession('test_session');

 expect(loaded.id).toBe('test_session');
 expect(loaded.messages).toHaveLength(1);
 });

 it('should throw error if session not found', async () => {
 (fs.existsSync as jest.Mock).mockReturnValue(false);

 await expect(sessionManager.loadSession('missing')).rejects.toThrow('Session not found');
 });
 });

 describe('listSessions', () => {
 it('should list all sessions', async () => {
 const mockSessions = [
 {
 id: 'session_1',
 startTime: Date.now() - 1000,
 lastActivity: Date.now() - 1000,
 messages: [{ role: 'user', content: 'First message' }],
 context: { workspaceRoot: '', activeFiles: [], recentEdits: [], executionHistory: [] },
 snapshots: []
 },
 {
 id: 'session_2',
 startTime: Date.now(),
 lastActivity: Date.now(),
 messages: [{ role: 'user', content: 'Second message' }],
 context: { workspaceRoot: '', activeFiles: [], recentEdits: [], executionHistory: [] },
 snapshots: []
 }
 ];

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readdirSync as jest.Mock).mockReturnValue(['session_1.json', 'session_2.json']);
 (fs.readFileSync as jest.Mock)
 .mockReturnValueOnce(JSON.stringify(mockSessions[0]))
 .mockReturnValueOnce(JSON.stringify(mockSessions[1]));

 const sessions = await sessionManager.listSessions();

 expect(sessions).toHaveLength(2);
 expect(sessions[0].id).toBe('session_2'); // Newest first
 expect(sessions[1].id).toBe('session_1');
 });

 it('should return empty array if no sessions', async () => {
 (fs.existsSync as jest.Mock).mockReturnValue(false);

 const sessions = await sessionManager.listSessions();

 expect(sessions).toEqual([]);
 });
 });

 describe('deleteSession', () => {
 it('should delete session file', async () => {
 (fs.existsSync as jest.Mock).mockReturnValue(true);

 await sessionManager.deleteSession('test_session');

 expect(fs.unlinkSync).toHaveBeenCalled();
 });

 it('should clear current session if deleted', async () => {
 const session = await sessionManager.createSession();
 (fs.existsSync as jest.Mock).mockReturnValue(true);

 await sessionManager.deleteSession(session.id);

 expect(sessionManager.getCurrentSession()).toBeUndefined();
 expect(mockContext.globalState.update).toHaveBeenCalledWith('lastSessionId', undefined);
 });
 });

 describe('searchSessions', () => {
 it('should search sessions by query', async () => {
 const mockSession: Session = {
 id: 'test_session',
 startTime: Date.now(),
 lastActivity: Date.now(),
 messages: [
 { role: 'user', content: 'How to authenticate users?' },
 { role: 'assistant', content: 'Use JWT tokens for authentication' }
 ],
 context: { workspaceRoot: '', activeFiles: [], recentEdits: [], executionHistory: [] },
 snapshots: []
 };

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readdirSync as jest.Mock).mockReturnValue(['test_session.json']);
 (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSession));

 const results = await sessionManager.searchSessions('authenticate');

 expect(results).toHaveLength(1);
 expect(results[0].relevance).toBeGreaterThan(0);
 expect(results[0].matchedMessages.length).toBeGreaterThan(0);
 });

 it('should return empty array if no matches', async () => {
 const mockSession: Session = {
 id: 'test_session',
 startTime: Date.now(),
 lastActivity: Date.now(),
 messages: [{ role: 'user', content: 'Hello' }],
 context: { workspaceRoot: '', activeFiles: [], recentEdits: [], executionHistory: [] },
 snapshots: []
 };

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readdirSync as jest.Mock).mockReturnValue(['test_session.json']);
 (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSession));

 const results = await sessionManager.searchSessions('nonexistent');

 expect(results).toEqual([]);
 });
 });

 describe('exportSession and importSession', () => {
 it('should export session to JSON', async () => {
 const mockSession: Session = {
 id: 'test_session',
 startTime: Date.now(),
 lastActivity: Date.now(),
 messages: [{ role: 'user', content: 'Test' }],
 context: { workspaceRoot: '', activeFiles: [], recentEdits: [], executionHistory: [] },
 snapshots: []
 };

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSession));

 const exported = await sessionManager.exportSession('test_session');

 expect(exported).toContain('"Test"');
 expect(JSON.parse(exported)).toHaveProperty('id');
 });

 it('should import session from JSON', async () => {
 const sessionData = {
 id: 'old_id',
 startTime: Date.now(),
 lastActivity: Date.now(),
 messages: [{ role: 'user', content: 'Imported' }],
 context: { workspaceRoot: '', activeFiles: [], recentEdits: [], executionHistory: [] },
 snapshots: []
 };

 const imported = await sessionManager.importSession(JSON.stringify(sessionData));

 expect(imported.id).not.toBe('old_id'); // Should have new ID
 expect(imported.messages[0].content).toBe('Imported');
 expect(fs.writeFileSync).toHaveBeenCalled();
 });
 });

 describe('createSnapshot', () => {
 it('should create snapshot of current session', async () => {
 await sessionManager.createSession();
 sessionManager.addMessage({ role: 'user', content: 'Test' });

 const snapshot = await sessionManager.createSnapshot('Test snapshot');

 expect(snapshot).toBeDefined();
 expect(snapshot.description).toBe('Test snapshot');
 expect(snapshot.state.messages).toHaveLength(1);
 });

 it('should throw error if no active session', async () => {
 await expect(sessionManager.createSnapshot('Test')).rejects.toThrow('No active session');
 });
 });

 describe('restoreSession', () => {
 it('should restore session as current', async () => {
 const mockSession: Session = {
 id: 'test_session',
 startTime: Date.now(),
 lastActivity: Date.now(),
 messages: [{ role: 'user', content: 'Restored' }],
 context: { workspaceRoot: '', activeFiles: [], recentEdits: [], executionHistory: [] },
 snapshots: []
 };

 (fs.existsSync as jest.Mock).mockReturnValue(true);
 (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockSession));

 const restored = await sessionManager.restoreSession('test_session');

 expect(restored.id).toBe('test_session');
 expect(sessionManager.getCurrentSession()).toBe(restored);
 expect(mockContext.globalState.update).toHaveBeenCalledWith('lastSessionId', 'test_session');
 });
 });

 describe('clearCurrentSession', () => {
 it('should clear current session', async () => {
 await sessionManager.createSession();

 sessionManager.clearCurrentSession();

 expect(sessionManager.getCurrentSession()).toBeUndefined();
 expect(mockContext.globalState.update).toHaveBeenCalledWith('lastSessionId', undefined);
 });
 });
});

