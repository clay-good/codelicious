"use strict";
/**
 * Intelligence Manager - Coordinate code intelligence features
 *
 * Features:
 * - Code analysis coordination
 * - Refactoring coordination
 * - Dependency analysis coordination
 * - Results caching
 * - VS Code integration
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligenceManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const codeAnalyzer_1 = require("./codeAnalyzer");
const refactoringEngine_1 = require("./refactoringEngine");
const dependencyAnalyzer_1 = require("./dependencyAnalyzer");
class IntelligenceManager {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.analysisCache = new Map();
        this.codeAnalyzer = new codeAnalyzer_1.CodeAnalyzer(workspaceRoot);
        this.refactoringEngine = new refactoringEngine_1.RefactoringEngine(workspaceRoot);
        this.dependencyAnalyzer = new dependencyAnalyzer_1.DependencyAnalyzer(workspaceRoot);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('codelicious-intelligence');
    }
    /**
    * Analyze current file
    */
    async analyzeCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }
        const filePath = editor.document.uri.fsPath;
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing code...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Analyzing...' });
                const result = await this.codeAnalyzer.analyzeFile(filePath);
                this.analysisCache.set(filePath, result);
                progress.report({ increment: 50, message: 'Generating diagnostics...' });
                // Update diagnostics
                this.updateDiagnostics(editor.document, result);
                progress.report({ increment: 100, message: 'Done!' });
                // Show results
                this.showAnalysisResults(result);
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
    * Analyze entire workspace
    */
    async analyzeWorkspace() {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing workspace...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Finding files...' });
                const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx}', '**/node_modules/**');
                progress.report({ increment: 20, message: `Analyzing ${files.length} files...` });
                let analyzed = 0;
                for (const file of files) {
                    const result = await this.codeAnalyzer.analyzeFile(file.fsPath);
                    this.analysisCache.set(file.fsPath, result);
                    analyzed++;
                    const percent = Math.round((analyzed / files.length) * 80);
                    progress.report({
                        increment: percent,
                        message: `Analyzed ${analyzed}/${files.length} files`
                    });
                }
                progress.report({ increment: 100, message: 'Done!' });
                vscode.window.showInformationMessage(` Analyzed ${files.length} files successfully!`);
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`Workspace analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
    * Analyze dependencies
    */
    async analyzeDependencies() {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing dependencies...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Building dependency graph...' });
                const graph = await this.dependencyAnalyzer.analyzeWorkspace();
                progress.report({ increment: 100, message: 'Done!' });
                // Show results
                this.showDependencyResults(graph);
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`Dependency analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
    * Extract method refactoring
    */
    async extractMethod() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select code to extract');
            return;
        }
        // Ask for method name
        const methodName = await vscode.window.showInputBox({
            prompt: 'Enter method name',
            placeHolder: 'myMethod',
            validateInput: (value) => {
                if (!value)
                    return 'Method name is required';
                if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
                    return 'Invalid method name';
                }
                return null;
            }
        });
        if (!methodName)
            return;
        try {
            const result = await this.refactoringEngine.extractMethod(editor.document, selection, methodName);
            if (result.success) {
                // Show preview
                const apply = await vscode.window.showInformationMessage(result.message, 'Apply', 'Cancel');
                if (apply === 'Apply') {
                    await this.refactoringEngine.applyRefactoring(editor.document, result.operations);
                    vscode.window.showInformationMessage(' Refactoring applied!');
                }
            }
            else {
                vscode.window.showErrorMessage(result.message);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Refactoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
    * Extract variable refactoring
    */
    async extractVariable() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }
        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showWarningMessage('Please select an expression to extract');
            return;
        }
        // Ask for variable name
        const variableName = await vscode.window.showInputBox({
            prompt: 'Enter variable name',
            placeHolder: 'myVariable',
            validateInput: (value) => {
                if (!value)
                    return 'Variable name is required';
                if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(value)) {
                    return 'Invalid variable name';
                }
                return null;
            }
        });
        if (!variableName)
            return;
        try {
            const result = await this.refactoringEngine.extractVariable(editor.document, selection, variableName);
            if (result.success) {
                const apply = await vscode.window.showInformationMessage(result.message, 'Apply', 'Cancel');
                if (apply === 'Apply') {
                    await this.refactoringEngine.applyRefactoring(editor.document, result.operations);
                    vscode.window.showInformationMessage(' Refactoring applied!');
                }
            }
            else {
                vscode.window.showErrorMessage(result.message);
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`Refactoring failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
    * Show code quality report
    */
    async showCodeQualityReport() {
        if (this.analysisCache.size === 0) {
            vscode.window.showInformationMessage('No analysis data available. Run "Analyze Workspace" first.');
            return;
        }
        const results = Array.from(this.analysisCache.values());
        const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
        const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
        const criticalIssues = results.reduce((sum, r) => sum + r.issues.filter(i => i.severity === 'critical').length, 0);
        const report = `
# Code Quality Report

## Overall Metrics
- **Average Quality Score**: ${Math.round(avgScore)}/100
- **Files Analyzed**: ${results.length}
- **Total Issues**: ${totalIssues}
- **Critical Issues**: ${criticalIssues}

## Top Issues
${this.formatTopIssues(results)}

## Recommendations
${this.formatRecommendations(results)}
`;
        // Show in new document
        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
    }
    /**
    * Update diagnostics for document
    */
    updateDiagnostics(document, result) {
        const diagnostics = result.issues.map(issue => {
            const range = new vscode.Range(issue.line - 1, issue.column, issue.line - 1, issue.column + 10);
            const severity = issue.type === 'error'
                ? vscode.DiagnosticSeverity.Error
                : issue.type === 'warning'
                    ? vscode.DiagnosticSeverity.Warning
                    : vscode.DiagnosticSeverity.Information;
            return new vscode.Diagnostic(range, issue.message, severity);
        });
        this.diagnosticCollection.set(document.uri, diagnostics);
    }
    /**
    * Show analysis results
    */
    showAnalysisResults(result) {
        const message = `Quality Score: ${result.score}/100 | Issues: ${result.issues.length} | Suggestions: ${result.suggestions.length}`;
        if (result.score >= 80) {
            vscode.window.showInformationMessage(` ${message}`);
        }
        else if (result.score >= 60) {
            vscode.window.showWarningMessage(` ${message}`);
        }
        else {
            vscode.window.showErrorMessage(` ${message}`);
        }
    }
    /**
    * Show dependency results
    */
    showDependencyResults(graph) {
        const suggestions = this.dependencyAnalyzer.suggestImprovements(graph);
        const message = `Dependencies: ${graph.metrics.totalDependencies} | Circular: ${graph.metrics.circularDependencies} | Unused: ${graph.metrics.unusedDependencies}`;
        if (suggestions.length === 0) {
            vscode.window.showInformationMessage(` ${message}`);
        }
        else {
            vscode.window.showWarningMessage(` ${message}`, 'Show Details').then(action => {
                if (action === 'Show Details') {
                    vscode.window.showInformationMessage(suggestions.join('\n'));
                }
            });
        }
    }
    /**
    * Format top issues
    */
    formatTopIssues(results) {
        const allIssues = results.flatMap(r => r.issues.map(i => ({ ...i, file: r.file })));
        const topIssues = allIssues
            .sort((a, b) => {
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            return severityOrder[a.severity] - severityOrder[b.severity];
        })
            .slice(0, 10);
        return topIssues
            .map(i => `- **${i.severity.toUpperCase()}**: ${i.message} (${path.basename(i.file)}:${i.line})`)
            .join('\n');
    }
    /**
    * Format recommendations
    */
    formatRecommendations(results) {
        const allSuggestions = results.flatMap(r => r.suggestions);
        const highPriority = allSuggestions.filter(s => s.priority === 'high');
        if (highPriority.length === 0) {
            return '- No high-priority recommendations';
        }
        return highPriority
            .slice(0, 5)
            .map(s => `- ${s.message}`)
            .join('\n');
    }
    /**
    * Dispose resources
    */
    dispose() {
        this.diagnosticCollection.dispose();
    }
}
exports.IntelligenceManager = IntelligenceManager;
//# sourceMappingURL=intelligenceManager.js.map