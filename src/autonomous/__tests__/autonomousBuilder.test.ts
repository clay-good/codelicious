/**
 * Tests for Autonomous Builder
 */

import * as vscode from 'vscode';
import { AutonomousBuilder } from '../autonomousBuilder';
import { ProjectStateTracker } from '../projectState';
import { ModelOrchestrator } from '../../models/orchestrator';
import { AutonomousExecutor, ExecutionPlan } from '../../core/autonomousExecutor';
import { ExecutionEngine } from '../../core/executionEngine';
import { ModelResponse, ExecutionResult } from '../../types';

// Mock dependencies
jest.mock('../../models/orchestrator');
jest.mock('../../core/autonomousExecutor');
jest.mock('../../core/executionEngine');
jest.mock('../projectState');
jest.mock('vscode');

describe('AutonomousBuilder', () => {
 let builder: AutonomousBuilder;
 let mockOrchestrator: jest.Mocked<ModelOrchestrator>;
 let mockAutonomousExecutor: jest.Mocked<AutonomousExecutor>;
 let mockExecutionEngine: jest.Mocked<ExecutionEngine>;
 let mockOutputChannel: jest.Mocked<vscode.OutputChannel>;
 let mockStateTracker: any;

 const workspaceRoot = '/test/workspace';
 const projectName = 'TestProject';
 const specification = 'Build a simple web app with Express and TypeScript';

 // Set timeout for all tests in this suite to 30 seconds
 jest.setTimeout(30000);

 beforeEach(() => {
 jest.clearAllMocks();

 // Mock output channel
 mockOutputChannel = {
 appendLine: jest.fn(),
 show: jest.fn(),
 dispose: jest.fn()
 } as any;

 // Mock orchestrator
 mockOrchestrator = {
 sendRequest: jest.fn(),
 sendStreamingRequest: jest.fn()
 } as any;

 // Mock autonomous executor
 mockAutonomousExecutor = {
 parseFileOperations: jest.fn(),
 showExecutionPlan: jest.fn(),
 executePlan: jest.fn()
 } as any;

 // Mock execution engine
 mockExecutionEngine = {
 execute: jest.fn()
 } as any;

 // Track iteration count across all tests
 let defaultIterationCount = 0;

 // Mock state tracker
 mockStateTracker = {
 getState: jest.fn().mockImplementation(() => ({
 projectId: 'test-id',
 projectName: projectName,
 workspaceRoot: workspaceRoot,
 startTime: Date.now(),
 lastUpdateTime: Date.now(),
 filesCreated: [],
 filesModified: [],
 filesDeleted: [],
 tasksTotal: 0,
 tasksCompleted: [],
 tasksPending: [],
 tasksFailed: [],
 dependencies: {
 packageJsonExists: false,
 dependenciesInstalled: false,
 dependencies: [],
 devDependencies: [],
 installAttempts: 0,
 installErrors: []
 },
 buildStatus: {
 attempted: false,
 successful: false,
 attempts: 0,
 errors: [],
 warnings: []
 },
 testStatus: {
 attempted: false,
 successful: false,
 attempts: 0,
 totalTests: 0,
 passedTests: 0,
 failedTests: 0,
 errors: []
 },
 completionPercentage: 0,
 currentPhase: 'initialization',
 errors: [],
 warnings: [],
 iterationCount: defaultIterationCount,
 maxIterations: 5,
 completionCriteria: {
 requireAllTasksComplete: true,
 requireBuildSuccess: true,
 requireTestsPass: false,
 requireNoDependencyErrors: true,
 minimumFilesCreated: 1,
 customCriteria: {}
 },
 isComplete: false,
 metadata: {}
 })),
 enableAutoSave: jest.fn(),
 saveState: jest.fn(),
 dispose: jest.fn(),
 setPhase: jest.fn(),
 setCurrentTask: jest.fn(),
 incrementIteration: jest.fn().mockImplementation(() => {
 defaultIterationCount++;
 return defaultIterationCount;
 }),
 isMaxIterationsReached: jest.fn().mockReturnValue(false),
 // Make checkCompletion return false first (to allow one iteration), then true
 checkCompletion: jest.fn()
 .mockReturnValueOnce(false) // First call: not complete, run one iteration
 .mockReturnValue(true), // Subsequent calls: complete, exit loop
 addFileCreated: jest.fn(),
 addFileModified: jest.fn(),
 addFileDeleted: jest.fn(),
 updateDependencies: jest.fn(),
 updateBuildStatus: jest.fn(),
 updateTestStatus: jest.fn(),
 addError: jest.fn(),
 getSummary: jest.fn().mockReturnValue('Test Summary for TestProject')
 };

 // Mock ProjectStateTracker constructor
 (ProjectStateTracker as jest.MockedClass<typeof ProjectStateTracker>).mockImplementation(() => mockStateTracker);

 // Mock vscode.window
 (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);

 builder = new AutonomousBuilder(
 workspaceRoot,
 mockOrchestrator,
 mockAutonomousExecutor,
 mockExecutionEngine,
 null, // ragService
 null, // learningManager
 {
 maxIterations: 5,
 requireUserApproval: false,
 autoFixErrors: false,
 outputChannel: mockOutputChannel
 }
 );
 });

 describe('Initialization', () => {
 it('should create builder with options', () => {
 expect(builder).toBeDefined();
 });

 it('should use default output channel if not provided', () => {
 const builderWithoutChannel = new AutonomousBuilder(
 workspaceRoot,
 mockOrchestrator,
 mockAutonomousExecutor,
 mockExecutionEngine,
 null, // ragService
 null // learningManager
 );

 expect(vscode.window.createOutputChannel).toHaveBeenCalledWith(
 'Codelicious Autonomous Builder'
 );
 });
 });

 describe('Build from Specification', () => {
 it('should complete successful build', async () => {
 // Mock completion check to return true after first iteration
 let callCount = 0;
 mockStateTracker.checkCompletion.mockImplementation(() => {
 callCount++;
 return callCount > 1; // Complete after first iteration
 });

 // Mock AI responses
 mockOrchestrator.sendRequest
 .mockResolvedValueOnce({
 content: '```typescript:src/main.ts\nconsole.log("Hello");\n```',
 usage: { totalTokens: 100 },
 cost: 0.001
 } as ModelResponse)
 .mockResolvedValueOnce({
 content: 'COMMAND: npm install\nCOMMAND: npm run build',
 usage: { totalTokens: 50 },
 cost: 0.0005
 } as ModelResponse)
 .mockResolvedValueOnce({
 content: 'PROJECT COMPLETE',
 usage: { totalTokens: 20 },
 cost: 0.0001
 } as ModelResponse);

 // Mock file operations
 const mockPlan: ExecutionPlan = {
 operations: [{
 type: 'create',
 filePath: 'src/main.ts',
 content: 'console.log("Hello");',
 language: 'typescript'
 }],
 description: 'Create main file',
 estimatedImpact: 'low'
 };

 mockAutonomousExecutor.parseFileOperations.mockReturnValue(mockPlan);
 mockAutonomousExecutor.executePlan.mockResolvedValue({
 success: true,
 appliedOperations: mockPlan.operations,
 failedOperations: [],
 errors: []
 });

 // Mock command execution
 mockExecutionEngine.execute.mockResolvedValue({
 success: true,
 stdout: 'Build successful',
 stderr: '',
 exitCode: 0,
 duration: 1000
 } as ExecutionResult);

 const result = await builder.buildFromSpecification(specification, projectName);

 expect(result.success).toBe(true);
 expect(result.iterations).toBeGreaterThan(0);
 expect(mockOrchestrator.sendRequest).toHaveBeenCalled();
 });

 it('should stop at max iterations', async () => {
 // Mock AI responses that never complete
 mockOrchestrator.sendRequest.mockResolvedValue({
 content: '```typescript:src/file.ts\nconsole.log("test");\n```',
 usage: { totalTokens: 100 },
 cost: 0.001
 } as ModelResponse);

 mockAutonomousExecutor.parseFileOperations.mockReturnValue({
 operations: [],
 description: 'No operations',
 estimatedImpact: 'low'
 });

 // Configure mocks for this specific test
 let iterationCount = 0;
 mockStateTracker.incrementIteration.mockClear();
 mockStateTracker.incrementIteration.mockImplementation(() => {
 iterationCount++;
 return iterationCount;
 });
 mockStateTracker.isMaxIterationsReached.mockClear();
 mockStateTracker.isMaxIterationsReached.mockImplementation(() => iterationCount >= 5);
 // Reset checkCompletion to always return false for this test
 mockStateTracker.checkCompletion.mockClear();
 mockStateTracker.checkCompletion.mockImplementation(() => false); // Never complete
 mockStateTracker.getState.mockImplementation(() => ({
 projectId: 'test-id',
 projectName: 'TestProject',
 workspaceRoot: '/test/workspace',
 startTime: Date.now(),
 lastUpdateTime: Date.now(),
 filesCreated: [],
 filesModified: [],
 filesDeleted: [],
 tasksTotal: 0,
 tasksCompleted: [],
 tasksPending: [],
 tasksFailed: [],
 dependencies: {
 packageJsonExists: false,
 dependenciesInstalled: false,
 dependencies: [],
 devDependencies: [],
 installAttempts: 0,
 installErrors: []
 },
 buildStatus: {
 attempted: false,
 successful: false,
 attempts: 0,
 errors: [],
 warnings: []
 },
 testStatus: {
 attempted: false,
 successful: false,
 attempts: 0,
 totalTests: 0,
 passedTests: 0,
 failedTests: 0,
 errors: []
 },
 completionPercentage: 0,
 currentPhase: 'building',
 errors: [],
 warnings: [],
 iterationCount: iterationCount,
 maxIterations: 5,
 completionCriteria: {
 requireAllTasksComplete: true,
 requireBuildSuccess: true,
 requireTestsPass: false,
 requireNoDependencyErrors: true,
 minimumFilesCreated: 1,
 customCriteria: {}
 },
 isComplete: false,
 metadata: {}
 }));

 const result = await builder.buildFromSpecification(specification, projectName);

 expect(result.iterations).toBe(5); // maxIterations
 expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
 expect.stringContaining('Maximum iterations reached')
 );
 });

 it('should handle errors gracefully', async () => {
 mockOrchestrator.sendRequest.mockRejectedValue(new Error('API Error'));

 const result = await builder.buildFromSpecification(specification, projectName);

 expect(result.success).toBe(false);
 expect(result.errors).toContain('API Error');
 });
 });

 describe('File Operations', () => {
 it('should parse and execute file operations', async () => {
 const aiResponse = '```typescript:src/main.ts\nconsole.log("Hello");\n```';

 const mockPlan: ExecutionPlan = {
 operations: [{
 type: 'create',
 filePath: 'src/main.ts',
 content: 'console.log("Hello");',
 language: 'typescript'
 }],
 description: 'Create main file',
 estimatedImpact: 'low'
 };

 mockAutonomousExecutor.parseFileOperations.mockReturnValue(mockPlan);
 mockAutonomousExecutor.executePlan.mockResolvedValue({
 success: true,
 appliedOperations: mockPlan.operations,
 failedOperations: [],
 errors: []
 });

 mockOrchestrator.sendRequest
 .mockResolvedValueOnce({
 content: aiResponse,
 usage: { totalTokens: 100 },
 cost: 0.001
 } as ModelResponse)
 .mockResolvedValueOnce({
 content: 'PROJECT COMPLETE',
 usage: { totalTokens: 20 },
 cost: 0.0001
 } as ModelResponse);

 await builder.buildFromSpecification(specification, projectName);

 expect(mockAutonomousExecutor.parseFileOperations).toHaveBeenCalledWith(aiResponse);
 expect(mockAutonomousExecutor.executePlan).toHaveBeenCalledWith(mockPlan);
 });

 it('should skip file operations if none detected', async () => {
 mockOrchestrator.sendRequest.mockResolvedValue({
 content: 'PROJECT COMPLETE',
 usage: { totalTokens: 20 },
 cost: 0.0001
 } as ModelResponse);

 mockAutonomousExecutor.parseFileOperations.mockReturnValue(null);

 await builder.buildFromSpecification(specification, projectName);

 expect(mockAutonomousExecutor.executePlan).not.toHaveBeenCalled();
 });
 });

 describe('Command Execution', () => {
 it('should parse and execute commands', async () => {
 const aiResponse = 'COMMAND: npm install\nCOMMAND: npm run build';

 mockOrchestrator.sendRequest
 .mockResolvedValueOnce({
 content: aiResponse,
 usage: { totalTokens: 50 },
 cost: 0.0005
 } as ModelResponse)
 .mockResolvedValueOnce({
 content: 'PROJECT COMPLETE',
 usage: { totalTokens: 20 },
 cost: 0.0001
 } as ModelResponse);

 mockAutonomousExecutor.parseFileOperations.mockReturnValue(null);

 mockExecutionEngine.execute.mockResolvedValue({
 success: true,
 stdout: 'Success',
 stderr: '',
 exitCode: 0,
 duration: 1000
 } as ExecutionResult);

 await builder.buildFromSpecification(specification, projectName);

 expect(mockExecutionEngine.execute).toHaveBeenCalledWith(
 'npm install',
 expect.objectContaining({
 workingDirectory: workspaceRoot
 })
 );
 expect(mockExecutionEngine.execute).toHaveBeenCalledWith(
 'npm run build',
 expect.objectContaining({
 workingDirectory: workspaceRoot
 })
 );
 });

 it('should handle command failures', async () => {
 mockOrchestrator.sendRequest
 .mockResolvedValueOnce({
 content: 'COMMAND: npm test',
 usage: { totalTokens: 30 },
 cost: 0.0003
 } as ModelResponse)
 .mockResolvedValueOnce({
 content: 'PROJECT COMPLETE',
 usage: { totalTokens: 20 },
 cost: 0.0001
 } as ModelResponse);

 mockAutonomousExecutor.parseFileOperations.mockReturnValue(null);

 mockExecutionEngine.execute.mockResolvedValue({
 success: false,
 stdout: '',
 stderr: 'Tests failed',
 exitCode: 1,
 duration: 1000
 } as ExecutionResult);

 await builder.buildFromSpecification(specification, projectName);

 expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
 expect.stringContaining('Failed')
 );
 });
 });

 describe('Test Result Parsing', () => {
 it('should parse Jest test results', async () => {
 const jestOutput = 'Tests: 10 passed, 10 total';

 mockOrchestrator.sendRequest
 .mockResolvedValueOnce({
 content: 'COMMAND: npm test',
 usage: { totalTokens: 30 },
 cost: 0.0003
 } as ModelResponse)
 .mockResolvedValueOnce({
 content: 'PROJECT COMPLETE',
 usage: { totalTokens: 20 },
 cost: 0.0001
 } as ModelResponse);

 mockAutonomousExecutor.parseFileOperations.mockReturnValue(null);

 mockExecutionEngine.execute.mockResolvedValue({
 success: true,
 stdout: jestOutput,
 stderr: '',
 exitCode: 0,
 duration: 1000
 } as ExecutionResult);

 await builder.buildFromSpecification(specification, projectName);

 expect(mockExecutionEngine.execute).toHaveBeenCalled();
 });
 });

 describe('Cancellation', () => {
 it('should cancel build', async () => {
 mockOrchestrator.sendRequest.mockImplementation(async () => {
 builder.cancel();
 return {
 content: 'Some response',
 usage: { totalTokens: 100 },
 cost: 0.001
 } as ModelResponse;
 });

 mockAutonomousExecutor.parseFileOperations.mockReturnValue(null);

 const result = await builder.buildFromSpecification(specification, projectName);

 expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
 expect.stringContaining('cancelled')
 );
 });
 });

 describe('State Management', () => {
 it('should provide state access', async () => {
 mockOrchestrator.sendRequest.mockResolvedValue({
 content: 'PROJECT COMPLETE',
 usage: { totalTokens: 20 },
 cost: 0.0001
 } as ModelResponse);

 await builder.buildFromSpecification(specification, projectName);

 const state = builder.getState();
 expect(state).toBeDefined();
 });

 it('should provide summary', async () => {
 mockOrchestrator.sendRequest.mockResolvedValue({
 content: 'PROJECT COMPLETE',
 usage: { totalTokens: 20 },
 cost: 0.0001
 } as ModelResponse);

 await builder.buildFromSpecification(specification, projectName);

 const summary = builder.getSummary();
 expect(summary).toContain(projectName);
 });
 });
});

