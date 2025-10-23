"use strict";
/**
 * Memory and Rules Manager
 *
 * Manages:
 * - User preferences and memories
 * - Project-specific rules
 * - Coding style preferences
 * - Custom instructions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StylePreferencesManager = exports.MemoryManager = void 0;
class MemoryManager {
    constructor(context) {
        this.context = context;
        this.memories = new Map();
        this.rules = new Map();
        this.loadMemories();
        this.loadRules();
    }
    /**
    * Add memory
    */
    addMemory(content, type, scope = 'workspace', tags = []) {
        const memory = {
            id: this.generateId(),
            type,
            content,
            scope,
            tags,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            useCount: 0
        };
        this.memories.set(memory.id, memory);
        this.saveMemories();
        return memory;
    }
    /**
    * Get relevant memories
    */
    getRelevantMemories(query, maxResults = 5) {
        const queryLower = query.toLowerCase();
        const scored = Array.from(this.memories.values()).map(memory => {
            let score = 0;
            // Content match
            if (memory.content.toLowerCase().includes(queryLower)) {
                score += 1.0;
            }
            // Tag match
            if (memory.tags.some(tag => queryLower.includes(tag.toLowerCase()))) {
                score += 0.5;
            }
            // Recency bonus
            const daysSinceUsed = (Date.now() - memory.lastUsed) / (1000 * 60 * 60 * 24);
            score += Math.max(0, 0.3 - (daysSinceUsed * 0.01));
            // Frequency bonus
            score += Math.min(memory.useCount * 0.1, 0.5);
            return { memory, score };
        });
        // Sort by score
        scored.sort((a, b) => b.score - a.score);
        // Update usage
        const results = scored.slice(0, maxResults).map(s => s.memory);
        results.forEach(m => {
            m.lastUsed = Date.now();
            m.useCount++;
        });
        this.saveMemories();
        return results;
    }
    /**
    * Delete memory
    */
    deleteMemory(id) {
        this.memories.delete(id);
        this.saveMemories();
    }
    /**
    * Add rule
    */
    addRule(rule) {
        const fullRule = {
            id: this.generateId(),
            ...rule
        };
        this.rules.set(fullRule.id, fullRule);
        this.saveRules();
        return fullRule;
    }
    /**
    * Get applicable rules
    */
    getApplicableRules(filePath) {
        return Array.from(this.rules.values())
            .filter(rule => {
            if (!rule.enabled)
                return false;
            // Check scope
            if (rule.scope === 'file') {
                return new RegExp(rule.pattern).test(filePath);
            }
            return true;
        })
            .sort((a, b) => b.priority - a.priority);
    }
    /**
    * Update rule
    */
    updateRule(id, updates) {
        const rule = this.rules.get(id);
        if (rule) {
            Object.assign(rule, updates);
            this.saveRules();
        }
    }
    /**
    * Delete rule
    */
    deleteRule(id) {
        this.rules.delete(id);
        this.saveRules();
    }
    /**
    * Get all memories
    */
    getAllMemories() {
        return Array.from(this.memories.values());
    }
    /**
    * Get all rules
    */
    getAllRules() {
        return Array.from(this.rules.values());
    }
    /**
    * Export memories
    */
    exportMemories() {
        return JSON.stringify(Array.from(this.memories.values()), null, 2);
    }
    /**
    * Import memories
    */
    importMemories(json) {
        try {
            const memories = JSON.parse(json);
            for (const memory of memories) {
                this.memories.set(memory.id, memory);
            }
            this.saveMemories();
        }
        catch (error) {
            throw new Error('Invalid memories JSON');
        }
    }
    /**
    * Load memories from storage
    */
    loadMemories() {
        const stored = this.context.globalState.get('codelicious.memories');
        if (stored) {
            for (const memory of stored) {
                this.memories.set(memory.id, memory);
            }
        }
    }
    /**
    * Save memories to storage
    */
    saveMemories() {
        const memories = Array.from(this.memories.values());
        this.context.globalState.update('codelicious.memories', memories);
    }
    /**
    * Load rules from storage
    */
    loadRules() {
        const stored = this.context.globalState.get('codelicious.rules');
        if (stored) {
            for (const rule of stored) {
                this.rules.set(rule.id, rule);
            }
        }
    }
    /**
    * Save rules to storage
    */
    saveRules() {
        const rules = Array.from(this.rules.values());
        this.context.globalState.update('codelicious.rules', rules);
    }
    /**
    * Generate unique ID
    */
    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.MemoryManager = MemoryManager;
/**
 * Style Preferences Manager
 */
class StylePreferencesManager {
    constructor() {
        this.preferences = new Map();
        this.initializeDefaults();
    }
    /**
    * Set preference
    */
    setPreference(key, value) {
        this.preferences.set(key, value);
    }
    /**
    * Get preference
    */
    getPreference(key) {
        return this.preferences.get(key);
    }
    /**
    * Get all preferences
    */
    getAllPreferences() {
        return Object.fromEntries(this.preferences);
    }
    /**
    * Initialize default preferences
    */
    initializeDefaults() {
        this.preferences.set('indentation', 'spaces');
        this.preferences.set('indentSize', 2);
        this.preferences.set('quotes', 'single');
        this.preferences.set('semicolons', true);
        this.preferences.set('trailingComma', 'es5');
        this.preferences.set('bracketSpacing', true);
        this.preferences.set('arrowParens', 'avoid');
        this.preferences.set('maxLineLength', 100);
    }
}
exports.StylePreferencesManager = StylePreferencesManager;
//# sourceMappingURL=memoryManager.js.map