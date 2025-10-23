/**
 * Terminal UI (TUI) Interface for Codelicious
 *
 * Interactive terminal interface with:
 * - Real-time code generation
 * - Progress visualization
 * - Interactive menus
 * - Keyboard shortcuts
 */
export interface TUIScreen {
    name: string;
    render(): void;
    handleInput(key: string): void;
}
export interface TUIState {
    currentScreen: string;
    history: string[];
    output: string[];
    loading: boolean;
    progress: number;
}
export declare class CodeliciousTUI {
    private state;
    private screens;
    constructor();
    /**
    * Setup TUI screens
    */
    private setupScreens;
    /**
    * Start TUI
    */
    start(): void;
    /**
    * Navigate to screen
    */
    navigateTo(screenName: string): void;
    /**
    * Render current screen
    */
    render(): void;
    /**
    * Clear screen
    */
    private clearScreen;
    /**
    * Render header
    */
    private renderHeader;
    /**
    * Render current screen
    */
    private renderCurrentScreen;
    /**
    * Render footer
    */
    private renderFooter;
    /**
    * Setup input handling
    */
    private setupInputHandling;
    /**
    * Show help
    */
    private showHelp;
    /**
    * Get state
    */
    getState(): TUIState;
    /**
    * Update state
    */
    updateState(updates: Partial<TUIState>): void;
}
//# sourceMappingURL=tuiInterface.d.ts.map