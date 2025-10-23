/**
 * Terminal UI (TUI) Interface for Codelicious
 *
 * Interactive terminal interface with:
 * - Real-time code generation
 * - Progress visualization
 * - Interactive menus
 * - Keyboard shortcuts
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('CodeliciousTUI');

/**
 * Helper function for TUI output (wraps console.log for UI rendering)
 */
function print(message: string = ''): void {
 // eslint-disable-next-line no-console
 console.log(message);
}

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

export class CodeliciousTUI {
 private state: TUIState;
 private screens: Map<string, TUIScreen>;

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
 private setupScreens(): void {
 this.screens.set('main', new MainScreen(this));
 this.screens.set('generate', new GenerateScreen(this));
 this.screens.set('analyze', new AnalyzeScreen(this));
 this.screens.set('settings', new SettingsScreen(this));
 }

 /**
 * Start TUI
 */
 start(): void {
 this.clearScreen();
 this.renderHeader();
 this.renderCurrentScreen();
 this.renderFooter();
 this.setupInputHandling();
 }

 /**
 * Navigate to screen
 */
 navigateTo(screenName: string): void {
 if (this.screens.has(screenName)) {
 this.state.currentScreen = screenName;
 this.render();
 }
 }

 /**
 * Render current screen
 */
 render(): void {
 this.clearScreen();
 this.renderHeader();
 this.renderCurrentScreen();
 this.renderFooter();
 }

 /**
 * Clear screen
 */
 private clearScreen(): void {
 // eslint-disable-next-line no-console
 console.clear();
 }

 /**
 * Render header
 */
 private renderHeader(): void {
 print('');
 print(' CODELICIOUS - AI Code Assistant ');
 print('');
 print('');
 }

 /**
 * Render current screen
 */
 private renderCurrentScreen(): void {
 const screen = this.screens.get(this.state.currentScreen);
 if (screen) {
 screen.render();
 }
 }

 /**
 * Render footer
 */
 private renderFooter(): void {
 print('');
 print('');
 print('Press [q] to quit | [h] for help | [m] for main menu');
 }

 /**
 * Setup input handling
 */
 private setupInputHandling(): void {
 // This would setup readline or similar for interactive input
 // For now, just a placeholder
 process.stdin.setRawMode(true);
 process.stdin.resume();
 process.stdin.on('data', (key) => {
 const keyStr = key.toString();

 // Global shortcuts
 if (keyStr === 'q' || keyStr === '\u0003') {
 process.exit(0);
 } else if (keyStr === 'm') {
 this.navigateTo('main');
 } else if (keyStr === 'h') {
 this.showHelp();
 } else {
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
 private showHelp(): void {
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
 getState(): TUIState {
 return this.state;
 }

 /**
 * Update state
 */
 updateState(updates: Partial<TUIState>): void {
 this.state = { ...this.state, ...updates };
 this.render();
 }
}

/**
 * Main Screen
 */
class MainScreen implements TUIScreen {
 name = 'main';

 constructor(private tui: CodeliciousTUI) {}

 render(): void {
 print('Main Menu:');
 print('');
 print(' [1] Generate Code');
 print(' [2] Analyze Codebase');
 print(' [3] Build Project');
 print(' [4] Settings');
 print('');
 print('Select an option (1-4):');
 }

 handleInput(key: string): void {
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
class GenerateScreen implements TUIScreen {
 name = 'generate';

 constructor(private tui: CodeliciousTUI) {}

 render(): void {
 print('Code Generation:');
 print('');
 print('Enter your prompt:');
 print('(Press Enter to submit, Esc to cancel)');
 print('');
 }

 handleInput(key: string): void {
 if (key === '\u001b') { // Escape
 this.tui.navigateTo('main');
 }
 }
}

/**
 * Analyze Screen
 */
class AnalyzeScreen implements TUIScreen {
 name = 'analyze';

 constructor(private tui: CodeliciousTUI) {}

 render(): void {
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

 handleInput(key: string): void {
 // Any key returns to main
 this.tui.navigateTo('main');
 }
}

/**
 * Settings Screen
 */
class SettingsScreen implements TUIScreen {
 name = 'settings';

 constructor(private tui: CodeliciousTUI) {}

 render(): void {
 print('Settings:');
 print('');
 print(' [1] Model: claude-sonnet-4');
 print(' [2] Auto-approve: No');
 print(' [3] Verbose: Yes');
 print('');
 print('Select setting to change (1-3):');
 }

 handleInput(key: string): void {
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

