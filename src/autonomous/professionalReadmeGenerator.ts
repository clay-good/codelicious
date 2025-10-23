/**
 * Professional README Generator
 * Generates comprehensive, professional READMEs without emojis
 * Includes: Description, Installation, Usage, Architecture, System Design
 */

import { ModelOrchestrator } from '../models/orchestrator';
import { TaskComplexity } from '../models/modelRouter';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createLogger } from '../utils/logger';

const logger = createLogger('ProfessionalReadmeGenerator');

export interface ProjectInfo {
 name: string;
 description: string;
 version?: string;
 author?: string;
 license?: string;
 repository?: string;
 homepage?: string;
 keywords?: string[];
}

export interface ReadmeContent {
 title: string;
 description: string;
 features: string[];
 installation: string;
 usage: string;
 api?: string;
 architecture?: string;
 systemDesign?: string;
 configuration?: string;
 development?: string;
 testing?: string;
 contributing?: string;
 license?: string;
 support?: string;
}

export class ProfessionalReadmeGenerator {
 constructor(
 private orchestrator: ModelOrchestrator,
 private workspaceRoot: string
 ) {}

 /**
 * Generate professional README from project analysis
 */
 async generateFromProject(projectInfo: ProjectInfo): Promise<string> {
 logger.info('Generating professional README...');

 // Analyze project structure
 const structure = await this.analyzeProjectStructure();

 // Detect technology stack
 const techStack = await this.detectTechnologyStack();

 // Generate comprehensive README
 const content = await this.generateReadmeContent(projectInfo, structure, techStack);

 return this.formatReadme(content);
 }

 /**
 * Generate README content using AI
 */
 private async generateReadmeContent(
 projectInfo: ProjectInfo,
 structure: any, // Project structure from analyzer
 techStack: any // Tech stack from analyzer
 ): Promise<ReadmeContent> {
 const prompt = `Generate a comprehensive, professional README.md for this project.

PROJECT INFORMATION:
- Name: ${projectInfo.name}
- Description: ${projectInfo.description}
- Version: ${projectInfo.version || '1.0.0'}
- License: ${projectInfo.license || 'MIT'}

TECHNOLOGY STACK:
${JSON.stringify(techStack, null, 2)}

PROJECT STRUCTURE:
${JSON.stringify(structure, null, 2)}

Generate content for these sections:

1. DESCRIPTION (2-3 paragraphs):
 - What the project does
 - Problem it solves
 - Key benefits
 - Target audience

2. FEATURES (comprehensive list):
 - Core features
 - Advanced features
 - Unique capabilities

3. INSTALLATION (detailed steps):
 - Prerequisites with versions
 - Step-by-step installation
 - Platform-specific instructions
 - Verification steps

4. USAGE (with examples):
 - Quick start
 - Basic usage examples
 - Common use cases
 - Configuration options

5. API DOCUMENTATION (if applicable):
 - Main APIs/functions
 - Parameters and return types
 - Usage examples

6. SYSTEM DESIGN:
 - High-level architecture
 - Component overview
 - Data flow
 - Key design decisions

7. ARCHITECTURE:
 - Directory structure
 - Module organization
 - Design patterns used
 - Technology choices

8. CONFIGURATION:
 - Configuration files
 - Environment variables
 - Available options

9. DEVELOPMENT:
 - Development setup
 - Running locally
 - Building from source
 - Code style

10. TESTING:
 - Running tests
 - Test coverage
 - Testing frameworks

11. CONTRIBUTING:
 - How to contribute
 - Pull request process
 - Code of conduct

CRITICAL REQUIREMENTS:
- DO NOT use any emojis or emoticons
- Use professional, technical language
- Include code examples with proper syntax highlighting
- Use markdown tables for structured data
- Use bullet points and numbered lists appropriately
- Keep tone professional and clear
- Include all necessary technical details

Return ONLY the content for each section in this JSON format:
{
 "description": "...",
 "features": ["feature 1", "feature 2"],
 "installation": "...",
 "usage": "...",
 "api": "...",
 "systemDesign": "...",
 "architecture": "...",
 "configuration": "...",
 "development": "...",
 "testing": "...",
 "contributing": "..."
}`;

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert technical writer. Create clear, professional documentation without emojis. Focus on technical accuracy and completeness.'
 },
 { role: 'user', content: prompt }
 ],
 temperature: 0.3
 },
 { complexity: TaskComplexity.MODERATE }
 );

 // Parse JSON response
 const jsonMatch = response.content.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 const parsed = JSON.parse(jsonMatch[0]);
 return {
 title: projectInfo.name,
 description: parsed.description || projectInfo.description,
 features: parsed.features || [],
 installation: parsed.installation || '',
 usage: parsed.usage || '',
 api: parsed.api,
 architecture: parsed.architecture,
 systemDesign: parsed.systemDesign,
 configuration: parsed.configuration,
 development: parsed.development,
 testing: parsed.testing,
 contributing: parsed.contributing,
 license: projectInfo.license || 'MIT',
 support: parsed.support
 };
 }

 // Fallback if parsing fails
 return this.generateFallbackContent(projectInfo);
 }

 /**
 * Format README with proper structure
 */
 private formatReadme(content: ReadmeContent): string {
 let readme = '';

 // Title
 readme += `# ${content.title}\n\n`;

 // Description
 readme += `## Description\n\n${content.description}\n\n`;

 // Features
 if (content.features.length > 0) {
 readme += `## Features\n\n`;
 content.features.forEach(feature => {
 readme += `- ${feature}\n`;
 });
 readme += '\n';
 }

 // Installation
 if (content.installation) {
 readme += `## Installation\n\n${content.installation}\n\n`;
 }

 // Usage
 if (content.usage) {
 readme += `## Usage\n\n${content.usage}\n\n`;
 }

 // API Documentation
 if (content.api) {
 readme += `## API Documentation\n\n${content.api}\n\n`;
 }

 // System Design
 if (content.systemDesign) {
 readme += `## System Design\n\n${content.systemDesign}\n\n`;
 }

 // Architecture
 if (content.architecture) {
 readme += `## Architecture\n\n${content.architecture}\n\n`;
 }

 // Configuration
 if (content.configuration) {
 readme += `## Configuration\n\n${content.configuration}\n\n`;
 }

 // Development
 if (content.development) {
 readme += `## Development\n\n${content.development}\n\n`;
 }

 // Testing
 if (content.testing) {
 readme += `## Testing\n\n${content.testing}\n\n`;
 }

 // Contributing
 if (content.contributing) {
 readme += `## Contributing\n\n${content.contributing}\n\n`;
 }

 // License
 if (content.license) {
 readme += `## License\n\n${content.license}\n\n`;
 }

 // Support
 if (content.support) {
 readme += `## Support\n\n${content.support}\n\n`;
 }

 return readme;
 }

 /**
 * Analyze project structure
 */
 private async analyzeProjectStructure(): Promise<any> {
 try {
 const files = await fs.readdir(this.workspaceRoot);
 return {
 hasPackageJson: files.includes('package.json'),
 hasRequirementsTxt: files.includes('requirements.txt'),
 hasCargoToml: files.includes('Cargo.toml'),
 hasGoMod: files.includes('go.mod'),
 hasSrcDir: files.includes('src'),
 hasTestDir: files.includes('test') || files.includes('tests'),
 hasDocsDir: files.includes('docs'),
 files: files.slice(0, 20) // First 20 files
 };
 } catch (error) {
 return { error: 'Could not analyze structure' };
 }
 }

 /**
 * Detect technology stack
 */
 private async detectTechnologyStack(): Promise<any> { // Tech stack structure
 const stack: any = { // Tech stack structure
 languages: [],
 frameworks: [],
 tools: []
 };

 try {
 const files = await fs.readdir(this.workspaceRoot);

 if (files.includes('package.json')) {
 stack.languages.push('JavaScript/TypeScript');
 stack.tools.push('npm/Node.js');
 }
 if (files.includes('requirements.txt') || files.includes('setup.py')) {
 stack.languages.push('Python');
 stack.tools.push('pip');
 }
 if (files.includes('Cargo.toml')) {
 stack.languages.push('Rust');
 stack.tools.push('Cargo');
 }
 if (files.includes('go.mod')) {
 stack.languages.push('Go');
 stack.tools.push('Go modules');
 }
 } catch (error) {
 // Ignore errors
 }

 return stack;
 }

 /**
 * Generate fallback content
 */
 private generateFallbackContent(projectInfo: ProjectInfo): ReadmeContent {
 return {
 title: projectInfo.name,
 description: projectInfo.description,
 features: [],
 installation: '```bash\nnpm install\n```',
 usage: 'See documentation for usage instructions.',
 license: projectInfo.license || 'MIT'
 };
 }

 /**
 * Write README to file
 */
 async writeReadme(content: string): Promise<void> {
 const readmePath = path.join(this.workspaceRoot, 'README.md');
 await fs.writeFile(readmePath, content, 'utf-8');
 logger.info('README.md written successfully');
 }
}

