/**
 * Main extension entry point for Codelicious
 */

import * as vscode from 'vscode';
import { ExtensionManager } from './core/extensionManager';
import { IndexingEngine } from './core/indexer';
import { ChatViewProvider } from './ui/chatViewProvider';
import { StatusBarManager } from './ui/statusBar';
import { ConfigurationManager } from './core/configurationManager';
import { SecureStorageManager } from './core/secureStorage';
import { ModelSelector } from './ui/modelSelector';
import { AnalyticsViewProvider } from './analytics/analyticsViewProvider';
import { InlineCompletionProvider } from './completion/inlineCompletionProvider';
import { ContextPanelProvider } from './ui/contextPanel';
import { createLogger } from './utils/logger';

const logger = createLogger('Extension');

let extensionManager: ExtensionManager | undefined;

/**
 * Extension activation - called when VS Code loads the extension
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
 logger.info('Codelicious is activating...');

 try {
 // Initialize core managers
 const configManager = new ConfigurationManager();
 const storageManager = new SecureStorageManager(context);
 const statusBar = new StatusBarManager();

 // Initialize extension manager
 extensionManager = new ExtensionManager(
 context,
 configManager,
 storageManager,
 statusBar
 );

 // Register the extension manager for cleanup
 context.subscriptions.push({
 dispose: () => extensionManager?.dispose()
 });

 // Initialize the extension
 await extensionManager.initialize();

 // Register commands
 registerCommands(context, extensionManager);
 registerPatternCommands(context, extensionManager);

 // Register chat view provider
 const chatProvider = new ChatViewProvider(context.extensionUri, extensionManager);
 context.subscriptions.push(
 vscode.window.registerWebviewViewProvider(
 ChatViewProvider.viewType,
 chatProvider
 )
 );

 // AUGMENT PARITY: Register context panel provider for transparency
 const contextPanel = new ContextPanelProvider(context.extensionUri);
 context.subscriptions.push(
 vscode.window.registerWebviewViewProvider(
 ContextPanelProvider.viewType,
 contextPanel
 )
 );

 // Connect context panel to chat provider
 chatProvider.setContextPanel(contextPanel);

 // Register analytics view provider
 const analyticsManager = extensionManager.getAnalyticsManager();
 if (analyticsManager) {
 const analyticsProvider = new AnalyticsViewProvider(context.extensionUri, analyticsManager);
 context.subscriptions.push(
 vscode.window.registerWebviewViewProvider(
 AnalyticsViewProvider.viewType,
 analyticsProvider
 )
 );
 }

 // Register inline completion provider
 const orchestrator = extensionManager.getModelOrchestrator();
 const ragService = extensionManager.getRAGService() || null;
 if (orchestrator) {
 const inlineCompletionProvider = new InlineCompletionProvider(orchestrator, ragService);

 // Register for all supported languages
 const supportedLanguages = [
 'typescript', 'javascript', 'python', 'java', 'csharp', 'cpp', 'c',
 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'dart',
 'html', 'css', 'scss', 'less', 'json', 'yaml', 'xml', 'markdown',
 'sql', 'shell', 'bash', 'powershell', 'dockerfile', 'makefile'
 ];

 for (const language of supportedLanguages) {
 context.subscriptions.push(
 vscode.languages.registerInlineCompletionItemProvider(
 { language },
 inlineCompletionProvider
 )
 );
 }

 // Also register for all files
 context.subscriptions.push(
 vscode.languages.registerInlineCompletionItemProvider(
 { scheme: 'file' },
 inlineCompletionProvider
 )
 );

 context.subscriptions.push({
 dispose: () => inlineCompletionProvider.dispose()
 });

 logger.info('Inline completion provider registered');
 }

 logger.info('Codelicious activated successfully!');

 // Show welcome message on first activation
 const hasShownWelcome = context.globalState.get('codelicious.hasShownWelcome', false);
 if (!hasShownWelcome) {
 showWelcomeMessage(context);
 context.globalState.update('codelicious.hasShownWelcome', true);
 }

 } catch (error) {
 logger.error('Failed to activate Codelicious:', error);
 vscode.window.showErrorMessage(
 `Failed to activate Codelicious: ${error instanceof Error ? error.message : 'Unknown error'}`
 );
 }
}

/**
 * Extension deactivation - called when VS Code unloads the extension
 */
export async function deactivate(): Promise<void> {
 logger.info('Codelicious is deactivating...');

 if (extensionManager) {
 await extensionManager.dispose();
 extensionManager = undefined;
 }

 logger.info('Codelicious deactivated successfully!');
}

/**
 * Register all extension commands
 */
function registerCommands(
 context: vscode.ExtensionContext,
 manager: ExtensionManager
): void {
 // Open chat command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.openChat', async () => {
 try {
 await vscode.commands.executeCommand('workbench.view.extension.codelicious-sidebar');
 vscode.window.showInformationMessage('Codelicious chat opened!');
 } catch (error) {
 vscode.window.showErrorMessage('Failed to open chat');
 }
 })
 );

 // Configure API keys command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.configureApiKeys', async () => {
 await manager.configureApiKeys();
 })
 );

 // Reindex project command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.reindexProject', async () => {
 await manager.reindexProject();
 })
 );

 // Show index status command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showIndexStatus', async () => {
 await manager.showIndexStatus();
 })
 );

 // Clear cache command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.clearCache', async () => {
 await manager.clearCache();
 })
 );

 // Show cost tracking command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showCostTracking', async () => {
 await manager.showCostTracking();
 })
 );

 // Show analytics dashboard command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showAnalytics', async () => {
 await vscode.commands.executeCommand('codelicious.analyticsView.focus');
 })
 );

 // Multi-file edit command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.multiFileEdit', async () => {
 const editor = manager.getMultiFileEditor();
 if (!editor) {
 vscode.window.showErrorMessage('Multi-file editor not available');
 return;
 }

 const request = await vscode.window.showInputBox({
 prompt: 'Describe the changes you want to make across multiple files',
 placeHolder: 'e.g., Rename all instances of "oldName" to "newName" across the project'
 });

 if (!request) {
 return;
 }

 // Get affected files from user
 const filesInput = await vscode.window.showInputBox({
 prompt: 'Enter file paths (comma-separated)',
 placeHolder: 'e.g., src/file1.ts, src/file2.ts'
 });

 if (!filesInput) {
 return;
 }

 const files = filesInput.split(',').map(f => f.trim());

 try {
 vscode.window.showInformationMessage('Planning multi-file edits...');
 const edits = await editor.planEdits(request, files);
 const result = await editor.applyEdits(edits, true);

 if (result.conflicts.length > 0) {
 vscode.window.showWarningMessage(`Found ${result.conflicts.length} conflicts. Review and resolve them.`);
 } else {
 vscode.window.showInformationMessage(`Planned ${edits.length} file edits. Review and apply.`);
 }
 } catch (error) {
 vscode.window.showErrorMessage(`Multi-file edit failed: ${error}`);
 }
 })
 );

 // Code review command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.reviewCode', async () => {
 const agent = manager.getCodeReviewAgent();
 if (!agent) {
 vscode.window.showErrorMessage('Code review agent not available');
 return;
 }

 const editor = vscode.window.activeTextEditor;
 if (!editor) {
 vscode.window.showErrorMessage('No active editor');
 return;
 }

 const document = editor.document;
 const content = document.getText();
 const language = document.languageId;
 const filePath = vscode.workspace.asRelativePath(document.uri);

 try {
 vscode.window.showInformationMessage('Reviewing code...');
 const result = await agent.reviewFile(filePath, content, language);

 // Show results
 const criticalCount = result.issues.filter(i => i.severity === 'critical').length;
 const highCount = result.issues.filter(i => i.severity === 'high').length;

 if (criticalCount > 0 || highCount > 0) {
 vscode.window.showWarningMessage(
 `Code review found ${criticalCount} critical and ${highCount} high priority issues. Score: ${result.score}/100`
 );
 } else {
 vscode.window.showInformationMessage(`Code review passed! Score: ${result.score}/100`);
 }

 // Show detailed results in output channel
 const output = vscode.window.createOutputChannel('Codelicious Code Review');
 output.clear();
 output.appendLine(`# Code Review: ${filePath}`);
 output.appendLine(`Score: ${result.score}/100`);
 output.appendLine(`\n${result.summary}\n`);
 output.appendLine('## Issues:');
 for (const issue of result.issues) {
 output.appendLine(`\n[${issue.severity.toUpperCase()}] ${issue.category}`);
 output.appendLine(`Line ${issue.line || 'N/A'}: ${issue.message}`);
 if (issue.suggestion) {
 output.appendLine(`Suggestion: ${issue.suggestion}`);
 }
 }
 output.show();
 } catch (error) {
 vscode.window.showErrorMessage(`Code review failed: ${error}`);
 }
 })
 );

 // Generate documentation command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.generateDocs', async () => {
 const generator = manager.getDocumentationGenerator();
 if (!generator) {
 vscode.window.showErrorMessage('Documentation generator not available');
 return;
 }

 const docType = await vscode.window.showQuickPick(
 ['README', 'API Reference', 'Usage Guide', 'Architecture'],
 { placeHolder: 'Select documentation type' }
 );

 if (!docType) {
 return;
 }

 try {
 vscode.window.showInformationMessage(`Generating ${docType}...`);

 if (docType === 'README') {
 const name = await vscode.window.showInputBox({ prompt: 'Project name' });
 const description = await vscode.window.showInputBox({ prompt: 'Project description' });

 if (!name || !description) {
 return;
 }

 const doc = await generator.generateReadme({
 name,
 description,
 features: ['Feature 1', 'Feature 2'],
 installation: 'npm install',
 usage: 'See documentation'
 });

 await generator.writeDocumentation(doc);
 vscode.window.showInformationMessage('README.md generated!');
 }
 } catch (error) {
 vscode.window.showErrorMessage(`Documentation generation failed: ${error}`);
 }
 })
 );

 // Select AI model command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.selectModel', async () => {
 const orchestrator = manager.getModelOrchestrator();
 if (orchestrator) {
 const selector = new ModelSelector(orchestrator, context.extensionUri);
 const selected = await selector.showModelPicker();
 if (selected) {
 await selector.setDefaultModel(selected);
 vscode.window.showInformationMessage(`Switched to ${selected.displayName}`);
 }
 } else {
 vscode.window.showErrorMessage('Model orchestrator not initialized');
 }
 })
 );

 // Configure agent models command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.configureAgentModels', async () => {
 await configureAgentModels();
 })
 );

 // Build persistent index command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.buildPersistentIndex', async () => {
 const ragService = manager.getRAGService();
 const persistentContext = ragService?.getPersistentContext();

 if (!persistentContext) {
 vscode.window.showErrorMessage('Persistent context engine not available');
 return;
 }

 const workspaceFolders = vscode.workspace.workspaceFolders;
 if (!workspaceFolders || workspaceFolders.length === 0) {
 vscode.window.showErrorMessage('No workspace folder open');
 return;
 }

 try {
 vscode.window.showInformationMessage('Building persistent index... This may take a few minutes.');
 await persistentContext.buildPersistentIndex(workspaceFolders[0].uri.fsPath);
 vscode.window.showInformationMessage(' Persistent index built successfully!');
 } catch (error) {
 vscode.window.showErrorMessage(`Failed to build index: ${error}`);
 }
 })
 );

 // Query architectural context command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.queryArchitecture', async () => {
 const ragService = manager.getRAGService();

 if (!ragService) {
 vscode.window.showErrorMessage('RAG service not available');
 return;
 }

 const query = await vscode.window.showInputBox({
 prompt: 'What would you like to know about your codebase architecture?',
 placeHolder: 'e.g., Show me all microservices, Find MVC patterns, etc.'
 });

 if (!query) {
 return;
 }

 try {
 vscode.window.showInformationMessage('Analyzing architecture...');
 const context = await ragService.queryWithArchitecture(query);

 if (!context) {
 vscode.window.showWarningMessage('No architectural context found');
 return;
 }

 // Show results in output channel
 const outputChannel = vscode.window.createOutputChannel('Codelicious Architecture');
 outputChannel.clear();
 outputChannel.appendLine('# Architectural Context Query Results\n');
 outputChannel.appendLine(`Query: ${query}\n`);
 outputChannel.appendLine(`Total Tokens: ${context.totalTokens}\n`);
 outputChannel.appendLine(`Relevant Files: ${context.relevantFiles.length}\n`);

 if (context.patterns.length > 0) {
 outputChannel.appendLine('\n## Detected Patterns:\n');
 for (const pattern of context.patterns) {
 outputChannel.appendLine(`- ${pattern.type}: ${pattern.description} (confidence: ${pattern.confidence})`);
 }
 }

 if (context.dependencies.length > 0) {
 outputChannel.appendLine(`\n## Dependencies: ${context.dependencies.length} found\n`);
 }

 if (context.symbols.length > 0) {
 outputChannel.appendLine(`\n## Symbols: ${context.symbols.length} found\n`);
 }

 outputChannel.appendLine('\n## Assembled Context:\n');
 outputChannel.appendLine(context.assembledContext);

 outputChannel.show();
 vscode.window.showInformationMessage(' Architecture analysis complete!');
 } catch (error) {
 vscode.window.showErrorMessage(`Architecture query failed: ${error}`);
 }
 })
 );

 // Show index statistics command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showIndexStats', async () => {
 const ragService = manager.getRAGService();
 const incrementalIndexer = ragService?.getIncrementalIndexer();

 if (!incrementalIndexer) {
 vscode.window.showWarningMessage('Incremental indexer not available');
 return;
 }

 const stats = incrementalIndexer.getStats();
 vscode.window.showInformationMessage(
 `Index Stats - Queue: ${stats.queueSize}, Processing: ${stats.isProcessing ? 'Yes' : 'No'}`
 );
 })
 );

 // Autonomous build command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.autonomousBuild', async () => {
 const workflow = manager.getAutonomousWorkflow();

 if (!workflow) {
 vscode.window.showErrorMessage('Autonomous workflow not available. Please wait for initialization to complete.');
 return;
 }

 const specification = await vscode.window.showInputBox({
 prompt: 'Describe what you want to build',
 placeHolder: 'e.g., Create a REST API for user management with authentication',
 ignoreFocusOut: true
 });

 if (!specification) {
 return;
 }

 try {
 vscode.window.showInformationMessage(' Starting autonomous build...');

 const result = await workflow.execute(specification, {
 autoWriteFiles: true,
 autoRunTests: false,
 requireApproval: true,
 maxRetries: 3
 });

 if (result.success) {
 vscode.window.showInformationMessage(
 ` Build complete! Generated ${result.filesWritten.length} files in ${(result.duration / 1000).toFixed(1)}s. ` +
 `Validation: ${result.validation.overallScore}/100`
 );
 } else {
 vscode.window.showErrorMessage(
 ` Build failed: ${result.errors.join(', ')}`
 );
 }
 } catch (error) {
 vscode.window.showErrorMessage(`Autonomous build failed: ${error}`);
 }
 })
 );

 // Build from instruction file command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.buildFromInstructionFile', async (uri?: vscode.Uri) => {
 const productBuilder = manager.getProductBuilder();

 if (!productBuilder) {
 vscode.window.showErrorMessage('Product builder not available');
 return;
 }

 let filePath: string | undefined;

 if (uri) {
 filePath = uri.fsPath;
 } else {
 const result = await vscode.window.showOpenDialog({
 canSelectFiles: true,
 canSelectFolders: false,
 canSelectMany: false,
 filters: {
 'Instruction Files': ['md', 'txt'],
 'All Files': ['*']
 },
 title: 'Select Instruction File'
 });

 if (result && result.length > 0) {
 filePath = result[0].fsPath;
 }
 }

 if (!filePath) {
 return;
 }

 await vscode.window.withProgress(
 {
 location: vscode.ProgressLocation.Notification,
 title: 'Building product from instruction file...',
 cancellable: false
 },
 async () => {
 try {
 const result = await productBuilder.buildFromInstructionFile(filePath!);
 if (result.success) {
 vscode.window.showInformationMessage(
 ` Product built successfully! Generated ${result.filesGenerated} files with quality score ${result.qualityScore}/100`
 );
 } else {
 vscode.window.showErrorMessage(` Build failed: ${result.errors?.join(', ')}`);
 }
 } catch (error) {
 vscode.window.showErrorMessage(`Failed to build from instruction file: ${error}`);
 }
 }
 );
 })
 );

 // Build from workspace instructions command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.buildFromWorkspaceInstructions', async () => {
 const productBuilder = manager.getProductBuilder();

 if (!productBuilder) {
 vscode.window.showErrorMessage('Product builder not available');
 return;
 }

 await vscode.window.withProgress(
 {
 location: vscode.ProgressLocation.Notification,
 title: 'Searching for instruction files...',
 cancellable: false
 },
 async () => {
 try {
 const results = await productBuilder.buildFromWorkspaceInstructions();
 const successCount = results.filter((r: { success: boolean }) => r.success).length;
 const totalFiles = results.reduce((sum: number, r: { filesGenerated: number }) => sum + r.filesGenerated, 0);

 if (successCount > 0) {
 vscode.window.showInformationMessage(
 ` Built ${successCount} product(s) successfully! Generated ${totalFiles} files total`
 );
 } else {
 vscode.window.showErrorMessage(` All builds failed`);
 }
 } catch (error) {
 vscode.window.showErrorMessage(`Failed to build from workspace instructions: ${error}`);
 }
 }
 );
 })
 );

 // Advanced testing: Analyze and improve
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.analyzeTests', async () => {
 const advancedTesting = manager.getAdvancedTesting();

 if (!advancedTesting) {
 vscode.window.showErrorMessage('Advanced testing not available');
 return;
 }

 try {
 vscode.window.showInformationMessage(' Analyzing test suite...');

 const result = await advancedTesting.getComprehensiveReport();

 const message = `Test Suite Report:

Overall Health: ${result.summary.overallHealth}/100
Coverage: ${result.coverage.overall.lines.percentage.toFixed(1)}%
Quality: ${result.quality.overall.score}/100 (${result.quality.overall.grade})

Strengths:
${result.summary.strengths.map(s => ` ${s}`).join('\n')}

Weaknesses:
${result.summary.weaknesses.map(w => ` ${w}`).join('\n')}

Priorities:
${result.summary.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;

 vscode.window.showInformationMessage(message, { modal: true });
 } catch (error) {
 vscode.window.showErrorMessage(`Test analysis failed: ${error}`);
 }
 })
 );

 // Advanced testing: Fix failing tests
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.fixFailingTests', async () => {
 const advancedTesting = manager.getAdvancedTesting();

 if (!advancedTesting) {
 vscode.window.showErrorMessage('Advanced testing not available');
 return;
 }

 try {
 vscode.window.showInformationMessage(' Fixing failing tests...');

 const result = await advancedTesting.fixAllFailingTests({
 autoApply: true,
 requireConfirmation: true,
 maxRetries: 3
 });

 vscode.window.showInformationMessage(
 ` Fixed ${result.successful}/${result.applied} tests in ${(result.duration / 1000).toFixed(1)}s`
 );
 } catch (error) {
 vscode.window.showErrorMessage(`Test fixing failed: ${error}`);
 }
 })
 );

 // Compare AI models command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.compareModels', async () => {
 const orchestrator = manager.getModelOrchestrator();
 if (orchestrator) {
 const selector = new ModelSelector(orchestrator, context.extensionUri);
 await selector.showModelComparison();
 } else {
 vscode.window.showErrorMessage('Model orchestrator not initialized');
 }
 })
 );

 // Generate tests command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.generateTests', async () => {
 const testManager = manager.getTestManager();
 if (testManager) {
 await testManager.generateTestsForCurrentFile();
 } else {
 vscode.window.showErrorMessage('Test manager not initialized');
 }
 })
 );

 // Run tests command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.runTests', async () => {
 const testManager = manager.getTestManager();
 if (testManager) {
 await testManager.runAllTests();
 } else {
 vscode.window.showErrorMessage('Test manager not initialized');
 }
 })
 );

 // Run tests for current file command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.runTestsForFile', async () => {
 const testManager = manager.getTestManager();
 if (testManager) {
 await testManager.runTestsForCurrentFile();
 } else {
 vscode.window.showErrorMessage('Test manager not initialized');
 }
 })
 );

 // Run tests with coverage command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.runTestsWithCoverage', async () => {
 const testManager = manager.getTestManager();
 if (testManager) {
 await testManager.runTestsWithCoverage();
 } else {
 vscode.window.showErrorMessage('Test manager not initialized');
 }
 })
 );

 // Stop tests command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.stopTests', () => {
 const testManager = manager.getTestManager();
 if (testManager) {
 testManager.stopTests();
 }
 })
 );

 // Analyze current file command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.analyzeFile', async () => {
 const intelligenceManager = manager.getIntelligenceManager();
 if (intelligenceManager) {
 await intelligenceManager.analyzeCurrentFile();
 } else {
 vscode.window.showErrorMessage('Intelligence manager not initialized');
 }
 })
 );

 // Analyze workspace command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.analyzeWorkspace', async () => {
 const intelligenceManager = manager.getIntelligenceManager();
 if (intelligenceManager) {
 await intelligenceManager.analyzeWorkspace();
 } else {
 vscode.window.showErrorMessage('Intelligence manager not initialized');
 }
 })
 );

 // Analyze dependencies command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.analyzeDependencies', async () => {
 const intelligenceManager = manager.getIntelligenceManager();
 if (intelligenceManager) {
 await intelligenceManager.analyzeDependencies();
 } else {
 vscode.window.showErrorMessage('Intelligence manager not initialized');
 }
 })
 );

 // Extract method command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.extractMethod', async () => {
 const intelligenceManager = manager.getIntelligenceManager();
 if (intelligenceManager) {
 await intelligenceManager.extractMethod();
 } else {
 vscode.window.showErrorMessage('Intelligence manager not initialized');
 }
 })
 );

 // Extract variable command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.extractVariable', async () => {
 const intelligenceManager = manager.getIntelligenceManager();
 if (intelligenceManager) {
 await intelligenceManager.extractVariable();
 } else {
 vscode.window.showErrorMessage('Intelligence manager not initialized');
 }
 })
 );

 // Show code quality report command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showCodeQualityReport', async () => {
 const intelligenceManager = manager.getIntelligenceManager();
 if (intelligenceManager) {
 await intelligenceManager.showCodeQualityReport();
 } else {
 vscode.window.showErrorMessage('Intelligence manager not initialized');
 }
 })
 );

 // Process specification command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.processSpecification', async () => {
 const specManager = manager.getSpecificationManager();
 if (!specManager) {
 vscode.window.showErrorMessage('Specification manager not initialized');
 return;
 }

 const editor = vscode.window.activeTextEditor;
 if (!editor) {
 vscode.window.showErrorMessage('No active editor');
 return;
 }

 const text = editor.document.getText();
 await specManager.processSpecification(text, { dryRun: false });
 })
 );

 // Process specification file command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.processSpecificationFile', async (uri?: vscode.Uri) => {
 const specManager = manager.getSpecificationManager();
 if (!specManager) {
 vscode.window.showErrorMessage('Specification manager not initialized');
 return;
 }

 let filePath: string;
 if (uri) {
 filePath = uri.fsPath;
 } else {
 const selected = await vscode.window.showOpenDialog({
 canSelectFiles: true,
 canSelectFolders: false,
 canSelectMany: false,
 filters: {
 'Markdown': ['md'],
 'Text': ['txt'],
 'All Files': ['*']
 }
 });

 if (!selected || selected.length === 0) {
 return;
 }

 filePath = selected[0].fsPath;
 }

 await specManager.processSpecificationFile(filePath, { dryRun: false });
 })
 );

 // Parse specification command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.parseSpecification', async () => {
 const specManager = manager.getSpecificationManager();
 if (!specManager) {
 vscode.window.showErrorMessage('Specification manager not initialized');
 return;
 }

 const editor = vscode.window.activeTextEditor;
 if (!editor) {
 vscode.window.showErrorMessage('No active editor');
 return;
 }

 const text = editor.document.getText();
 const spec = await specManager.parseSpecification(text);
 await specManager.showSpecificationSummary(spec);
 })
 );

 // Show specification status command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showSpecificationStatus', () => {
 const specManager = manager.getSpecificationManager();
 if (!specManager) {
 vscode.window.showErrorMessage('Specification manager not initialized');
 return;
 }

 const status = specManager.getStatus();
 vscode.window.showInformationMessage(
 `Specification Status: ${status.state} (${status.progress}%)`
 );
 })
 );

 // Generate commit message command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.generateCommitMessage', async () => {
 const gitManager = manager.getGitManager();
 if (!gitManager) {
 vscode.window.showErrorMessage('Git manager not initialized');
 return;
 }

 await gitManager.showCommitMessagePicker();
 })
 );

 // Generate PR description command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.generatePRDescription', async () => {
 const gitManager = manager.getGitManager();
 if (!gitManager) {
 vscode.window.showErrorMessage('Git manager not initialized');
 return;
 }

 await gitManager.showPRDescription();
 })
 );

 // Analyze changes command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.analyzeChanges', async () => {
 const gitManager = manager.getGitManager();
 if (!gitManager) {
 vscode.window.showErrorMessage('Git manager not initialized');
 return;
 }

 await gitManager.showChangeAnalysis();
 })
 );
}

/**
 * Show welcome message to new users
 */
function showWelcomeMessage(context: vscode.ExtensionContext): void {
 const message = 'Welcome to Codelicious! Your AI coding assistant is ready.';
 const actions = ['Open Chat', 'Configure API Keys', 'Learn More'];

 vscode.window.showInformationMessage(message, ...actions).then(async (selection) => {
 switch (selection) {
 case 'Open Chat':
 await vscode.commands.executeCommand('codelicious.openChat');
 break;
 case 'Configure API Keys':
 await vscode.commands.executeCommand('codelicious.configureApiKeys');
 break;
 case 'Learn More':
 vscode.env.openExternal(vscode.Uri.parse('https://github.com/clay-good/codelicious'));
 break;
 }
 });
}

/**
 * Configure agent models
 */
async function configureAgentModels(): Promise<void> {
 const config = vscode.workspace.getConfiguration('codelicious.agents');

 // Step 1: Ask if user wants to use same model for all agents or configure per-agent
 const choice = await vscode.window.showQuickPick(
 [
 {
 label: '$(symbol-method) Use Same Model for All Agents',
 description: 'Simplest option - one model for all agents',
 value: 'same'
 },
 {
 label: '$(settings-gear) Configure Per-Agent Models',
 description: 'Advanced - different model for each agent',
 value: 'per-agent'
 },
 {
 label: '$(circle-slash) Use Automatic Routing',
 description: 'Let orchestrator choose best available model',
 value: 'auto'
 }
 ],
 {
 placeHolder: 'How would you like to configure agent models?',
 title: 'Agent Model Configuration'
 }
 );

 if (!choice) {
 return;
 }

 if (choice.value === 'auto') {
 // Clear all model settings
 await config.update('defaultModel', '', vscode.ConfigurationTarget.Global);
 await config.update('preFilter.model', '', vscode.ConfigurationTarget.Global);
 await config.update('codeGenerator.model', '', vscode.ConfigurationTarget.Global);
 await config.update('securityReviewer.model', '', vscode.ConfigurationTarget.Global);
 await config.update('qualityReviewer.model', '', vscode.ConfigurationTarget.Global);
 await config.update('testingValidator.model', '', vscode.ConfigurationTarget.Global);

 vscode.window.showInformationMessage(' Agent models configured to use automatic routing');
 return;
 }

 // Step 2: Get available models from user's API keys
 const modelOptions = [
 { label: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022', description: 'Best for code generation and security' },
 { label: 'Claude 3 Opus', value: 'claude-3-opus-20240229', description: 'Most capable, highest cost' },
 { label: 'Claude 3 Haiku', value: 'claude-3-haiku-20240307', description: 'Fastest, lowest cost' },
 { label: 'GPT-4o', value: 'gpt-4o', description: 'Latest OpenAI model, very capable' },
 { label: 'GPT-4o Mini', value: 'gpt-4o-mini', description: 'Fast and cost-effective' },
 { label: 'GPT-4 Turbo', value: 'gpt-4-turbo-preview', description: 'Previous generation, still powerful' },
 { label: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo', description: 'Fastest, lowest cost' },
 { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro', description: 'Google\'s latest model' },
 { label: 'Ollama Llama 3', value: 'ollama:llama3', description: 'Local model, free' },
 { label: 'Ollama CodeLlama', value: 'ollama:codellama', description: 'Local code model, free' }
 ];

 if (choice.value === 'same') {
 // Step 3a: Select one model for all agents
 const selectedModel = await vscode.window.showQuickPick(modelOptions, {
 placeHolder: 'Select model to use for all agents',
 title: 'Default Model for All Agents'
 });

 if (!selectedModel) {
 return;
 }

 // Save to settings
 await config.update('defaultModel', selectedModel.value, vscode.ConfigurationTarget.Global);

 vscode.window.showInformationMessage(` All agents configured to use: ${selectedModel.label}`);
 } else {
 // Step 3b: Configure per-agent models
 const agents = [
 { name: 'Pre-Filter Agent', key: 'preFilter.model', description: 'Optimizes prompts before sending to main AI' },
 { name: 'Code Generator', key: 'codeGenerator.model', description: 'Generates code from requirements' },
 { name: 'Security Reviewer', key: 'securityReviewer.model', description: 'Reviews code for security vulnerabilities' },
 { name: 'Quality Reviewer', key: 'qualityReviewer.model', description: 'Reviews code quality and best practices' },
 { name: 'Testing Validator', key: 'testingValidator.model', description: 'Generates and validates tests' }
 ];

 for (const agent of agents) {
 const selectedModel = await vscode.window.showQuickPick(
 [
 { label: '$(circle-slash) Use Default Model', value: '', description: 'Use the default model setting' },
 ...modelOptions
 ],
 {
 placeHolder: `Select model for ${agent.name}`,
 title: `${agent.name} - ${agent.description}`
 }
 );

 if (!selectedModel) {
 return; // User cancelled
 }

 await config.update(agent.key, selectedModel.value, vscode.ConfigurationTarget.Global);
 }

 vscode.window.showInformationMessage(' Agent models configured successfully!');
 }

 // Show summary
 const summary = [
 'Agent Model Configuration:',
 ` Default: ${config.get('defaultModel') || 'auto'}`,
 ` Pre-Filter: ${config.get('preFilter.model') || 'default'}`,
 ` Code Generator: ${config.get('codeGenerator.model') || 'default'}`,
 ` Security Reviewer: ${config.get('securityReviewer.model') || 'default'}`,
 ` Quality Reviewer: ${config.get('qualityReviewer.model') || 'default'}`,
 ` Testing Validator: ${config.get('testingValidator.model') || 'default'}`
 ].join('\n');

 logger.info(summary);
}

/**
 * Register pattern management commands
 */
function registerPatternCommands(
 context: vscode.ExtensionContext,
 manager: ExtensionManager
): void {
 // View learned patterns command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.viewLearnedPatterns', async () => {
 const learningManager = manager.getLearningManager();
 if (!learningManager) {
 vscode.window.showErrorMessage('Learning manager not initialized');
 return;
 }

 const patternLearner = (learningManager as any).patternLearner;
 const patterns = patternLearner.getPatterns({ minSuccessRate: 50 });

 if (patterns.length === 0) {
 vscode.window.showInformationMessage('No learned patterns yet. Keep coding and the system will learn!');
 return;
 }

 // Show patterns in quick pick
 interface PatternItem extends vscode.QuickPickItem {
 pattern: {
 name: string;
 description: string;
 successRate: number;
 usageCount: number;
 code: string;
 language: string;
 };
 }

 const items: PatternItem[] = patterns.map((p: PatternItem['pattern']) => ({
 label: `$(library) ${p.name}`,
 description: `Success: ${p.successRate.toFixed(0)}% | Used: ${p.usageCount}x`,
 detail: p.description,
 pattern: p
 }));

 const selected = await vscode.window.showQuickPick(items, {
 placeHolder: 'Select a pattern to view details',
 matchOnDescription: true,
 matchOnDetail: true
 });

 if (selected) {
 const doc = await vscode.workspace.openTextDocument({
 content: `# ${selected.pattern.name}\n\n${selected.pattern.description}\n\n\`\`\`${selected.pattern.language}\n${selected.pattern.code}\n\`\`\``,
 language: 'markdown'
 });
 await vscode.window.showTextDocument(doc);
 }
 })
 );

 // Optimize pattern cache command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.optimizePatternCache', async () => {
 const learningManager = manager.getLearningManager();
 if (!learningManager) {
 vscode.window.showErrorMessage('Learning manager not initialized');
 return;
 }

 await vscode.window.withProgress({
 location: vscode.ProgressLocation.Notification,
 title: 'Optimizing pattern cache...',
 cancellable: false
 }, async () => {
 await learningManager.optimizeCache();
 });

 vscode.window.showInformationMessage(' Pattern cache optimized successfully!');
 })
 );

 // Export patterns command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.exportPatterns', async () => {
 const learningManager = manager.getLearningManager();
 if (!learningManager) {
 vscode.window.showErrorMessage('Learning manager not initialized');
 return;
 }

 const patterns = await learningManager.exportPatternsForRAG();

 if (patterns.length === 0) {
 vscode.window.showInformationMessage('No patterns to export');
 return;
 }

 const uri = await vscode.window.showSaveDialog({
 defaultUri: vscode.Uri.file('codelicious-patterns.json'),
 filters: { 'JSON': ['json'] }
 });

 if (uri) {
 const fs = require('fs');
 fs.writeFileSync(uri.fsPath, JSON.stringify(patterns, null, 2));
 vscode.window.showInformationMessage(` Exported ${patterns.length} patterns to ${uri.fsPath}`);
 }
 })
 );

 // Trigger learning command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.triggerLearning', async () => {
 const learningManager = manager.getLearningManager();
 if (!learningManager) {
 vscode.window.showErrorMessage('Learning manager not initialized');
 return;
 }

 await vscode.window.withProgress({
 location: vscode.ProgressLocation.Notification,
 title: 'Learning from feedback...',
 cancellable: false
 }, async () => {
 const learnedCount = await learningManager.learn();
 vscode.window.showInformationMessage(` Learned ${learnedCount} new patterns!`);
 });
 })
 );

 // Show cache stats command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showCacheStats', async () => {
 const learningManager = manager.getLearningManager();
 if (!learningManager) {
 vscode.window.showErrorMessage('Learning manager not initialized');
 return;
 }

 const stats = learningManager.getCacheStats() as any; // Complex cache statistics structure

 if (!stats.available) {
 vscode.window.showInformationMessage('Pattern cache not available (requires embedding service)');
 return;
 }

 const message = [
 'Pattern Cache Statistics:',
 ` Memory: ${(stats.memorySize / 1024 / 1024).toFixed(2)} MB`,
 ` Disk: ${(stats.diskSize / 1024 / 1024).toFixed(2)} MB`,
 ` Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`,
 ` Evictions: ${stats.evictions}`,
 ` Patterns: ${stats.patternCount}`
 ].join('\n');

 vscode.window.showInformationMessage(message, { modal: true });
 })
 );

 // Quick actions menu command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showQuickActions', async () => {
 const quickActions = manager.getQuickActionsMenu();
 if (!quickActions) {
 vscode.window.showErrorMessage('Quick actions not initialized');
 return;
 }
 await quickActions.show();
 })
 );

 // Start tutorial command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.startTutorial', async () => {
 const tutorialSystem = manager.getTutorialSystem();
 if (!tutorialSystem) {
 vscode.window.showErrorMessage('Tutorial system not initialized');
 return;
 }
 await tutorialSystem.showTutorialMenu();
 })
 );

 // Show health status command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showHealthStatus', async () => {
 const orchestrator = manager.getModelOrchestrator();
 if (!orchestrator) {
 vscode.window.showErrorMessage('Model orchestrator not initialized');
 return;
 }

 const health = orchestrator.getCircuitBreakerHealth?.();
 if (!health) {
 vscode.window.showInformationMessage('Health monitoring not available');
 return;
 }

 const healthyCount = Array.isArray(health.healthy) ? health.healthy.length : 0;
 const unhealthyCount = Array.isArray(health.unhealthy) ? health.unhealthy.length : 0;
 const total = healthyCount + unhealthyCount;
 const healthPercentage = total > 0 ? (healthyCount / total * 100).toFixed(0) : '100';

 const message = [
 ' System Health Status',
 '',
 `Overall Health: ${healthPercentage}%`,
 `Healthy Services: ${healthyCount}`,
 `Unhealthy Services: ${unhealthyCount}`,
 '',
 unhealthyCount > 0 ? ' Some services are experiencing issues' : ' All systems operational'
 ].join('\n');

 vscode.window.showInformationMessage(message, { modal: true });
 })
 );

 // Show performance metrics command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showPerformanceMetrics', async () => {
 const analytics = manager.getAnalyticsManager();
 if (!analytics) {
 vscode.window.showErrorMessage('Analytics not initialized');
 return;
 }

 const summary = analytics.getSummary();
 const cacheManager = manager.getCacheManager();
 const cacheStats = cacheManager?.getStats() || { hits: 0, misses: 0 };
 const cacheHitRate = cacheStats.hits + cacheStats.misses > 0
 ? ((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100).toFixed(1)
 : '0';

 const message = [
 ' Performance Metrics',
 '',
 `Average Duration: ${Math.round(summary.performance.averageDuration || 0)}ms`,
 `Total Operations: ${summary.performance.totalOperations || 0}`,
 `Success Rate: ${(summary.performance.successRate * 100).toFixed(1)}%`,
 `Cache Hit Rate: ${cacheHitRate}%`,
 `Total Cost: $${(summary.cost.totalCost || 0).toFixed(2)}`
 ].join('\n');

 vscode.window.showInformationMessage(message, { modal: true });
 })
 );

 // Show activity log command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showActivityLog', async () => {
 const orchestrator = manager.getModelOrchestrator();
 if (!orchestrator) {
 vscode.window.showErrorMessage('Model orchestrator not initialized');
 return;
 }

 const queueStats = orchestrator.getRequestQueueStats?.() || {};
 const queueData = Object.values(queueStats)[0] as any || {
 queueSize: 0,
 activeRequests: 0,
 totalProcessed: 0,
 totalFailed: 0
 };

 const message = [
 ' Activity Log',
 '',
 `Active Requests: ${queueData.activeRequests || 0}`,
 `Queued Requests: ${queueData.queueSize || 0}`,
 `Total Processed: ${queueData.totalProcessed || 0}`,
 `Total Failed: ${queueData.totalFailed || 0}`
 ].join('\n');

 vscode.window.showInformationMessage(message, { modal: true });
 })
 );

 // Run configuration wizard command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.runConfigurationWizard', async () => {
 const wizard = manager.getConfigurationWizard();
 if (!wizard) {
 vscode.window.showErrorMessage('Configuration wizard not initialized');
 return;
 }
 await wizard.start();
 })
 );

 // MCP: List available tools command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.listMCPTools', async () => {
 const mcpRegistry = manager.getMCPRegistry();
 if (!mcpRegistry) {
 vscode.window.showErrorMessage('MCP Tool Registry not available');
 return;
 }

 const tools = mcpRegistry.getAvailableTools();
 if (tools.length === 0) {
 vscode.window.showInformationMessage('No MCP tools available. Make sure MCP server is running.');
 return;
 }

 // Group tools by category
 const byCategory: Record<string, any[]> = {};
 for (const tool of tools) {
 if (!byCategory[tool.category]) {
 byCategory[tool.category] = [];
 }
 byCategory[tool.category].push(tool);
 }

 // Create quick pick items
 const items = Object.entries(byCategory).flatMap(([category, categoryTools]) => [
 {
 label: `$(folder) ${category.toUpperCase()}`,
 kind: vscode.QuickPickItemKind.Separator
 },
 ...categoryTools.map(tool => ({
 label: `$(tools) ${tool.name}`,
 description: tool.description,
 detail: `Capabilities: ${tool.capabilities.join(', ')}`,
 tool
 }))
 ]);

 const selected = await vscode.window.showQuickPick(items, {
 placeHolder: 'Select a tool to view details',
 matchOnDescription: true,
 matchOnDetail: true
 });

 if (selected && 'tool' in selected) {
 const tool = selected.tool;
 const message = [
 `# ${tool.name}`,
 '',
 tool.description,
 '',
 `**Category:** ${tool.category}`,
 `**Version:** ${tool.version}`,
 `**Authentication:** ${tool.authentication.type}${tool.authentication.required ? ' (required)' : ''}`,
 '',
 `**Capabilities:**`,
 ...tool.capabilities.map((cap: string) => ` • ${cap}`),
 '',
 `**Parameters:** ${tool.parameters.length}`,
 ...tool.parameters.map((p: { name: string; type: string; required?: boolean; description: string }) =>
 ` • ${p.name} (${p.type})${p.required ? ' *required*' : ''}: ${p.description}`)
 ].join('\n');

 const doc = await vscode.workspace.openTextDocument({
 content: message,
 language: 'markdown'
 });
 await vscode.window.showTextDocument(doc);
 }
 })
 );

 // MCP: Show statistics command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.showMCPStats', async () => {
 const mcpRegistry = manager.getMCPRegistry();
 if (!mcpRegistry) {
 vscode.window.showErrorMessage('MCP Tool Registry not available');
 return;
 }

 const stats = mcpRegistry.getStatistics();
 const message = [
 ' MCP Tool Statistics',
 '',
 `Total Tools: ${stats.totalTools}`,
 `Total Invocations: ${stats.totalInvocations}`,
 `Success Rate: ${(stats.successRate * 100).toFixed(1)}%`,
 `Average Duration: ${Math.round(stats.averageDuration)}ms`,
 '',
 '**Tools by Category:**',
 ...Object.entries(stats.toolsByCategory).map(([cat, count]) => ` ${cat}: ${count}`),
 '',
 '**Most Used Tools:**',
 ...stats.mostUsedTools.slice(0, 5).map((t, i) => ` ${i + 1}. ${t.toolId} (${t.count} uses)`)
 ].join('\n');

 vscode.window.showInformationMessage(message, { modal: true });
 })
 );

 // MCP: Search tools command
 context.subscriptions.push(
 vscode.commands.registerCommand('codelicious.searchMCPTools', async () => {
 const mcpRegistry = manager.getMCPRegistry();
 if (!mcpRegistry) {
 vscode.window.showErrorMessage('MCP Tool Registry not available');
 return;
 }

 const query = await vscode.window.showInputBox({
 prompt: 'Search for MCP tools',
 placeHolder: 'e.g., database, api, docker, etc.'
 });

 if (!query) {
 return;
 }

 const tools = mcpRegistry.searchTools(query);
 if (tools.length === 0) {
 vscode.window.showInformationMessage(`No tools found matching "${query}"`);
 return;
 }

 const items = tools.map(tool => ({
 label: `$(tools) ${tool.name}`,
 description: tool.description,
 detail: `Category: ${tool.category} | Capabilities: ${tool.capabilities.join(', ')}`,
 tool
 }));

 const selected = await vscode.window.showQuickPick(items, {
 placeHolder: `Found ${tools.length} tools matching "${query}"`,
 matchOnDescription: true,
 matchOnDetail: true
 });

 if (selected) {
 vscode.window.showInformationMessage(`Selected: ${selected.tool.name}`);
 }
 })
 );
}

