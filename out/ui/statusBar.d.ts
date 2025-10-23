/**
 * Manages the status bar indicator for Codelicious
 */
export declare class StatusBarManager {
    private statusBarItem;
    constructor();
    /**
    * Show a message in the status bar
    */
    show(text: string, icon?: string): void;
    /**
    * Hide the status bar item
    */
    hide(): void;
    /**
    * Update the tooltip
    */
    setTooltip(tooltip: string): void;
    /**
    * Clean up resources
    */
    dispose(): void;
}
//# sourceMappingURL=statusBar.d.ts.map