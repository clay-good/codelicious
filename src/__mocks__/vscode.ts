/**
 * Mock VS Code API for testing
 */

export const workspace = {
 getConfiguration: jest.fn(() => ({
 get: jest.fn((key: string, defaultValue?: unknown) => {
 const defaults: Record<string, any> = {
 'indexing.progressive': true,
 'indexing.background': true,
 'indexing.maxMemory': '2GB',
 'indexing.excludePatterns': ['**/node_modules/**', '**/.git/**'],
 'models.preferLocal': true,
 'models.fallbackToCloud': true,
 'models.costLimit': 10.0,
 'execution.sandbox': true,
 'execution.timeout': 30000,
 'execution.requireConfirmation': true,
 'embeddingServer.url': 'http://localhost:8765'
 };
 return defaults[key] ?? defaultValue;
 }),
 has: jest.fn(() => true),
 inspect: jest.fn(),
 update: jest.fn()
 })),
 workspaceFolders: [],
 createFileSystemWatcher: jest.fn(() => ({
 onDidCreate: jest.fn(),
 onDidChange: jest.fn(),
 onDidDelete: jest.fn(),
 dispose: jest.fn()
 })),
 onDidChangeConfiguration: jest.fn(),
 onDidChangeWorkspaceFolders: jest.fn(),
 onDidOpenTextDocument: jest.fn(),
 onDidCloseTextDocument: jest.fn(),
 onDidChangeTextDocument: jest.fn(),
 onDidSaveTextDocument: jest.fn()
};

export const window = {
 showInformationMessage: jest.fn(),
 showWarningMessage: jest.fn(),
 showErrorMessage: jest.fn(),
 showQuickPick: jest.fn(),
 showInputBox: jest.fn(),
 createStatusBarItem: jest.fn(() => ({
 text: '',
 tooltip: '',
 command: '',
 show: jest.fn(),
 hide: jest.fn(),
 dispose: jest.fn()
 })),
 createWebviewPanel: jest.fn(),
 createOutputChannel: jest.fn(() => ({
 append: jest.fn(),
 appendLine: jest.fn(),
 clear: jest.fn(),
 show: jest.fn(),
 hide: jest.fn(),
 dispose: jest.fn()
 })),
 activeTextEditor: undefined,
 visibleTextEditors: [],
 onDidChangeActiveTextEditor: jest.fn(),
 onDidChangeVisibleTextEditors: jest.fn(),
 onDidChangeTextEditorSelection: jest.fn(),
 onDidChangeTextEditorVisibleRanges: jest.fn()
};

export const commands = {
 registerCommand: jest.fn(),
 executeCommand: jest.fn()
};

export const Uri = {
 file: jest.fn((path: string) => ({ fsPath: path, path })),
 parse: jest.fn((uri: string) => ({ fsPath: uri, path: uri }))
};

export const Range = jest.fn();
export const Position = jest.fn();
export const Selection = jest.fn();

export enum StatusBarAlignment {
 Left = 1,
 Right = 2
}

export enum ViewColumn {
 Active = -1,
 Beside = -2,
 One = 1,
 Two = 2,
 Three = 3
}

export enum ConfigurationTarget {
 Global = 1,
 Workspace = 2,
 WorkspaceFolder = 3
}

export class ExtensionContext {
 subscriptions: unknown[] = [];
 workspaceState = {
 get: jest.fn(),
 update: jest.fn(),
 keys: jest.fn(() => [])
 };
 globalState = {
 get: jest.fn(),
 update: jest.fn(),
 keys: jest.fn(() => []),
 setKeysForSync: jest.fn()
 };
 secrets = {
 get: jest.fn(),
 store: jest.fn(),
 delete: jest.fn(),
 onDidChange: jest.fn()
 };
 extensionUri = Uri.file('/fake/extension/path');
 extensionPath = '/fake/extension/path';
 asAbsolutePath = jest.fn((relativePath: string) => `/fake/extension/path/${relativePath}`);
 storageUri = Uri.file('/fake/storage/path');
 storagePath = '/fake/storage/path';
 globalStorageUri = Uri.file('/fake/global/storage/path');
 globalStoragePath = '/fake/global/storage/path';
 logUri = Uri.file('/fake/log/path');
 logPath = '/fake/log/path';
 extensionMode = 3; // Production
}

export const languages = {
 registerCompletionItemProvider: jest.fn(),
 registerCodeActionsProvider: jest.fn(),
 registerCodeLensProvider: jest.fn(),
 registerDefinitionProvider: jest.fn(),
 registerHoverProvider: jest.fn(),
 registerDocumentSymbolProvider: jest.fn(),
 registerWorkspaceSymbolProvider: jest.fn()
};

export const debug = {
 registerDebugConfigurationProvider: jest.fn(),
 startDebugging: jest.fn()
};

export const tasks = {
 registerTaskProvider: jest.fn(),
 executeTask: jest.fn()
};

export const env = {
 appName: 'Visual Studio Code',
 appRoot: '/fake/app/root',
 language: 'en',
 clipboard: {
 readText: jest.fn(),
 writeText: jest.fn()
 },
 machineId: 'fake-machine-id',
 sessionId: 'fake-session-id',
 remoteName: undefined,
 shell: '/bin/bash',
 uriScheme: 'vscode'
};

