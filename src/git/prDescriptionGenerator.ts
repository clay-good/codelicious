/**
 * PR Description Generator - Generate intelligent pull request descriptions
 * Uses AI to analyze commits and changes to generate comprehensive PR descriptions
 */

import { GitService, GitCommit, GitDiff } from './gitService';
import { ModelOrchestrator } from '../models/orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('PRDescriptionGenerator');

export interface PRDescriptionOptions {
 baseBranch?: string;
 includeChecklist?: boolean;
 includeBreakingChanges?: boolean;
 includeTestingNotes?: boolean;
 template?: PRTemplate;
}

export enum PRTemplate {
 STANDARD = 'standard',
 FEATURE = 'feature',
 BUGFIX = 'bugfix',
 HOTFIX = 'hotfix',
 REFACTOR = 'refactor',
 DOCS = 'docs'
}

export interface GeneratedPRDescription {
 title: string;
 summary: string;
 changes: string[];
 breakingChanges?: string[];
 testingNotes?: string;
 checklist?: string[];
 full: string;
 type: PRTemplate;
}

export class PRDescriptionGenerator {
 constructor(
 private gitService: GitService,
 private modelOrchestrator: ModelOrchestrator
 ) {}

 /**
 * Generate PR description for current branch
 */
 async generatePRDescription(options: PRDescriptionOptions = {}): Promise<GeneratedPRDescription> {
 const {
 baseBranch = 'main',
 includeChecklist = true,
 includeBreakingChanges = true,
 includeTestingNotes = true,
 template = PRTemplate.STANDARD
 } = options;

 // Get current branch
 const currentBranch = await this.gitService.getCurrentBranch();
 if (currentBranch === baseBranch) {
 throw new Error(`Cannot generate PR description for base branch: ${baseBranch}`);
 }

 // Get commits since base branch
 const commits = await this.getCommitsSinceBase(baseBranch);
 if (commits.length === 0) {
 throw new Error(`No commits found between ${currentBranch} and ${baseBranch}`);
 }

 // Get diff summary
 const diffs = await this.getDiffSummary(baseBranch);

 // Analyze changes
 const analysis = this.analyzeChanges(commits, diffs);

 // Generate PR description using AI
 const prompt = this.buildPrompt(
 currentBranch,
 baseBranch,
 analysis,
 template,
 includeChecklist,
 includeBreakingChanges,
 includeTestingNotes
 );

 const modelResponse = await this.modelOrchestrator.sendRequest({
 messages: [{ role: 'user', content: prompt }],
 temperature: 0.4,
 maxTokens: 1000
 });
 const response = modelResponse.content;

 // Parse response
 return this.parsePRDescription(response, template, includeChecklist);
 }

 /**
 * Get commits since base branch
 */
 private async getCommitsSinceBase(baseBranch: string): Promise<GitCommit[]> {
 try {
 const output = await this.gitService['execGit']([
 'log',
 `${baseBranch}..HEAD`,
 '--pretty=format:%H|%an|%ad|%s',
 '--date=iso',
 '--name-only'
 ]);

 return this.gitService['parseLog'](output);
 } catch (error) {
 logger.error('Failed to get commits:', error);
 return [];
 }
 }

 /**
 * Get diff summary since base branch
 */
 private async getDiffSummary(baseBranch: string): Promise<GitDiff[]> {
 try {
 const output = await this.gitService['execGit']([
 'diff',
 `${baseBranch}...HEAD`,
 '--numstat'
 ]);

 return this.gitService['parseDiffNumstat'](output);
 } catch (error) {
 logger.error('Failed to get diff summary:', error);
 return [];
 }
 }

 /**
 * Analyze changes to determine PR type and content
 */
 private analyzeChanges(commits: GitCommit[], diffs: GitDiff[]): PRAnalysis {
 const analysis: PRAnalysis = {
 commitCount: commits.length,
 fileCount: diffs.length,
 totalAdditions: 0,
 totalDeletions: 0,
 affectedAreas: [],
 commitMessages: commits.map(c => c.message),
 hasTests: false,
 hasDocs: false,
 hasBreakingChanges: false,
 type: PRTemplate.STANDARD
 };

 // Calculate total changes
 for (const diff of diffs) {
 analysis.totalAdditions += diff.additions;
 analysis.totalDeletions += diff.deletions;
 }

 // Determine affected areas
 const areas = new Set<string>();
 for (const diff of diffs) {
 const parts = diff.file.split('/');
 if (parts.length > 1) {
 areas.add(parts[0]);
 }
 }
 analysis.affectedAreas = Array.from(areas);

 // Check for tests and docs
 analysis.hasTests = diffs.some(d => d.file.includes('test') || d.file.includes('spec'));
 analysis.hasDocs = diffs.some(d => d.file.endsWith('.md') || d.file.includes('docs'));

 // Check for breaking changes
 analysis.hasBreakingChanges = commits.some(c =>
 c.message.toLowerCase().includes('breaking') ||
 c.message.includes('BREAKING CHANGE')
 );

 // Determine PR type
 const messages = commits.map(c => c.message.toLowerCase()).join(' ');
 if (messages.includes('fix') || messages.includes('bug')) {
 analysis.type = messages.includes('hotfix') ? PRTemplate.HOTFIX : PRTemplate.BUGFIX;
 } else if (messages.includes('refactor')) {
 analysis.type = PRTemplate.REFACTOR;
 } else if (messages.includes('docs') || analysis.hasDocs) {
 analysis.type = PRTemplate.DOCS;
 } else {
 analysis.type = PRTemplate.FEATURE;
 }

 return analysis;
 }

 /**
 * Build prompt for AI model
 */
 private buildPrompt(
 currentBranch: string,
 baseBranch: string,
 analysis: PRAnalysis,
 template: PRTemplate,
 includeChecklist: boolean,
 includeBreakingChanges: boolean,
 includeTestingNotes: boolean
 ): string {
 let prompt = `Generate a pull request description for merging ${currentBranch} into ${baseBranch}.\n\n`;

 prompt += `Commits: ${analysis.commitCount}\n`;
 prompt += `Files changed: ${analysis.fileCount}\n`;
 prompt += `Additions: ${analysis.totalAdditions}\n`;
 prompt += `Deletions: ${analysis.totalDeletions}\n`;
 prompt += `Affected areas: ${analysis.affectedAreas.join(', ')}\n\n`;

 prompt += 'Commit messages:\n';
 for (const message of analysis.commitMessages) {
 prompt += `- ${message}\n`;
 }
 prompt += '\n';

 prompt += `PR Type: ${template}\n`;
 prompt += `Has tests: ${analysis.hasTests}\n`;
 prompt += `Has docs: ${analysis.hasDocs}\n`;
 prompt += `Has breaking changes: ${analysis.hasBreakingChanges}\n\n`;

 prompt += 'Format your response as:\n';
 prompt += 'TITLE: <concise PR title>\n';
 prompt += 'SUMMARY: <brief summary of changes>\n';
 prompt += 'CHANGES:\n';
 prompt += '- <change 1>\n';
 prompt += '- <change 2>\n';
 prompt += '...\n';

 if (includeBreakingChanges && analysis.hasBreakingChanges) {
 prompt += 'BREAKING:\n';
 prompt += '- <breaking change 1>\n';
 prompt += '...\n';
 }

 if (includeTestingNotes) {
 prompt += 'TESTING: <how to test these changes>\n';
 }

 if (includeChecklist) {
 prompt += 'CHECKLIST:\n';
 prompt += '- <checklist item 1>\n';
 prompt += '...\n';
 }

 return prompt;
 }

 /**
 * Parse AI response into structured PR description
 */
 private parsePRDescription(
 response: string,
 template: PRTemplate,
 includeChecklist: boolean
 ): GeneratedPRDescription {
 const lines = response.split('\n');
 let title = '';
 let summary = '';
 const changes: string[] = [];
 const breakingChanges: string[] = [];
 let testingNotes = '';
 const checklist: string[] = [];

 let currentSection = '';

 for (const line of lines) {
 const trimmed = line.trim();

 if (trimmed.startsWith('TITLE:')) {
 currentSection = 'title';
 title = trimmed.substring(6).trim();
 } else if (trimmed.startsWith('SUMMARY:')) {
 currentSection = 'summary';
 summary = trimmed.substring(8).trim();
 } else if (trimmed.startsWith('CHANGES:')) {
 currentSection = 'changes';
 } else if (trimmed.startsWith('BREAKING:')) {
 currentSection = 'breaking';
 } else if (trimmed.startsWith('TESTING:')) {
 currentSection = 'testing';
 testingNotes = trimmed.substring(8).trim();
 } else if (trimmed.startsWith('CHECKLIST:')) {
 currentSection = 'checklist';
 } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
 const item = trimmed.substring(1).trim();
 if (currentSection === 'changes') {
 changes.push(item);
 } else if (currentSection === 'breaking') {
 breakingChanges.push(item);
 } else if (currentSection === 'checklist') {
 checklist.push(item);
 }
 } else if (trimmed && currentSection) {
 if (currentSection === 'title') {
 title += ' ' + trimmed;
 } else if (currentSection === 'summary') {
 summary += ' ' + trimmed;
 } else if (currentSection === 'testing') {
 testingNotes += ' ' + trimmed;
 }
 }
 }

 // Build full description
 let full = `## ${title}\n\n`;
 full += `${summary}\n\n`;

 if (changes.length > 0) {
 full += '### Changes\n\n';
 for (const change of changes) {
 full += `- ${change}\n`;
 }
 full += '\n';
 }

 if (breakingChanges.length > 0) {
 full += '### Breaking Changes\n\n';
 for (const change of breakingChanges) {
 full += `- ${change}\n`;
 }
 full += '\n';
 }

 if (testingNotes) {
 full += '### Testing\n\n';
 full += `${testingNotes}\n\n`;
 }

 if (checklist.length > 0) {
 full += '### Checklist\n\n';
 for (const item of checklist) {
 full += `- [ ] ${item}\n`;
 }
 }

 return {
 title,
 summary,
 changes,
 breakingChanges: breakingChanges.length > 0 ? breakingChanges : undefined,
 testingNotes: testingNotes || undefined,
 checklist: checklist.length > 0 ? checklist : undefined,
 full,
 type: template
 };
 }
}

interface PRAnalysis {
 commitCount: number;
 fileCount: number;
 totalAdditions: number;
 totalDeletions: number;
 affectedAreas: string[];
 commitMessages: string[];
 hasTests: boolean;
 hasDocs: boolean;
 hasBreakingChanges: boolean;
 type: PRTemplate;
}

