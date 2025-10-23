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
export interface Template {
    id: string;
    name: string;
    description: string;
    language: string;
    framework?: string;
    category: 'component' | 'service' | 'model' | 'test' | 'config' | 'utility';
    variables: TemplateVariable[];
    template: string;
    dependencies?: string[];
}
export interface TemplateVariable {
    name: string;
    type: 'string' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    default?: unknown;
    validation?: (value: unknown) => boolean;
}
export interface TemplateContext {
    [key: string]: unknown;
}
export declare class CodeTemplateSystem {
    private templates;
    constructor();
    /**
    * Generate code from template
    */
    generate(templateId: string, context: TemplateContext): string;
    /**
    * Get template by ID
    */
    getTemplate(id: string): Template | undefined;
    /**
    * Get templates by category
    */
    getTemplatesByCategory(category: string, language?: string): Template[];
    /**
    * Register custom template
    */
    registerTemplate(template: Template): void;
    /**
    * Validate context against template variables
    */
    private validateContext;
    /**
    * Apply default values
    */
    private applyDefaults;
    /**
    * Render template with context
    */
    private renderTemplate;
    /**
    * Initialize built-in templates
    */
    private initializeTemplates;
}
//# sourceMappingURL=codeTemplateSystem.d.ts.map