/**
 * Enhanced Code Generator - World-class code generation with quality enforcement
 *
 * Features:
 * - Framework-specific generation (React, Vue, Express, FastAPI)
 * - Few-shot learning with examples
 * - Quality gates (type safety, error handling, documentation)
 * - Architectural pattern enforcement (SOLID, Clean Architecture)
 * - Style enforcement (Prettier, ESLint)
 *
 * Goal: Consistently generate 90%+ quality code
 */

import { ModelOrchestrator, TaskComplexity } from '../models/orchestrator';
import { EnhancedContext } from './enhancedContextGatherer';
import { AdvancedQualityEngine } from './advancedQualityEngine';
import { createLogger } from '../utils/logger';

const logger = createLogger('EnhancedCodeGenerator');

export interface EnhancedGenerationRequest {
 description: string;
 language: string;
 framework?: string;
 filePath: string;
 context: EnhancedContext;
 existingCode?: string;
 requirements?: string[];
 constraints?: string[];
}

export interface EnhancedGenerationResult {
 code: string;
 quality: number;
 issues: string[];
 improvements: string[];
}

export interface CodeExample {
 description: string;
 code: string;
 quality: number;
}

export class EnhancedCodeGenerator {
 private orchestrator: ModelOrchestrator;
 private examples: Map<string, CodeExample[]> = new Map();
 private qualityEngine: AdvancedQualityEngine;

 constructor(orchestrator: ModelOrchestrator) {
 this.orchestrator = orchestrator;
 this.qualityEngine = new AdvancedQualityEngine(orchestrator);
 this.loadExamples();
 }

 /**
 * Generate production-ready code with quality enforcement
 */
 async generate(request: EnhancedGenerationRequest): Promise<EnhancedGenerationResult> {
 logger.info(' Generating production-ready code...');

 // Step 1: Build enhanced prompt with examples
 const prompt = this.buildEnhancedPrompt(request);

 // Step 2: Generate code with AI
 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: this.getSystemPrompt(request)
 },
 {
 role: 'user',
 content: prompt
 }
 ],
 temperature: 0.2, // Low temperature for consistent quality
 maxTokens: 8000
 },
 { complexity: TaskComplexity.COMPLEX }
 );

 // Step 3: Extract and validate code
 const code = this.extractCode(response.content);

 // Step 4: Advanced quality analysis
 const qualityAnalysis = await this.qualityEngine.analyze(code, request.language, request.framework);
 logger.info(`Quality: ${qualityAnalysis.grade} (${qualityAnalysis.score}/100)`);

 // Step 5: Auto-fix quality issues
 let finalCode = code;
 if (qualityAnalysis.autoFixable && qualityAnalysis.score < 90) {
 logger.info(`Found ${qualityAnalysis.issues.length} quality issues, applying fixes...`);
 finalCode = await this.qualityEngine.autoFix(code, qualityAnalysis, request.language);

 // Re-analyze after fixes
 const reanalysis = await this.qualityEngine.analyze(finalCode, request.language, request.framework);
 logger.info(`Quality after fixes: ${reanalysis.grade} (${reanalysis.score}/100)`);

 return {
 code: finalCode,
 quality: reanalysis.score,
 issues: reanalysis.issues.map(i => i.message),
 improvements: reanalysis.recommendations
 };
 }

 return {
 code: finalCode,
 quality: qualityAnalysis.score,
 issues: qualityAnalysis.issues.map(i => i.message),
 improvements: qualityAnalysis.recommendations
 };
 }

 /**
 * Get system prompt based on language and framework
 */
 private getSystemPrompt(request: EnhancedGenerationRequest): string {
 const basePrompt = `You are a world-class software engineer with 15+ years of experience.
You write production-ready code that is:
- Type-safe (no 'any' types in TypeScript)
- Well-documented (JSDoc/docstrings for all public APIs)
- Error-handled (comprehensive try-catch, validation)
- Tested (testable design, dependency injection)
- Maintainable (SOLID principles, DRY, KISS)
- Performant (O(n) complexity or better)
- Secure (input validation, no SQL injection, XSS prevention)`;

 // Add framework-specific guidelines
 if (request.framework === 'react') {
 return `${basePrompt}

React-specific guidelines:
- Use functional components with hooks
- Use TypeScript for props and state
- Use proper prop validation
- Handle loading and error states
- Use React.memo for performance
- Follow React best practices (composition over inheritance)
- Use proper key props in lists
- Avoid inline functions in JSX
- Use useCallback and useMemo appropriately`;
 }

 if (request.framework === 'express') {
 return `${basePrompt}

Express-specific guidelines:
- Use async/await for all routes
- Use proper error handling middleware
- Validate all inputs (use Zod or Joi)
- Use proper HTTP status codes
- Use middleware for authentication
- Use proper logging
- Handle CORS properly
- Use rate limiting
- Sanitize inputs to prevent injection`;
 }

 if (request.framework === 'vue') {
 return `${basePrompt}

Vue-specific guidelines:
- Use Composition API with <script setup>
- Use TypeScript for props and emits
- Use proper prop validation
- Handle loading and error states
- Use computed properties for derived state
- Use watchers sparingly
- Follow Vue best practices
- Use proper v-bind and v-on syntax`;
 }

 if (request.framework === 'fastapi') {
 return `${basePrompt}

FastAPI-specific guidelines:
- Use Pydantic models for validation
- Use proper type hints everywhere
- Use async def for all endpoints
- Use proper HTTP status codes
- Use dependency injection
- Use proper error handling
- Use proper logging
- Document with docstrings
- Use proper authentication`;
 }

 return basePrompt;
 }

 /**
 * Build enhanced prompt with examples and constraints
 */
 private buildEnhancedPrompt(request: EnhancedGenerationRequest): string {
 const examples = this.getRelevantExamples(request);
 const constraints = this.buildConstraints(request);

 let prompt = `Generate ${request.language} code for: ${request.description}\n\n`;

 // Add file path context
 prompt += `File: ${request.filePath}\n\n`;

 // Add framework context
 if (request.framework) {
 prompt += `Framework: ${request.framework}\n\n`;
 }

 // Add architectural context
 if (request.context.architecture) {
 prompt += `Architecture Style: ${request.context.architecture.style}\n`;
 prompt += `Layers: ${request.context.architecture.layers.join(', ')}\n\n`;
 }

 // Add existing code context (for modifications)
 if (request.existingCode) {
 prompt += `Existing Code:\n\`\`\`${request.language}\n${request.existingCode}\n\`\`\`\n\n`;
 prompt += `Modify the existing code to: ${request.description}\n\n`;
 }

 // Add requirements
 if (request.requirements && request.requirements.length > 0) {
 prompt += `Requirements:\n${request.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\n`;
 }

 // Add examples (few-shot learning)
 if (examples.length > 0) {
 prompt += `Examples of high-quality code:\n\n`;
 examples.forEach((example, i) => {
 prompt += `Example ${i + 1} (Quality: ${example.quality}/100):\n`;
 prompt += `Description: ${example.description}\n`;
 prompt += `\`\`\`${request.language}\n${example.code}\n\`\`\`\n\n`;
 });
 }

 // Add constraints
 prompt += `Constraints:\n${constraints.join('\n')}\n\n`;

 // Add quality checklist
 prompt += `Quality Checklist (ALL must be satisfied):\n`;
 prompt += `Type-safe (no 'any' types)\n`;
 prompt += `Error handling (try-catch, validation)\n`;
 prompt += `Documentation (JSDoc/docstrings)\n`;
 prompt += `Testable (dependency injection, pure functions)\n`;
 prompt += `SOLID principles (single responsibility, etc.)\n`;
 prompt += `Performance (efficient algorithms)\n`;
 prompt += `Security (input validation, sanitization)\n\n`;

 // Add output format
 prompt += `Output Format:\n`;
 prompt += `\`\`\`${request.language}\n`;
 prompt += `// Your production-ready code here\n`;
 prompt += `\`\`\`\n\n`;

 prompt += `Generate ONLY the code, no explanations.`;

 return prompt;
 }

 /**
 * Get relevant examples for few-shot learning
 */
 private getRelevantExamples(request: EnhancedGenerationRequest): CodeExample[] {
 const key = `${request.language}-${request.framework || 'generic'}`;
 return this.examples.get(key)?.slice(0, 3) || [];
 }

 /**
 * Build constraints based on context
 */
 private buildConstraints(request: EnhancedGenerationRequest): string[] {
 const constraints: string[] = [];

 // Language-specific constraints
 if (request.language === 'typescript') {
 constraints.push('- Use strict TypeScript (no any, unknown over any)');
 constraints.push('- Use interfaces for public APIs');
 constraints.push('- Use enums for constants');
 constraints.push('- Use proper access modifiers (private, protected, public)');
 }

 if (request.language === 'python') {
 constraints.push('- Use type hints everywhere');
 constraints.push('- Follow PEP 8 style guide');
 constraints.push('- Use dataclasses or Pydantic models');
 constraints.push('- Use proper docstrings (Google or NumPy style)');
 }

 // Framework-specific constraints
 if (request.framework === 'react') {
 constraints.push('- Use functional components only');
 constraints.push('- Use proper React hooks (useState, useEffect, etc.)');
 constraints.push('- Avoid prop drilling (use context or state management)');
 }

 if (request.framework === 'express') {
 constraints.push('- Use async/await, no callbacks');
 constraints.push('- Use middleware for cross-cutting concerns');
 constraints.push('- Use proper error handling middleware');
 }

 // Add custom constraints
 if (request.constraints) {
 constraints.push(...request.constraints.map(c => `- ${c}`));
 }

 return constraints;
 }

 /**
 * Extract code from AI response
 */
 private extractCode(response: string): string {
 // Extract code from markdown code blocks
 const codeBlockRegex = /```[\w]*\n([\s\S]*?)\n```/;
 const match = response.match(codeBlockRegex);

 if (match && match[1]) {
 return match[1].trim();
 }

 // If no code block, return entire response
 return response.trim();
 }

 /**
 * Enforce quality gates
 */
 private async enforceQualityGates(
 code: string,
 request: EnhancedGenerationRequest
 ): Promise<{ quality: number; issues: string[]; improvements: string[] }> {
 const issues: string[] = [];
 const improvements: string[] = [];
 let quality = 100;

 // Gate 1: Type safety (TypeScript)
 if (request.language === 'typescript') {
 const anyCount = (code.match(/:\s*any\b/g) || []).length;
 if (anyCount > 0) {
 issues.push(`Found ${anyCount} 'any' types - replace with specific types`);
 quality -= anyCount * 10;
 }
 }

 // Gate 2: Error handling
 const hasTryCatch = code.includes('try') && code.includes('catch');
 const hasThrow = code.includes('throw');
 if (!hasTryCatch && !hasThrow) {
 issues.push('Missing error handling - add try-catch blocks');
 quality -= 15;
 }

 // Gate 3: Documentation
 const hasJSDoc = code.includes('/**') || code.includes('"""');
 if (!hasJSDoc) {
 issues.push('Missing documentation - add JSDoc/docstrings');
 quality -= 10;
 }

 // Gate 4: Input validation
 const hasValidation = code.includes('validate') || code.includes('check') || code.includes('assert');
 if (!hasValidation && (request.framework === 'express' || request.framework === 'fastapi')) {
 issues.push('Missing input validation - add validation logic');
 quality -= 15;
 }

 // Gate 5: Testability
 const hasConstructor = code.includes('constructor');
 const hasDependencyInjection = hasConstructor && code.match(/constructor\s*\([^)]+\)/);
 if (hasConstructor && !hasDependencyInjection) {
 improvements.push('Consider using dependency injection for better testability');
 }

 // Gate 6: SOLID principles
 const classCount = (code.match(/class\s+\w+/g) || []).length;
 const methodCount = (code.match(/\s+(public|private|protected)?\s*\w+\s*\([^)]*\)\s*[:{]/g) || []).length;
 if (classCount > 0 && methodCount / classCount > 10) {
 improvements.push('Class has too many methods - consider splitting (Single Responsibility Principle)');
 }

 return {
 quality: Math.max(0, quality),
 issues,
 improvements
 };
 }

 /**
 * Apply quality fixes
 */
 private async applyQualityFixes(
 code: string,
 issues: string[],
 request: EnhancedGenerationRequest
 ): Promise<string> {
 const fixPrompt = `Fix the following issues in this code:

Issues:
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

Code:
\`\`\`${request.language}
${code}
\`\`\`

Return the fixed code with all issues resolved. Output ONLY the code, no explanations.`;

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert code reviewer. Fix code issues while maintaining functionality.'
 },
 {
 role: 'user',
 content: fixPrompt
 }
 ],
 temperature: 0.2,
 maxTokens: 8000
 },
 { complexity: TaskComplexity.MODERATE }
 );

 return this.extractCode(response.content);
 }

 /**
 * Load code examples for few-shot learning
 */
 private loadExamples(): void {
 // React component examples
 this.examples.set('typescript-react', [
 {
 description: 'React component with TypeScript, props validation, error handling',
 quality: 95,
 code: `import React, { useState, useCallback } from 'react';

interface UserProfileProps {
 userId: string;
 onUpdate?: (user: User) => void;
}

interface User {
 id: string;
 name: string;
 email: string;
}

/**
 * UserProfile component displays and allows editing of user information
 * @param userId - The ID of the user to display
 * @param onUpdate - Optional callback when user is updated
 */
export const UserProfile: React.FC<UserProfileProps> = ({ userId, onUpdate }) => {
 const [user, setUser] = useState<User | null>(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);

 const fetchUser = useCallback(async () => {
 try {
 setLoading(true);
 setError(null);
 const response = await fetch(\`/api/users/\${userId}\`);
 if (!response.ok) {
 throw new Error('Failed to fetch user');
 }
 const data = await response.json();
 setUser(data);
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Unknown error');
 } finally {
 setLoading(false);
 }
 }, [userId]);

 if (loading) return <div>Loading...</div>;
 if (error) return <div>Error: {error}</div>;
 if (!user) return null;

 return (
 <div className="user-profile">
 <h2>{user.name}</h2>
 <p>{user.email}</p>
 </div>
 );
};`
 }
 ]);

 // Express route examples
 this.examples.set('typescript-express', [
 {
 description: 'Express route with validation, error handling, authentication',
 quality: 95,
 code: `import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger';

const logger = createLogger('EnhancedCodeGenerator');

const router = Router();

// Validation schema
const createUserSchema = z.object({
 name: z.string().min(1).max(100),
 email: z.string().email(),
 age: z.number().int().min(18).max(120)
});

type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * Create a new user
 * @route POST /api/users
 * @access Private
 */
router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
 try {
 // Validate input
 const input = createUserSchema.parse(req.body);

 // Create user
 const user = await createUser(input);

 // Return success
 res.status(201).json({
 success: true,
 data: user
 });
 } catch (error) {
 if (error instanceof z.ZodError) {
 return res.status(400).json({
 success: false,
 error: 'Validation failed',
 details: error.errors
 });
 }
 next(error);
 }
});

async function createUser(input: CreateUserInput): Promise<User> {
 // Implementation
 throw new Error('Not implemented');
}

export default router;`
 }
 ]);
 }
}

