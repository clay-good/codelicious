/**
 * Project Analyzer
 *
 * Analyzes project specifications and extracts:
 * - Requirements (functional, non-functional, technical)
 * - Constraints (time, resources, technology)
 * - Technical stack recommendations
 * - Architecture patterns
 * - Complexity assessment
 * - Success criteria
 */

import { ModelOrchestrator } from '../models/orchestrator';
import { ModelRequest } from '../types';
import { TaskComplexity } from '../models/modelRouter';
import { createLogger } from '../utils/logger';

const logger = createLogger('ProjectAnalyzer');

export interface Requirement {
 id: string;
 type: 'functional' | 'non-functional' | 'technical';
 description: string;
 priority: 'critical' | 'high' | 'medium' | 'low';
 category: string;
 acceptanceCriteria: string[];
}

export interface Constraint {
 type: 'time' | 'resource' | 'technology' | 'budget' | 'compliance';
 description: string;
 impact: 'blocking' | 'limiting' | 'preferential';
 details: Record<string, any>;
}

export interface TechStackRecommendation {
 category: 'language' | 'framework' | 'database' | 'infrastructure' | 'tool';
 name: string;
 version?: string;
 reason: string;
 alternatives: string[];
 confidence: number; // 0-1
}

export interface ArchitecturePattern {
 name: string;
 description: string;
 applicability: string;
 benefits: string[];
 tradeoffs: string[];
 confidence: number; // 0-1
}

export interface ComplexityAssessment {
 overall: 'trivial' | 'simple' | 'moderate' | 'complex' | 'very-complex';
 score: number; // 0-100
 factors: {
 technical: number;
 scope: number;
 integration: number;
 novelty: number;
 risk: number;
 };
 reasoning: string;
}

export interface SuccessCriteria {
 id: string;
 description: string;
 measurable: boolean;
 metric?: string;
 target?: string;
 priority: 'must-have' | 'should-have' | 'nice-to-have';
}

export interface ProjectAnalysis {
 projectName: string;
 projectType: string;
 description: string;
 requirements: Requirement[];
 constraints: Constraint[];
 techStack: TechStackRecommendation[];
 architecture: ArchitecturePattern[];
 complexity: ComplexityAssessment;
 successCriteria: SuccessCriteria[];
 estimatedDuration: {
 min: number; // hours
 max: number; // hours
 confidence: number; // 0-1
 };
 risks: string[];
 assumptions: string[];
 metadata: {
 analyzedAt: number;
 version: string;
 };
}

export class ProjectAnalyzer {
 constructor(private orchestrator: ModelOrchestrator) {}

 /**
 * Analyze a project specification
 */
 async analyzeSpecification(specification: string): Promise<ProjectAnalysis> {
 logger.info('Analyzing project specification...');

 // Extract basic information
 const basicInfo = await this.extractBasicInfo(specification);

 // Extract requirements
 const requirements = await this.extractRequirements(specification);

 // Extract constraints
 const constraints = await this.extractConstraints(specification);

 // Recommend tech stack
 const techStack = await this.recommendTechStack(specification, requirements);

 // Recommend architecture
 const architecture = await this.recommendArchitecture(specification, requirements, techStack);

 // Assess complexity
 const complexity = await this.assessComplexity(specification, requirements, techStack);

 // Extract success criteria
 const successCriteria = await this.extractSuccessCriteria(specification, requirements);

 // Estimate duration
 const estimatedDuration = this.estimateDuration(complexity, requirements.length);

 // Identify risks
 const risks = await this.identifyRisks(specification, requirements, constraints, complexity);

 // Extract assumptions
 const assumptions = await this.extractAssumptions(specification);

 return {
 projectName: basicInfo.name,
 projectType: basicInfo.type,
 description: basicInfo.description,
 requirements,
 constraints,
 techStack,
 architecture,
 complexity,
 successCriteria,
 estimatedDuration,
 risks,
 assumptions,
 metadata: {
 analyzedAt: Date.now(),
 version: '1.0.0'
 }
 };
 }

 /**
 * Extract basic project information
 */
 private async extractBasicInfo(specification: string): Promise<{
 name: string;
 type: string;
 description: string;
 }> {
 const prompt = `Analyze this project specification and extract:
1. Project name (if not specified, suggest one)
2. Project type (web app, CLI tool, library, API, mobile app, etc.)
3. Brief description (1-2 sentences)

Specification:
${specification}

Respond in JSON format:
{
 "name": "project name",
 "type": "project type",
 "description": "brief description"
}`;

 const request: ModelRequest = {
 messages: [{ role: 'user', content: prompt }],
 temperature: 0.3
 };

 const response = await this.orchestrator.sendRequest(request, {
 complexity: TaskComplexity.SIMPLE
 });

 try {
 const jsonMatch = response.content.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 return JSON.parse(jsonMatch[0]);
 }
 } catch (error) {
 logger.warn('Failed to parse basic info, using defaults');
 }

 return {
 name: 'Untitled Project',
 type: 'application',
 description: specification.substring(0, 200)
 };
 }

 /**
 * Extract requirements from specification
 */
 private async extractRequirements(specification: string): Promise<Requirement[]> {
 const prompt = `Analyze this specification and extract ALL requirements.
Categorize each as functional, non-functional, or technical.
Assign priority: critical, high, medium, or low.
Include acceptance criteria for each.

Specification:
${specification}

Respond in JSON format:
{
 "requirements": [
 {
 "id": "REQ-001",
 "type": "functional",
 "description": "requirement description",
 "priority": "high",
 "category": "category name",
 "acceptanceCriteria": ["criterion 1", "criterion 2"]
 }
 ]
}`;

 const request: ModelRequest = {
 messages: [{ role: 'user', content: prompt }],
 temperature: 0.3
 };

 const response = await this.orchestrator.sendRequest(request, {
 complexity: TaskComplexity.MODERATE
 });

 try {
 const jsonMatch = response.content.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 const parsed = JSON.parse(jsonMatch[0]);
 return parsed.requirements || [];
 }
 } catch (error) {
 logger.warn('Failed to parse requirements');
 }

 return [];
 }

 /**
 * Extract constraints
 */
 private async extractConstraints(specification: string): Promise<Constraint[]> {
 const prompt = `Identify all constraints in this specification:
- Time constraints
- Resource constraints
- Technology constraints
- Budget constraints
- Compliance/regulatory constraints

Specification:
${specification}

Respond in JSON format:
{
 "constraints": [
 {
 "type": "time",
 "description": "constraint description",
 "impact": "blocking",
 "details": {}
 }
 ]
}`;

 const request: ModelRequest = {
 messages: [{ role: 'user', content: prompt }],
 temperature: 0.3
 };

 const response = await this.orchestrator.sendRequest(request, {
 complexity: TaskComplexity.SIMPLE
 });

 try {
 const jsonMatch = response.content.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 const parsed = JSON.parse(jsonMatch[0]);
 return parsed.constraints || [];
 }
 } catch (error) {
 logger.warn('Failed to parse constraints');
 }

 return [];
 }

 /**
 * Recommend technology stack
 */
 private async recommendTechStack(
 specification: string,
 requirements: Requirement[]
 ): Promise<TechStackRecommendation[]> {
 const reqSummary = requirements.slice(0, 10).map(r => r.description).join('\n');

 const prompt = `Based on this specification and requirements, recommend a technology stack.
Include: language, framework, database, infrastructure, and tools.
Provide alternatives and confidence scores.

Specification:
${specification}

Key Requirements:
${reqSummary}

Respond in JSON format:
{
 "techStack": [
 {
 "category": "language",
 "name": "TypeScript",
 "version": "5.0",
 "reason": "why this choice",
 "alternatives": ["JavaScript", "Python"],
 "confidence": 0.9
 }
 ]
}`;

 const request: ModelRequest = {
 messages: [{ role: 'user', content: prompt }],
 temperature: 0.4
 };

 const response = await this.orchestrator.sendRequest(request, {
 complexity: TaskComplexity.MODERATE
 });

 try {
 const jsonMatch = response.content.match(/\{[\s\S]*\}/);
 if (jsonMatch) {
 const parsed = JSON.parse(jsonMatch[0]);
 return parsed.techStack || [];
 }
 } catch (error) {
 logger.warn('Failed to parse tech stack');
 }

 return [];
 }

 /**
 * Recommend architecture patterns (stub implementation)
 */
 private async recommendArchitecture(
 specification: string,
 requirements: Requirement[],
 techStack: TechStackRecommendation[]
 ): Promise<ArchitecturePattern[]> {
 // Stub implementation - return empty array for now
 return [];
 }

 /**
 * Assess project complexity (stub implementation)
 */
 private async assessComplexity(
 specification: string,
 requirements: Requirement[],
 techStack: TechStackRecommendation[]
 ): Promise<ComplexityAssessment> {
 // Stub implementation - return moderate complexity
 return {
 overall: 'moderate',
 score: 50,
 factors: {
 technical: 50,
 scope: 50,
 integration: 50,
 novelty: 50,
 risk: 50
 },
 reasoning: 'Complexity assessment pending full implementation'
 };
 }

 /**
 * Extract success criteria (stub implementation)
 */
 private async extractSuccessCriteria(
 specification: string,
 requirements: Requirement[]
 ): Promise<SuccessCriteria[]> {
 // Stub implementation - return empty array for now
 return [];
 }

 /**
 * Estimate project duration (stub implementation)
 */
 private estimateDuration(
 complexity: ComplexityAssessment,
 requirementCount: number
 ): { min: number; max: number; confidence: number } {
 // Stub implementation - return basic estimate
 const baseHours = requirementCount * 4;
 return {
 min: baseHours,
 max: baseHours * 2,
 confidence: 0.5
 };
 }

 /**
 * Identify project risks (stub implementation)
 */
 private async identifyRisks(
 specification: string,
 requirements: Requirement[],
 constraints: Constraint[],
 complexity: ComplexityAssessment
 ): Promise<string[]> {
 // Stub implementation - return empty array for now
 return [];
 }

 /**
 * Extract assumptions (stub implementation)
 */
 private async extractAssumptions(
 specification: string
 ): Promise<string[]> {
 // Stub implementation - return empty array for now
 return [];
 }
}
