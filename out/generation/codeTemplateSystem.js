"use strict";
/**
 * Code Template System - Reusable templates for common patterns
 * Goal: Generate consistent, high-quality code from templates
 *
 * Features:
 * - Pre-built templates for common patterns
 * - Variable substitution
 * - Conditional sections
 * - Framework-specific templates
 * - Custom template creation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeTemplateSystem = void 0;
class CodeTemplateSystem {
    constructor() {
        this.templates = new Map();
        this.initializeTemplates();
    }
    /**
    * Generate code from template
    */
    generate(templateId, context) {
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`Template not found: ${templateId}`);
        }
        // Validate context
        this.validateContext(template, context);
        // Apply defaults
        const fullContext = this.applyDefaults(template, context);
        // Render template
        return this.renderTemplate(template.template, fullContext);
    }
    /**
    * Get template by ID
    */
    getTemplate(id) {
        return this.templates.get(id);
    }
    /**
    * Get templates by category
    */
    getTemplatesByCategory(category, language) {
        return Array.from(this.templates.values()).filter(t => t.category === category && (!language || t.language === language));
    }
    /**
    * Register custom template
    */
    registerTemplate(template) {
        this.templates.set(template.id, template);
    }
    /**
    * Validate context against template variables
    */
    validateContext(template, context) {
        for (const variable of template.variables) {
            if (variable.required && !(variable.name in context)) {
                throw new Error(`Required variable missing: ${variable.name}`);
            }
            if (variable.name in context && variable.validation) {
                if (!variable.validation(context[variable.name])) {
                    throw new Error(`Invalid value for variable: ${variable.name}`);
                }
            }
        }
    }
    /**
    * Apply default values
    */
    applyDefaults(template, context) {
        const fullContext = { ...context };
        for (const variable of template.variables) {
            if (!(variable.name in fullContext) && variable.default !== undefined) {
                fullContext[variable.name] = variable.default;
            }
        }
        return fullContext;
    }
    /**
    * Render template with context
    */
    renderTemplate(template, context) {
        let result = template;
        // Replace variables: {{variableName}}
        result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
            return context[varName] !== undefined ? String(context[varName]) : match;
        });
        // Conditional sections: {{#if condition}}...{{/if}}
        result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, condition, content) => {
            return context[condition] ? content : '';
        });
        // Loop sections: {{#each items}}...{{/each}}
        result = result.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, arrayName, content) => {
            const array = context[arrayName];
            if (!Array.isArray(array))
                return '';
            return array.map((item) => {
                let itemContent = content;
                // Replace {{this}} with item
                itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
                // Replace {{this.property}} with item.property
                itemContent = itemContent.replace(/\{\{this\.(\w+)\}\}/g, (m, prop) => {
                    return item[prop] !== undefined ? String(item[prop]) : m;
                });
                return itemContent;
            }).join('');
        });
        return result;
    }
    /**
    * Initialize built-in templates
    */
    initializeTemplates() {
        // React Component Template
        this.templates.set('react-component', {
            id: 'react-component',
            name: 'React Functional Component',
            description: 'Modern React component with TypeScript',
            language: 'typescript',
            framework: 'react',
            category: 'component',
            variables: [
                { name: 'componentName', type: 'string', description: 'Component name', required: true },
                { name: 'hasProps', type: 'boolean', description: 'Has props interface', required: false, default: false },
                { name: 'props', type: 'array', description: 'Props list', required: false, default: [] },
                { name: 'useState', type: 'boolean', description: 'Use useState hook', required: false, default: false },
                { name: 'useEffect', type: 'boolean', description: 'Use useEffect hook', required: false, default: false }
            ],
            template: `import React{{#if useState}}, { useState }{{/if}}{{#if useEffect}}, { useEffect }{{/if}} from 'react';

{{#if hasProps}}
interface {{componentName}}Props {
{{#each props}}
 {{this.name}}: {{this.type}};
{{/each}}
}
{{/if}}

export const {{componentName}}: React.FC{{#if hasProps}}<{{componentName}}Props>{{/if}} = ({{#if hasProps}}{ {{#each props}}{{this.name}}{{/each}} }{{/if}}) => {
{{#if useState}}
 const [state, setState] = useState<any>(null);
{{/if}}

{{#if useEffect}}
 useEffect(() => {
 // Effect logic here
 return () => {
 // Cleanup
 };
 }, []);
{{/if}}

 return (
 <div className="{{componentName}}">
 <h1>{{componentName}}</h1>
 </div>
 );
};
`,
            dependencies: ['react']
        });
        // Express Route Template
        this.templates.set('express-route', {
            id: 'express-route',
            name: 'Express Route Handler',
            description: 'Express.js route with error handling',
            language: 'typescript',
            framework: 'express',
            category: 'service',
            variables: [
                { name: 'routeName', type: 'string', description: 'Route name', required: true },
                { name: 'method', type: 'string', description: 'HTTP method', required: true },
                { name: 'path', type: 'string', description: 'Route path', required: true },
                { name: 'hasAuth', type: 'boolean', description: 'Requires authentication', required: false, default: false },
                { name: 'hasValidation', type: 'boolean', description: 'Has input validation', required: false, default: false }
            ],
            template: `import { Request, Response, NextFunction } from 'express';
{{#if hasAuth}}
import { authenticate } from '../middleware/auth';
{{/if}}
{{#if hasValidation}}
import { validate } from '../middleware/validation';
import { {{routeName}}Schema } from '../schemas/{{routeName}}';
import { createLogger } from '../utils/logger';

const logger = createLogger('CodeTemplateSystem');
{{/if}}

/**
 * {{routeName}} route handler
 * @route {{method}} {{path}}
 */
export const {{routeName}} = [
{{#if hasAuth}}
 authenticate,
{{/if}}
{{#if hasValidation}}
 validate({{routeName}}Schema),
{{/if}}
 async (req: Request, res: Response, next: NextFunction) => {
 try {
 // TODO: Implement route logic

 res.status(200).json({
 success: true,
 data: {}
 });
 } catch (error) {
 next(error);
 }
 }
];
`,
            dependencies: ['express']
        });
        // TypeScript Class Template
        this.templates.set('typescript-class', {
            id: 'typescript-class',
            name: 'TypeScript Class',
            description: 'Well-structured TypeScript class',
            language: 'typescript',
            category: 'model',
            variables: [
                { name: 'className', type: 'string', description: 'Class name', required: true },
                { name: 'properties', type: 'array', description: 'Class properties', required: false, default: [] },
                { name: 'methods', type: 'array', description: 'Class methods', required: false, default: [] },
                { name: 'hasConstructor', type: 'boolean', description: 'Has constructor', required: false, default: true }
            ],
            template: `/**
 * {{className}} class
 * TODO: Add class description
 */
export class {{className}} {
{{#each properties}}
 private {{this.name}}: {{this.type}};
{{/each}}

{{#if hasConstructor}}
 constructor({{#each properties}}{{this.name}}: {{this.type}}{{/each}}) {
{{#each properties}}
 this.{{this.name}} = {{this.name}};
{{/each}}
 }
{{/if}}

{{#each methods}}
 /**
 * {{this.name}} method
 * TODO: Add method description
 */
 {{this.name}}({{#each this.params}}{{this.name}}: {{this.type}}{{/each}}): {{this.returnType}} {
 // TODO: Implement method
 throw new Error('Not implemented');
 }
{{/each}}
}
`
        });
        // Jest Test Template
        this.templates.set('jest-test', {
            id: 'jest-test',
            name: 'Jest Test Suite',
            description: 'Comprehensive Jest test suite',
            language: 'typescript',
            framework: 'jest',
            category: 'test',
            variables: [
                { name: 'testName', type: 'string', description: 'Test suite name', required: true },
                { name: 'targetFile', type: 'string', description: 'File being tested', required: true },
                { name: 'testCases', type: 'array', description: 'Test cases', required: false, default: [] }
            ],
            template: `import { {{testName}} } from '{{targetFile}}';

describe('{{testName}}', () => {
 beforeEach(() => {
 // Setup
 });

 afterEach(() => {
 // Cleanup
 });

{{#each testCases}}
 it('{{this.description}}', async () => {
 // Arrange
 {{#if this.arrange}}
 {{this.arrange}}
 {{/if}}

 // Act
 {{#if this.act}}
 {{this.act}}
 {{/if}}

 // Assert
 {{#if this.assert}}
 {{this.assert}}
 {{/if}}
 });

{{/each}}
});
`,
            dependencies: ['jest', '@types/jest']
        });
        // Python Class Template
        this.templates.set('python-class', {
            id: 'python-class',
            name: 'Python Class',
            description: 'Well-structured Python class',
            language: 'python',
            category: 'model',
            variables: [
                { name: 'className', type: 'string', description: 'Class name', required: true },
                { name: 'properties', type: 'array', description: 'Class properties', required: false, default: [] },
                { name: 'methods', type: 'array', description: 'Class methods', required: false, default: [] }
            ],
            template: `"""
{{className}} class
TODO: Add class description
"""

class {{className}}:
 """{{className}} implementation"""

 def __init__(self{{#each properties}}, {{this.name}}: {{this.type}}{{/each}}):
 """Initialize {{className}}"""
{{#each properties}}
 self.{{this.name}} = {{this.name}}
{{/each}}

{{#each methods}}
 def {{this.name}}(self{{#each this.params}}, {{this.name}}: {{this.type}}{{/each}}) -> {{this.returnType}}:
 """
 {{this.name}} method
 TODO: Add method description
 """
 raise NotImplementedError("Not implemented")

{{/each}}
`
        });
        // API Client Template
        this.templates.set('api-client', {
            id: 'api-client',
            name: 'API Client',
            description: 'HTTP API client with error handling',
            language: 'typescript',
            category: 'service',
            variables: [
                { name: 'clientName', type: 'string', description: 'Client name', required: true },
                { name: 'baseUrl', type: 'string', description: 'Base URL', required: true },
                { name: 'endpoints', type: 'array', description: 'API endpoints', required: false, default: [] }
            ],
            template: `import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * {{clientName}} API Client
 */
export class {{clientName}} {
 private client: AxiosInstance;

 constructor(apiKey?: string) {
 this.client = axios.create({
 baseURL: '{{baseUrl}}',
 headers: {
 'Content-Type': 'application/json',
 ...(apiKey && { 'Authorization': \`Bearer \${apiKey}\` })
 }
 });

 this.setupInterceptors();
 }

 /**
 * Setup request/response interceptors
 */
 private setupInterceptors(): void {
 this.client.interceptors.response.use(
 response => response,
 (error: AxiosError) => {
 // Handle errors
 logger.error('API Error:', error.message);
 throw error;
 }
 );
 }

{{#each endpoints}}
 /**
 * {{this.description}}
 */
 async {{this.name}}({{#each this.params}}{{this.name}}: {{this.type}}{{/each}}): Promise<{{this.returnType}}> {
 try {
 const response = await this.client.{{this.method}}('{{this.path}}');
 return response.data;
 } catch (error) {
 throw new Error(\`Failed to {{this.name}}: \${error}\`);
 }
 }

{{/each}}
}
`,
            dependencies: ['axios']
        });
    }
}
exports.CodeTemplateSystem = CodeTemplateSystem;
//# sourceMappingURL=codeTemplateSystem.js.map