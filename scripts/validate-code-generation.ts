/**
 * Comprehensive Validation Script for Code Generation System
 * 
 * This script validates:
 * 1. Code generation quality
 * 2. Self-healing capabilities
 * 3. RAG/embedding efficiency
 * 4. Token usage optimization
 * 5. Performance benchmarks
 * 6. Production readiness
 */

import { MasterCodeGenerator, GenerationRequest } from '../src/generation/masterCodeGenerator';
import { SelfHealingGenerator } from '../src/generation/selfHealingGenerator';
import { RAGService } from '../src/rag/ragService';
import { EmbeddingService } from '../src/embedding/embeddingService';
import { CodeChunker } from '../src/embedding/codeChunker';

interface ValidationResult {
  category: string;
  test: string;
  passed: boolean;
  score: number;
  duration: number;
  details: string;
  metrics?: any;
}

interface ValidationReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  overallScore: number;
  results: ValidationResult[];
  summary: string;
}

class CodeGenerationValidator {
  private results: ValidationResult[] = [];
  private masterGenerator: MasterCodeGenerator;

  constructor() {
    this.masterGenerator = new MasterCodeGenerator();
  }

  async runAllValidations(): Promise<ValidationReport> {
    console.log('Starting comprehensive validation...\n');

    await this.validateCodeQuality();
    await this.validateSelfHealing();
    await this.validateRAGEfficiency();
    await this.validateTokenOptimization();
    await this.validatePerformance();
    await this.validateProductionReadiness();

    return this.generateReport();
  }

  private async validateCodeQuality(): Promise<void> {
    console.log('1. Validating Code Quality...');

    // Test 1: TypeScript REST API
    await this.runTest(
      'Code Quality',
      'Generate TypeScript REST API',
      async () => {
        const request: GenerationRequest = {
          description: 'Create a REST API with user authentication, CRUD operations, and error handling',
          language: 'typescript',
          framework: 'express',
          filePath: 'src/api/server.ts',
          workspaceRoot: '/test',
          options: {
            useTemplates: true,
            targetQuality: 95,
            maxRefinementPasses: 3,
            includeTests: true,
            includeDocumentation: true,
            strictValidation: true
          }
        };

        const result = await this.masterGenerator.generate(request);

        return {
          passed: result.success && result.quality.score >= 90,
          score: result.quality.score,
          details: `Generated ${result.code.split('\n').length} lines, quality: ${result.quality.grade}`,
          metrics: {
            linesOfCode: result.code.split('\n').length,
            qualityGrade: result.quality.grade,
            refinementPasses: result.metadata.refinementPasses,
            hasTests: !!result.testCode,
            hasDocs: !!result.documentation
          }
        };
      }
    );

    // Test 2: React Component
    await this.runTest(
      'Code Quality',
      'Generate React Component with TypeScript',
      async () => {
        const request: GenerationRequest = {
          description: 'Create a data table component with sorting, filtering, and pagination',
          language: 'typescript',
          framework: 'react',
          filePath: 'src/components/DataTable.tsx',
          workspaceRoot: '/test',
          options: {
            useTemplates: true,
            targetQuality: 95,
            maxRefinementPasses: 3,
            includeTests: true,
            includeDocumentation: true,
            strictValidation: true
          }
        };

        const result = await this.masterGenerator.generate(request);

        return {
          passed: result.success && result.quality.score >= 90,
          score: result.quality.score,
          details: `Generated React component with ${result.code.split('\n').length} lines`,
          metrics: {
            hasHooks: result.code.includes('useState') && result.code.includes('useEffect'),
            hasTypeScript: result.code.includes('interface') || result.code.includes('type'),
            hasTests: !!result.testCode
          }
        };
      }
    );

    // Test 3: Python ML Pipeline
    await this.runTest(
      'Code Quality',
      'Generate Python ML Pipeline',
      async () => {
        const request: GenerationRequest = {
          description: 'Create a machine learning pipeline with preprocessing and model training',
          language: 'python',
          framework: 'scikit-learn',
          filePath: 'src/ml/pipeline.py',
          workspaceRoot: '/test',
          options: {
            useTemplates: true,
            targetQuality: 90,
            maxRefinementPasses: 2,
            includeTests: true,
            includeDocumentation: true,
            strictValidation: true
          }
        };

        const result = await this.masterGenerator.generate(request);

        return {
          passed: result.success && result.quality.score >= 85,
          score: result.quality.score,
          details: `Generated Python ML pipeline with ${result.code.split('\n').length} lines`,
          metrics: {
            hasSklearn: result.code.includes('sklearn'),
            hasPreprocessing: result.code.includes('fit') && result.code.includes('transform'),
            hasTests: !!result.testCode
          }
        };
      }
    );
  }

  private async validateSelfHealing(): Promise<void> {
    console.log('\n2. Validating Self-Healing Capabilities...');

    // Test: Self-healing with errors
    await this.runTest(
      'Self-Healing',
      'Automatic error detection and fixing',
      async () => {
        // Simulate generation with potential errors
        const request: GenerationRequest = {
          description: 'Create a complex TypeScript class with generics and error handling',
          language: 'typescript',
          filePath: 'src/complex.ts',
          workspaceRoot: '/test',
          options: {
            useTemplates: true,
            targetQuality: 95,
            maxRefinementPasses: 5,
            includeTests: true,
            includeDocumentation: false,
            strictValidation: true
          }
        };

        const result = await this.masterGenerator.generate(request);

        return {
          passed: result.success && result.metadata.refinementPasses > 1,
          score: result.quality.score,
          details: `Self-healed through ${result.metadata.refinementPasses} iterations`,
          metrics: {
            iterations: result.metadata.refinementPasses,
            improvements: result.metadata.improvements.length,
            finalQuality: result.quality.score
          }
        };
      }
    );
  }

  private async validateRAGEfficiency(): Promise<void> {
    console.log('\n3. Validating RAG/Embedding Efficiency...');

    // Test: Chunking efficiency
    await this.runTest(
      'RAG Efficiency',
      'Code chunking optimization',
      async () => {
        const chunker = new CodeChunker(512, 50, true);
        const largeFile = Array(500).fill(null)
          .map((_, i) => `function func${i}() { return ${i}; }`)
          .join('\n');

        const startTime = Date.now();
        const chunks = await chunker.chunkFile('test.ts', largeFile);
        const duration = Date.now() - startTime;

        return {
          passed: chunks.length > 0 && duration < 5000,
          score: Math.max(0, 100 - (duration / 50)),
          details: `Chunked ${largeFile.split('\n').length} lines into ${chunks.length} chunks in ${duration}ms`,
          metrics: {
            inputLines: largeFile.split('\n').length,
            outputChunks: chunks.length,
            avgChunkSize: chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length,
            duration
          }
        };
      }
    );
  }

  private async validateTokenOptimization(): Promise<void> {
    console.log('\n4. Validating Token Usage Optimization...');

    // Test: Token efficiency
    await this.runTest(
      'Token Optimization',
      'Efficient token usage in generation',
      async () => {
        const request: GenerationRequest = {
          description: 'Create a simple utility function',
          language: 'typescript',
          filePath: 'src/utils.ts',
          workspaceRoot: '/test',
          options: {
            useTemplates: true,
            targetQuality: 85,
            maxRefinementPasses: 1,
            includeTests: false,
            includeDocumentation: false,
            strictValidation: false
          }
        };

        const result = await this.masterGenerator.generate(request);

        // Estimate tokens (rough: 1 token ≈ 4 characters)
        const estimatedTokens = result.code.length / 4;

        return {
          passed: result.success && estimatedTokens < 2000,
          score: Math.max(0, 100 - (estimatedTokens / 20)),
          details: `Generated code with ~${Math.round(estimatedTokens)} tokens`,
          metrics: {
            codeLength: result.code.length,
            estimatedTokens: Math.round(estimatedTokens),
            efficient: estimatedTokens < 2000
          }
        };
      }
    );
  }

  private async validatePerformance(): Promise<void> {
    console.log('\n5. Validating Performance...');

    // Test: Generation speed
    await this.runTest(
      'Performance',
      'Code generation speed',
      async () => {
        const request: GenerationRequest = {
          description: 'Create a simple function',
          language: 'typescript',
          filePath: 'src/simple.ts',
          workspaceRoot: '/test',
          options: {
            useTemplates: true,
            targetQuality: 85,
            maxRefinementPasses: 1,
            includeTests: false,
            includeDocumentation: false,
            strictValidation: false
          }
        };

        const startTime = Date.now();
        const result = await this.masterGenerator.generate(request);
        const duration = Date.now() - startTime;

        return {
          passed: result.success && duration < 15000,
          score: Math.max(0, 100 - (duration / 150)),
          details: `Generated code in ${duration}ms`,
          metrics: {
            duration,
            fast: duration < 15000
          }
        };
      }
    );
  }

  private async validateProductionReadiness(): Promise<void> {
    console.log('\n6. Validating Production Readiness...');

    // Test: Complete feature implementation
    await this.runTest(
      'Production Readiness',
      'Complete feature with tests and docs',
      async () => {
        const request: GenerationRequest = {
          description: 'Create a user authentication service with JWT tokens',
          language: 'typescript',
          filePath: 'src/auth/authService.ts',
          workspaceRoot: '/test',
          options: {
            useTemplates: true,
            targetQuality: 95,
            maxRefinementPasses: 3,
            includeTests: true,
            includeDocumentation: true,
            strictValidation: true
          }
        };

        const result = await this.masterGenerator.generate(request);

        const productionReady = 
          result.success &&
          result.quality.score >= 90 &&
          result.testCode !== undefined &&
          result.documentation !== undefined &&
          result.metadata.validationPassed;

        return {
          passed: productionReady,
          score: result.quality.score,
          details: `Production-ready: ${productionReady}`,
          metrics: {
            hasCode: !!result.code,
            hasTests: !!result.testCode,
            hasDocs: !!result.documentation,
            validated: result.metadata.validationPassed,
            quality: result.quality.score
          }
        };
      }
    );
  }

  private async runTest(
    category: string,
    test: string,
    testFn: () => Promise<{ passed: boolean; score: number; details: string; metrics?: any }>
  ): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await testFn();
      const duration = Date.now() - startTime;

      this.results.push({
        category,
        test,
        passed: result.passed,
        score: result.score,
        duration,
        details: result.details,
        metrics: result.metrics
      });

      console.log(`  ${result.passed ? '✓' : '✗'} ${test} (${duration}ms) - Score: ${result.score.toFixed(1)}`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        category,
        test,
        passed: false,
        score: 0,
        duration,
        details: `Error: ${error instanceof Error ? error.message : String(error)}`
      });

      console.log(`  ✗ ${test} (${duration}ms) - FAILED`);
    }
  }

  private generateReport(): ValidationReport {
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.length - passed;
    const overallScore = this.results.reduce((sum, r) => sum + r.score, 0) / this.results.length;

    const summary = `
Validation Complete!
Total Tests: ${this.results.length}
Passed: ${passed}
Failed: ${failed}
Overall Score: ${overallScore.toFixed(1)}/100

${overallScore >= 90 ? 'EXCELLENT - Production Ready!' : 
  overallScore >= 80 ? 'GOOD - Minor improvements needed' :
  overallScore >= 70 ? 'FAIR - Some improvements needed' :
  'NEEDS WORK - Significant improvements required'}
    `.trim();

    return {
      timestamp: new Date().toISOString(),
      totalTests: this.results.length,
      passed,
      failed,
      overallScore,
      results: this.results,
      summary
    };
  }
}

// Run validation if executed directly
if (require.main === module) {
  const validator = new CodeGenerationValidator();
  validator.runAllValidations()
    .then(report => {
      console.log('\n' + '='.repeat(80));
      console.log(report.summary);
      console.log('='.repeat(80));
      process.exit(report.failed === 0 ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation failed:', error);
      process.exit(1);
    });
}

export { CodeGenerationValidator, ValidationReport, ValidationResult };

