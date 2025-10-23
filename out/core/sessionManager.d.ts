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
import { Session, Message, SessionContext, SessionSnapshot } from '../types';
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
export declare class SessionManager {
    private readonly context;
    private sessionsDir;
    private currentSession?;
    private autoSaveEnabled;
    private autoSaveInterval;
    constructor(context: vscode.ExtensionContext);
    /**
    * Initialize the session manager
    */
    initialize(): Promise<void>;
    /**
    * Create a new session
    */
    createSession(title?: string, workspaceRoot?: string): Promise<Session>;
    /**
    * Get current session
    */
    getCurrentSession(): Session | undefined;
    /**
    * Add message to current session
    */
    addMessage(message: Message): void;
    /**
    * Update session context
    */
    updateContext(context: Partial<SessionContext>): void;
    /**
    * Save current session
    */
    saveCurrentSession(): Promise<void>;
    /**
    * Save a session to disk
    */
    saveSession(session: Session): Promise<void>;
    /**
    * Load a session from disk
    */
    loadSession(sessionId: string): Promise<Session>;
    /**
    * List all sessions
    */
    listSessions(): Promise<SessionMetadata[]>;
    /**
    * Delete a session
    */
    deleteSession(sessionId: string): Promise<void>;
    /**
    * Search sessions by query
    */
    searchSessions(query: string): Promise<SessionSearchResult[]>;
    /**
    * Export session to JSON
    */
    exportSession(sessionId: string): Promise<string>;
    /**
    * Import session from JSON
    */
    importSession(jsonData: string): Promise<Session>;
    /**
    * Create a snapshot of current session
    */
    createSnapshot(description: string): Promise<SessionSnapshot>;
    /**
    * Restore a session as current
    */
    restoreSession(sessionId: string): Promise<Session>;
    /**
    * Clear current session
    */
    clearCurrentSession(): void;
    /**
    * Start auto-save
    */
    private startAutoSave;
    /**
    * Stop auto-save
    */
    private stopAutoSave;
    /**
    * Search within a session
    */
    private searchInSession;
    /**
    * Generate a unique session ID
    */
    private generateSessionId;
    /**
    * Generate title from session
    */
    private generateTitle;
    /**
    * Get file path for a session
    */
    private getSessionFilePath;
    /**
    * Ensure sessions directory exists
    */
    private ensureSessionsDirectory;
    /**
    * Clean up resources
    */
    dispose(): Promise<void>;
}
//# sourceMappingURL=sessionManager.d.ts.map