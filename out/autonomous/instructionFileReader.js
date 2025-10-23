"use strict";
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
exports.InstructionFileReader = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class InstructionFileReader {
    /**
    * Read instruction file
    */
    async readInstructionFile(filePath) {
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
    async findInstructionFiles(workspaceRoot) {
        const instructionFiles = [];
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
            }
            catch {
                // File doesn't exist, continue
            }
        }
        return instructionFiles;
    }
    /**
    * Detect file format
    */
    detectFormat(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        return ext === '.md' || ext === '.markdown' ? 'markdown' : 'text';
    }
    /**
    * Parse sections from content
    */
    parseSections(content, format) {
        if (format === 'markdown') {
            return this.parseMarkdownSections(content);
        }
        else {
            return this.parseTextSections(content);
        }
    }
    /**
    * Parse markdown sections
    */
    parseMarkdownSections(content) {
        const sections = [];
        const lines = content.split('\n');
        let currentSection = null;
        let currentContent = [];
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
            }
            else if (currentSection) {
                currentContent.push(line);
            }
            else {
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
    parseTextSections(content) {
        const sections = [];
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
    detectSectionType(text) {
        const lower = text.toLowerCase();
        if (lower.includes('requirement') || lower.includes('must') || lower.includes('should')) {
            return 'requirements';
        }
        else if (lower.includes('feature') || lower.includes('functionality')) {
            return 'features';
        }
        else if (lower.includes('technical') || lower.includes('architecture') || lower.includes('stack')) {
            return 'technical';
        }
        else if (lower.includes('constraint') || lower.includes('limitation') || lower.includes('restriction')) {
            return 'constraints';
        }
        else if (lower.includes('example') || lower.includes('sample') || lower.includes('demo')) {
            return 'examples';
        }
        else {
            return 'other';
        }
    }
    /**
    * Detect priority from title/content
    */
    detectPriority(text) {
        const lower = text.toLowerCase();
        if (lower.includes('critical') || lower.includes('must') || lower.includes('required')) {
            return 'high';
        }
        else if (lower.includes('optional') || lower.includes('nice to have') || lower.includes('future')) {
            return 'low';
        }
        else {
            return 'medium';
        }
    }
    /**
    * Extract metadata from content
    */
    extractMetadata(content, sections) {
        const metadata = {};
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
    convertToWorkflowInput(instruction) {
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
exports.InstructionFileReader = InstructionFileReader;
//# sourceMappingURL=instructionFileReader.js.map