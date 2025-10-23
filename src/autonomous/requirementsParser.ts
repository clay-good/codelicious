/**
 * Requirements Parser - Parse natural language specifications into structured requirements
 *
 * Matches Augment's capability to convert natural language into executable tasks
 */

import { ModelOrchestrator, TaskComplexity } from '../models/orchestrator';
import { createLogger } from '../utils/logger';

const logger = createLogger('RequirementsParser');

export interface Requirement {
 id: string;
 description: string;
 type: 'feature' | 'bugfix' | 'refactor' | 'test' | 'documentation';
 priority: 'critical' | 'high' | 'medium' | 'low';
 acceptanceCriteria: string[];
 technicalConstraints: string[];
 dependencies: string[];
 estimatedComplexity: 'simple' | 'moderate' | 'complex';
 affectedFiles: string[];
 testRequirements: TestRequirement[];
}

export interface TestRequirement {
 type: 'unit' | 'integration' | 'e2e';
 description: string;
 coverage: number;
}

export interface ParsedRequirements {
 mainRequirement: Requirement;
 subRequirements: Requirement[];
 totalEstimatedEffort: number;
 risks: string[];
 recommendations: string[];
}

export class RequirementsParser {
 constructor(private orchestrator: ModelOrchestrator) {}

 /**
 * Parse natural language specification into structured requirements
 */
 async parse(specification: string): Promise<ParsedRequirements> {
 logger.info(' Parsing requirements...');

 const prompt = this.buildParsingPrompt(specification);

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert software requirements analyst. Parse user specifications into detailed, structured requirements.'
 },
 {
 role: 'user',
 content: prompt
 }
 ],
 temperature: 0.3,
 maxTokens: 4000
 },
 { complexity: TaskComplexity.MODERATE }
 );

 const parsed = this.parseResponse(response.content);
 logger.info('Requirements parsed successfully');

 return parsed;
 }

 /**
 * Build prompt for requirements parsing
 */
 private buildParsingPrompt(specification: string): string {
 return `Parse the following software specification into structured requirements.

SPECIFICATION:
${specification}

Analyze and extract:
1. Main requirement (what needs to be built)
2. Sub-requirements (breakdown of tasks)
3. Acceptance criteria (how to verify success)
4. Technical constraints (limitations, dependencies)
5. Test requirements (what tests are needed)
6. Affected files (which files will change)
7. Risks and recommendations

Return a JSON object with this structure:
{
 "mainRequirement": {
 "id": "REQ-001",
 "description": "Brief description",
 "type": "feature|bugfix|refactor|test|documentation",
 "priority": "critical|high|medium|low",
 "acceptanceCriteria": ["criterion 1", "criterion 2"],
 "technicalConstraints": ["constraint 1"],
 "dependencies": ["dependency 1"],
 "estimatedComplexity": "simple|moderate|complex",
 "affectedFiles": ["file1.ts", "file2.ts"],
 "testRequirements": [
 {
 "type": "unit|integration|e2e",
 "description": "Test description",
 "coverage": 80
 }
 ]
 },
 "subRequirements": [
 // Same structure as mainRequirement
 ],
 "totalEstimatedEffort": 8,
 "risks": ["risk 1", "risk 2"],
 "recommendations": ["recommendation 1"]
}

Be specific and detailed. Think like a senior software architect.`;
 }

 /**
 * Parse AI response into structured requirements
 */
 private parseResponse(content: string): ParsedRequirements {
 try {
 // Extract JSON from response
 const jsonMatch = content.match(/\{[\s\S]*\}/);
 if (!jsonMatch) {
 throw new Error('No JSON found in response');
 }

 const parsed = JSON.parse(jsonMatch[0]);

 // Validate and return
 return {
 mainRequirement: this.validateRequirement(parsed.mainRequirement),
 subRequirements: (parsed.subRequirements || []).map((r: any) => this.validateRequirement(r)), // Requirement structure
 totalEstimatedEffort: parsed.totalEstimatedEffort || 0,
 risks: parsed.risks || [],
 recommendations: parsed.recommendations || []
 };
 } catch (error) {
 logger.error('Failed to parse requirements response:', error);

 // Return fallback requirement
 return {
 mainRequirement: {
 id: 'REQ-001',
 description: content.substring(0, 200),
 type: 'feature',
 priority: 'medium',
 acceptanceCriteria: ['Implementation complete', 'Tests passing'],
 technicalConstraints: [],
 dependencies: [],
 estimatedComplexity: 'moderate',
 affectedFiles: [],
 testRequirements: []
 },
 subRequirements: [],
 totalEstimatedEffort: 4,
 risks: ['Requirements parsing failed - manual review needed'],
 recommendations: ['Review and refine requirements manually']
 };
 }
 }

 /**
 * Validate and normalize a requirement
 */
 private validateRequirement(req: any): Requirement { // Requirement structure from AI
 return {
 id: req.id || `REQ-${Date.now()}`,
 description: req.description || 'No description',
 type: this.validateType(req.type),
 priority: this.validatePriority(req.priority),
 acceptanceCriteria: Array.isArray(req.acceptanceCriteria) ? req.acceptanceCriteria : [],
 technicalConstraints: Array.isArray(req.technicalConstraints) ? req.technicalConstraints : [],
 dependencies: Array.isArray(req.dependencies) ? req.dependencies : [],
 estimatedComplexity: this.validateComplexity(req.estimatedComplexity),
 affectedFiles: Array.isArray(req.affectedFiles) ? req.affectedFiles : [],
 testRequirements: Array.isArray(req.testRequirements) ? req.testRequirements : []
 };
 }

 private validateType(type: string): 'feature' | 'bugfix' | 'refactor' | 'test' | 'documentation' {
 const valid = ['feature', 'bugfix', 'refactor', 'test', 'documentation'];
 return valid.includes(type) ? type as any : 'feature';
 }

 private validatePriority(priority: string): 'critical' | 'high' | 'medium' | 'low' {
 const valid = ['critical', 'high', 'medium', 'low'];
 return valid.includes(priority) ? priority as any : 'medium';
 }

 private validateComplexity(complexity: string): 'simple' | 'moderate' | 'complex' {
 const valid = ['simple', 'moderate', 'complex'];
 return valid.includes(complexity) ? complexity as any : 'moderate';
 }

 /**
 * Refine requirements with additional context
 */
 async refine(
 requirements: ParsedRequirements,
 additionalContext: string
 ): Promise<ParsedRequirements> {
 logger.info('Refining requirements with additional context...');

 const prompt = `Refine these requirements with additional context:

CURRENT REQUIREMENTS:
${JSON.stringify(requirements, null, 2)}

ADDITIONAL CONTEXT:
${additionalContext}

Update the requirements to incorporate this context. Return the complete updated JSON.`;

 const response = await this.orchestrator.sendRequest(
 {
 messages: [
 {
 role: 'system',
 content: 'You are an expert software requirements analyst. Refine requirements based on additional context.'
 },
 {
 role: 'user',
 content: prompt
 }
 ],
 temperature: 0.3,
 maxTokens: 4000
 },
 { complexity: TaskComplexity.MODERATE }
 );

 return this.parseResponse(response.content);
 }

 /**
 * Validate requirements completeness
 */
 validateCompleteness(requirements: ParsedRequirements): {
 isComplete: boolean;
 missingElements: string[];
 score: number;
 } {
 const missingElements: string[] = [];
 let score = 100;

 // Check main requirement
 if (!requirements.mainRequirement.description) {
 missingElements.push('Main requirement description');
 score -= 20;
 }

 if (requirements.mainRequirement.acceptanceCriteria.length === 0) {
 missingElements.push('Acceptance criteria');
 score -= 15;
 }

 if (requirements.mainRequirement.testRequirements.length === 0) {
 missingElements.push('Test requirements');
 score -= 15;
 }

 if (requirements.mainRequirement.affectedFiles.length === 0) {
 missingElements.push('Affected files');
 score -= 10;
 }

 // Check sub-requirements
 if (requirements.mainRequirement.estimatedComplexity === 'complex' && requirements.subRequirements.length === 0) {
 missingElements.push('Sub-requirements for complex task');
 score -= 20;
 }

 // Check risks
 if (requirements.risks.length === 0) {
 missingElements.push('Risk analysis');
 score -= 10;
 }

 return {
 isComplete: missingElements.length === 0,
 missingElements,
 score: Math.max(0, score)
 };
 }
}

