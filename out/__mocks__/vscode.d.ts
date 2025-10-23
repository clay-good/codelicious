/**
 * Mock VS Code API for testing
 */
export declare const workspace: {
    getConfiguration: jest.Mock<{
        get: jest.Mock<any, [key: string, defaultValue?: unknown], any>;
        has: jest.Mock<boolean, [], any>;
        inspect: jest.Mock<any, any, any>;
        update: jest.Mock<any, any, any>;
    }, [], any>;
    workspaceFolders: never[];
    createFileSystemWatcher: jest.Mock<{
        onDidCreate: jest.Mock<any, any, any>;
        onDidChange: jest.Mock<any, any, any>;
        onDidDelete: jest.Mock<any, any, any>;
        dispose: jest.Mock<any, any, any>;
    }, [], any>;
    onDidChangeConfiguration: jest.Mock<any, any, any>;
    onDidChangeWorkspaceFolders: jest.Mock<any, any, any>;
    onDidOpenTextDocument: jest.Mock<any, any, any>;
    onDidCloseTextDocument: jest.Mock<any, any, any>;
    onDidChangeTextDocument: jest.Mock<any, any, any>;
    onDidSaveTextDocument: jest.Mock<any, any, any>;
};
export declare const window: {
    showInformationMessage: jest.Mock<any, any, any>;
    showWarningMessage: jest.Mock<any, any, any>;
    showErrorMessage: jest.Mock<any, any, any>;
    showQuickPick: jest.Mock<any, any, any>;
    showInputBox: jest.Mock<any, any, any>;
    createStatusBarItem: jest.Mock<{
        text: string;
        tooltip: string;
        command: string;
        show: jest.Mock<any, any, any>;
        hide: jest.Mock<any, any, any>;
        dispose: jest.Mock<any, any, any>;
    }, [], any>;
    createWebviewPanel: jest.Mock<any, any, any>;
    createOutputChannel: jest.Mock<{
        append: jest.Mock<any, any, any>;
        appendLine: jest.Mock<any, any, any>;
        clear: jest.Mock<any, any, any>;
        show: jest.Mock<any, any, any>;
        hide: jest.Mock<any, any, any>;
        dispose: jest.Mock<any, any, any>;
    }, [], any>;
    activeTextEditor: undefined;
    visibleTextEditors: never[];
    onDidChangeActiveTextEditor: jest.Mock<any, any, any>;
    onDidChangeVisibleTextEditors: jest.Mock<any, any, any>;
    onDidChangeTextEditorSelection: jest.Mock<any, any, any>;
    onDidChangeTextEditorVisibleRanges: jest.Mock<any, any, any>;
};
export declare const commands: {
    registerCommand: jest.Mock<any, any, any>;
    executeCommand: jest.Mock<any, any, any>;
};
export declare const Uri: {
    file: jest.Mock<{
        fsPath: string;
        path: string;
    }, [path: string], any>;
    parse: jest.Mock<{
        fsPath: string;
        path: string;
    }, [uri: string], any>;
};
export declare const Range: jest.Mock<any, any, any>;
export declare const Position: jest.Mock<any, any, any>;
export declare const Selection: jest.Mock<any, any, any>;
export declare enum StatusBarAlignment {
    Left = 1,
    Right = 2
}
export declare enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3
}
export declare enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3
}
export declare class ExtensionContext {
    subscriptions: unknown[];
    workspaceState: {
        get: jest.Mock<any, any, any>;
        update: jest.Mock<any, any, any>;
        keys: jest.Mock<never[], [], any>;
    };
    globalState: {
        get: jest.Mock<any, any, any>;
        update: jest.Mock<any, any, any>;
        keys: jest.Mock<never[], [], any>;
        setKeysForSync: jest.Mock<any, any, any>;
    };
    secrets: {
        get: jest.Mock<any, any, any>;
        store: jest.Mock<any, any, any>;
        delete: jest.Mock<any, any, any>;
        onDidChange: jest.Mock<any, any, any>;
    };
    extensionUri: {
        fsPath: string;
        path: string;
    };
    extensionPath: string;
    asAbsolutePath: jest.Mock<string, [relativePath: string], any>;
    storageUri: {
        fsPath: string;
        path: string;
    };
    storagePath: string;
    globalStorageUri: {
        fsPath: string;
        path: string;
    };
    globalStoragePath: string;
    logUri: {
        fsPath: string;
        path: string;
    };
    logPath: string;
    extensionMode: number;
}
export declare const languages: {
    registerCompletionItemProvider: jest.Mock<any, any, any>;
    registerCodeActionsProvider: jest.Mock<any, any, any>;
    registerCodeLensProvider: jest.Mock<any, any, any>;
    registerDefinitionProvider: jest.Mock<any, any, any>;
    registerHoverProvider: jest.Mock<any, any, any>;
    registerDocumentSymbolProvider: jest.Mock<any, any, any>;
    registerWorkspaceSymbolProvider: jest.Mock<any, any, any>;
};
export declare const debug: {
    registerDebugConfigurationProvider: jest.Mock<any, any, any>;
    startDebugging: jest.Mock<any, any, any>;
};
export declare const tasks: {
    registerTaskProvider: jest.Mock<any, any, any>;
    executeTask: jest.Mock<any, any, any>;
};
export declare const env: {
    appName: string;
    appRoot: string;
    language: string;
    clipboard: {
        readText: jest.Mock<any, any, any>;
        writeText: jest.Mock<any, any, any>;
    };
    machineId: string;
    sessionId: string;
    remoteName: undefined;
    shell: string;
    uriScheme: string;
};
//# sourceMappingURL=vscode.d.ts.map