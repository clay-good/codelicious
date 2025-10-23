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
 pattern: string; // Regex or glob pattern
 action: 'enforce' | 'suggest' | 'warn';
 scope: 'global' | 'workspace' | 'file';
 enabled: boolean;
 priority: number;
}

export class MemoryManager {
 private memories: Map<string, Memory>;
 private rules: Map<string, Rule>;
 private context: vscode.ExtensionContext;

 constructor(context: vscode.ExtensionContext) {
 this.context = context;
 this.memories = new Map();
 this.rules = new Map();
 this.loadMemories();
 this.loadRules();
 }

 /**
 * Add memory
 */
 addMemory(content: string, type: Memory['type'], scope: Memory['scope'] = 'workspace', tags: string[] = []): Memory {
 const memory: Memory = {
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
 getRelevantMemories(query: string, maxResults: number = 5): Memory[] {
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
 deleteMemory(id: string): void {
 this.memories.delete(id);
 this.saveMemories();
 }

 /**
 * Add rule
 */
 addRule(rule: Omit<Rule, 'id'>): Rule {
 const fullRule: Rule = {
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
 getApplicableRules(filePath: string): Rule[] {
 return Array.from(this.rules.values())
 .filter(rule => {
 if (!rule.enabled) return false;

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
 updateRule(id: string, updates: Partial<Rule>): void {
 const rule = this.rules.get(id);
 if (rule) {
 Object.assign(rule, updates);
 this.saveRules();
 }
 }

 /**
 * Delete rule
 */
 deleteRule(id: string): void {
 this.rules.delete(id);
 this.saveRules();
 }

 /**
 * Get all memories
 */
 getAllMemories(): Memory[] {
 return Array.from(this.memories.values());
 }

 /**
 * Get all rules
 */
 getAllRules(): Rule[] {
 return Array.from(this.rules.values());
 }

 /**
 * Export memories
 */
 exportMemories(): string {
 return JSON.stringify(Array.from(this.memories.values()), null, 2);
 }

 /**
 * Import memories
 */
 importMemories(json: string): void {
 try {
 const memories = JSON.parse(json) as Memory[];
 for (const memory of memories) {
 this.memories.set(memory.id, memory);
 }
 this.saveMemories();
 } catch (error) {
 throw new Error('Invalid memories JSON');
 }
 }

 /**
 * Load memories from storage
 */
 private loadMemories(): void {
 const stored = this.context.globalState.get<Memory[]>('codelicious.memories');
 if (stored) {
 for (const memory of stored) {
 this.memories.set(memory.id, memory);
 }
 }
 }

 /**
 * Save memories to storage
 */
 private saveMemories(): void {
 const memories = Array.from(this.memories.values());
 this.context.globalState.update('codelicious.memories', memories);
 }

 /**
 * Load rules from storage
 */
 private loadRules(): void {
 const stored = this.context.globalState.get<Rule[]>('codelicious.rules');
 if (stored) {
 for (const rule of stored) {
 this.rules.set(rule.id, rule);
 }
 }
 }

 /**
 * Save rules to storage
 */
 private saveRules(): void {
 const rules = Array.from(this.rules.values());
 this.context.globalState.update('codelicious.rules', rules);
 }

 /**
 * Generate unique ID
 */
 private generateId(): string {
 return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
 }
}

/**
 * Style Preferences Manager
 */
export class StylePreferencesManager {
 private preferences: Map<string, any>;

 constructor() {
 this.preferences = new Map();
 this.initializeDefaults();
 }

 /**
 * Set preference
 */
 setPreference(key: string, value: unknown): void {
 this.preferences.set(key, value);
 }

 /**
 * Get preference
 */
 getPreference(key: string): unknown {
 return this.preferences.get(key);
 }

 /**
 * Get all preferences
 */
 getAllPreferences(): Record<string, any> {
 return Object.fromEntries(this.preferences);
 }

 /**
 * Initialize default preferences
 */
 private initializeDefaults(): void {
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

