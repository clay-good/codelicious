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
export declare class QuickActionsMenu {
    private context;
    private recentActions;
    private readonly maxRecentActions;
    private readonly actions;
    constructor(context: vscode.ExtensionContext);
    /**
    * Show quick actions menu
    */
    show(): Promise<void>;
    /**
    * Build quick pick items
    */
    private buildQuickPickItems;
    /**
    * Convert action to quick pick item
    */
    private actionToQuickPickItem;
    /**
    * Execute action
    */
    private executeAction;
    /**
    * Add action to recent list
    */
    private addRecentAction;
    /**
    * Load recent actions from storage
    */
    private loadRecentActions;
    /**
    * Save recent actions to storage
    */
    private saveRecentActions;
    /**
    * Get action by ID
    */
    getAction(id: string): QuickAction | undefined;
    /**
    * Get all actions
    */
    getAllActions(): QuickAction[];
    /**
    * Get actions by category
    */
    getActionsByCategory(category: string): QuickAction[];
}
//# sourceMappingURL=quickActions.d.ts.map