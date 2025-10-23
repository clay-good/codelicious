import * as path from 'path';
import * as fs from 'fs/promises';
import { ModelOrchestrator } from '../models/orchestrator';
import { TaskComplexity } from '../models/modelRouter';
import { createLogger } from '../utils/logger';

const logger = createLogger('DocumentationGenerator');

/**
 * Documentation type
 */
export enum DocumentationType {
 README = 'readme',
 API_REFERENCE = 'api_reference',
 USAGE_GUIDE = 'usage_guide',
 ARCHITECTURE = 'architecture',
 CHANGELOG = 'changelog',
 CONTRIBUTING = 'contributing'
}

/**
 * Documentation section
 */
export interface DocumentationSection {
 title: string;
 content: string;
 subsections?: DocumentationSection[];
}

/**
 * Documentation result
 */
export interface DocumentationResult {
 type: DocumentationType;
 filePath: string;
 content: string;
 sections: DocumentationSection[];
}

/**
 * Auto-generate comprehensive documentation
 * Creates README, API references, usage guides, and more
 */
export class DocumentationGenerator {
 private orchestrator: ModelOrchestrator;
 private workspaceRoot: string;

 constructor(orchestrator: ModelOrchestrator, workspaceRoot: string) {
 this.orchestrator = orchestrator;
 this.workspaceRoot = workspaceRoot;
 }

 /**
 * Generate README.md
 */
 async generateReadme(projectInfo: {
 name: string;
 description: string;
 features: string[];
 installation: string;
 usage: string;
 }): Promise<DocumentationResult> {
 logger.info(' Generating README.md...');

 const prompt = `Generate a comprehensive, professional README.md for this project:

**Project Name**: ${projectInfo.name}
**Description**: ${projectInfo.description}

**Features**:
${projectInfo.features.map(f => `- ${f}`).join('\n')}

**Installation**:
${projectInfo.installation}

**Usage**:
${projectInfo.usage}

Create a professional README with these sections:

## 1. Project Title
- Clear, descriptive title
- Brief one-line description
- Badges (build status, version, license, etc.)

## 2. Description
- Detailed project description
- Problem it solves
- Key benefits
- Target audience

## 3. Features
- Comprehensive list of features
- Organized by category if applicable
- Clear, concise descriptions

## 4. Installation
- Prerequisites (Node.js version, Python version, etc.)
- Step-by-step installation instructions
- Platform-specific notes (Windows, macOS, Linux)
- Troubleshooting common installation issues

## 5. Usage
- Quick start guide
- Basic usage examples with code blocks
- Common use cases
- Configuration options
- Command-line interface (if applicable)

## 6. API Documentation
- Overview of main APIs/functions
- Parameters and return types
- Usage examples for each API
- Error handling

## 7. System Design & Architecture
- High-level architecture overview
- Component diagram (describe in text)
- Data flow
- Key design decisions
- Technology stack

## 8. Configuration
- Configuration file format
- Available options
- Environment variables
- Default values

## 9. Development
- Setting up development environment
- Running tests
- Building from source
- Code style guidelines

## 10. Contributing
- How to contribute
- Code of conduct
- Pull request process
- Issue reporting guidelines

## 11. Testing
- How to run tests
- Test coverage
- Testing frameworks used

## 12. License
- License type
- Copyright information

## 13. Support & Contact
- How to get help
- Community channels
- Issue tracker
- Contact information

IMPORTANT FORMATTING RULES:
- Use proper markdown formatting with code blocks and tables
- DO NOT use emojis or emoticons anywhere in the README
- Use clear, professional language
- Include code examples in appropriate language syntax highlighting
- Use tables for structured data
- Use bullet points for lists
- Use numbered lists for sequential steps
- Keep tone professional and technical`;

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert technical writer. Create clear, comprehensive documentation.'
 },
 { role: 'user', content: prompt }
 ],
 temperature: 0.5
 },
 { complexity: TaskComplexity.SIMPLE }
 );

 const content = response.content;
 const sections = this.parseMarkdownSections(content);

 return {
 type: DocumentationType.README,
 filePath: 'README.md',
 content,
 sections
 };
 }

 /**
 * Generate API reference documentation
 */
 async generateApiReference(sourceFiles: Array<{ path: string; content: string }>): Promise<DocumentationResult> {
 logger.info(' Generating API reference...');

 const prompt = `Generate comprehensive API reference documentation for these source files:

${sourceFiles.map(f => `
**File**: ${f.path}
\`\`\`
${f.content.substring(0, 2000)}${f.content.length > 2000 ? '...' : ''}
\`\`\`
`).join('\n')}

Create API documentation with:
1. Overview of the API
2. Classes and interfaces
3. Methods and functions with parameters, return types, and examples
4. Properties and fields
5. Events (if applicable)
6. Usage examples
7. Error handling

Use proper markdown formatting with code blocks and tables.`;

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert API documentation writer. Create clear, detailed API references.'
 },
 { role: 'user', content: prompt }
 ],
 temperature: 0.3
 },
 { complexity: TaskComplexity.MODERATE }
 );

 const content = response.content;
 const sections = this.parseMarkdownSections(content);

 return {
 type: DocumentationType.API_REFERENCE,
 filePath: 'docs/API.md',
 content,
 sections
 };
 }

 /**
 * Generate usage guide
 */
 async generateUsageGuide(projectInfo: {
 name: string;
 mainFeatures: string[];
 examples: Array<{ title: string; description: string; code: string }>;
 }): Promise<DocumentationResult> {
 logger.info(' Generating usage guide...');

 const prompt = `Generate a comprehensive usage guide for ${projectInfo.name}:

**Main Features**:
${projectInfo.mainFeatures.map(f => `- ${f}`).join('\n')}

**Examples**:
${projectInfo.examples.map(ex => `
### ${ex.title}
${ex.description}
\`\`\`
${ex.code}
\`\`\`
`).join('\n')}

Create a usage guide with:
1. Getting started
2. Basic usage
3. Advanced features
4. Common use cases
5. Troubleshooting
6. FAQ
7. Best practices

Use clear explanations with code examples.`;

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert technical writer. Create clear, beginner-friendly guides.'
 },
 { role: 'user', content: prompt }
 ],
 temperature: 0.5
 },
 { complexity: TaskComplexity.SIMPLE }
 );

 const content = response.content;
 const sections = this.parseMarkdownSections(content);

 return {
 type: DocumentationType.USAGE_GUIDE,
 filePath: 'docs/USAGE.md',
 content,
 sections
 };
 }

 /**
 * Generate architecture documentation
 */
 async generateArchitectureDoc(components: Array<{
 name: string;
 description: string;
 dependencies: string[];
 }>): Promise<DocumentationResult> {
 logger.info(' Generating architecture documentation...');

 const prompt = `Generate architecture documentation for a system with these components:

${components.map(c => `
**${c.name}**
Description: ${c.description}
Dependencies: ${c.dependencies.join(', ')}
`).join('\n')}

Create architecture documentation with:
1. System overview
2. Architecture diagram (mermaid)
3. Component descriptions
4. Data flow
5. Design decisions
6. Scalability considerations
7. Security considerations

Use mermaid diagrams where appropriate.`;

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert software architect. Create clear architecture documentation.'
 },
 { role: 'user', content: prompt }
 ],
 temperature: 0.4
 },
 { complexity: TaskComplexity.MODERATE }
 );

 const content = response.content;
 const sections = this.parseMarkdownSections(content);

 return {
 type: DocumentationType.ARCHITECTURE,
 filePath: 'docs/ARCHITECTURE.md',
 content,
 sections
 };
 }

 /**
 * Generate inline code comments
 */
 async generateInlineComments(code: string, language: string): Promise<string> {
 logger.info(' Generating inline comments...');

 const prompt = `Add comprehensive inline comments to this ${language} code:

\`\`\`${language}
${code}
\`\`\`

Add comments that:
1. Explain what each function/method does
2. Describe complex logic
3. Document parameters and return values
4. Explain edge cases
5. Add JSDoc/docstring style comments

Return only the commented code, no explanations.`;

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert code documenter. Add clear, helpful comments.'
 },
 { role: 'user', content: prompt }
 ],
 temperature: 0.3
 },
 { complexity: TaskComplexity.SIMPLE }
 );

 // Extract code from response
 const codeMatch = response.content.match(/```[\w]*\n([\s\S]*?)\n```/);
 return codeMatch ? codeMatch[1] : response.content;
 }

 /**
 * Parse markdown into sections
 */
 private parseMarkdownSections(markdown: string): DocumentationSection[] {
 const sections: DocumentationSection[] = [];
 const lines = markdown.split('\n');

 let currentSection: DocumentationSection | null = null;
 let currentContent: string[] = [];

 for (const line of lines) {
 // Check for headers
 const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

 if (headerMatch) {
 // Save previous section
 if (currentSection) {
 currentSection.content = currentContent.join('\n').trim();
 sections.push(currentSection);
 }

 // Start new section
 currentSection = {
 title: headerMatch[2],
 content: '',
 subsections: []
 };
 currentContent = [];
 } else if (currentSection) {
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
 * Write documentation to file
 */
 async writeDocumentation(doc: DocumentationResult): Promise<void> {
 const fullPath = path.join(this.workspaceRoot, doc.filePath);

 // Ensure directory exists
 await fs.mkdir(path.dirname(fullPath), { recursive: true });

 // Write file
 await fs.writeFile(fullPath, doc.content, 'utf-8');

 logger.info(`Documentation written to ${doc.filePath}`);
 }

 /**
 * Generate all documentation for a project
 */
 async generateAllDocumentation(projectInfo: {
 name: string;
 description: string;
 features: string[];
 sourceFiles: Array<{ path: string; content: string }>;
 }): Promise<DocumentationResult[]> {
 logger.info(' Generating all documentation...');

 const results: DocumentationResult[] = [];

 // Generate README
 const readme = await this.generateReadme({
 name: projectInfo.name,
 description: projectInfo.description,
 features: projectInfo.features,
 installation: 'npm install',
 usage: 'See usage guide for details'
 });
 results.push(readme);

 // Generate API reference
 if (projectInfo.sourceFiles.length > 0) {
 const apiRef = await this.generateApiReference(projectInfo.sourceFiles);
 results.push(apiRef);
 }

 return results;
 }
}

