"use strict";
/**
 * Professional README Generator
 * Generates comprehensive, professional READMEs without emojis
 * Includes: Description, Installation, Usage, Architecture, System Design
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
exports.ProfessionalReadmeGenerator = void 0;
const modelRouter_1 = require("../models/modelRouter");
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ProfessionalReadmeGenerator');
class ProfessionalReadmeGenerator {
    constructor(orchestrator, workspaceRoot) {
        this.orchestrator = orchestrator;
        this.workspaceRoot = workspaceRoot;
    }
    /**
    * Generate professional README from project analysis
    */
    async generateFromProject(projectInfo) {
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
    async generateReadmeContent(projectInfo, structure, // Project structure from analyzer
    techStack // Tech stack from analyzer
    ) {
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
        const response = await this.orchestrator.sendRequest({
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert technical writer. Create clear, professional documentation without emojis. Focus on technical accuracy and completeness.'
                },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3
        }, { complexity: modelRouter_1.TaskComplexity.MODERATE });
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
    formatReadme(content) {
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
    async analyzeProjectStructure() {
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
        }
        catch (error) {
            return { error: 'Could not analyze structure' };
        }
    }
    /**
    * Detect technology stack
    */
    async detectTechnologyStack() {
        const stack = {
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
        }
        catch (error) {
            // Ignore errors
        }
        return stack;
    }
    /**
    * Generate fallback content
    */
    generateFallbackContent(projectInfo) {
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
    async writeReadme(content) {
        const readmePath = path.join(this.workspaceRoot, 'README.md');
        await fs.writeFile(readmePath, content, 'utf-8');
        logger.info('README.md written successfully');
    }
}
exports.ProfessionalReadmeGenerator = ProfessionalReadmeGenerator;
//# sourceMappingURL=professionalReadmeGenerator.js.map