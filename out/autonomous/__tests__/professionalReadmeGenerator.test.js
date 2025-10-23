"use strict";
/**
 * Tests for Professional README Generator
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
const professionalReadmeGenerator_1 = require("../professionalReadmeGenerator");
const orchestrator_1 = require("../../models/orchestrator");
// Mock dependencies
jest.mock('../../models/orchestrator');
jest.mock('fs/promises');
describe('ProfessionalReadmeGenerator', () => {
    let generator;
    let mockOrchestrator;
    const workspaceRoot = '/test/workspace';
    beforeEach(() => {
        mockOrchestrator = new orchestrator_1.ModelOrchestrator({}, {}, {}, {});
        generator = new professionalReadmeGenerator_1.ProfessionalReadmeGenerator(mockOrchestrator, workspaceRoot);
    });
    describe('generateFromProject', () => {
        it('should generate professional README without emojis', async () => {
            const projectInfo = {
                name: 'Test Project',
                description: 'A test project',
                version: '1.0.0',
                license: 'MIT'
            };
            const mockResponse = {
                content: JSON.stringify({
                    description: 'This is a professional test project that solves important problems.',
                    features: [
                        'Feature 1: Core functionality',
                        'Feature 2: Advanced capabilities',
                        'Feature 3: Integration support'
                    ],
                    installation: '```bash\nnpm install test-project\n```',
                    usage: '```javascript\nconst project = require("test-project");\nproject.run();\n```',
                    systemDesign: 'The system follows a modular architecture with clear separation of concerns.',
                    architecture: 'The project is organized into modules: core, utils, and integrations.',
                    configuration: 'Configuration is managed through environment variables.',
                    development: 'Run `npm run dev` to start development server.',
                    testing: 'Run `npm test` to execute the test suite.',
                    contributing: 'Please read CONTRIBUTING.md for details on our code of conduct.'
                }),
                model: 'claude-sonnet-4',
                usage: { promptTokens: 200, completionTokens: 300, totalTokens: 500 },
                cost: 0.01,
                latency: 1000
            };
            mockOrchestrator.sendRequest.mockResolvedValue(mockResponse);
            const readme = await generator.generateFromProject(projectInfo);
            // Verify README structure
            expect(readme).toContain('# Test Project');
            expect(readme).toContain('## Description');
            expect(readme).toContain('## Features');
            expect(readme).toContain('## Installation');
            expect(readme).toContain('## Usage');
            expect(readme).toContain('## System Design');
            expect(readme).toContain('## Architecture');
            // Verify NO emojis
            expect(readme).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u); // No emojis
            expect(readme).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u); // No emoji characters
            // Verify professional content
            expect(readme).toContain('professional');
            expect(readme).toContain('Feature 1');
            expect(readme).toContain('npm install');
        });
        it('should include all required sections', async () => {
            const projectInfo = {
                name: 'Complete Project',
                description: 'A complete project with all sections',
                version: '2.0.0',
                license: 'Apache-2.0'
            };
            const mockResponse = {
                content: JSON.stringify({
                    description: 'Complete description',
                    features: ['Feature A', 'Feature B'],
                    installation: 'Install instructions',
                    usage: 'Usage instructions',
                    api: 'API documentation',
                    systemDesign: 'System design details',
                    architecture: 'Architecture overview',
                    configuration: 'Configuration guide',
                    development: 'Development setup',
                    testing: 'Testing guide',
                    contributing: 'Contributing guidelines'
                }),
                model: 'claude-sonnet-4',
                usage: { promptTokens: 250, completionTokens: 350, totalTokens: 600 },
                cost: 0.012,
                latency: 1200
            };
            mockOrchestrator.sendRequest.mockResolvedValue(mockResponse);
            const readme = await generator.generateFromProject(projectInfo);
            // Verify all sections present
            expect(readme).toContain('## Description');
            expect(readme).toContain('## Features');
            expect(readme).toContain('## Installation');
            expect(readme).toContain('## Usage');
            expect(readme).toContain('## API Documentation');
            expect(readme).toContain('## System Design');
            expect(readme).toContain('## Architecture');
            expect(readme).toContain('## Configuration');
            expect(readme).toContain('## Development');
            expect(readme).toContain('## Testing');
            expect(readme).toContain('## Contributing');
            expect(readme).toContain('## License');
        });
        it('should handle AI response parsing errors gracefully', async () => {
            const projectInfo = {
                name: 'Error Project',
                description: 'Project with parsing error',
                version: '1.0.0',
                license: 'MIT'
            };
            const mockResponse = {
                content: 'Invalid JSON response without proper structure',
                model: 'claude-sonnet-4',
                usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
                cost: 0.002,
                latency: 500
            };
            mockOrchestrator.sendRequest.mockResolvedValue(mockResponse);
            const readme = await generator.generateFromProject(projectInfo);
            // Should still generate basic README
            expect(readme).toContain('# Error Project');
            expect(readme).toContain('## Description');
            expect(readme).toContain('Project with parsing error');
        });
        it('should use professional language without casual terms', async () => {
            const projectInfo = {
                name: 'Professional Project',
                description: 'A professional software project',
                version: '1.0.0',
                license: 'MIT'
            };
            const mockResponse = {
                content: JSON.stringify({
                    description: 'This project provides enterprise-grade solutions for complex problems.',
                    features: ['Robust error handling', 'Comprehensive testing', 'Production-ready code'],
                    installation: 'Follow standard installation procedures.',
                    usage: 'Refer to the API documentation for usage details.'
                }),
                model: 'claude-sonnet-4',
                usage: { promptTokens: 150, completionTokens: 250, totalTokens: 400 },
                cost: 0.008,
                latency: 900
            };
            mockOrchestrator.sendRequest.mockResolvedValue(mockResponse);
            const readme = await generator.generateFromProject(projectInfo);
            // Verify professional language
            expect(readme).toContain('enterprise-grade');
            expect(readme).toContain('Robust');
            expect(readme).toContain('Comprehensive');
            expect(readme).toContain('Production-ready');
            // Verify NO casual language
            expect(readme).not.toContain('awesome');
            expect(readme).not.toContain('cool');
            expect(readme).not.toContain('neat');
            expect(readme).not.toContain('fun');
        });
    });
    describe('writeReadme', () => {
        it('should write README to correct location', async () => {
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            const content = '# Test README\n\nThis is a test.';
            await generator.writeReadme(content);
            expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('README.md'), content, 'utf-8');
        });
    });
    describe('README content validation', () => {
        it('should not contain any emoji characters', async () => {
            const projectInfo = {
                name: 'No Emoji Project',
                description: 'Project without emojis',
                version: '1.0.0',
                license: 'MIT'
            };
            const mockResponse = {
                content: JSON.stringify({
                    description: 'Clean professional description',
                    features: ['Feature without emojis'],
                    installation: 'npm install',
                    usage: 'node index.js'
                }),
                model: 'claude-sonnet-4',
                usage: { promptTokens: 80, completionTokens: 120, totalTokens: 200 },
                cost: 0.004,
                latency: 600
            };
            mockOrchestrator.sendRequest.mockResolvedValue(mockResponse);
            const readme = await generator.generateFromProject(projectInfo);
            // Comprehensive emoji check
            const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
            expect(readme).not.toMatch(emojiRegex);
            // Verify professional tone - no emoji characters
            expect(readme).not.toMatch(/[\u{1F000}-\u{1FFFF}]/u);
        });
        it('should include code blocks with proper syntax highlighting', async () => {
            const projectInfo = {
                name: 'Code Example Project',
                description: 'Project with code examples',
                version: '1.0.0',
                license: 'MIT'
            };
            const mockResponse = {
                content: JSON.stringify({
                    description: 'Project description',
                    features: ['Feature 1'],
                    installation: '```bash\nnpm install example\n```',
                    usage: '```javascript\nconst example = require("example");\nexample.run();\n```'
                }),
                model: 'claude-sonnet-4',
                usage: { promptTokens: 120, completionTokens: 180, totalTokens: 300 },
                cost: 0.006,
                latency: 800
            };
            mockOrchestrator.sendRequest.mockResolvedValue(mockResponse);
            const readme = await generator.generateFromProject(projectInfo);
            // Verify code blocks
            expect(readme).toContain('```bash');
            expect(readme).toContain('```javascript');
            expect(readme).toContain('npm install');
            expect(readme).toContain('require("example")');
        });
    });
});
//# sourceMappingURL=professionalReadmeGenerator.test.js.map