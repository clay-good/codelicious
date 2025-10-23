"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const types_1 = require("../types");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('SessionManager');
class SessionManager {
    constructor(context) {
        this.context = context;
        this.autoSaveEnabled = true;
        this.autoSaveInterval = null;
        this.sessionsDir = path.join(context.globalStorageUri.fsPath, 'sessions');
        this.ensureSessionsDirectory();
    }
    /**
    * Initialize the session manager
    */
    async initialize() {
        logger.info('Initializing Session Manager...');
        // Load last session if exists
        const lastSessionId = this.context.globalState.get('lastSessionId');
        if (lastSessionId) {
            try {
                this.currentSession = await this.loadSession(lastSessionId);
                logger.info(`Restored last session: ${lastSessionId}`);
            }
            catch (error) {
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
    async createSession(title, workspaceRoot) {
        const id = this.generateSessionId();
        const now = Date.now();
        const session = {
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
    getCurrentSession() {
        return this.currentSession;
    }
    /**
    * Add message to current session
    */
    addMessage(message) {
        if (!this.currentSession) {
            this.createSession();
        }
        this.currentSession.messages.push(message);
        this.currentSession.lastActivity = Date.now();
    }
    /**
    * Update session context
    */
    updateContext(context) {
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
    async saveCurrentSession() {
        if (!this.currentSession) {
            return;
        }
        await this.saveSession(this.currentSession);
    }
    /**
    * Save a session to disk
    */
    async saveSession(session) {
        const filePath = this.getSessionFilePath(session.id);
        const data = JSON.stringify(session, null, 2);
        fs.writeFileSync(filePath, data, 'utf8');
    }
    /**
    * Load a session from disk
    */
    async loadSession(sessionId) {
        const filePath = this.getSessionFilePath(sessionId);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    }
    /**
    * List all sessions
    */
    async listSessions() {
        if (!fs.existsSync(this.sessionsDir)) {
            return [];
        }
        const files = fs.readdirSync(this.sessionsDir);
        const sessions = [];
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const filePath = path.join(this.sessionsDir, file);
                    const data = fs.readFileSync(filePath, 'utf8');
                    const session = JSON.parse(data);
                    sessions.push({
                        id: session.id,
                        title: this.generateTitle(session),
                        createdAt: session.startTime,
                        updatedAt: session.lastActivity,
                        messageCount: session.messages.length,
                        tags: []
                    });
                }
                catch (error) {
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
    async deleteSession(sessionId) {
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
    async searchSessions(query) {
        const sessions = await this.listSessions();
        const results = [];
        for (const metadata of sessions) {
            try {
                const session = await this.loadSession(metadata.id);
                const result = this.searchInSession(session, query);
                if (result.relevance > 0) {
                    results.push(result);
                }
            }
            catch (error) {
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
    async exportSession(sessionId) {
        const session = await this.loadSession(sessionId);
        return JSON.stringify(session, null, 2);
    }
    /**
    * Import session from JSON
    */
    async importSession(jsonData) {
        const session = JSON.parse(jsonData);
        // Generate new ID to avoid conflicts
        session.id = this.generateSessionId();
        session.lastActivity = Date.now();
        await this.saveSession(session);
        return session;
    }
    /**
    * Create a snapshot of current session
    */
    async createSnapshot(description) {
        if (!this.currentSession) {
            throw new Error('No active session to snapshot');
        }
        const snapshot = {
            id: this.generateSessionId(),
            timestamp: Date.now(),
            description,
            state: {
                messages: [...this.currentSession.messages],
                context: { ...this.currentSession.context },
                indexingProgress: {
                    phase: types_1.IndexingPhase.CONTINUOUS,
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
    async restoreSession(sessionId) {
        const session = await this.loadSession(sessionId);
        this.currentSession = session;
        this.context.globalState.update('lastSessionId', sessionId);
        return session;
    }
    /**
    * Clear current session
    */
    clearCurrentSession() {
        this.currentSession = undefined;
        this.context.globalState.update('lastSessionId', undefined);
    }
    /**
    * Start auto-save
    */
    startAutoSave() {
        if (this.autoSaveInterval) {
            return;
        }
        // Auto-save every 30 seconds
        this.autoSaveInterval = setInterval(async () => {
            if (this.currentSession && this.currentSession.messages.length > 0) {
                try {
                    await this.saveCurrentSession();
                }
                catch (error) {
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
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }
    /**
    * Search within a session
    */
    searchInSession(session, query) {
        const lowerQuery = query.toLowerCase();
        let relevance = 0;
        const matchedMessages = [];
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
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
    * Generate title from session
    */
    generateTitle(session) {
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
    getSessionFilePath(sessionId) {
        return path.join(this.sessionsDir, `${sessionId}.json`);
    }
    /**
    * Ensure sessions directory exists
    */
    ensureSessionsDirectory() {
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }
    /**
    * Clean up resources
    */
    async dispose() {
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
exports.SessionManager = SessionManager;
//# sourceMappingURL=sessionManager.js.map