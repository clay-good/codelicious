"use strict";
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
exports.DocumentationGenerator = exports.DocumentationType = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const modelRouter_1 = require("../models/modelRouter");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('DocumentationGenerator');
/**
 * Documentation type
 */
var DocumentationType;
(function (DocumentationType) {
    DocumentationType["README"] = "readme";
    DocumentationType["API_REFERENCE"] = "api_reference";
    DocumentationType["USAGE_GUIDE"] = "usage_guide";
    DocumentationType["ARCHITECTURE"] = "architecture";
    DocumentationType["CHANGELOG"] = "changelog";
    DocumentationType["CONTRIBUTING"] = "contributing";
})(DocumentationType || (exports.DocumentationType = DocumentationType = {}));
/**
 * Auto-generate comprehensive documentation
 * Creates README, API references, usage guides, and more
 */
class DocumentationGenerator {
    constructor(orchestrator, workspaceRoot) {
        this.orchestrator = orchestrator;
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Generate README.md
    */
    async generateReadme(projectInfo) {
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
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert technical writer. Create clear, comprehensive documentation.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.5
        }, { complexity: modelRouter_1.TaskComplexity.SIMPLE });
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
    async generateApiReference(sourceFiles) {
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
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert API documentation writer. Create clear, detailed API references.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3
        }, { complexity: modelRouter_1.TaskComplexity.MODERATE });
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
    async generateUsageGuide(projectInfo) {
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
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert technical writer. Create clear, beginner-friendly guides.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.5
        }, { complexity: modelRouter_1.TaskComplexity.SIMPLE });
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
    async generateArchitectureDoc(components) {
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
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert software architect. Create clear architecture documentation.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.4
        }, { complexity: modelRouter_1.TaskComplexity.MODERATE });
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
    async generateInlineComments(code, language) {
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
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert code documenter. Add clear, helpful comments.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3
        }, { complexity: modelRouter_1.TaskComplexity.SIMPLE });
        // Extract code from response
        const codeMatch = response.content.match(/```[\w]*\n([\s\S]*?)\n```/);
        return codeMatch ? codeMatch[1] : response.content;
    }
    /**
    * Parse markdown into sections
    */
    parseMarkdownSections(markdown) {
        const sections = [];
        const lines = markdown.split('\n');
        let currentSection = null;
        let currentContent = [];
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
            }
            else if (currentSection) {
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
    async writeDocumentation(doc) {
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
    async generateAllDocumentation(projectInfo) {
        logger.info(' Generating all documentation...');
        const results = [];
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
exports.DocumentationGenerator = DocumentationGenerator;
//# sourceMappingURL=documentationGenerator.js.map