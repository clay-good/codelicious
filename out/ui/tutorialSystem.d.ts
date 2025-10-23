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
export declare class TutorialSystem {
    private context;
    private currentTutorial?;
    private currentStepIndex;
    private completedTutorials;
    private tutorialProgress;
    private readonly tutorials;
    constructor(context: vscode.ExtensionContext);
    /**
    * Show tutorial selection menu
    */
    showTutorialMenu(): Promise<void>;
    /**
    * Start a tutorial
    */
    startTutorial(tutorial: Tutorial): Promise<void>;
    /**
    * Show current step
    */
    private showCurrentStep;
    /**
    * Move to next step
    */
    private nextStep;
    /**
    * Complete tutorial
    */
    private completeTutorial;
    /**
    * Skip tutorial
    */
    private skipTutorial;
    /**
    * Load progress from storage
    */
    private loadProgress;
    /**
    * Save progress to storage
    */
    private saveProgress;
}
//# sourceMappingURL=tutorialSystem.d.ts.map