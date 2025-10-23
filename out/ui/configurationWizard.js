"use strict";
/**
 * Smart Configuration Wizard - Intelligent setup assistant
 * UX: Guides users through optimal configuration based on their project
 *
 * Features:
 * - Project type detection
 * - Optimal settings recommendations
 * - Budget-based model selection
 * - Framework-specific configuration
 * - One-click setup
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
exports.ConfigurationWizard = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ConfigurationWizard');
class ConfigurationWizard {
    constructor(context, workspaceRoot) {
        this.context = context;
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Start the configuration wizard
    */
    async start() {
        // Welcome
        const proceed = await vscode.window.showInformationMessage(' Welcome to Codelicious! Let\'s get you set up with the optimal configuration for your project.', 'Get Started', 'Skip Setup');
        if (proceed !== 'Get Started') {
            return;
        }
        // Analyze project
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Analyzing your project...',
            cancellable: false
        }, async () => {
            await this.delay(1000); // Give user time to see the message
        });
        const analysis = await this.analyzeProject();
        // Show analysis results
        await this.showAnalysisResults(analysis);
        // Configure API keys
        await this.configureApiKeys(analysis);
        // Configure model preferences
        await this.configureModelPreferences(analysis);
        // Configure features
        await this.configureFeatures(analysis);
        // Complete
        await this.complete();
    }
    /**
    * Analyze the project
    */
    async analyzeProject() {
        const analysis = {
            type: 'unknown',
            languages: [],
            frameworks: [],
            hasTests: false,
            hasCI: false,
            estimatedSize: 'medium'
        };
        try {
            // Detect languages
            const files = await vscode.workspace.findFiles('**/*', '**/node_modules/**', 100);
            const extensions = new Set(files.map(f => path.extname(f.fsPath)));
            if (extensions.has('.ts') || extensions.has('.tsx')) {
                analysis.languages.push('TypeScript');
            }
            if (extensions.has('.js') || extensions.has('.jsx')) {
                analysis.languages.push('JavaScript');
            }
            if (extensions.has('.py')) {
                analysis.languages.push('Python');
            }
            if (extensions.has('.rs')) {
                analysis.languages.push('Rust');
            }
            if (extensions.has('.go')) {
                analysis.languages.push('Go');
            }
            // Detect package manager and frameworks
            const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                analysis.packageManager = 'npm';
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                // Detect frameworks
                const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
                if (deps['react'])
                    analysis.frameworks.push('React');
                if (deps['vue'])
                    analysis.frameworks.push('Vue');
                if (deps['@angular/core'])
                    analysis.frameworks.push('Angular');
                if (deps['next'])
                    analysis.frameworks.push('Next.js');
                if (deps['express'])
                    analysis.frameworks.push('Express');
                if (deps['nestjs'])
                    analysis.frameworks.push('NestJS');
                // Check for tests
                if (deps['jest'] || deps['mocha'] || deps['vitest']) {
                    analysis.hasTests = true;
                }
            }
            // Check for Python
            if (fs.existsSync(path.join(this.workspaceRoot, 'requirements.txt')) ||
                fs.existsSync(path.join(this.workspaceRoot, 'pyproject.toml'))) {
                analysis.packageManager = 'pip';
                // Check for frameworks
                const reqPath = path.join(this.workspaceRoot, 'requirements.txt');
                if (fs.existsSync(reqPath)) {
                    const reqs = fs.readFileSync(reqPath, 'utf-8');
                    if (reqs.includes('django'))
                        analysis.frameworks.push('Django');
                    if (reqs.includes('flask'))
                        analysis.frameworks.push('Flask');
                    if (reqs.includes('fastapi'))
                        analysis.frameworks.push('FastAPI');
                    if (reqs.includes('pytest'))
                        analysis.hasTests = true;
                }
            }
            // Check for CI
            analysis.hasCI = fs.existsSync(path.join(this.workspaceRoot, '.github/workflows')) ||
                fs.existsSync(path.join(this.workspaceRoot, '.gitlab-ci.yml')) ||
                fs.existsSync(path.join(this.workspaceRoot, '.circleci'));
            // Determine project type
            if (analysis.frameworks.some(f => ['React', 'Vue', 'Angular', 'Next.js'].includes(f))) {
                analysis.type = 'web';
            }
            else if (analysis.frameworks.some(f => ['Express', 'NestJS', 'Django', 'Flask', 'FastAPI'].includes(f))) {
                analysis.type = 'backend';
            }
            else if (analysis.languages.length > 0) {
                analysis.type = 'library';
            }
            // Estimate size
            const fileCount = files.length;
            if (fileCount < 50) {
                analysis.estimatedSize = 'small';
            }
            else if (fileCount < 200) {
                analysis.estimatedSize = 'medium';
            }
            else {
                analysis.estimatedSize = 'large';
            }
        }
        catch (error) {
            logger.error('Failed to analyze project:', error);
        }
        return analysis;
    }
    /**
    * Show analysis results
    */
    async showAnalysisResults(analysis) {
        const details = [
            `**Project Type:** ${analysis.type}`,
            `**Languages:** ${analysis.languages.join(', ') || 'None detected'}`,
            `**Frameworks:** ${analysis.frameworks.join(', ') || 'None detected'}`,
            `**Size:** ${analysis.estimatedSize}`,
            `**Tests:** ${analysis.hasTests ? 'Yes' : 'No'}`,
            `**CI/CD:** ${analysis.hasCI ? 'Yes' : 'No'}`
        ].join('\n');
        await vscode.window.showInformationMessage(`Project Analysis Complete!\n\n${details}`, { modal: true }, 'Continue');
    }
    /**
    * Configure API keys
    */
    async configureApiKeys(analysis) {
        const recommendation = this.getModelRecommendation(analysis);
        const message = `Based on your ${analysis.type} project, we recommend:\n\n` +
            `**${recommendation.model}** (${recommendation.provider})\n\n` +
            `${recommendation.reasoning}\n\n` +
            `Estimated monthly cost: $${recommendation.estimatedMonthlyCost}\n\n` +
            `Would you like to configure this provider now?`;
        const action = await vscode.window.showInformationMessage(message, { modal: true }, 'Configure Now', 'Choose Different Provider', 'Skip');
        if (action === 'Configure Now') {
            await vscode.commands.executeCommand('codelicious.configureApiKeys');
        }
        else if (action === 'Choose Different Provider') {
            await this.showProviderSelection();
        }
    }
    /**
    * Get model recommendation
    */
    getModelRecommendation(analysis) {
        // For large projects or complex types, recommend Claude
        if (analysis.estimatedSize === 'large' || analysis.type === 'backend') {
            return {
                provider: 'Claude',
                model: 'claude-3-5-sonnet-20241022',
                reasoning: 'Claude Sonnet excels at complex reasoning and large codebases. Perfect for backend systems and large projects.',
                estimatedMonthlyCost: 15
            };
        }
        // For web projects, recommend GPT-4
        if (analysis.type === 'web') {
            return {
                provider: 'OpenAI',
                model: 'gpt-4-turbo-preview',
                reasoning: 'GPT-4 Turbo is excellent for web development with great React/Vue/Angular knowledge.',
                estimatedMonthlyCost: 12
            };
        }
        // For small projects, recommend Gemini Flash
        if (analysis.estimatedSize === 'small') {
            return {
                provider: 'Gemini',
                model: 'gemini-1.5-flash',
                reasoning: 'Gemini Flash is extremely fast and cost-effective, perfect for smaller projects.',
                estimatedMonthlyCost: 3
            };
        }
        // Default to Claude
        return {
            provider: 'Claude',
            model: 'claude-3-5-sonnet-20241022',
            reasoning: 'Claude Sonnet offers the best balance of capability and cost for most projects.',
            estimatedMonthlyCost: 10
        };
    }
    /**
    * Show provider selection
    */
    async showProviderSelection() {
        const providers = [
            {
                label: '$(sparkle) Claude (Anthropic)',
                description: 'Best for complex reasoning • $3-15/month',
                detail: 'Recommended for large projects and backend systems'
            },
            {
                label: '$(robot) OpenAI (GPT-4)',
                description: 'Great all-around • $10-20/month',
                detail: 'Excellent for web development and general tasks'
            },
            {
                label: '$(zap) Gemini (Google)',
                description: 'Fast and cheap • $2-8/month',
                detail: 'Perfect for small projects and rapid iteration'
            },
            {
                label: '$(server) Ollama (Local)',
                description: 'Free, runs locally • $0/month',
                detail: 'Privacy-focused, no API costs, requires local setup'
            }
        ];
        const selected = await vscode.window.showQuickPick(providers, {
            placeHolder: 'Select your preferred AI provider...',
            matchOnDescription: true,
            matchOnDetail: true
        });
        if (selected) {
            await vscode.commands.executeCommand('codelicious.configureApiKeys');
        }
    }
    /**
    * Configure model preferences
    */
    async configureModelPreferences(analysis) {
        const budget = await vscode.window.showQuickPick([
            { label: 'Budget-Conscious', description: '$5-10/month', value: 'low' },
            { label: 'Balanced', description: '$10-20/month', value: 'medium' },
            { label: 'Performance-Focused', description: '$20-50/month', value: 'high' }
        ], {
            placeHolder: 'What\'s your monthly AI budget?'
        });
        if (budget) {
            // Set cost limit based on budget
            const costLimits = { low: 10, medium: 20, high: 50 };
            const config = vscode.workspace.getConfiguration('codelicious');
            await config.update('models.costLimit', costLimits[budget.value], true);
        }
    }
    /**
    * Configure features
    */
    async configureFeatures(analysis) {
        const features = await vscode.window.showQuickPick([
            { label: '$(check) Enable Autonomous Builder', picked: true },
            { label: '$(check) Enable Auto Test Generation', picked: analysis.hasTests },
            { label: '$(check) Enable Code Review', picked: true },
            { label: '$(check) Enable Git Integration', picked: analysis.hasCI },
            { label: '$(check) Enable Cost Tracking', picked: true }
        ], {
            placeHolder: 'Select features to enable...',
            canPickMany: true
        });
        // Apply feature configuration
        // (This would update settings based on selections)
    }
    /**
    * Complete setup
    */
    async complete() {
        await vscode.window.showInformationMessage('Setup Complete!\n\nCodelicious is now configured and ready to use.\n\nTry opening the chat (Cmd+Shift+L) or run a tutorial to learn more!', 'Start Tutorial', 'Open Chat', 'Close').then(action => {
            if (action === 'Start Tutorial') {
                vscode.commands.executeCommand('codelicious.startTutorial');
            }
            else if (action === 'Open Chat') {
                vscode.commands.executeCommand('codelicious.openChat');
            }
        });
        // Mark wizard as completed
        this.context.globalState.update('codelicious.wizardCompleted', true);
    }
    /**
    * Check if wizard should run
    */
    static shouldRun(context) {
        return !context.globalState.get('codelicious.wizardCompleted', false);
    }
    /**
    * Delay helper
    */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ConfigurationWizard = ConfigurationWizard;
//# sourceMappingURL=configurationWizard.js.map