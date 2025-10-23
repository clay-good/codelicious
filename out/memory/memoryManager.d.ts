/**
 * Memory and Rules Manager
 *
 * Manages:
 * - User preferences and memories
 * - Project-specific rules
 * - Coding style preferences
 * - Custom instructions
 */
import * as vscode from 'vscode';
export interface Memory {
    id: string;
    type: 'preference' | 'fact' | 'instruction' | 'style';
    content: string;
    scope: 'global' | 'workspace' | 'project';
    tags: string[];
    createdAt: number;
    lastUsed: number;
    useCount: number;
}
export interface Rule {
    id: string;
    name: string;
    description: string;
    pattern: string;
    action: 'enforce' | 'suggest' | 'warn';
    scope: 'global' | 'workspace' | 'file';
    enabled: boolean;
    priority: number;
}
export declare class MemoryManager {
    private memories;
    private rules;
    private context;
    constructor(context: vscode.ExtensionContext);
    /**
    * Add memory
    */
    addMemory(content: string, type: Memory['type'], scope?: Memory['scope'], tags?: string[]): Memory;
    /**
    * Get relevant memories
    */
    getRelevantMemories(query: string, maxResults?: number): Memory[];
    /**
    * Delete memory
    */
    deleteMemory(id: string): void;
    /**
    * Add rule
    */
    addRule(rule: Omit<Rule, 'id'>): Rule;
    /**
    * Get applicable rules
    */
    getApplicableRules(filePath: string): Rule[];
    /**
    * Update rule
    */
    updateRule(id: string, updates: Partial<Rule>): void;
    /**
    * Delete rule
    */
    deleteRule(id: string): void;
    /**
    * Get all memories
    */
    getAllMemories(): Memory[];
    /**
    * Get all rules
    */
    getAllRules(): Rule[];
    /**
    * Export memories
    */
    exportMemories(): string;
    /**
    * Import memories
    */
    importMemories(json: string): void;
    /**
    * Load memories from storage
    */
    private loadMemories;
    /**
    * Save memories to storage
    */
    private saveMemories;
    /**
    * Load rules from storage
    */
    private loadRules;
    /**
    * Save rules to storage
    */
    private saveRules;
    /**
    * Generate unique ID
    */
    private generateId;
}
/**
 * Style Preferences Manager
 */
export declare class StylePreferencesManager {
    private preferences;
    constructor();
    /**
    * Set preference
    */
    setPreference(key: string, value: unknown): void;
    /**
    * Get preference
    */
    getPreference(key: string): unknown;
    /**
    * Get all preferences
    */
    getAllPreferences(): Record<string, any>;
    /**
    * Initialize default preferences
    */
    private initializeDefaults;
}
//# sourceMappingURL=memoryManager.d.ts.map