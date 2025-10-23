/**
 * Session Manager - Save, restore, and manage conversation sessions
 *
 * Features:
 * - Save conversations with metadata
 * - Restore previous sessions
 * - Search conversation history
 * - Export/import sessions
 * - Session snapshots
 * - Auto-save functionality
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Session, Message, SessionContext, SessionSnapshot, IndexingPhase } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('SessionManager');

export interface SessionMetadata {
 id: string;
 title: string;
 createdAt: number;
 updatedAt: number;
 messageCount: number;
 model?: string;
 tags: string[];
}

export interface SessionSearchResult {
 session: Session;
 relevance: number;
 matchedMessages: number[];
}

export class SessionManager {
 private sessionsDir: string;
 private currentSession?: Session;
 private autoSaveEnabled: boolean = true;
 private autoSaveInterval: NodeJS.Timeout | null = null;

 constructor(private readonly context: vscode.ExtensionContext) {
 this.sessionsDir = path.join(context.globalStorageUri.fsPath, 'sessions');
 this.ensureSessionsDirectory();
 }

 /**
 * Initialize the session manager
 */
 async initialize(): Promise<void> {
 logger.info('Initializing Session Manager...');

 // Load last session if exists
 const lastSessionId = this.context.globalState.get<string>('lastSessionId');
 if (lastSessionId) {
 try {
 this.currentSession = await this.loadSession(lastSessionId);
 logger.info(`Restored last session: ${lastSessionId}`);
 } catch (error) {
 logger.info('Failed to restore last session');
 }
 }

 // Start auto-save if enabled
 if (this.autoSaveEnabled) {
 this.startAutoSave();
 }

 logger.info('Session Manager initialized successfully');
 }

 /**
 * Create a new session
 */
 async createSession(title?: string, workspaceRoot?: string): Promise<Session> {
 const id = this.generateSessionId();
 const now = Date.now();

 const session: Session = {
 id,
 startTime: now,
 lastActivity: now,
 messages: [],
 context: {
 workspaceRoot: workspaceRoot || '',
 activeFiles: [],
 recentEdits: [],
 executionHistory: []
 },
 snapshots: []
 };

 this.currentSession = session;
 this.context.globalState.update('lastSessionId', id);

 return session;
 }

 /**
 * Get current session
 */
 getCurrentSession(): Session | undefined {
 return this.currentSession;
 }

 /**
 * Add message to current session
 */
 addMessage(message: Message): void {
 if (!this.currentSession) {
 this.createSession();
 }

 this.currentSession!.messages.push(message);
 this.currentSession!.lastActivity = Date.now();
 }

 /**
 * Update session context
 */
 updateContext(context: Partial<SessionContext>): void {
 if (!this.currentSession) {
 return;
 }

 this.currentSession.context = {
 ...this.currentSession.context,
 ...context
 };
 this.currentSession.lastActivity = Date.now();
 }

 /**
 * Save current session
 */
 async saveCurrentSession(): Promise<void> {
 if (!this.currentSession) {
 return;
 }

 await this.saveSession(this.currentSession);
 }

 /**
 * Save a session to disk
 */
 async saveSession(session: Session): Promise<void> {
 const filePath = this.getSessionFilePath(session.id);
 const data = JSON.stringify(session, null, 2);

 fs.writeFileSync(filePath, data, 'utf8');
 }

 /**
 * Load a session from disk
 */
 async loadSession(sessionId: string): Promise<Session> {
 const filePath = this.getSessionFilePath(sessionId);

 if (!fs.existsSync(filePath)) {
 throw new Error(`Session not found: ${sessionId}`);
 }

 const data = fs.readFileSync(filePath, 'utf8');
 return JSON.parse(data) as Session;
 }

 /**
 * List all sessions
 */
 async listSessions(): Promise<SessionMetadata[]> {
 if (!fs.existsSync(this.sessionsDir)) {
 return [];
 }

 const files = fs.readdirSync(this.sessionsDir);
 const sessions: SessionMetadata[] = [];

 for (const file of files) {
 if (file.endsWith('.json')) {
 try {
 const filePath = path.join(this.sessionsDir, file);
 const data = fs.readFileSync(filePath, 'utf8');
 const session = JSON.parse(data) as Session;

 sessions.push({
 id: session.id,
 title: this.generateTitle(session),
 createdAt: session.startTime,
 updatedAt: session.lastActivity,
 messageCount: session.messages.length,
 tags: []
 });
 } catch (error) {
 logger.error(`Failed to load session ${file}`, error);
 }
 }
 }

 // Sort by updated date (newest first)
 sessions.sort((a, b) => b.updatedAt - a.updatedAt);

 return sessions;
 }

 /**
 * Delete a session
 */
 async deleteSession(sessionId: string): Promise<void> {
 const filePath = this.getSessionFilePath(sessionId);

 if (fs.existsSync(filePath)) {
 fs.unlinkSync(filePath);
 }

 // Clear current session if it's the one being deleted
 if (this.currentSession?.id === sessionId) {
 this.currentSession = undefined;
 this.context.globalState.update('lastSessionId', undefined);
 }
 }

 /**
 * Search sessions by query
 */
 async searchSessions(query: string): Promise<SessionSearchResult[]> {
 const sessions = await this.listSessions();
 const results: SessionSearchResult[] = [];

 for (const metadata of sessions) {
 try {
 const session = await this.loadSession(metadata.id);
 const result = this.searchInSession(session, query);

 if (result.relevance > 0) {
 results.push(result);
 }
 } catch (error) {
 logger.error(`Failed to search session ${metadata.id}`, error);
 }
 }

 // Sort by relevance
 results.sort((a, b) => b.relevance - a.relevance);

 return results;
 }

 /**
 * Export session to JSON
 */
 async exportSession(sessionId: string): Promise<string> {
 const session = await this.loadSession(sessionId);
 return JSON.stringify(session, null, 2);
 }

 /**
 * Import session from JSON
 */
 async importSession(jsonData: string): Promise<Session> {
 const session = JSON.parse(jsonData) as Session;

 // Generate new ID to avoid conflicts
 session.id = this.generateSessionId();
 session.lastActivity = Date.now();

 await this.saveSession(session);

 return session;
 }

 /**
 * Create a snapshot of current session
 */
 async createSnapshot(description: string): Promise<SessionSnapshot> {
 if (!this.currentSession) {
 throw new Error('No active session to snapshot');
 }

 const snapshot: SessionSnapshot = {
 id: this.generateSessionId(),
 timestamp: Date.now(),
 description,
 state: {
 messages: [...this.currentSession.messages],
 context: { ...this.currentSession.context },
 indexingProgress: {
 phase: IndexingPhase.CONTINUOUS,
 filesProcessed: 0,
 totalFiles: 0,
 currentFile: '',
 progress: 100,
 startTime: Date.now()
 }
 }
 };

 this.currentSession.snapshots.push(snapshot);
 await this.saveCurrentSession();

 return snapshot;
 }

 /**
 * Restore a session as current
 */
 async restoreSession(sessionId: string): Promise<Session> {
 const session = await this.loadSession(sessionId);
 this.currentSession = session;
 this.context.globalState.update('lastSessionId', sessionId);

 return session;
 }

 /**
 * Clear current session
 */
 clearCurrentSession(): void {
 this.currentSession = undefined;
 this.context.globalState.update('lastSessionId', undefined);
 }

 /**
 * Start auto-save
 */
 private startAutoSave(): void {
 if (this.autoSaveInterval) {
 return;
 }

 // Auto-save every 30 seconds
 this.autoSaveInterval = setInterval(async () => {
 if (this.currentSession && this.currentSession.messages.length > 0) {
 try {
 await this.saveCurrentSession();
 } catch (error) {
 logger.error('Auto-save failed', error);
 }
 }
 }, 30000);

 // Allow Node.js to exit even if this timer is active
 this.autoSaveInterval.unref();
 }

 /**
 * Stop auto-save
 */
 private stopAutoSave(): void {
 if (this.autoSaveInterval) {
 clearInterval(this.autoSaveInterval);
 this.autoSaveInterval = null;
 }
 }

 /**
 * Search within a session
 */
 private searchInSession(session: Session, query: string): SessionSearchResult {
 const lowerQuery = query.toLowerCase();
 let relevance = 0;
 const matchedMessages: number[] = [];

 // Search in messages
 session.messages.forEach((message, index) => {
 if (message.content.toLowerCase().includes(lowerQuery)) {
 relevance += 1;
 matchedMessages.push(index);
 }
 });

 return {
 session,
 relevance,
 matchedMessages,
 };
 }

 /**
 * Generate a unique session ID
 */
 private generateSessionId(): string {
 return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
 }

 /**
 * Generate title from session
 */
 private generateTitle(session: Session): string {
 // Try to get title from first user message
 const firstUserMessage = session.messages.find(m => m.role === 'user');

 if (firstUserMessage) {
 let title = firstUserMessage.content.substring(0, 50).trim();
 title = title.replace(/\n/g, ' ');
 if (firstUserMessage.content.length > 50) {
 title += '...';
 }
 return title;
 }

 // Fallback to timestamp
 return `Session ${new Date(session.startTime).toLocaleString()}`;
 }

 /**
 * Get file path for a session
 */
 private getSessionFilePath(sessionId: string): string {
 return path.join(this.sessionsDir, `${sessionId}.json`);
 }

 /**
 * Ensure sessions directory exists
 */
 private ensureSessionsDirectory(): void {
 if (!fs.existsSync(this.sessionsDir)) {
 fs.mkdirSync(this.sessionsDir, { recursive: true });
 }
 }

 /**
 * Clean up resources
 */
 async dispose(): Promise<void> {
 logger.info('Disposing SessionManager...');

 // Stop auto-save
 this.stopAutoSave();

 // Save current session
 if (this.currentSession) {
 await this.saveCurrentSession();
 }

 logger.info('SessionManager disposed');
 }
}
