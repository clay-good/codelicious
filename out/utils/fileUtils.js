"use strict";
/**
 * File utility functions for indexing
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFileHash = getFileHash;
exports.getFileSize = getFileSize;
exports.getFileModifiedTime = getFileModifiedTime;
exports.detectLanguage = detectLanguage;
exports.shouldIndexFile = shouldIndexFile;
exports.createIgnoreMatcher = createIgnoreMatcher;
exports.findFiles = findFiles;
exports.readFileContent = readFileContent;
exports.fileExists = fileExists;
exports.getRelativePath = getRelativePath;
exports.detectProjectType = detectProjectType;
exports.parsePackageJson = parsePackageJson;
exports.getFileStats = getFileStats;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const ignore_1 = __importDefault(require("ignore"));
const fast_glob_1 = __importDefault(require("fast-glob"));
const logger_1 = require("./logger");
const logger = (0, logger_1.createLogger)('FileUtils');
/**
 * Get file hash for change detection
 */
function getFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return crypto.createHash('md5').update(content).digest('hex');
    }
    catch (error) {
        logger.error(`Error hashing file ${filePath}`, error);
        return '';
    }
}
/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    }
    catch (error) {
        return 0;
    }
}
/**
 * Get file last modified time
 */
function getFileModifiedTime(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.mtimeMs;
    }
    catch (error) {
        return 0;
    }
}
/**
 * Detect programming language from file extension
 */
function detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap = {
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.py': 'python',
        '.rs': 'rust',
        '.go': 'go',
        '.java': 'java',
        '.c': 'c',
        '.cpp': 'cpp',
        '.h': 'c',
        '.hpp': 'cpp',
        '.cs': 'csharp',
        '.rb': 'ruby',
        '.php': 'php',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.r': 'r',
        '.m': 'objective-c',
        '.sh': 'shell',
        '.bash': 'shell',
        '.zsh': 'shell',
        '.sql': 'sql',
        '.html': 'html',
        '.css': 'css',
        '.scss': 'scss',
        '.json': 'json',
        '.xml': 'xml',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.md': 'markdown',
        '.txt': 'text'
    };
    return languageMap[ext] || 'unknown';
}
/**
 * Check if file should be indexed
 */
function shouldIndexFile(filePath) {
    const language = detectLanguage(filePath);
    // Only index known programming languages and documentation
    const indexableLanguages = [
        'typescript', 'javascript', 'python', 'rust', 'go', 'java',
        'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'kotlin',
        'scala', 'r', 'objective-c', 'shell', 'sql', 'markdown'
    ];
    return indexableLanguages.includes(language);
}
/**
 * Create ignore matcher from patterns
 */
function createIgnoreMatcher(patterns) {
    const ig = (0, ignore_1.default)();
    ig.add(patterns);
    return ig;
}
/**
 * Find all files in directory matching patterns
 */
async function findFiles(directory, excludePatterns = []) {
    try {
        const files = await (0, fast_glob_1.default)('**/*', {
            cwd: directory,
            absolute: true,
            ignore: excludePatterns,
            onlyFiles: true,
            followSymbolicLinks: false
        });
        return files.filter(shouldIndexFile);
    }
    catch (error) {
        logger.error('Error finding files', error);
        return [];
    }
}
/**
 * Read file content safely
 */
function readFileContent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    }
    catch (error) {
        logger.error(`Error reading file ${filePath}`, error);
        return null;
    }
}
/**
 * Check if file exists
 */
function fileExists(filePath) {
    try {
        return fs.existsSync(filePath);
    }
    catch (error) {
        return false;
    }
}
/**
 * Get relative path from workspace root
 */
function getRelativePath(filePath, workspaceRoot) {
    return path.relative(workspaceRoot, filePath);
}
/**
 * Detect project type from workspace
 */
function detectProjectType(workspaceRoot) {
    const indicators = {
        'node': ['package.json', 'node_modules'],
        'python': ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
        'rust': ['Cargo.toml', 'Cargo.lock'],
        'go': ['go.mod', 'go.sum'],
        'java': ['pom.xml', 'build.gradle', 'build.gradle.kts'],
        'dotnet': ['*.csproj', '*.sln'],
        'ruby': ['Gemfile', 'Gemfile.lock'],
        'php': ['composer.json', 'composer.lock']
    };
    for (const [type, files] of Object.entries(indicators)) {
        for (const file of files) {
            const filePath = path.join(workspaceRoot, file);
            if (fileExists(filePath)) {
                return type;
            }
        }
    }
    return 'unknown';
}
/**
 * Parse package.json for dependencies
 */
function parsePackageJson(workspaceRoot) {
    const packagePath = path.join(workspaceRoot, 'package.json');
    if (!fileExists(packagePath)) {
        return null;
    }
    try {
        const content = readFileContent(packagePath);
        if (!content) {
            return null;
        }
        return JSON.parse(content);
    }
    catch (error) {
        logger.error('Error parsing package.json', error);
        return null;
    }
}
function getFileStats(filePath, workspaceRoot) {
    return {
        size: getFileSize(filePath),
        modified: getFileModifiedTime(filePath),
        hash: getFileHash(filePath),
        language: detectLanguage(filePath),
        relativePath: getRelativePath(filePath, workspaceRoot)
    };
}
//# sourceMappingURL=fileUtils.js.map