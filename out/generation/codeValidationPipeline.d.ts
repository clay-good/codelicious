/**
 * Code Validation Pipeline - Comprehensive validation before deployment
 * Goal: Ensure all generated code is production-ready
 *
 * Features:
 * - Syntax validation
 * - Type checking
 * - Linting
 * - Security scanning
 * - Performance analysis
 * - Test execution
 * - Quality gates
 */
export interface ValidationPipeline {
    stages: ValidationStage[];
    qualityGates: QualityGate[];
}
export interface ValidationStage {
    name: string;
    description: string;
    required: boolean;
    execute: (code: string, context: ValidationContext) => Promise<StageResult>;
}
export interface ValidationContext {
    language: string;
    framework?: string;
    filePath: string;
    workspaceRoot: string;
}
export interface StageResult {
    passed: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    metrics?: unknown;
    duration: number;
}
export interface ValidationError {
    stage: string;
    severity: 'error' | 'critical';
    message: string;
    location?: {
        line: number;
        column: number;
    };
    fix?: string;
}
export interface ValidationWarning {
    stage: string;
    message: string;
    location?: {
        line: number;
        column: number;
    };
    suggestion?: string;
}
export interface QualityGate {
    name: string;
    metric: string;
    threshold: number;
    operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
    required: boolean;
}
export interface PipelineResult {
    passed: boolean;
    stages: StageResult[];
    qualityGates: QualityGateResult[];
    overallScore: number;
    summary: string;
    duration: number;
}
export interface QualityGateResult {
    gate: QualityGate;
    passed: boolean;
    actualValue: number;
    message: string;
}
export declare class CodeValidationPipeline {
    private analyzer;
    private bestPractices;
    private pipeline;
    constructor();
    /**
    * Run validation pipeline
    */
    validate(code: string, context: ValidationContext): Promise<PipelineResult>;
    /**
    * Create validation pipeline
    */
    private createPipeline;
    /**
    * Check quality gates
    */
    private checkQualityGates;
    /**
    * Evaluate quality gate
    */
    private evaluateGate;
    /**
    * Get operator symbol
    */
    private getOperatorSymbol;
    /**
    * Calculate overall score
    */
    private calculateOverallScore;
    /**
    * Generate summary
    */
    private generateSummary;
}
//# sourceMappingURL=codeValidationPipeline.d.ts.map