#!/usr/bin/env node
"use strict";
/**
 * CLI Interface for Codelicious
 *
 * Provides command-line interface for:
 * - Code generation
 * - Project analysis
 * - Autonomous building
 * - RAG queries
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
exports.CodeliciousCLI = void 0;
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('CodeliciousCLI');
class CodeliciousCLI {
    constructor() {
        this.program = new commander_1.Command();
        this.setupCommands();
    }
    /**
    * Setup CLI commands
    */
    setupCommands() {
        this.program
            .name('codelicious')
            .description('AI-powered code generation and analysis')
            .version('1.0.0');
        // Generate command
        this.program
            .command('generate <prompt>')
            .description('Generate code from natural language prompt')
            .option('-m, --model <model>', 'AI model to use', 'claude-sonnet-4')
            .option('-o, --output <path>', 'Output file path')
            .option('-v, --verbose', 'Verbose output')
            .action((prompt, options) => this.handleGenerate(prompt, options));
        // Analyze command
        this.program
            .command('analyze <path>')
            .description('Analyze codebase and provide insights')
            .option('-d, --depth <number>', 'Analysis depth', '3')
            .option('-f, --format <format>', 'Output format (json|text)', 'text')
            .action((path, options) => this.handleAnalyze(path, options));
        // Build command
        this.program
            .command('build <spec>')
            .description('Autonomously build project from specification')
            .option('-m, --model <model>', 'AI model to use', 'claude-sonnet-4')
            .option('-w, --watch', 'Watch mode - rebuild on changes')
            .option('-y, --yes', 'Auto-approve all changes')
            .action((spec, options) => this.handleBuild(spec, options));
        // Query command
        this.program
            .command('query <question>')
            .description('Query codebase using RAG')
            .option('-n, --results <number>', 'Number of results', '5')
            .option('-c, --context', 'Include full context')
            .action((question, options) => this.handleQuery(question, options));
        // Index command
        this.program
            .command('index [path]')
            .description('Index codebase for semantic search')
            .option('-f, --force', 'Force re-indexing')
            .option('-w, --watch', 'Watch for changes')
            .action((path, options) => this.handleIndex(path, options));
        // Test command
        this.program
            .command('test <path>')
            .description('Generate and run tests')
            .option('-c, --coverage', 'Generate coverage report')
            .option('-w, --watch', 'Watch mode')
            .action((path, options) => this.handleTest(path, options));
        // Config command
        this.program
            .command('config <key> [value]')
            .description('Get or set configuration')
            .action((key, value) => this.handleConfig(key, value));
        // Interactive mode
        this.program
            .command('interactive')
            .alias('i')
            .description('Start interactive TUI mode')
            .action(() => this.handleInteractive());
    }
    /**
    * Handle generate command
    */
    async handleGenerate(prompt, options) {
        logger.info(`Generating code with ${options.model}...`);
        logger.info(`Prompt: ${prompt}`);
        // This would call the actual code generation service
        const code = await this.generateCode(prompt, options);
        if (options.output) {
            fs.writeFileSync(options.output, code);
            logger.info(`Code written to ${options.output}`);
        }
        else {
            logger.info('\n--- Generated Code ---\n');
            logger.info(code);
        }
    }
    /**
    * Handle analyze command
    */
    async handleAnalyze(targetPath, options) {
        logger.info(`Analyzing ${targetPath}...`);
        const analysis = await this.analyzeCode(targetPath, options);
        if (options.format === 'json') {
            logger.info(JSON.stringify(analysis, null, 2));
        }
        else {
            this.printAnalysis(analysis);
        }
    }
    /**
    * Handle build command
    */
    async handleBuild(spec, options) {
        logger.info(`Building project from specification...`);
        logger.info(`Spec: ${spec}`);
        // This would call the autonomous builder
        await this.buildProject(spec, options);
    }
    /**
    * Handle query command
    */
    async handleQuery(question, options) {
        logger.info(`Querying codebase...`);
        logger.info(`Question: ${question}`);
        const results = await this.queryCodebase(question, options);
        logger.info(`\nFound ${results.length} results:\n`);
        results.forEach((result, i) => {
            logger.info(`${i + 1}. ${result.file}:${result.line}`);
            logger.info(` ${result.snippet}`);
            logger.info(` Relevance: ${(result.score * 100).toFixed(1)}%\n`);
        });
    }
    /**
    * Handle index command
    */
    async handleIndex(targetPath = '.', options) {
        logger.info(`Indexing ${targetPath}...`);
        await this.indexCodebase(targetPath, options);
        logger.info('Indexing complete!');
    }
    /**
    * Handle test command
    */
    async handleTest(targetPath, options) {
        logger.info(`Generating and running tests for ${targetPath}...`);
        await this.runTests(targetPath, options);
    }
    /**
    * Handle config command
    */
    handleConfig(key, value) {
        if (value) {
            logger.info(`Setting ${key} = ${value}`);
            this.setConfig(key, value);
        }
        else {
            const currentValue = this.getConfig(key);
            logger.info(`${key} = ${currentValue}`);
        }
    }
    /**
    * Handle interactive mode
    */
    async handleInteractive() {
        logger.info('Starting interactive TUI mode...');
        logger.info('(TUI implementation would go here)');
        // This would launch the TUI
        // For now, just show a message
        logger.info('\nTip: Use VS Code extension for full interactive experience');
    }
    /**
    * Parse and execute CLI
    */
    async run(argv) {
        await this.program.parseAsync(argv);
    }
    // Mock implementations (would be replaced with actual services)
    async generateCode(prompt, options) {
        return `// Generated code for: ${prompt}\n// Model: ${options.model}\n\nfunction example() {\n // Implementation here\n}`;
    }
    async analyzeCode(path, options) {
        return {
            files: 10,
            lines: 1000,
            complexity: 'medium',
            issues: []
        };
    }
    async buildProject(spec, options) {
        logger.info('Building project...');
    }
    async queryCodebase(question, options) {
        return [
            { file: 'src/example.ts', line: 42, snippet: 'function example() {...}', score: 0.95 }
        ];
    }
    async indexCodebase(path, options) {
        logger.info('Indexing...');
    }
    async runTests(path, options) {
        logger.info('Running tests...');
    }
    setConfig(key, value) {
        // Would save to config file
    }
    getConfig(key) {
        // Would read from config file
        return 'value';
    }
    printAnalysis(analysis) {
        logger.info('\nAnalysis Results:\n');
        logger.info(`Files: ${analysis.files}`);
        logger.info(`Lines: ${analysis.lines}`);
        logger.info(`Complexity: ${analysis.complexity}`);
        logger.info(`Issues: ${analysis.issues.length}`);
    }
}
exports.CodeliciousCLI = CodeliciousCLI;
// CLI entry point
if (require.main === module) {
    const cli = new CodeliciousCLI();
    cli.run(process.argv).catch(error => {
        logger.error('Error', error);
        process.exit(1);
    });
}
//# sourceMappingURL=cliInterface.js.map