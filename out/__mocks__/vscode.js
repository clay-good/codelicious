"use strict";
/**
 * Mock VS Code API for testing
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = exports.tasks = exports.debug = exports.languages = exports.ExtensionContext = exports.ConfigurationTarget = exports.ViewColumn = exports.StatusBarAlignment = exports.Selection = exports.Position = exports.Range = exports.Uri = exports.commands = exports.window = exports.workspace = void 0;
exports.workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn((key, defaultValue) => {
            const defaults = {
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
exports.window = {
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
exports.commands = {
    registerCommand: jest.fn(),
    executeCommand: jest.fn()
};
exports.Uri = {
    file: jest.fn((path) => ({ fsPath: path, path })),
    parse: jest.fn((uri) => ({ fsPath: uri, path: uri }))
};
exports.Range = jest.fn();
exports.Position = jest.fn();
exports.Selection = jest.fn();
var StatusBarAlignment;
(function (StatusBarAlignment) {
    StatusBarAlignment[StatusBarAlignment["Left"] = 1] = "Left";
    StatusBarAlignment[StatusBarAlignment["Right"] = 2] = "Right";
})(StatusBarAlignment || (exports.StatusBarAlignment = StatusBarAlignment = {}));
var ViewColumn;
(function (ViewColumn) {
    ViewColumn[ViewColumn["Active"] = -1] = "Active";
    ViewColumn[ViewColumn["Beside"] = -2] = "Beside";
    ViewColumn[ViewColumn["One"] = 1] = "One";
    ViewColumn[ViewColumn["Two"] = 2] = "Two";
    ViewColumn[ViewColumn["Three"] = 3] = "Three";
})(ViewColumn || (exports.ViewColumn = ViewColumn = {}));
var ConfigurationTarget;
(function (ConfigurationTarget) {
    ConfigurationTarget[ConfigurationTarget["Global"] = 1] = "Global";
    ConfigurationTarget[ConfigurationTarget["Workspace"] = 2] = "Workspace";
    ConfigurationTarget[ConfigurationTarget["WorkspaceFolder"] = 3] = "WorkspaceFolder";
})(ConfigurationTarget || (exports.ConfigurationTarget = ConfigurationTarget = {}));
class ExtensionContext {
    constructor() {
        this.subscriptions = [];
        this.workspaceState = {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => [])
        };
        this.globalState = {
            get: jest.fn(),
            update: jest.fn(),
            keys: jest.fn(() => []),
            setKeysForSync: jest.fn()
        };
        this.secrets = {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
            onDidChange: jest.fn()
        };
        this.extensionUri = exports.Uri.file('/fake/extension/path');
        this.extensionPath = '/fake/extension/path';
        this.asAbsolutePath = jest.fn((relativePath) => `/fake/extension/path/${relativePath}`);
        this.storageUri = exports.Uri.file('/fake/storage/path');
        this.storagePath = '/fake/storage/path';
        this.globalStorageUri = exports.Uri.file('/fake/global/storage/path');
        this.globalStoragePath = '/fake/global/storage/path';
        this.logUri = exports.Uri.file('/fake/log/path');
        this.logPath = '/fake/log/path';
        this.extensionMode = 3; // Production
    }
}
exports.ExtensionContext = ExtensionContext;
exports.languages = {
    registerCompletionItemProvider: jest.fn(),
    registerCodeActionsProvider: jest.fn(),
    registerCodeLensProvider: jest.fn(),
    registerDefinitionProvider: jest.fn(),
    registerHoverProvider: jest.fn(),
    registerDocumentSymbolProvider: jest.fn(),
    registerWorkspaceSymbolProvider: jest.fn()
};
exports.debug = {
    registerDebugConfigurationProvider: jest.fn(),
    startDebugging: jest.fn()
};
exports.tasks = {
    registerTaskProvider: jest.fn(),
    executeTask: jest.fn()
};
exports.env = {
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
//# sourceMappingURL=vscode.js.map