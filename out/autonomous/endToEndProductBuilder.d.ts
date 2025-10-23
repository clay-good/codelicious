/**
 * End-to-End Product Builder - Build complete products from instructions
 *
 * Features:
 * - Read instructions from .md/.txt files
 * - Parse requirements and specifications
 * - Generate complete product architecture
 * - Generate all code files
 * - Generate comprehensive tests
 * - Compile and fix errors
 * - Validate production readiness
 * - Zero manual intervention required
 *
 * Goal: Build production-ready products automatically
 */
import * as vscode from 'vscode';
import { ModelOrchestrator } from '../models/orchestrator';
import { SpecificationManager } from '../specification/specificationManager';
import { RAGService } from '../rag/ragService';
import { ExecutionEngine } from '../core/executionEngine';
export interface ProductBuildRequest {
    instructionFile: string;
    outputDirectory: string;
    options?: ProductBuildOptions;
}
export interface ProductBuildOptions {
    language?: string;
    framework?: string;
    includeTests?: boolean;
    includeDocs?: boolean;
    autoFix?: boolean;
    maxIterations?: number;
}
export interface ProductBuildResult {
    success: boolean;
    filesGenerated: number;
    testsGenerated: number;
    compilationStatus: 'success' | 'failed' | 'not_applicable';
    testStatus: 'passed' | 'failed' | 'not_run';
    qualityScore: number;
    errors: string[];
    warnings: string[];
    buildTime: number;
    summary: string;
}
export declare class EndToEndProductBuilder {
    private orchestrator;
    private ragService;
    private executionEngine;
    private workspaceRoot;
    private specificationManager;
    private selfHealingGenerator;
    private instructionReader;
    constructor(orchestrator: ModelOrchestrator, ragService: RAGService, executionEngine: ExecutionEngine, workspaceRoot: string, specificationManager: SpecificationManager);
    /**
    * Build product from instruction file
    */
    buildFromInstructionFile(instructionFilePath: string, options?: Partial<ProductBuildOptions>): Promise<ProductBuildResult>;
    /**
    * Find and build from instruction files in workspace
    */
    buildFromWorkspaceInstructions(options?: Partial<ProductBuildOptions>): Promise<ProductBuildResult[]>;
    /**
    * Build a complete product from instructions
    */
    build(request: ProductBuildRequest): Promise<ProductBuildResult>;
    /**
    * Read instructions from file
    */
    private readInstructions;
    /**
    * Build summary report
    */
    private buildSummary;
    /**
    * Get letter grade from score
    */
    private getGrade;
    /**
    * Build a product from a specification file (VS Code command)
    */
    static buildFromFile(context: vscode.ExtensionContext, orchestrator: ModelOrchestrator, specificationManager: SpecificationManager): Promise<void>;
}
//# sourceMappingURL=endToEndProductBuilder.d.ts.map