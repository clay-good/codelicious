/**
 * Instruction File Reader
 *
 * Reads and parses instruction files (txt/markdown) for autonomous product building.
 * Supports:
 * - Plain text instructions
 * - Markdown formatted instructions
 * - Structured specifications with sections
 * - Multi-file instruction sets
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface InstructionFile {
 filePath: string;
 content: string;
 format: 'text' | 'markdown';
 sections: InstructionSection[];
 metadata: InstructionMetadata;
}

export interface InstructionSection {
 title: string;
 content: string;
 type: 'requirements' | 'features' | 'technical' | 'constraints' | 'examples' | 'other';
 priority: 'high' | 'medium' | 'low';
}

export interface InstructionMetadata {
 projectName?: string;
 projectType?: string;
 language?: string;
 framework?: string;
 dependencies?: string[];
 targetDirectory?: string;
}

export class InstructionFileReader {
 /**
 * Read instruction file
 */
 async readInstructionFile(filePath: string): Promise<InstructionFile> {
 const content = await fs.readFile(filePath, 'utf-8');
 const format = this.detectFormat(filePath);
 const sections = this.parseSections(content, format);
 const metadata = this.extractMetadata(content, sections);

 return {
 filePath,
 content,
 format,
 sections,
 metadata
 };
 }

 /**
 * Find instruction files in workspace
 */
 async findInstructionFiles(workspaceRoot: string): Promise<string[]> {
 const instructionFiles: string[] = [];

 // Common instruction file names
 const commonNames = [
 'INSTRUCTIONS.md',
 'INSTRUCTIONS.txt',
 'BUILD.md',
 'BUILD.txt',
 'SPEC.md',
 'SPEC.txt',
 'REQUIREMENTS.md',
 'REQUIREMENTS.txt',
 'instructions.md',
 'instructions.txt',
 'build.md',
 'build.txt',
 'spec.md',
 'spec.txt'
 ];

 for (const name of commonNames) {
 const filePath = path.join(workspaceRoot, name);
 try {
 await fs.access(filePath);
 instructionFiles.push(filePath);
 } catch {
 // File doesn't exist, continue
 }
 }

 return instructionFiles;
 }

 /**
 * Detect file format
 */
 private detectFormat(filePath: string): 'text' | 'markdown' {
 const ext = path.extname(filePath).toLowerCase();
 return ext === '.md' || ext === '.markdown' ? 'markdown' : 'text';
 }

 /**
 * Parse sections from content
 */
 private parseSections(content: string, format: 'text' | 'markdown'): InstructionSection[] {
 if (format === 'markdown') {
 return this.parseMarkdownSections(content);
 } else {
 return this.parseTextSections(content);
 }
 }

 /**
 * Parse markdown sections
 */
 private parseMarkdownSections(content: string): InstructionSection[] {
 const sections: InstructionSection[] = [];
 const lines = content.split('\n');

 let currentSection: InstructionSection | null = null;
 let currentContent: string[] = [];

 for (const line of lines) {
 // Check for heading (# Title or ## Title)
 const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

 if (headingMatch) {
 // Save previous section
 if (currentSection) {
 currentSection.content = currentContent.join('\n').trim();
 sections.push(currentSection);
 }

 // Start new section
 const title = headingMatch[2].trim();
 currentSection = {
 title,
 content: '',
 type: this.detectSectionType(title),
 priority: this.detectPriority(title)
 };
 currentContent = [];
 } else if (currentSection) {
 currentContent.push(line);
 } else {
 // Content before first heading
 if (!currentSection) {
 currentSection = {
 title: 'Overview',
 content: '',
 type: 'other',
 priority: 'high'
 };
 }
 currentContent.push(line);
 }
 }

 // Save last section
 if (currentSection) {
 currentSection.content = currentContent.join('\n').trim();
 sections.push(currentSection);
 }

 return sections;
 }

 /**
 * Parse text sections (simple paragraph-based)
 */
 private parseTextSections(content: string): InstructionSection[] {
 const sections: InstructionSection[] = [];
 const paragraphs = content.split(/\n\s*\n/);

 for (let i = 0; i < paragraphs.length; i++) {
 const paragraph = paragraphs[i].trim();
 if (paragraph) {
 const firstLine = paragraph.split('\n')[0];
 sections.push({
 title: firstLine.length > 50 ? `Section ${i + 1}` : firstLine,
 content: paragraph,
 type: this.detectSectionType(paragraph),
 priority: this.detectPriority(paragraph)
 });
 }
 }

 return sections;
 }

 /**
 * Detect section type from title/content
 */
 private detectSectionType(text: string): InstructionSection['type'] {
 const lower = text.toLowerCase();

 if (lower.includes('requirement') || lower.includes('must') || lower.includes('should')) {
 return 'requirements';
 } else if (lower.includes('feature') || lower.includes('functionality')) {
 return 'features';
 } else if (lower.includes('technical') || lower.includes('architecture') || lower.includes('stack')) {
 return 'technical';
 } else if (lower.includes('constraint') || lower.includes('limitation') || lower.includes('restriction')) {
 return 'constraints';
 } else if (lower.includes('example') || lower.includes('sample') || lower.includes('demo')) {
 return 'examples';
 } else {
 return 'other';
 }
 }

 /**
 * Detect priority from title/content
 */
 private detectPriority(text: string): InstructionSection['priority'] {
 const lower = text.toLowerCase();

 if (lower.includes('critical') || lower.includes('must') || lower.includes('required')) {
 return 'high';
 } else if (lower.includes('optional') || lower.includes('nice to have') || lower.includes('future')) {
 return 'low';
 } else {
 return 'medium';
 }
 }

 /**
 * Extract metadata from content
 */
 private extractMetadata(content: string, sections: InstructionSection[]): InstructionMetadata {
 const metadata: InstructionMetadata = {};

 // Extract project name
 const projectNameMatch = content.match(/project\s*name\s*:\s*(.+)/i);
 if (projectNameMatch) {
 metadata.projectName = projectNameMatch[1].trim();
 }

 // Extract project type
 const projectTypeMatch = content.match(/project\s*type\s*:\s*(.+)/i);
 if (projectTypeMatch) {
 metadata.projectType = projectTypeMatch[1].trim();
 }

 // Extract language
 const languageMatch = content.match(/language\s*:\s*(.+)/i);
 if (languageMatch) {
 metadata.language = languageMatch[1].trim();
 }

 // Extract framework
 const frameworkMatch = content.match(/framework\s*:\s*(.+)/i);
 if (frameworkMatch) {
 metadata.framework = frameworkMatch[1].trim();
 }

 // Extract dependencies
 const depsMatch = content.match(/dependencies\s*:\s*(.+)/i);
 if (depsMatch) {
 metadata.dependencies = depsMatch[1].split(',').map(d => d.trim());
 }

 // Extract target directory
 const targetDirMatch = content.match(/target\s*directory\s*:\s*(.+)/i);
 if (targetDirMatch) {
 metadata.targetDirectory = targetDirMatch[1].trim();
 }

 return metadata;
 }

 /**
 * Convert instruction file to autonomous workflow input
 */
 convertToWorkflowInput(instruction: InstructionFile): string {
 let input = '';

 // Add metadata if available
 if (instruction.metadata.projectName) {
 input += `Project: ${instruction.metadata.projectName}\n\n`;
 }

 if (instruction.metadata.projectType) {
 input += `Type: ${instruction.metadata.projectType}\n\n`;
 }

 if (instruction.metadata.language) {
 input += `Language: ${instruction.metadata.language}\n\n`;
 }

 if (instruction.metadata.framework) {
 input += `Framework: ${instruction.metadata.framework}\n\n`;
 }

 // Add sections in priority order
 const sortedSections = [...instruction.sections].sort((a, b) => {
 const priorityOrder = { high: 0, medium: 1, low: 2 };
 return priorityOrder[a.priority] - priorityOrder[b.priority];
 });

 for (const section of sortedSections) {
 input += `## ${section.title}\n\n`;
 input += `${section.content}\n\n`;
 }

 return input.trim();
 }
}

