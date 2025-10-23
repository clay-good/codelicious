"use strict";
/**
 * Terminal UI (TUI) Interface for Codelicious
 *
 * Interactive terminal interface with:
 * - Real-time code generation
 * - Progress visualization
 * - Interactive menus
 * - Keyboard shortcuts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeliciousTUI = void 0;
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CodeliciousTUI');
/**
 * Helper function for TUI output (wraps console.log for UI rendering)
 */
function print(message = '') {
    // eslint-disable-next-line no-console
    console.log(message);
}
class CodeliciousTUI {
    constructor() {
        this.state = {
            currentScreen: 'main',
            history: [],
            output: [],
            loading: false,
            progress: 0
        };
        this.screens = new Map();
        this.setupScreens();
    }
    /**
    * Setup TUI screens
    */
    setupScreens() {
        this.screens.set('main', new MainScreen(this));
        this.screens.set('generate', new GenerateScreen(this));
        this.screens.set('analyze', new AnalyzeScreen(this));
        this.screens.set('settings', new SettingsScreen(this));
    }
    /**
    * Start TUI
    */
    start() {
        this.clearScreen();
        this.renderHeader();
        this.renderCurrentScreen();
        this.renderFooter();
        this.setupInputHandling();
    }
    /**
    * Navigate to screen
    */
    navigateTo(screenName) {
        if (this.screens.has(screenName)) {
            this.state.currentScreen = screenName;
            this.render();
        }
    }
    /**
    * Render current screen
    */
    render() {
        this.clearScreen();
        this.renderHeader();
        this.renderCurrentScreen();
        this.renderFooter();
    }
    /**
    * Clear screen
    */
    clearScreen() {
        // eslint-disable-next-line no-console
        console.clear();
    }
    /**
    * Render header
    */
    renderHeader() {
        print('');
        print(' CODELICIOUS - AI Code Assistant ');
        print('');
        print('');
    }
    /**
    * Render current screen
    */
    renderCurrentScreen() {
        const screen = this.screens.get(this.state.currentScreen);
        if (screen) {
            screen.render();
        }
    }
    /**
    * Render footer
    */
    renderFooter() {
        print('');
        print('');
        print('Press [q] to quit | [h] for help | [m] for main menu');
    }
    /**
    * Setup input handling
    */
    setupInputHandling() {
        // This would setup readline or similar for interactive input
        // For now, just a placeholder
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', (key) => {
            const keyStr = key.toString();
            // Global shortcuts
            if (keyStr === 'q' || keyStr === '\u0003') {
                process.exit(0);
            }
            else if (keyStr === 'm') {
                this.navigateTo('main');
            }
            else if (keyStr === 'h') {
                this.showHelp();
            }
            else {
                // Pass to current screen
                const screen = this.screens.get(this.state.currentScreen);
                if (screen) {
                    screen.handleInput(keyStr);
                }
            }
        });
    }
    /**
    * Show help
    */
    showHelp() {
        this.clearScreen();
        print('');
        print(' HELP & SHORTCUTS ');
        print('');
        print('');
        print('Global Shortcuts:');
        print(' [q] - Quit');
        print(' [m] - Main menu');
        print(' [h] - Help');
        print('');
        print('Main Menu:');
        print(' [1] - Generate code');
        print(' [2] - Analyze codebase');
        print(' [3] - Build project');
        print(' [4] - Settings');
        print('');
        print('Press any key to continue...');
    }
    /**
    * Get state
    */
    getState() {
        return this.state;
    }
    /**
    * Update state
    */
    updateState(updates) {
        this.state = { ...this.state, ...updates };
        this.render();
    }
}
exports.CodeliciousTUI = CodeliciousTUI;
/**
 * Main Screen
 */
class MainScreen {
    constructor(tui) {
        this.tui = tui;
        this.name = 'main';
    }
    render() {
        print('Main Menu:');
        print('');
        print(' [1] Generate Code');
        print(' [2] Analyze Codebase');
        print(' [3] Build Project');
        print(' [4] Settings');
        print('');
        print('Select an option (1-4):');
    }
    handleInput(key) {
        switch (key) {
            case '1':
                this.tui.navigateTo('generate');
                break;
            case '2':
                this.tui.navigateTo('analyze');
                break;
            case '3':
                print('Build project...');
                break;
            case '4':
                this.tui.navigateTo('settings');
                break;
        }
    }
}
/**
 * Generate Screen
 */
class GenerateScreen {
    constructor(tui) {
        this.tui = tui;
        this.name = 'generate';
    }
    render() {
        print('Code Generation:');
        print('');
        print('Enter your prompt:');
        print('(Press Enter to submit, Esc to cancel)');
        print('');
    }
    handleInput(key) {
        if (key === '\u001b') { // Escape
            this.tui.navigateTo('main');
        }
    }
}
/**
 * Analyze Screen
 */
class AnalyzeScreen {
    constructor(tui) {
        this.tui = tui;
        this.name = 'analyze';
    }
    render() {
        print('Codebase Analysis:');
        print('');
        print('Analyzing...');
        print('');
        print('Results:');
        print(' Files: 150');
        print(' Lines: 15,000');
        print(' Complexity: Medium');
        print('');
    }
    handleInput(key) {
        // Any key returns to main
        this.tui.navigateTo('main');
    }
}
/**
 * Settings Screen
 */
class SettingsScreen {
    constructor(tui) {
        this.tui = tui;
        this.name = 'settings';
    }
    render() {
        print('Settings:');
        print('');
        print(' [1] Model: claude-sonnet-4');
        print(' [2] Auto-approve: No');
        print(' [3] Verbose: Yes');
        print('');
        print('Select setting to change (1-3):');
    }
    handleInput(key) {
        switch (key) {
            case '1':
                print('Change model...');
                break;
            case '2':
                print('Toggle auto-approve...');
                break;
            case '3':
                print('Toggle verbose...');
                break;
        }
    }
}
//# sourceMappingURL=tuiInterface.js.map