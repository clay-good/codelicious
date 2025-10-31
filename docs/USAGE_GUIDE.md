# Codelicious Usage Guide

## Quick Start

### 1. **Install Codelicious**

```bash
# Clone the repository
git clone https://github.com/clay-good/codelicious.git
cd codelicious

# Install dependencies
npm install

# Build the extension
npm run build

# Run tests (optional)
npm test
```

### 2. **Configure API Keys**

Open VS Code settings and configure your AI provider API keys:

```json
{
 // Recommended: Claude Sonnet 4.5 (best quality)
 "codelicious.claude.apiKey": "your-claude-api-key",

 // Optional: Other providers
 "codelicious.openai.apiKey": "your-openai-api-key",
 "codelicious.gemini.apiKey": "your-gemini-api-key"
}
```

### 3. **Set Default Model (Recommended)**

```json
{
 // Use Claude Sonnet 4.5 for best quality
 "codelicious.models.defaultModel": "claude-3-5-sonnet-20241022",
 "codelicious.agents.defaultModel": "claude-3-5-sonnet-20241022"
}
```

---

## Core Features

### 1. Autonomous Building

Build entire applications from specifications:

```typescript
// Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
// Type: "Codelicious: Build from Specification"

// Or use the API:
const builder = new AutonomousBuilder(
 workspaceRoot,
 orchestrator,
 autonomousExecutor,
 executionEngine,
 ragService,
 learningManager,
 {
 maxIterations: 50,
 autoFixErrors: true,
 enableTests: true
 }
);

const result = await builder.buildFromSpecification(
 "Build a REST API with Express and TypeScript that handles user authentication"
);
```

**What it does**:
- Parses requirements
- Creates execution plan
- Generates code with Claude Sonnet 4.5
- Validates code quality
- Fixes any issues automatically
- Generates comprehensive tests
- Validates tests
- Learns from the process

---

### 2. **Problem Solving**

Solve code problems with AI:

```typescript
// Detect a problem
const problem = {
 id: 'prob-1',
 type: 'compilation',
 severity: 'critical',
 description: 'Type error in user authentication',
 context: {
 code: '...',
 filePath: 'src/auth.ts',
 language: 'typescript',
 framework: 'express',
 dependencies: ['express', 'jsonwebtoken'],
 relatedCode: []
 },
 affectedFiles: ['src/auth.ts'],
 errorMessage: 'Property "email" does not exist on type "User"',
 detectedAt: new Date()
};

// Solve it
const problemSolver = new IntelligentProblemSolver(
 orchestrator,
 ragService,
 learningManager
);

const result = await problemSolver.solveProblem(problem, {
 maxIterations: 5,
 requireTests: true,
 considerAlternatives: true,
 useRAG: true,
 learnFromSolution: true
});

console.log(`Problem solved in ${result.iterations} iterations`);
console.log(`Solution: ${result.solution.approach}`);
console.log(`Tests generated: ${result.solution.tests.length}`);
```

---

### 3. **Test Generation**

Generate comprehensive tests:

```typescript
// Open Command Palette
// Type: "Codelicious: Generate Tests"

// Or use the API:
const testGenerator = new AutomaticTestGenerator(
 orchestrator,
 ragService
);

const result = await testGenerator.generate(
 generatedCode,
 architecturalContext
);

console.log(`Generated ${result.tests.length} test files`);
console.log(`Total tests: ${result.totalTests}`);
console.log(`Coverage: ${result.coverage}%`);
```

---

### 4. **Code Refactoring**

Refactor code with AI:

```typescript
// Select code in editor
// Open Command Palette
// Type: "Codelicious: Refactor"

// Or use the API:
const refactoringEngine = new RefactoringEngine(workspaceRoot);

// Extract method
const result = await refactoringEngine.extractMethod(
 document,
 selection,
 'calculateTotal'
);

// Apply refactoring
await refactoringEngine.applyRefactoring(document, result.operations);
```

**Refactoring Operations**:
- Extract method/function
- Extract variable
- Rename symbol
- Inline variable
- Move to file
- Convert to arrow function

---

### 5. **Code Validation**

Validate code quality:

```typescript
const validator = new ProductionValidator(
 orchestrator,
 executionEngine
);

const result = await validator.validate(
 generatedCode,
 generatedTests,
 requirements
);

console.log(`Overall score: ${result.overallScore}/100`);
console.log(`Passed: ${result.passed}`);
console.log(`Critical issues: ${result.criticalIssues.length}`);
```

**Validation Checks**:
- Compilation
- Test execution
- Linting
- Security
- Requirements
- Performance
- Documentation

---

### 6. **Iterative Refinement**

Refine code until perfect:

```typescript
const refinementEngine = new IterativeRefinementEngine(
 orchestrator,
 validator,
 executionEngine
);

const result = await refinementEngine.refineUntilPerfect(
 generatedCode,
 requirements,
 {
 maxIterations: 10,
 targetScore: 95,
 fixCompilationErrors: true,
 fixTestFailures: true,
 fixLintingIssues: true,
 fixLogicErrors: true
 }
);

console.log(`Refined in ${result.iterations} iterations`);
console.log(`Final score: ${result.finalScore}/100`);
```

---

## Chat Interface

Use the chat interface for interactive development:

```typescript
// Open Command Palette
// Type: "Codelicious: Open Chat"

// Chat commands:
// - "Build a REST API with Express"
// - "Fix the error in auth.ts"
// - "Generate tests for UserService"
// - "Refactor the calculateTotal function"
// - "Explain how the authentication works"
```

---

## Configuration

### Model Configuration

```json
{
 // Default model (recommended: Claude Sonnet 4.5)
 "codelicious.models.defaultModel": "claude-3-5-sonnet-20241022",

 // Default provider
 "codelicious.models.defaultProvider": "claude",

 // Cost limit (USD per day)
 "codelicious.models.costLimit": 10.0,

 // Prefer local models
 "codelicious.models.preferLocal": true,

 // Fallback to cloud if local fails
 "codelicious.models.fallbackToCloud": true
}
```

### Agent Configuration

```json
{
 // Default model for all agents
 "codelicious.agents.defaultModel": "claude-3-5-sonnet-20241022",

 // Override for specific agents
 "codelicious.agents.codeGenerator.model": "claude-3-5-sonnet-20241022",
 "codelicious.agents.securityReviewer.model": "claude-3-5-sonnet-20241022",
 "codelicious.agents.qualityReviewer.model": "claude-3-5-sonnet-20241022",
 "codelicious.agents.testingValidator.model": "claude-3-5-sonnet-20241022",

 // Autonomous building
 "codelicious.agents.autoWriteFiles": true,
 "codelicious.agents.autoExecuteTests": true,
 "codelicious.agents.requireApproval": true
}
```

### RAG Configuration

```json
{
 // Enable progressive indexing
 "codelicious.indexing.progressive": true,

 // Run indexing in background
 "codelicious.indexing.background": true,

 // Maximum memory for indexing
 "codelicious.indexing.maxMemory": "2GB"
}
```

---

## Advanced Usage

### Custom Problem Solving

```typescript
// Create custom problem solver
class CustomProblemSolver extends IntelligentProblemSolver {
 async analyzeProblem(problem: Problem, useRAG: boolean) {
 // Custom analysis logic
 const analysis = await super.analyzeProblem(problem, useRAG);

 // Add custom insights
 analysis.customInsights = this.getCustomInsights(problem);

 return analysis;
 }
}
```

### Custom Validation

```typescript
// Create custom validator
class CustomValidator extends ProductionValidator {
 async validate(code, tests, requirements) {
 const result = await super.validate(code, tests, requirements);

 // Add custom checks
 result.checks.push(await this.customSecurityCheck(code));

 return result;
 }
}
```

---

## Monitoring & Analytics

### View Statistics

```typescript
// Get learning statistics
const learningManager = extensionManager.getLearningManager();
const stats = learningManager.getStats();

console.log(`Total feedback: ${stats.totalFeedback}`);
console.log(`Total patterns: ${stats.totalPatterns}`);
console.log(`Approval rate: ${stats.approvalRate}%`);
console.log(`Average quality: ${stats.averageQualityScore}`);
```

### View Model Usage

```typescript
// Get model orchestrator statistics
const orchestrator = extensionManager.getOrchestrator();
const stats = orchestrator.getStats();

console.log(`Total requests: ${stats.totalRequests}`);
console.log(`Total cost: $${stats.totalCost.toFixed(2)}`);
console.log(`Cache hit rate: ${stats.cacheHitRate}%`);
```

---

## Troubleshooting

### Build Errors

```bash
# Clean build
npm run clean
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

### Test Failures

```bash
# Run specific test
npm test -- --testNamePattern="should initialize successfully"

# Run with verbose output
npm test -- --verbose

# Run with coverage
npm test -- --coverage
```

### API Key Issues

```bash
# Verify API keys are set
code --list-extensions | grep codelicious

# Check VS Code settings
cat ~/.config/Code/User/settings.json | grep codelicious
```

---

## Resources

- Documentation: See ARCHITECTURE.md, INSTALLATION.md, DEVELOPMENT.md
- GitHub: https://github.com/clay-good/codelicious
- Issues: https://github.com/clay-good/codelicious/issues

---

## Summary

Codelicious provides:

- Autonomous building from specifications
- Intelligent problem solving with Claude Sonnet 4.5
- Comprehensive test generation with high coverage
- Code refactoring with AI suggestions
- Multi-stage validation for production quality
- Iterative refinement until perfect
- Self-learning for continuous improvement

Start building amazing applications with AI today!

