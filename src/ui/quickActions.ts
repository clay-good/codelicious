/**
 * Quick Actions Menu - Fast access to common operations
 * UX: One-click access to frequently used features
 *
 * Features:
 * - Categorized actions
 * - Recently used actions
 * - Keyboard shortcuts display
 * - Context-aware suggestions
 * - Search functionality
 */

import * as vscode from 'vscode';

export interface QuickAction {
 id: string;
 label: string;
 description: string;
 icon: string;
 command: string;
 category: string;
 shortcut?: string;
 args?: unknown[];
}

export class QuickActionsMenu {
 private recentActions: string[] = [];
 private readonly maxRecentActions = 5;

 private readonly actions: QuickAction[] = [
 // Chat & AI
 {
 id: 'openChat',
 label: 'Open Chat',
 description: 'Start a conversation with AI',
 icon: '$(comment-discussion)',
 command: 'codelicious.openChat',
 category: 'Chat & AI',
 shortcut: 'Cmd+Shift+L'
 },
 {
 id: 'selectModel',
 label: 'Select AI Model',
 description: 'Choose which AI model to use',
 icon: '$(robot)',
 command: 'codelicious.selectModel',
 category: 'Chat & AI'
 },
 {
 id: 'compareModels',
 label: 'Compare Models',
 description: 'Compare AI models side-by-side',
 icon: '$(compare-changes)',
 command: 'codelicious.compareModels',
 category: 'Chat & AI'
 },

 // Autonomous Builder
 {
 id: 'autonomousBuild',
 label: 'Autonomous Build',
 description: 'Build entire feature from specification',
 icon: '$(rocket)',
 command: 'codelicious.autonomousBuild',
 category: 'Autonomous'
 },
 {
 id: 'multiFileEdit',
 label: 'Multi-File Edit',
 description: 'Edit multiple files simultaneously',
 icon: '$(files)',
 command: 'codelicious.multiFileEdit',
 category: 'Autonomous'
 },

 // Code Quality
 {
 id: 'reviewCode',
 label: 'Review Code',
 description: 'AI-powered code review',
 icon: '$(checklist)',
 command: 'codelicious.reviewCode',
 category: 'Code Quality'
 },
 {
 id: 'analyzeFile',
 label: 'Analyze Current File',
 description: 'Analyze code quality and issues',
 icon: '$(search)',
 command: 'codelicious.analyzeFile',
 category: 'Code Quality'
 },
 {
 id: 'refactorCode',
 label: 'Refactor Code',
 description: 'Intelligent code refactoring',
 icon: '$(symbol-method)',
 command: 'codelicious.refactorCode',
 category: 'Code Quality'
 },

 // Testing
 {
 id: 'generateTests',
 label: 'Generate Tests',
 description: 'Generate tests for current file',
 icon: '$(beaker)',
 command: 'codelicious.generateTests',
 category: 'Testing'
 },
 {
 id: 'runTests',
 label: 'Run Tests',
 description: 'Execute all tests',
 icon: '$(play)',
 command: 'codelicious.runTests',
 category: 'Testing'
 },
 {
 id: 'fixFailingTests',
 label: 'Fix Failing Tests',
 description: 'Automatically fix failing tests',
 icon: '$(tools)',
 command: 'codelicious.fixFailingTests',
 category: 'Testing'
 },

 // Git Integration
 {
 id: 'generateCommit',
 label: 'Generate Commit Message',
 description: 'AI-powered commit messages',
 icon: '$(git-commit)',
 command: 'codelicious.generateCommitMessage',
 category: 'Git'
 },
 {
 id: 'generatePR',
 label: 'Generate PR Description',
 description: 'Create PR description',
 icon: '$(git-pull-request)',
 command: 'codelicious.generatePRDescription',
 category: 'Git'
 },

 // Documentation
 {
 id: 'generateDocs',
 label: 'Generate Documentation',
 description: 'Auto-generate comprehensive docs',
 icon: '$(book)',
 command: 'codelicious.generateDocs',
 category: 'Documentation'
 },

 // System
 {
 id: 'configureKeys',
 label: 'Configure API Keys',
 description: 'Set up AI provider keys',
 icon: '$(key)',
 command: 'codelicious.configureApiKeys',
 category: 'System'
 },
 {
 id: 'showAnalytics',
 label: 'View Analytics',
 description: 'Performance and cost analytics',
 icon: '$(graph)',
 command: 'codelicious.showAnalytics',
 category: 'System'
 },
 {
 id: 'showHealth',
 label: 'System Health',
 description: 'View system health status',
 icon: '$(pulse)',
 command: 'codelicious.showHealthStatus',
 category: 'System'
 },
 {
 id: 'clearCache',
 label: 'Clear Cache',
 description: 'Clear all caches',
 icon: '$(trash)',
 command: 'codelicious.clearCache',
 category: 'System'
 }
 ];

 constructor(private context: vscode.ExtensionContext) {
 this.loadRecentActions();
 }

 /**
 * Show quick actions menu
 */
 async show(): Promise<void> {
 const items = this.buildQuickPickItems();

 const selected = await vscode.window.showQuickPick(items, {
 placeHolder: 'Select an action...',
 matchOnDescription: true,
 matchOnDetail: true
 });

 if (selected && selected.action) {
 await this.executeAction(selected.action);
 }
 }

 /**
 * Build quick pick items
 */
 private buildQuickPickItems(): Array<vscode.QuickPickItem & { action?: QuickAction }> {
 const items: Array<vscode.QuickPickItem & { action?: QuickAction }> = [];

 // Add recent actions
 if (this.recentActions.length > 0) {
 items.push({
 label: '$(history) Recently Used',
 kind: vscode.QuickPickItemKind.Separator
 });

 for (const actionId of this.recentActions) {
 const action = this.actions.find(a => a.id === actionId);
 if (action) {
 items.push(this.actionToQuickPickItem(action));
 }
 }
 }

 // Group actions by category
 const categories = [...new Set(this.actions.map(a => a.category))];

 for (const category of categories) {
 items.push({
 label: category,
 kind: vscode.QuickPickItemKind.Separator
 });

 const categoryActions = this.actions.filter(a => a.category === category);
 for (const action of categoryActions) {
 items.push(this.actionToQuickPickItem(action));
 }
 }

 return items;
 }

 /**
 * Convert action to quick pick item
 */
 private actionToQuickPickItem(action: QuickAction): vscode.QuickPickItem & { action: QuickAction } {
 const shortcut = action.shortcut ? ` (${action.shortcut})` : '';

 return {
 label: `${action.icon} ${action.label}${shortcut}`,
 description: action.description,
 action
 };
 }

 /**
 * Execute action
 */
 private async executeAction(action: QuickAction): Promise<void> {
 try {
 // Add to recent actions
 this.addRecentAction(action.id);

 // Execute command
 if (action.args) {
 await vscode.commands.executeCommand(action.command, ...action.args);
 } else {
 await vscode.commands.executeCommand(action.command);
 }

 } catch (error) {
 vscode.window.showErrorMessage(`Failed to execute action: ${error}`);
 }
 }

 /**
 * Add action to recent list
 */
 private addRecentAction(actionId: string): void {
 // Remove if already exists
 this.recentActions = this.recentActions.filter(id => id !== actionId);

 // Add to front
 this.recentActions.unshift(actionId);

 // Limit size
 if (this.recentActions.length > this.maxRecentActions) {
 this.recentActions = this.recentActions.slice(0, this.maxRecentActions);
 }

 // Save
 this.saveRecentActions();
 }

 /**
 * Load recent actions from storage
 */
 private loadRecentActions(): void {
 const stored = this.context.globalState.get<string[]>('codelicious.recentActions', []);
 this.recentActions = stored;
 }

 /**
 * Save recent actions to storage
 */
 private saveRecentActions(): void {
 this.context.globalState.update('codelicious.recentActions', this.recentActions);
 }

 /**
 * Get action by ID
 */
 getAction(id: string): QuickAction | undefined {
 return this.actions.find(a => a.id === id);
 }

 /**
 * Get all actions
 */
 getAllActions(): QuickAction[] {
 return [...this.actions];
 }

 /**
 * Get actions by category
 */
 getActionsByCategory(category: string): QuickAction[] {
 return this.actions.filter(a => a.category === category);
 }
}

