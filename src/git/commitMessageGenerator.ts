/**
 * Commit Message Generator - Generate intelligent commit messages
 * Uses AI to analyze staged changes and generate conventional commit messages
 */

import { GitService, GitDiff, GitFile } from './gitService';
import { ModelOrchestrator } from '../models/orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('CommitMessageGenerator');

export interface CommitMessageOptions {
 conventional?: boolean;
 includeBody?: boolean;
 includeBreakingChanges?: boolean;
 maxLength?: number;
}

export interface GeneratedCommitMessage {
 subject: string;
 body?: string;
 footer?: string;
 full: string;
 type: CommitType;
 scope?: string;
}

export enum CommitType {
 FEAT = 'feat',
 FIX = 'fix',
 DOCS = 'docs',
 STYLE = 'style',
 REFACTOR = 'refactor',
 PERF = 'perf',
 TEST = 'test',
 BUILD = 'build',
 CI = 'ci',
 CHORE = 'chore',
 REVERT = 'revert'
}

export class CommitMessageGenerator {
 constructor(
 private gitService: GitService,
 private modelOrchestrator: ModelOrchestrator
 ) {}

 /**
 * Generate commit message for staged changes
 */
 async generateCommitMessage(options: CommitMessageOptions = {}): Promise<GeneratedCommitMessage> {
 const {
 conventional = true,
 includeBody = true,
 includeBreakingChanges = true,
 maxLength = 72
 } = options;

 // Get staged changes
 const status = await this.gitService.getStatus();
 if (status.staged.length === 0) {
 throw new Error('No staged changes to commit');
 }

 // Get diffs for staged files
 const diffs = await this.gitService.getStagedDiff();

 // Analyze changes
 const analysis = this.analyzeChanges(status.staged, diffs);

 // Generate commit message using AI
 const prompt = this.buildPrompt(analysis, conventional, includeBody, includeBreakingChanges, maxLength);
 const modelResponse = await this.modelOrchestrator.sendRequest({
 messages: [{ role: 'user', content: prompt }],
 temperature: 0.3, // Lower temperature for more consistent output
 maxTokens: 500
 });
 const response = modelResponse.content;

 // Parse response
 return this.parseCommitMessage(response, conventional);
 }

 /**
 * Generate multiple commit message suggestions
 */
 async generateSuggestions(count: number = 3, options: CommitMessageOptions = {}): Promise<GeneratedCommitMessage[]> {
 const suggestions: GeneratedCommitMessage[] = [];

 for (let i = 0; i < count; i++) {
 try {
 const message = await this.generateCommitMessage({
 ...options,
 // Vary temperature slightly for diversity
 maxLength: options.maxLength
 });
 suggestions.push(message);
 } catch (error) {
 logger.error(`Failed to generate suggestion ${i + 1}:`, error);
 }
 }

 return suggestions;
 }

 /**
 * Analyze changes to determine commit type and scope
 */
 private analyzeChanges(files: GitFile[], diffs: GitDiff[]): ChangeAnalysis {
 const analysis: ChangeAnalysis = {
 type: CommitType.CHORE,
 scope: undefined,
 files: files.map(f => f.path),
 totalAdditions: 0,
 totalDeletions: 0,
 affectedAreas: [],
 isBreaking: false
 };

 // Calculate total changes
 for (const diff of diffs) {
 analysis.totalAdditions += diff.additions;
 analysis.totalDeletions += diff.deletions;
 }

 // Determine affected areas (directories)
 const areas = new Set<string>();
 for (const file of files) {
 const parts = file.path.split('/');
 if (parts.length > 1) {
 areas.add(parts[0]);
 }
 }
 analysis.affectedAreas = Array.from(areas);

 // Determine commit type based on file patterns
 const hasTests = files.some(f => f.path.includes('test') || f.path.includes('spec'));
 const hasDocs = files.some(f => f.path.endsWith('.md') || f.path.includes('docs'));
 const hasConfig = files.some(f =>
 f.path.includes('package.json') ||
 f.path.includes('tsconfig') ||
 f.path.includes('webpack') ||
 f.path.includes('.yml') ||
 f.path.includes('.yaml')
 );
 const hasStyles = files.some(f => f.path.endsWith('.css') || f.path.endsWith('.scss'));

 if (hasTests && files.length === files.filter(f => f.path.includes('test') || f.path.includes('spec')).length) {
 analysis.type = CommitType.TEST;
 } else if (hasDocs && files.length === files.filter(f => f.path.endsWith('.md')).length) {
 analysis.type = CommitType.DOCS;
 } else if (hasConfig) {
 analysis.type = CommitType.BUILD;
 } else if (hasStyles && files.length === files.filter(f => f.path.endsWith('.css') || f.path.endsWith('.scss')).length) {
 analysis.type = CommitType.STYLE;
 } else if (analysis.totalDeletions > analysis.totalAdditions * 2) {
 analysis.type = CommitType.REFACTOR;
 } else {
 // Default to feat or fix based on file names
 const hasFix = files.some(f => f.path.toLowerCase().includes('fix') || f.path.toLowerCase().includes('bug'));
 analysis.type = hasFix ? CommitType.FIX : CommitType.FEAT;
 }

 // Determine scope (first affected area if only one)
 if (analysis.affectedAreas.length === 1) {
 analysis.scope = analysis.affectedAreas[0];
 }

 return analysis;
 }

 /**
 * Build prompt for AI model
 */
 private buildPrompt(
 analysis: ChangeAnalysis,
 conventional: boolean,
 includeBody: boolean,
 includeBreakingChanges: boolean,
 maxLength: number
 ): string {
 let prompt = 'Generate a commit message for the following changes:\n\n';

 prompt += `Files changed: ${analysis.files.join(', ')}\n`;
 prompt += `Total additions: ${analysis.totalAdditions}\n`;
 prompt += `Total deletions: ${analysis.totalDeletions}\n`;
 prompt += `Affected areas: ${analysis.affectedAreas.join(', ')}\n\n`;

 if (conventional) {
 prompt += 'Use Conventional Commits format (type(scope): subject).\n';
 prompt += `Suggested type: ${analysis.type}\n`;
 if (analysis.scope) {
 prompt += `Suggested scope: ${analysis.scope}\n`;
 }
 prompt += '\nValid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert\n\n';
 }

 prompt += `Subject line should be ${maxLength} characters or less.\n`;

 if (includeBody) {
 prompt += 'Include a body that explains what and why (not how).\n';
 }

 if (includeBreakingChanges && analysis.isBreaking) {
 prompt += 'Include BREAKING CHANGE footer if applicable.\n';
 }

 prompt += '\nFormat your response as:\n';
 prompt += 'SUBJECT: <subject line>\n';
 if (includeBody) {
 prompt += 'BODY: <body text>\n';
 }
 if (includeBreakingChanges) {
 prompt += 'FOOTER: <footer text (optional)>\n';
 }

 return prompt;
 }

 /**
 * Parse AI response into structured commit message
 */
 private parseCommitMessage(response: string, conventional: boolean): GeneratedCommitMessage {
 const lines = response.split('\n');
 let subject = '';
 let body = '';
 let footer = '';

 let currentSection = '';

 for (const line of lines) {
 const trimmed = line.trim();

 if (trimmed.startsWith('SUBJECT:')) {
 currentSection = 'subject';
 subject = trimmed.substring(8).trim();
 } else if (trimmed.startsWith('BODY:')) {
 currentSection = 'body';
 body = trimmed.substring(5).trim();
 } else if (trimmed.startsWith('FOOTER:')) {
 currentSection = 'footer';
 footer = trimmed.substring(7).trim();
 } else if (trimmed && currentSection) {
 if (currentSection === 'subject') {
 subject += ' ' + trimmed;
 } else if (currentSection === 'body') {
 body += '\n' + trimmed;
 } else if (currentSection === 'footer') {
 footer += '\n' + trimmed;
 }
 }
 }

 // Parse type and scope from subject if conventional
 let type = CommitType.CHORE;
 let scope: string | undefined;

 if (conventional && subject) {
 const match = subject.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)$/);
 if (match) {
 type = match[1] as CommitType;
 scope = match[2];
 subject = match[3];
 }
 }

 // Build full message
 let full = conventional ? `${type}${scope ? `(${scope})` : ''}: ${subject}` : subject;
 if (body) {
 full += '\n\n' + body.trim();
 }
 if (footer) {
 full += '\n\n' + footer.trim();
 }

 return {
 subject: conventional ? `${type}${scope ? `(${scope})` : ''}: ${subject}` : subject,
 body: body.trim() || undefined,
 footer: footer.trim() || undefined,
 full,
 type,
 scope
 };
 }
}

interface ChangeAnalysis {
 type: CommitType;
 scope?: string;
 files: string[];
 totalAdditions: number;
 totalDeletions: number;
 affectedAreas: string[];
 isBreaking: boolean;
}

