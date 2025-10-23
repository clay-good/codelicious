/**
 * Interactive Tutorial System - Guided onboarding for new users
 * UX: Step-by-step tutorials with progress tracking
 *
 * Features:
 * - Multiple tutorial tracks
 * - Progress tracking
 * - Interactive steps
 * - Contextual help
 * - Skip/resume capability
 */

import * as vscode from 'vscode';

export interface TutorialStep {
 id: string;
 title: string;
 description: string;
 instructions: string;
 command?: string;
 validation?: () => Promise<boolean>;
 hint?: string;
}

export interface Tutorial {
 id: string;
 title: string;
 description: string;
 icon: string;
 estimatedTime: string;
 difficulty: 'beginner' | 'intermediate' | 'advanced';
 steps: TutorialStep[];
}

export class TutorialSystem {
 private currentTutorial?: Tutorial;
 private currentStepIndex: number = 0;
 private completedTutorials: Set<string> = new Set();
 private tutorialProgress: Map<string, number> = new Map();

 private readonly tutorials: Tutorial[] = [
 {
 id: 'getting-started',
 title: 'Getting Started with Codelicious',
 description: 'Learn the basics of using Codelicious',
 icon: '$(rocket)',
 estimatedTime: '5 minutes',
 difficulty: 'beginner',
 steps: [
 {
 id: 'welcome',
 title: 'Welcome to Codelicious!',
 description: 'Your AI-powered development assistant',
 instructions: `Welcome! Codelicious is a revolutionary AI platform that helps you:
• Write code faster with AI assistance
• Generate tests automatically
• Review code quality
• Build entire features autonomously

Let's get you set up!`,
 hint: 'Click "Next" to continue'
 },
 {
 id: 'configure-keys',
 title: 'Configure API Keys',
 description: 'Set up your AI provider',
 instructions: `To use Codelicious, you need to configure at least one AI provider.

Supported providers:
• Claude (Anthropic) - Best for complex reasoning
• OpenAI (GPT-4) - Great all-around performance
• Gemini (Google) - Fast and cost-effective
• Ollama - Free local models

Click the button below to configure your API keys.`,
 command: 'codelicious.configureApiKeys',
 hint: 'You can always change this later in settings'
 },
 {
 id: 'open-chat',
 title: 'Open the Chat Interface',
 description: 'Start your first conversation',
 instructions: `The chat interface is your main way to interact with AI.

Try opening it now using:
• Click the Codelicious icon in the sidebar
• Or press Cmd+Shift+L (Ctrl+Shift+L on Windows)

Once open, try asking: "What does this project do?"`,
 command: 'codelicious.openChat',
 validation: async () => {
 // Check if chat view is visible
 return true; // Simplified for now
 },
 hint: 'Look for the Codelicious icon in the left sidebar'
 },
 {
 id: 'select-model',
 title: 'Choose Your AI Model',
 description: 'Select the best model for your task',
 instructions: `Different AI models have different strengths:

• Claude Sonnet - Best for complex code
• GPT-4 Turbo - Fast and capable
• Gemini Flash - Extremely fast and cheap

Click the model selector in the chat header to try different models.`,
 hint: 'The model selector shows the current model and provider'
 },
 {
 id: 'first-query',
 title: 'Ask Your First Question',
 description: 'Try the AI assistant',
 instructions: `Now let's try asking the AI a question!

Good first questions:
• "Explain this file to me"
• "Add error handling to this function"
• "Write tests for this class"
• "Find potential bugs in this code"

The AI has full context of your codebase!`,
 hint: 'The AI can see your entire project structure'
 },
 {
 id: 'complete',
 title: 'You\'re All Set!',
 description: 'Start building with AI',
 instructions: `Congratulations! You've completed the getting started tutorial.

Next steps:
• Try the "Autonomous Build" tutorial
• Explore the Quick Actions menu (click the Codelicious icon in status bar)
• Check out the Analytics view for cost tracking

Happy coding! `,
 hint: 'You can restart this tutorial anytime from Help menu'
 }
 ]
 },
 {
 id: 'autonomous-build',
 title: 'Autonomous Feature Building',
 description: 'Learn to build entire features with AI',
 icon: '$(rocket)',
 estimatedTime: '10 minutes',
 difficulty: 'intermediate',
 steps: [
 {
 id: 'intro',
 title: 'Autonomous Builder Overview',
 description: 'Build features from specifications',
 instructions: `The Autonomous Builder can create entire features from a simple description.

It will:
1. Parse your requirements
2. Plan the implementation
3. Generate code across multiple files
4. Create tests
5. Validate everything works

Let's try it!`,
 hint: 'This is one of Codelicious\'s most powerful features'
 },
 {
 id: 'write-spec',
 title: 'Write a Specification',
 description: 'Describe what you want to build',
 instructions: `Create a new file called "feature-spec.md" with this content:

\`\`\`markdown
# User Profile Feature

## Requirements
- Add user profile page
- Show user name, email, avatar
- Allow editing profile
- Save changes to database

## Technical Details
- Use React components
- REST API endpoints
- Form validation
\`\`\`

Then run: Codelicious: Process Specification`,
 command: 'codelicious.processSpecification',
 hint: 'The AI will analyze and implement this specification'
 },
 {
 id: 'review-plan',
 title: 'Review the Implementation Plan',
 description: 'See what the AI will build',
 instructions: `The AI has created a detailed plan showing:
• Files to create/modify
• Components to build
• Tests to write
• Dependencies needed

Review the plan and approve it to continue.`,
 hint: 'You can modify the plan before approving'
 },
 {
 id: 'watch-build',
 title: 'Watch the Build Process',
 description: 'See AI build your feature',
 instructions: `The AI is now:
• Generating code
• Creating tests
• Running validation
• Fixing any issues

Watch the progress in the output panel.`,
 hint: 'This usually takes 2-5 minutes depending on complexity'
 },
 {
 id: 'review-code',
 title: 'Review Generated Code',
 description: 'Check the implementation',
 instructions: `The build is complete! Now:
1. Review the generated code
2. Run the tests
3. Try the feature
4. Make any adjustments

The AI has created production-ready code!`,
 hint: 'You can ask the AI to make changes if needed'
 }
 ]
 },
 {
 id: 'testing-workflow',
 title: 'Automated Testing Workflow',
 description: 'Master AI-powered testing',
 icon: '$(beaker)',
 estimatedTime: '8 minutes',
 difficulty: 'intermediate',
 steps: [
 {
 id: 'intro',
 title: 'Testing with Codelicious',
 description: 'Automated test generation and fixing',
 instructions: `Codelicious can:
• Generate comprehensive tests
• Analyze test coverage
• Fix failing tests automatically
• Improve test quality

Let's explore these features!`,
 hint: 'Testing is crucial for code quality'
 },
 {
 id: 'generate-tests',
 title: 'Generate Tests',
 description: 'Create tests for your code',
 instructions: `Open any source file and run:
Codelicious: Generate Tests for Current File

The AI will:
• Analyze your code
• Identify test cases
• Generate comprehensive tests
• Match your existing test patterns`,
 command: 'codelicious.generateTests',
 hint: 'Tests are generated in the __tests__ directory'
 },
 {
 id: 'run-tests',
 title: 'Run Tests',
 description: 'Execute your test suite',
 instructions: `Run all tests with:
Codelicious: Run All Tests

You'll see:
• Test results
• Coverage metrics
• Failed tests (if any)
• Performance stats`,
 command: 'codelicious.runTests',
 hint: 'Results appear in the output panel'
 },
 {
 id: 'fix-tests',
 title: 'Fix Failing Tests',
 description: 'Automatically fix test failures',
 instructions: `If any tests fail, run:
Codelicious: Fix Failing Tests

The AI will:
• Analyze the failures
• Identify root causes
• Generate fixes
• Validate the fixes work`,
 command: 'codelicious.fixFailingTests',
 hint: 'The AI learns from your codebase patterns'
 },
 {
 id: 'coverage',
 title: 'Analyze Coverage',
 description: 'Find gaps in test coverage',
 instructions: `Run coverage analysis:
Codelicious: Analyze Test Coverage

You'll see:
• Coverage percentage
• Uncovered lines
• Missing test cases
• Recommendations`,
 hint: 'Aim for 80%+ coverage on critical code'
 }
 ]
 }
 ];

 constructor(private context: vscode.ExtensionContext) {
 this.loadProgress();
 }

 /**
 * Show tutorial selection menu
 */
 async showTutorialMenu(): Promise<void> {
 const items = this.tutorials.map(tutorial => {
 const completed = this.completedTutorials.has(tutorial.id);
 const progress = this.tutorialProgress.get(tutorial.id) || 0;
 const progressText = completed ? ' Completed' :
 progress > 0 ? `${progress}/${tutorial.steps.length} steps` : '';

 return {
 label: `${tutorial.icon} ${tutorial.title}`,
 description: `${tutorial.difficulty} • ${tutorial.estimatedTime}`,
 detail: `${tutorial.description}${progressText ? ' • ' + progressText : ''}`,
 tutorial
 };
 });

 const selected = await vscode.window.showQuickPick(items, {
 placeHolder: 'Select a tutorial to start...',
 matchOnDescription: true,
 matchOnDetail: true
 });

 if (selected) {
 await this.startTutorial(selected.tutorial);
 }
 }

 /**
 * Start a tutorial
 */
 async startTutorial(tutorial: Tutorial): Promise<void> {
 this.currentTutorial = tutorial;
 this.currentStepIndex = this.tutorialProgress.get(tutorial.id) || 0;

 await this.showCurrentStep();
 }

 /**
 * Show current step
 */
 private async showCurrentStep(): Promise<void> {
 if (!this.currentTutorial) {
 return;
 }

 const step = this.currentTutorial.steps[this.currentStepIndex];
 if (!step) {
 await this.completeTutorial();
 return;
 }

 const isLastStep = this.currentStepIndex === this.currentTutorial.steps.length - 1;
 const actions = isLastStep ? ['Finish'] : ['Next', 'Skip Tutorial'];

 if (step.command) {
 actions.unshift('Run Command');
 }

 const message = `**${step.title}**\n\n${step.instructions}\n\n${step.hint ? ` Hint: ${step.hint}` : ''}`;

 const action = await vscode.window.showInformationMessage(
 message,
 { modal: true },
 ...actions
 );

 if (action === 'Run Command' && step.command) {
 await vscode.commands.executeCommand(step.command);
 // Show step again after command
 await this.showCurrentStep();
 } else if (action === 'Next' || action === 'Finish') {
 await this.nextStep();
 } else if (action === 'Skip Tutorial') {
 await this.skipTutorial();
 }
 }

 /**
 * Move to next step
 */
 private async nextStep(): Promise<void> {
 if (!this.currentTutorial) {
 return;
 }

 this.currentStepIndex++;
 this.tutorialProgress.set(this.currentTutorial.id, this.currentStepIndex);
 this.saveProgress();

 await this.showCurrentStep();
 }

 /**
 * Complete tutorial
 */
 private async completeTutorial(): Promise<void> {
 if (!this.currentTutorial) {
 return;
 }

 this.completedTutorials.add(this.currentTutorial.id);
 this.tutorialProgress.delete(this.currentTutorial.id);
 this.saveProgress();

 vscode.window.showInformationMessage(
 ` Congratulations! You've completed "${this.currentTutorial.title}"!`,
 'Start Another Tutorial',
 'Close'
 ).then(action => {
 if (action === 'Start Another Tutorial') {
 this.showTutorialMenu();
 }
 });

 this.currentTutorial = undefined;
 this.currentStepIndex = 0;
 }

 /**
 * Skip tutorial
 */
 private async skipTutorial(): Promise<void> {
 const confirm = await vscode.window.showWarningMessage(
 'Are you sure you want to skip this tutorial? Your progress will be saved.',
 'Yes, Skip',
 'No, Continue'
 );

 if (confirm === 'Yes, Skip') {
 this.currentTutorial = undefined;
 this.currentStepIndex = 0;
 } else {
 await this.showCurrentStep();
 }
 }

 /**
 * Load progress from storage
 */
 private loadProgress(): void {
 const completed = this.context.globalState.get<string[]>('codelicious.completedTutorials', []);
 this.completedTutorials = new Set(completed);

 const progress = this.context.globalState.get<Record<string, number>>('codelicious.tutorialProgress', {});
 this.tutorialProgress = new Map(Object.entries(progress));
 }

 /**
 * Save progress to storage
 */
 private saveProgress(): void {
 this.context.globalState.update('codelicious.completedTutorials', Array.from(this.completedTutorials));
 this.context.globalState.update('codelicious.tutorialProgress', Object.fromEntries(this.tutorialProgress));
 }
}

