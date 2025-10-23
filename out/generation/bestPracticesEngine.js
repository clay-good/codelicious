"use strict";
/**
 * Best Practices Engine - Enforce language-specific best practices
 * Goal: Ensure generated code follows industry standards
 *
 * Features:
 * - Language-specific best practices
 * - Design pattern recommendations
 * - Anti-pattern detection
 * - Framework-specific guidelines
 * - Performance best practices
 * - Security best practices
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BestPracticesEngine = void 0;
class BestPracticesEngine {
    constructor() {
        this.practices = new Map();
        this.patterns = [];
        this.initializePractices();
        this.initializePatterns();
    }
    /**
    * Validate code against best practices
    */
    validate(code, language, framework) {
        const practices = this.getPracticesForLanguage(language, framework);
        const violations = [];
        for (const practice of practices) {
            const practiceViolations = this.checkPractice(code, practice);
            violations.push(...practiceViolations);
        }
        const score = this.calculateScore(violations, practices.length);
        const suggestions = this.generateSuggestions(violations);
        return {
            passed: violations.filter(v => v.practice.severity === 'must').length === 0,
            violations,
            suggestions,
            score
        };
    }
    /**
    * Get recommended design patterns for use case
    */
    recommendPatterns(useCase, language) {
        return this.patterns.filter(p => p.useCase.toLowerCase().includes(useCase.toLowerCase()));
    }
    /**
    * Get best practices for language
    */
    getPracticesForLanguage(language, framework) {
        const langPractices = this.practices.get(language) || [];
        if (framework) {
            return langPractices.filter(p => !p.framework || p.framework === framework);
        }
        return langPractices;
    }
    /**
    * Check if code violates a practice
    */
    checkPractice(code, practice) {
        const violations = [];
        const lines = code.split('\n');
        // Check based on practice category
        switch (practice.category) {
            case 'naming':
                violations.push(...this.checkNamingConventions(code, lines, practice));
                break;
            case 'structure':
                violations.push(...this.checkStructure(code, lines, practice));
                break;
            case 'performance':
                violations.push(...this.checkPerformance(code, lines, practice));
                break;
            case 'security':
                violations.push(...this.checkSecurity(code, lines, practice));
                break;
            case 'testing':
                violations.push(...this.checkTesting(code, lines, practice));
                break;
            case 'documentation':
                violations.push(...this.checkDocumentation(code, lines, practice));
                break;
        }
        return violations;
    }
    /**
    * Check naming conventions
    */
    checkNamingConventions(code, lines, practice) {
        const violations = [];
        if (practice.id === 'camelCase-functions') {
            const functionPattern = /function\s+([A-Z][a-zA-Z0-9]*)/g;
            let match;
            while ((match = functionPattern.exec(code)) !== null) {
                const lineNum = code.substring(0, match.index).split('\n').length;
                violations.push({
                    practice,
                    location: { line: lineNum, column: 0 },
                    message: `Function "${match[1]}" should use camelCase`,
                    fix: `Rename to ${match[1].charAt(0).toLowerCase() + match[1].slice(1)}`
                });
            }
        }
        if (practice.id === 'PascalCase-classes') {
            const classPattern = /class\s+([a-z][a-zA-Z0-9]*)/g;
            let match;
            while ((match = classPattern.exec(code)) !== null) {
                const lineNum = code.substring(0, match.index).split('\n').length;
                violations.push({
                    practice,
                    location: { line: lineNum, column: 0 },
                    message: `Class "${match[1]}" should use PascalCase`,
                    fix: `Rename to ${match[1].charAt(0).toUpperCase() + match[1].slice(1)}`
                });
            }
        }
        return violations;
    }
    /**
    * Check code structure
    */
    checkStructure(code, lines, practice) {
        const violations = [];
        if (practice.id === 'single-responsibility') {
            // Check if class/function does too many things
            const classPattern = /class\s+\w+/g;
            const matches = code.match(classPattern);
            if (matches) {
                for (const match of matches) {
                    const classCode = this.extractClassCode(code, match);
                    const methodCount = (classCode.match(/\s+(public|private|protected)?\s*\w+\s*\(/g) || []).length;
                    if (methodCount > 10) {
                        violations.push({
                            practice,
                            location: { line: 0, column: 0 },
                            message: `Class has ${methodCount} methods - consider splitting responsibilities`,
                            fix: 'Extract related methods into separate classes'
                        });
                    }
                }
            }
        }
        return violations;
    }
    /**
    * Check performance practices
    */
    checkPerformance(code, lines, practice) {
        const violations = [];
        if (practice.id === 'avoid-nested-loops') {
            let nestingLevel = 0;
            lines.forEach((line, index) => {
                if (line.includes('for') || line.includes('while')) {
                    nestingLevel++;
                    if (nestingLevel > 2) {
                        violations.push({
                            practice,
                            location: { line: index + 1, column: 0 },
                            message: 'Deeply nested loops detected - O(n³) or worse complexity',
                            fix: 'Consider using hash maps, sets, or algorithmic optimization'
                        });
                    }
                }
                if (line.includes('}')) {
                    nestingLevel = Math.max(0, nestingLevel - 1);
                }
            });
        }
        return violations;
    }
    /**
    * Check security practices
    */
    checkSecurity(code, lines, practice) {
        const violations = [];
        if (practice.id === 'no-eval') {
            if (code.includes('eval(')) {
                violations.push({
                    practice,
                    location: { line: 0, column: 0 },
                    message: 'Use of eval() is a security risk',
                    fix: 'Use safer alternatives like JSON.parse() or Function constructor'
                });
            }
        }
        if (practice.id === 'no-hardcoded-secrets') {
            const secretPatterns = [
                /password\s*=\s*['"][^'"]+['"]/i,
                /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
                /secret\s*=\s*['"][^'"]+['"]/i,
                /token\s*=\s*['"][^'"]+['"]/i
            ];
            lines.forEach((line, index) => {
                for (const pattern of secretPatterns) {
                    if (pattern.test(line)) {
                        violations.push({
                            practice,
                            location: { line: index + 1, column: 0 },
                            message: 'Hardcoded secret detected',
                            fix: 'Use environment variables or secure secret management'
                        });
                    }
                }
            });
        }
        return violations;
    }
    /**
    * Check testing practices
    */
    checkTesting(code, lines, practice) {
        const violations = [];
        if (practice.id === 'test-coverage') {
            // This would integrate with actual test coverage tools
            // For now, just check if test file exists
        }
        return violations;
    }
    /**
    * Check documentation practices
    */
    checkDocumentation(code, lines, practice) {
        const violations = [];
        if (practice.id === 'document-public-api') {
            const publicFunctionPattern = /export\s+(function|class|const)\s+(\w+)/g;
            let match;
            while ((match = publicFunctionPattern.exec(code)) !== null) {
                const lineNum = code.substring(0, match.index).split('\n').length;
                const prevLine = lines[lineNum - 2];
                if (!prevLine || !prevLine.trim().startsWith('/**')) {
                    violations.push({
                        practice,
                        location: { line: lineNum, column: 0 },
                        message: `Public ${match[1]} "${match[2]}" lacks JSDoc documentation`,
                        fix: 'Add JSDoc comment describing purpose, parameters, and return value'
                    });
                }
            }
        }
        return violations;
    }
    /**
    * Calculate score based on violations
    */
    calculateScore(violations, totalPractices) {
        let score = 100;
        for (const violation of violations) {
            switch (violation.practice.severity) {
                case 'must':
                    score -= 10;
                    break;
                case 'should':
                    score -= 5;
                    break;
                case 'consider':
                    score -= 2;
                    break;
            }
        }
        return Math.max(0, score);
    }
    /**
    * Generate suggestions
    */
    generateSuggestions(violations) {
        const suggestions = [];
        const categories = new Set(violations.map(v => v.practice.category));
        for (const category of categories) {
            const categoryViolations = violations.filter(v => v.practice.category === category);
            suggestions.push(`${category}: ${categoryViolations.length} issue(s) found`);
        }
        return suggestions;
    }
    /**
    * Extract class code
    */
    extractClassCode(code, className) {
        const classStart = code.indexOf(className);
        if (classStart === -1)
            return '';
        let braceCount = 0;
        let inClass = false;
        let classCode = '';
        for (let i = classStart; i < code.length; i++) {
            const char = code[i];
            classCode += char;
            if (char === '{') {
                braceCount++;
                inClass = true;
            }
            else if (char === '}') {
                braceCount--;
                if (inClass && braceCount === 0) {
                    break;
                }
            }
        }
        return classCode;
    }
    /**
    * Initialize best practices
    */
    initializePractices() {
        // TypeScript/JavaScript practices
        const tsPractices = [
            {
                id: 'camelCase-functions',
                category: 'naming',
                language: 'typescript',
                rule: 'Use camelCase for functions and variables',
                description: 'Functions and variables should use camelCase naming convention',
                example: 'function getUserData() { }',
                antiPattern: 'function GetUserData() { }',
                severity: 'should'
            },
            {
                id: 'PascalCase-classes',
                category: 'naming',
                language: 'typescript',
                rule: 'Use PascalCase for classes and interfaces',
                description: 'Classes and interfaces should use PascalCase naming convention',
                example: 'class UserService { }',
                antiPattern: 'class userService { }',
                severity: 'should'
            },
            {
                id: 'single-responsibility',
                category: 'structure',
                language: 'typescript',
                rule: 'Each class should have a single responsibility',
                description: 'Classes should focus on one thing and do it well',
                example: 'class UserRepository { } // Only handles user data access',
                antiPattern: 'class UserManager { } // Handles data, validation, email, etc.',
                severity: 'should'
            },
            {
                id: 'avoid-nested-loops',
                category: 'performance',
                language: 'typescript',
                rule: 'Avoid deeply nested loops',
                description: 'Nested loops beyond 2 levels indicate algorithmic issues',
                example: 'Use hash maps or better algorithms',
                antiPattern: 'for(...) { for(...) { for(...) { } } }',
                severity: 'should'
            },
            {
                id: 'no-eval',
                category: 'security',
                language: 'typescript',
                rule: 'Never use eval()',
                description: 'eval() is a security vulnerability',
                example: 'JSON.parse(data)',
                antiPattern: 'eval(userInput)',
                severity: 'must'
            },
            {
                id: 'no-hardcoded-secrets',
                category: 'security',
                language: 'typescript',
                rule: 'Never hardcode secrets',
                description: 'Use environment variables for sensitive data',
                example: 'const apiKey = process.env.API_KEY',
                antiPattern: 'const apiKey = "sk-1234567890"',
                severity: 'must'
            },
            {
                id: 'document-public-api',
                category: 'documentation',
                language: 'typescript',
                rule: 'Document all public APIs',
                description: 'All exported functions/classes need JSDoc comments',
                example: '/** Description */ export function foo() { }',
                antiPattern: 'export function foo() { }',
                severity: 'should'
            }
        ];
        this.practices.set('typescript', tsPractices);
        this.practices.set('javascript', tsPractices);
        // Python practices
        const pythonPractices = [
            {
                id: 'snake_case',
                category: 'naming',
                language: 'python',
                rule: 'Use snake_case for functions and variables',
                description: 'Follow PEP 8 naming conventions',
                example: 'def get_user_data():',
                antiPattern: 'def getUserData():',
                severity: 'should'
            },
            {
                id: 'docstrings',
                category: 'documentation',
                language: 'python',
                rule: 'Use docstrings for all public functions',
                description: 'Follow PEP 257 docstring conventions',
                example: '"""Get user data."""',
                antiPattern: '# Get user data',
                severity: 'should'
            }
        ];
        this.practices.set('python', pythonPractices);
    }
    /**
    * Initialize design patterns
    */
    initializePatterns() {
        this.patterns = [
            {
                name: 'Singleton',
                category: 'creational',
                description: 'Ensure a class has only one instance',
                useCase: 'database connection, configuration manager',
                implementation: 'Private constructor, static instance',
                pros: ['Controlled access', 'Lazy initialization'],
                cons: ['Global state', 'Testing difficulty']
            },
            {
                name: 'Factory',
                category: 'creational',
                description: 'Create objects without specifying exact class',
                useCase: 'object creation based on conditions',
                implementation: 'Factory method returns interface/base class',
                pros: ['Loose coupling', 'Easy to extend'],
                cons: ['More classes', 'Complexity']
            },
            {
                name: 'Observer',
                category: 'behavioral',
                description: 'Define one-to-many dependency between objects',
                useCase: 'event handling, pub/sub systems',
                implementation: 'Subject maintains list of observers',
                pros: ['Loose coupling', 'Dynamic relationships'],
                cons: ['Memory leaks', 'Unexpected updates']
            },
            {
                name: 'Strategy',
                category: 'behavioral',
                description: 'Define family of algorithms, make them interchangeable',
                useCase: 'different sorting algorithms, payment methods',
                implementation: 'Interface with multiple implementations',
                pros: ['Runtime algorithm selection', 'Easy to add new strategies'],
                cons: ['More classes', 'Client must know strategies']
            }
        ];
    }
}
exports.BestPracticesEngine = BestPracticesEngine;
//# sourceMappingURL=bestPracticesEngine.js.map