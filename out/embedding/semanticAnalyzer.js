"use strict";
/**
 * Advanced Semantic Analyzer
 *
 * Provides deep semantic understanding of code including:
 * - Intent detection (what the code is trying to do)
 * - Code pattern recognition
 * - Semantic similarity scoring
 * - Purpose classification
 * - Complexity analysis
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SemanticAnalyzer = void 0;
const types_1 = require("../types");
class SemanticAnalyzer {
    constructor() {
        this.intentPatterns = this.initializeIntentPatterns();
        this.designPatterns = this.initializeDesignPatterns();
        this.domainKeywords = this.initializeDomainKeywords();
    }
    /**
    * Analyze code semantically
    */
    async analyze(code, filePath, astAnalysis) {
        const intent = this.detectIntent(code, filePath);
        const patterns = this.detectPatterns(code, astAnalysis);
        const purpose = this.classifyPurpose(code, filePath, intent);
        const complexity = this.analyzeComplexity(code, astAnalysis);
        const concepts = this.extractConcepts(code, astAnalysis);
        const dependencies = this.extractSemanticDependencies(code, astAnalysis);
        const quality = this.assessQuality(code, patterns, complexity);
        return {
            intent,
            patterns,
            purpose,
            complexity,
            concepts,
            dependencies,
            quality
        };
    }
    /**
    * Calculate semantic similarity between two code snippets
    */
    calculateSimilarity(code1, code2, analysis1, analysis2) {
        const reasons = [];
        const sharedConcepts = [];
        let score = 0;
        // Compare intents
        if (analysis1 && analysis2) {
            if (analysis1.intent.type === analysis2.intent.type) {
                score += 0.3;
                reasons.push(`Same intent: ${analysis1.intent.type}`);
            }
            // Compare concepts
            const concepts1 = new Set(analysis1.concepts);
            const concepts2 = new Set(analysis2.concepts);
            const shared = Array.from(concepts1).filter(c => concepts2.has(c));
            if (shared.length > 0) {
                const conceptScore = shared.length / Math.max(concepts1.size, concepts2.size);
                score += conceptScore * 0.3;
                sharedConcepts.push(...shared);
                reasons.push(`Shared concepts: ${shared.join(', ')}`);
            }
            // Compare patterns
            const patterns1 = new Set(analysis1.patterns.map(p => p.name));
            const patterns2 = new Set(analysis2.patterns.map(p => p.name));
            const sharedPatterns = Array.from(patterns1).filter(p => patterns2.has(p));
            if (sharedPatterns.length > 0) {
                score += 0.2;
                reasons.push(`Shared patterns: ${sharedPatterns.join(', ')}`);
            }
            // Compare purpose
            if (analysis1.purpose.domain === analysis2.purpose.domain) {
                score += 0.1;
                reasons.push(`Same domain: ${analysis1.purpose.domain}`);
            }
            if (analysis1.purpose.layer === analysis2.purpose.layer) {
                score += 0.1;
                reasons.push(`Same layer: ${analysis1.purpose.layer}`);
            }
        }
        else {
            // Fallback to text similarity
            score = this.calculateTextSimilarity(code1, code2);
            reasons.push('Text-based similarity');
        }
        return {
            score: Math.min(score, 1.0),
            reasons,
            sharedConcepts
        };
    }
    /**
    * Detect intent of code
    */
    detectIntent(code, filePath) {
        const intents = [];
        // Check each intent pattern
        for (const [intentType, patterns] of this.intentPatterns.entries()) {
            let matches = 0;
            const matchedKeywords = [];
            for (const pattern of patterns) {
                const match = code.match(pattern);
                if (match) {
                    matches++;
                    matchedKeywords.push(match[0]);
                }
            }
            if (matches > 0) {
                intents.push({
                    type: intentType,
                    confidence: Math.min(matches / patterns.length, 1.0),
                    keywords: matchedKeywords
                });
            }
        }
        // Sort by confidence and return top intent
        intents.sort((a, b) => b.confidence - a.confidence);
        if (intents.length > 0) {
            const topIntent = intents[0];
            return {
                type: topIntent.type,
                confidence: topIntent.confidence,
                description: this.getIntentDescription(topIntent.type),
                keywords: topIntent.keywords
            };
        }
        return {
            type: 'unknown',
            confidence: 0,
            description: 'Unable to determine intent',
            keywords: []
        };
    }
    /**
    * Detect design patterns
    */
    detectPatterns(code, astAnalysis) {
        const patterns = [];
        // Singleton pattern
        if (/private\s+static\s+\w+\s*:\s*\w+/.test(code) && /getInstance\(\)/.test(code)) {
            patterns.push({
                name: 'Singleton',
                type: 'design_pattern',
                confidence: 0.9,
                description: 'Ensures a class has only one instance',
                examples: []
            });
        }
        // Factory pattern
        if (/create\w+\(/.test(code) && /return\s+new\s+\w+/.test(code)) {
            patterns.push({
                name: 'Factory',
                type: 'design_pattern',
                confidence: 0.8,
                description: 'Creates objects without specifying exact class',
                examples: []
            });
        }
        // Observer pattern
        if (/subscribe|addEventListener|on\(/.test(code) && /notify|emit|trigger/.test(code)) {
            patterns.push({
                name: 'Observer',
                type: 'design_pattern',
                confidence: 0.85,
                description: 'Defines one-to-many dependency between objects',
                examples: []
            });
        }
        // Builder pattern
        if (/\.with\w+\(/.test(code) && /\.build\(\)/.test(code)) {
            patterns.push({
                name: 'Builder',
                type: 'design_pattern',
                confidence: 0.9,
                description: 'Constructs complex objects step by step',
                examples: []
            });
        }
        // Strategy pattern
        if (astAnalysis && astAnalysis.symbols.some(s => s.kind === types_1.SymbolKind.INTERFACE && /Strategy|Algorithm/.test(s.name))) {
            patterns.push({
                name: 'Strategy',
                type: 'design_pattern',
                confidence: 0.85,
                description: 'Defines family of algorithms and makes them interchangeable',
                examples: []
            });
        }
        // Anti-pattern: God Object
        if (astAnalysis) {
            const classes = astAnalysis.symbols.filter(s => s.kind === types_1.SymbolKind.CLASS);
            for (const cls of classes) {
                const methods = astAnalysis.symbols.filter(s => s.parent === cls.name && s.kind === types_1.SymbolKind.METHOD);
                if (methods.length > 20) {
                    patterns.push({
                        name: 'God Object',
                        type: 'anti_pattern',
                        confidence: 0.9,
                        description: 'Class with too many responsibilities',
                        examples: [cls.name]
                    });
                }
            }
        }
        return patterns;
    }
    /**
    * Classify purpose of code
    */
    classifyPurpose(code, filePath, intent) {
        // Determine domain
        let domain = 'general';
        for (const [domainName, keywords] of this.domainKeywords.entries()) {
            if (keywords.some(kw => code.includes(kw) || filePath.includes(kw))) {
                domain = domainName;
                break;
            }
        }
        // Determine layer
        let layer = 'unknown';
        if (/controller|route|endpoint/i.test(filePath) || /router|express|fastify/.test(code)) {
            layer = 'controller';
        }
        else if (/service|business/i.test(filePath)) {
            layer = 'service';
        }
        else if (/model|entity|schema/i.test(filePath)) {
            layer = 'model';
        }
        else if (/repository|dao/i.test(filePath)) {
            layer = 'repository';
        }
        else if (/component|view/i.test(filePath)) {
            layer = 'view';
        }
        else if (/util|helper/i.test(filePath)) {
            layer = 'utility';
        }
        return {
            primary: intent.description,
            secondary: [],
            domain,
            layer
        };
    }
    /**
    * Analyze complexity
    */
    analyzeComplexity(code, astAnalysis) {
        // Calculate cyclomatic complexity
        let cyclomatic = 1;
        const decisionPoints = code.match(/if|else|for|while|case|catch|\?\?|\|\||&&/g);
        if (decisionPoints) {
            cyclomatic += decisionPoints.length;
        }
        // Calculate cognitive complexity (how hard to understand)
        let cognitive = 0;
        cognitive += (code.match(/if|else/g) || []).length * 1;
        cognitive += (code.match(/for|while/g) || []).length * 2;
        cognitive += (code.match(/switch|case/g) || []).length * 1;
        cognitive += (code.match(/try|catch/g) || []).length * 1;
        cognitive += (code.match(/\?\?|\|\||&&/g) || []).length * 0.5;
        // Nesting penalty
        const nestingLevel = this.calculateNestingLevel(code);
        cognitive += nestingLevel * 2;
        // Calculate maintainability (0-100)
        const lines = code.split('\n').length;
        const commentRatio = (code.match(/\/\/|\/\*|\*\//g) || []).length / lines;
        let maintainability = 100;
        maintainability -= Math.min(cyclomatic * 2, 40);
        maintainability -= Math.min(cognitive, 30);
        maintainability += commentRatio * 10;
        maintainability = Math.max(0, Math.min(100, maintainability));
        return {
            cognitive: Math.min(cognitive, 100),
            cyclomatic,
            maintainability
        };
    }
    /**
    * Extract key concepts from code
    */
    extractConcepts(code, astAnalysis) {
        const concepts = new Set();
        // Extract from symbol names
        if (astAnalysis) {
            for (const symbol of astAnalysis.symbols) {
                // Split camelCase and PascalCase
                const words = symbol.name.split(/(?=[A-Z])/).map(w => w.toLowerCase());
                words.forEach(w => concepts.add(w));
            }
        }
        // Extract from comments
        const comments = code.match(/\/\/.*|\/\*[\s\S]*?\*\//g) || [];
        for (const comment of comments) {
            const words = comment.match(/\b[a-z]{4,}\b/gi) || [];
            words.forEach(w => concepts.add(w.toLowerCase()));
        }
        // Extract from string literals
        const strings = code.match(/"[^"]+"|'[^']+'/g) || [];
        for (const str of strings) {
            const words = str.match(/\b[a-z]{4,}\b/gi) || [];
            words.forEach(w => concepts.add(w.toLowerCase()));
        }
        // Filter out common words
        const commonWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'will', 'would', 'could', 'should']);
        return Array.from(concepts).filter(c => !commonWords.has(c) && c.length > 2);
    }
    /**
    * Extract semantic dependencies
    */
    extractSemanticDependencies(code, astAnalysis) {
        const dependencies = new Set();
        // Extract from imports
        if (astAnalysis) {
            for (const imp of astAnalysis.imports) {
                dependencies.add(imp.module);
            }
        }
        // Extract from require statements
        const requires = code.match(/require\(['"]([^'"]+)['"]\)/g) || [];
        for (const req of requires) {
            const match = req.match(/require\(['"]([^'"]+)['"]\)/);
            if (match) {
                dependencies.add(match[1]);
            }
        }
        return Array.from(dependencies);
    }
    /**
    * Assess code quality
    */
    assessQuality(code, patterns, complexity) {
        const issues = [];
        const suggestions = [];
        let score = 100;
        // Check for anti-patterns
        const antiPatterns = patterns.filter(p => p.type === 'anti_pattern');
        if (antiPatterns.length > 0) {
            score -= antiPatterns.length * 15;
            issues.push(...antiPatterns.map(p => `Anti-pattern detected: ${p.name}`));
            suggestions.push('Refactor to remove anti-patterns');
        }
        // Check complexity
        if (complexity.cyclomatic > 10) {
            score -= (complexity.cyclomatic - 10) * 2;
            issues.push(`High cyclomatic complexity: ${complexity.cyclomatic}`);
            suggestions.push('Break down complex functions into smaller ones');
        }
        if (complexity.cognitive > 15) {
            score -= (complexity.cognitive - 15);
            issues.push(`High cognitive complexity: ${complexity.cognitive}`);
            suggestions.push('Simplify logic and reduce nesting');
        }
        // Check for comments
        const lines = code.split('\n').length;
        const commentLines = (code.match(/\/\/|\/\*/g) || []).length;
        const commentRatio = commentLines / lines;
        if (commentRatio < 0.1 && lines > 20) {
            score -= 10;
            issues.push('Insufficient comments');
            suggestions.push('Add comments to explain complex logic');
        }
        // Check for error handling
        if (!/try|catch|throw/.test(code) && code.length > 500) {
            score -= 10;
            issues.push('No error handling detected');
            suggestions.push('Add try-catch blocks for error handling');
        }
        // Check for magic numbers
        const magicNumbers = code.match(/\b\d{2,}\b/g) || [];
        if (magicNumbers.length > 3) {
            score -= 5;
            issues.push('Magic numbers detected');
            suggestions.push('Replace magic numbers with named constants');
        }
        // Check for long functions
        const functionLengths = this.calculateFunctionLengths(code);
        const longFunctions = functionLengths.filter(l => l > 50);
        if (longFunctions.length > 0) {
            score -= longFunctions.length * 5;
            issues.push(`${longFunctions.length} function(s) exceed 50 lines`);
            suggestions.push('Break down long functions into smaller ones');
        }
        return {
            score: Math.max(0, Math.min(100, score)),
            issues,
            suggestions
        };
    }
    /**
    * Calculate nesting level
    */
    calculateNestingLevel(code) {
        let maxNesting = 0;
        let currentNesting = 0;
        for (const char of code) {
            if (char === '{') {
                currentNesting++;
                maxNesting = Math.max(maxNesting, currentNesting);
            }
            else if (char === '}') {
                currentNesting--;
            }
        }
        return maxNesting;
    }
    /**
    * Calculate function lengths
    */
    calculateFunctionLengths(code) {
        const lengths = [];
        const functionRegex = /function\s+\w+\s*\([^)]*\)\s*\{|=>\s*\{|\w+\s*\([^)]*\)\s*\{/g;
        let match;
        while ((match = functionRegex.exec(code)) !== null) {
            const startIndex = match.index;
            let braceCount = 1;
            let endIndex = startIndex + match[0].length;
            for (let i = endIndex; i < code.length && braceCount > 0; i++) {
                if (code[i] === '{')
                    braceCount++;
                if (code[i] === '}')
                    braceCount--;
                endIndex = i;
            }
            const functionCode = code.substring(startIndex, endIndex);
            const lines = functionCode.split('\n').length;
            lengths.push(lines);
        }
        return lengths;
    }
    /**
    * Calculate text similarity (fallback)
    */
    calculateTextSimilarity(text1, text2) {
        const words1 = new Set(text1.toLowerCase().match(/\b\w+\b/g) || []);
        const words2 = new Set(text2.toLowerCase().match(/\b\w+\b/g) || []);
        const intersection = new Set(Array.from(words1).filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        return union.size > 0 ? intersection.size / union.size : 0;
    }
    /**
    * Get intent description
    */
    getIntentDescription(type) {
        const descriptions = {
            data_processing: 'Processes or transforms data',
            api_endpoint: 'Handles HTTP requests and responses',
            validation: 'Validates input or data',
            transformation: 'Transforms data from one format to another',
            authentication: 'Handles user authentication',
            authorization: 'Handles user authorization and permissions',
            database_operation: 'Performs database operations',
            file_operation: 'Performs file system operations',
            network_operation: 'Performs network operations',
            ui_component: 'Renders UI components',
            business_logic: 'Implements business rules',
            utility: 'Provides utility functions',
            test: 'Tests functionality',
            unknown: 'Unknown intent'
        };
        return descriptions[type];
    }
    /**
    * Initialize intent patterns
    */
    initializeIntentPatterns() {
        return new Map([
            ['data_processing', [/map\(/, /filter\(/, /reduce\(/, /transform/, /process/i]],
            ['api_endpoint', [/router\.|app\.(get|post|put|delete)/, /express/, /@(Get|Post|Put|Delete)/]],
            ['validation', [/validate/, /isValid/, /check/, /assert/, /schema\.validate/]],
            ['transformation', [/convert/, /parse/, /serialize/, /deserialize/, /toJSON/, /fromJSON/]],
            ['authentication', [/login/, /authenticate/, /passport/, /jwt/, /token/, /session/]],
            ['authorization', [/authorize/, /permission/, /role/, /canAccess/, /isAllowed/]],
            ['database_operation', [/query/, /find/, /save/, /update/, /delete/, /insert/, /select/]],
            ['file_operation', [/readFile/, /writeFile/, /fs\./, /createReadStream/, /createWriteStream/]],
            ['network_operation', [/fetch/, /axios/, /http\./, /request/, /socket/]],
            ['ui_component', [/render/, /component/, /useState/, /useEffect/, /props/, /jsx/]],
            ['business_logic', [/calculate/, /compute/, /determine/, /evaluate/, /process/]],
            ['utility', [/helper/, /util/, /format/, /parse/, /convert/]],
            ['test', [/describe\(/, /it\(/, /test\(/, /expect\(/, /assert/]]
        ]);
    }
    /**
    * Initialize design patterns
    */
    initializeDesignPatterns() {
        return new Map([
            ['Singleton', [/private\s+static\s+instance/, /getInstance\(\)/]],
            ['Factory', [/create\w+\(/, /factory/i]],
            ['Observer', [/subscribe/, /addEventListener/, /on\(/, /emit/, /notify/]],
            ['Builder', [/\.with\w+\(/, /\.build\(\)/]],
            ['Strategy', [/strategy/i, /algorithm/i]]
        ]);
    }
    /**
    * Initialize domain keywords
    */
    initializeDomainKeywords() {
        return new Map([
            ['web', ['http', 'express', 'router', 'request', 'response', 'api', 'endpoint']],
            ['data', ['database', 'query', 'sql', 'mongodb', 'postgres', 'redis', 'cache']],
            ['ml', ['model', 'train', 'predict', 'tensor', 'neural', 'learning', 'dataset']],
            ['system', ['process', 'thread', 'memory', 'cpu', 'kernel', 'system']],
            ['security', ['encrypt', 'decrypt', 'hash', 'auth', 'token', 'jwt', 'oauth']],
            ['ui', ['component', 'render', 'view', 'template', 'react', 'vue', 'angular']]
        ]);
    }
}
exports.SemanticAnalyzer = SemanticAnalyzer;
//# sourceMappingURL=semanticAnalyzer.js.map