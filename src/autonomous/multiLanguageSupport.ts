/**
 * Multi-Language Support for Autonomous Building
 *
 * Supports:
 * - TypeScript/JavaScript (existing)
 * - Python
 * - Go
 * - Rust
 *
 * Features:
 * - Language-specific error parsing
 * - Language-specific compilation
 * - Language-specific fix generation
 * - Language-specific testing
 */

import { ExecutionEngine } from '../core/executionEngine';
import { GeneratedCode } from './contextAwareCodeGenerator';
import { DetectedError, Language } from './errorDetector';

export interface LanguageConfig {
 language: Language;
 fileExtensions: string[];
 compiler?: string;
 compileCommand: (file: string) => string;
 testCommand: (file: string) => string;
 lintCommand?: (file: string) => string;
 formatCommand?: (file: string) => string;
 packageManager?: string;
 installCommand: (packages: string[]) => string;
 errorPatterns: RegExp[];
}

export interface CompilationResult {
 success: boolean;
 output: string;
 errors: DetectedError[];
 warnings: DetectedError[];
 duration: number;
}

export class MultiLanguageSupport {
 private languageConfigs: Map<Language, LanguageConfig> = new Map();

 constructor(private executionEngine: ExecutionEngine) {
 this.initializeLanguageConfigs();
 }

 /**
 * Compile code for any supported language
 */
 async compile(
 file: GeneratedCode,
 workspaceRoot: string
 ): Promise<CompilationResult> {
 const language = this.detectLanguage(file.filePath);
 const config = this.languageConfigs.get(language);

 if (!config) {
 return {
 success: false,
 output: `Unsupported language: ${language}`,
 errors: [],
 warnings: [],
 duration: 0
 };
 }

 const startTime = Date.now();
 const command = config.compileCommand(file.filePath);

 try {
 const result = await this.executionEngine.execute(command, {
 workingDirectory: workspaceRoot,
 timeout: 60000
 });

 const errors = this.parseErrors(result.stderr || result.stdout, config);
 const warnings = errors.filter(e => e.severity === 'warning');
 const actualErrors = errors.filter(e => e.severity === 'error');

 return {
 success: result.success && actualErrors.length === 0,
 output: result.stdout,
 errors: actualErrors,
 warnings,
 duration: Date.now() - startTime
 };
 } catch (error) {
 return {
 success: false,
 output: String(error),
 errors: [],
 warnings: [],
 duration: Date.now() - startTime
 };
 }
 }

 /**
 * Run tests for any supported language
 */
 async runTests(
 file: GeneratedCode,
 workspaceRoot: string
 ): Promise<{ success: boolean; output: string }> {
 const language = this.detectLanguage(file.filePath);
 const config = this.languageConfigs.get(language);

 if (!config) {
 return { success: false, output: `Unsupported language: ${language}` };
 }

 const command = config.testCommand(file.filePath);

 try {
 const result = await this.executionEngine.execute(command, {
 workingDirectory: workspaceRoot,
 timeout: 120000
 });

 return {
 success: result.success,
 output: result.stdout || result.stderr
 };
 } catch (error) {
 return { success: false, output: String(error) };
 }
 }

 /**
 * Install dependencies for any supported language
 */
 async installDependencies(
 language: Language,
 packages: string[],
 workspaceRoot: string
 ): Promise<{ success: boolean; output: string }> {
 const config = this.languageConfigs.get(language);

 if (!config || !config.packageManager) {
 return { success: false, output: `No package manager for ${language}` };
 }

 const command = config.installCommand(packages);

 try {
 const result = await this.executionEngine.execute(command, {
 workingDirectory: workspaceRoot,
 timeout: 300000 // 5 minutes for package installation
 });

 return {
 success: result.success,
 output: result.stdout || result.stderr
 };
 } catch (error) {
 return { success: false, output: String(error) };
 }
 }

 /**
 * Lint code for any supported language
 */
 async lint(
 file: GeneratedCode,
 workspaceRoot: string
 ): Promise<{ success: boolean; output: string; issues: DetectedError[] }> {
 const language = this.detectLanguage(file.filePath);
 const config = this.languageConfigs.get(language);

 if (!config || !config.lintCommand) {
 return { success: true, output: 'No linter configured', issues: [] };
 }

 const command = config.lintCommand(file.filePath);

 try {
 const result = await this.executionEngine.execute(command, {
 workingDirectory: workspaceRoot,
 timeout: 60000
 });

 const issues = this.parseErrors(result.stdout || result.stderr, config);

 return {
 success: result.success,
 output: result.stdout || result.stderr,
 issues
 };
 } catch (error) {
 return { success: false, output: String(error), issues: [] };
 }
 }

 /**
 * Format code for any supported language
 */
 async format(
 file: GeneratedCode,
 workspaceRoot: string
 ): Promise<{ success: boolean; formattedContent?: string }> {
 const language = this.detectLanguage(file.filePath);
 const config = this.languageConfigs.get(language);

 if (!config || !config.formatCommand) {
 return { success: true }; // No formatter, that's okay
 }

 const command = config.formatCommand(file.filePath);

 try {
 const result = await this.executionEngine.execute(command, {
 workingDirectory: workspaceRoot,
 timeout: 30000
 });

 return {
 success: result.success,
 formattedContent: result.stdout
 };
 } catch (error) {
 return { success: false };
 }
 }

 /**
 * Detect language from file path
 */
 private detectLanguage(filePath: string): Language {
 if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
 if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
 if (filePath.endsWith('.py')) return 'python';
 if (filePath.endsWith('.go')) return 'go';
 if (filePath.endsWith('.rs')) return 'rust';
 return 'other';
 }

 /**
 * Parse errors from output
 */
 private parseErrors(output: string, config: LanguageConfig): DetectedError[] {
 const errors: DetectedError[] = [];

 for (const pattern of config.errorPatterns) {
 const matches = output.matchAll(pattern);
 for (const match of matches) {
 // Pattern-specific parsing would go here
 // For now, create basic error
 errors.push({
 id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
 type: 'other',
 severity: 'error',
 language: config.language,
 file: '',
 message: match[0],
 context: {
 surroundingCode: '',
 imports: [],
 exports: [],
 variables: [],
 functions: [],
 classes: [],
 dependencies: []
 },
 suggestedFixes: [],
 relatedErrors: [],
 confidence: 0.7
 });
 }
 }

 return errors;
 }

 /**
 * Initialize language configurations
 */
 private initializeLanguageConfigs(): void {
 // TypeScript
 this.languageConfigs.set('typescript', {
 language: 'typescript',
 fileExtensions: ['.ts', '.tsx'],
 compiler: 'tsc',
 compileCommand: (file) => `npx tsc --noEmit ${file}`,
 testCommand: (file) => `npm test -- ${file}`,
 lintCommand: (file) => `npx eslint ${file}`,
 formatCommand: (file) => `npx prettier --write ${file}`,
 packageManager: 'npm',
 installCommand: (packages) => `npm install ${packages.join(' ')}`,
 errorPatterns: [
 /(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)/g
 ]
 });

 // JavaScript
 this.languageConfigs.set('javascript', {
 language: 'javascript',
 fileExtensions: ['.js', '.jsx'],
 compileCommand: (file) => `node --check ${file}`,
 testCommand: (file) => `npm test -- ${file}`,
 lintCommand: (file) => `npx eslint ${file}`,
 formatCommand: (file) => `npx prettier --write ${file}`,
 packageManager: 'npm',
 installCommand: (packages) => `npm install ${packages.join(' ')}`,
 errorPatterns: [
 /(.+?):(\d+)\n(.+)/g
 ]
 });

 // Python
 this.languageConfigs.set('python', {
 language: 'python',
 fileExtensions: ['.py'],
 compiler: 'python',
 compileCommand: (file) => `python -m py_compile ${file}`,
 testCommand: (file) => `python -m pytest ${file}`,
 lintCommand: (file) => `python -m pylint ${file}`,
 formatCommand: (file) => `python -m black ${file}`,
 packageManager: 'pip',
 installCommand: (packages) => `pip install ${packages.join(' ')}`,
 errorPatterns: [
 /File "(.+?)", line (\d+).*\n.*\n(\w+Error): (.+)/g,
 /(.+?):(\d+):(\d+): (.+)/g
 ]
 });

 // Go
 this.languageConfigs.set('go', {
 language: 'go',
 fileExtensions: ['.go'],
 compiler: 'go',
 compileCommand: (file) => `go build ${file}`,
 testCommand: (file) => `go test ${file}`,
 lintCommand: (file) => `golint ${file}`,
 formatCommand: (file) => `gofmt -w ${file}`,
 packageManager: 'go',
 installCommand: (packages) => `go get ${packages.join(' ')}`,
 errorPatterns: [
 /(.+?):(\d+):(\d+): (.+)/g,
 /# (.+?)\n(.+?):(\d+):(\d+): (.+)/g
 ]
 });

 // Rust
 this.languageConfigs.set('rust', {
 language: 'rust',
 fileExtensions: ['.rs'],
 compiler: 'rustc',
 compileCommand: (file) => `rustc --crate-type lib ${file}`,
 testCommand: (file) => `cargo test`,
 lintCommand: (file) => `cargo clippy -- -D warnings`,
 formatCommand: (file) => `rustfmt ${file}`,
 packageManager: 'cargo',
 installCommand: (packages) => `cargo add ${packages.join(' ')}`,
 errorPatterns: [
 /error\[E(\d+)\]: (.+)\n\s+--> (.+?):(\d+):(\d+)/g,
 /warning: (.+)\n\s+--> (.+?):(\d+):(\d+)/g
 ]
 });
 }

 /**
 * Get language config
 */
 getLanguageConfig(language: Language): LanguageConfig | undefined {
 return this.languageConfigs.get(language);
 }

 /**
 * Check if language is supported
 */
 isLanguageSupported(language: Language): boolean {
 return this.languageConfigs.has(language);
 }

 /**
 * Get all supported languages
 */
 getSupportedLanguages(): Language[] {
 return Array.from(this.languageConfigs.keys());
 }
}

