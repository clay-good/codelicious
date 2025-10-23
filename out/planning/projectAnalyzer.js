"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectAnalyzer = void 0;
const modelRouter_1 = require("../models/modelRouter");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('ProjectAnalyzer');
class ProjectAnalyzer {
    constructor(orchestrator) {
        this.orchestrator = orchestrator;
    }
    /**
    * Analyze a project specification
    */
    async analyzeSpecification(specification) {
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
    async extractBasicInfo(specification) {
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
        const request = {
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        };
        const response = await this.orchestrator.sendRequest(request, {
            complexity: modelRouter_1.TaskComplexity.SIMPLE
        });
        try {
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        }
        catch (error) {
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
    async extractRequirements(specification) {
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
        const request = {
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        };
        const response = await this.orchestrator.sendRequest(request, {
            complexity: modelRouter_1.TaskComplexity.MODERATE
        });
        try {
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed.requirements || [];
            }
        }
        catch (error) {
            logger.warn('Failed to parse requirements');
        }
        return [];
    }
    /**
    * Extract constraints
    */
    async extractConstraints(specification) {
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
        const request = {
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        };
        const response = await this.orchestrator.sendRequest(request, {
            complexity: modelRouter_1.TaskComplexity.SIMPLE
        });
        try {
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed.constraints || [];
            }
        }
        catch (error) {
            logger.warn('Failed to parse constraints');
        }
        return [];
    }
    /**
    * Recommend technology stack
    */
    async recommendTechStack(specification, requirements) {
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
        const request = {
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.4
        };
        const response = await this.orchestrator.sendRequest(request, {
            complexity: modelRouter_1.TaskComplexity.MODERATE
        });
        try {
            const jsonMatch = response.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return parsed.techStack || [];
            }
        }
        catch (error) {
            logger.warn('Failed to parse tech stack');
        }
        return [];
    }
    /**
    * Recommend architecture patterns (stub implementation)
    */
    async recommendArchitecture(specification, requirements, techStack) {
        // Stub implementation - return empty array for now
        return [];
    }
    /**
    * Assess project complexity (stub implementation)
    */
    async assessComplexity(specification, requirements, techStack) {
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
    async extractSuccessCriteria(specification, requirements) {
        // Stub implementation - return empty array for now
        return [];
    }
    /**
    * Estimate project duration (stub implementation)
    */
    estimateDuration(complexity, requirementCount) {
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
    async identifyRisks(specification, requirements, constraints, complexity) {
        // Stub implementation - return empty array for now
        return [];
    }
    /**
    * Extract assumptions (stub implementation)
    */
    async extractAssumptions(specification) {
        // Stub implementation - return empty array for now
        return [];
    }
}
exports.ProjectAnalyzer = ProjectAnalyzer;
//# sourceMappingURL=projectAnalyzer.js.map