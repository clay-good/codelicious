/**
 * Tests for ModelSelector
 */

import { ModelSelector, ModelInfo } from '../modelSelector';
import { ModelOrchestrator } from '../../models/orchestrator';
import { ModelProvider } from '../../types';

// Mock VS Code API
const mockShowQuickPick = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockExecuteCommand = jest.fn();
const mockCreateWebviewPanel = jest.fn();
const mockGetConfiguration = jest.fn();

jest.mock('vscode', () => ({
 window: {
 showQuickPick: (...args: any[]) => mockShowQuickPick(...args),
 showInformationMessage: (...args: any[]) => mockShowInformationMessage(...args),
 showErrorMessage: (...args: any[]) => mockShowErrorMessage(...args),
 createWebviewPanel: (...args: any[]) => mockCreateWebviewPanel(...args)
 },
 commands: {
 executeCommand: (...args: any[]) => mockExecuteCommand(...args)
 },
 workspace: {
 getConfiguration: (...args: any[]) => {
 const result = mockGetConfiguration(...args);
 // If mockGetConfiguration returns undefined, return a default config object
 if (!result) {
 return {
 get: jest.fn(),
 update: jest.fn().mockResolvedValue(undefined)
 };
 }
 return result;
 }
 },
 ViewColumn: {
 One: 1
 },
 ConfigurationTarget: {
 Global: 1
 }
}));

// Mock ModelOrchestrator
const mockOrchestrator = {
 getAvailableProviders: jest.fn()
} as unknown as ModelOrchestrator;

// Mock ModelComparisonView
const mockComparisonViewShow = jest.fn();

jest.mock('../modelComparisonView', () => ({
 ModelComparisonView: jest.fn().mockImplementation(() => ({
 show: mockComparisonViewShow
 }))
}));

describe('ModelSelector', () => {
 let selector: ModelSelector;
 const mockExtensionUri = { fsPath: '/test/extension', scheme: 'file', authority: '', path: '/test/extension', query: '', fragment: '' } as any;

 beforeEach(() => {
 selector = new ModelSelector(mockOrchestrator, mockExtensionUri);
 jest.clearAllMocks();
 });

 describe('showModelPicker', () => {
 it('should show error if no providers configured', async () => {
 (mockOrchestrator.getAvailableProviders as jest.Mock).mockReturnValue([]);
 mockShowErrorMessage.mockResolvedValue('Configure API Keys');

 const result = await selector.showModelPicker();

 expect(result).toBeUndefined();
 expect(mockShowErrorMessage).toHaveBeenCalledWith(
 'No AI providers configured. Please configure API keys first.',
 'Configure API Keys'
 );
 });

 it('should show models for available providers', async () => {
 (mockOrchestrator.getAvailableProviders as jest.Mock).mockReturnValue([
 ModelProvider.CLAUDE,
 ModelProvider.OPENAI
 ]);
 mockShowQuickPick.mockResolvedValue(undefined);

 await selector.showModelPicker();

 expect(mockShowQuickPick).toHaveBeenCalled();
 const items = mockShowQuickPick.mock.calls[0][0];
 expect(items.length).toBeGreaterThan(0);
 expect(items.every((item: any) =>
 item.model.provider === ModelProvider.CLAUDE ||
 item.model.provider === ModelProvider.OPENAI
 )).toBe(true);
 });

 it('should return selected model', async () => {
 (mockOrchestrator.getAvailableProviders as jest.Mock).mockReturnValue([
 ModelProvider.CLAUDE
 ]);

 const mockModel: ModelInfo = {
 provider: ModelProvider.CLAUDE,
 model: 'claude-3-5-sonnet-20241022',
 displayName: 'Claude 3.5 Sonnet',
 description: 'Test',
 contextWindow: 200000,
 costPerMToken: '$3 / $15',
 capabilities: ['Coding']
 };

 mockShowQuickPick.mockResolvedValue({ model: mockModel });

 const result = await selector.showModelPicker();

 expect(result).toEqual(mockModel);
 });
 });

 describe('showModelComparison', () => {
 it('should show comparison view', async () => {
 (mockOrchestrator.getAvailableProviders as jest.Mock).mockReturnValue([
 ModelProvider.CLAUDE
 ]);

 await selector.showModelComparison();

 // Since we provided extensionUri, it should call show() on the ModelComparisonView
 expect(mockComparisonViewShow).toHaveBeenCalled();
 });
 });

 describe('setDefaultModel', () => {
 it('should update configuration', async () => {
 const mockConfig = {
 update: jest.fn().mockResolvedValue(undefined)
 };
 mockGetConfiguration.mockReturnValue(mockConfig);

 const model: ModelInfo = {
 provider: ModelProvider.CLAUDE,
 model: 'claude-3-5-sonnet-20241022',
 displayName: 'Claude 3.5 Sonnet',
 description: 'Test',
 contextWindow: 200000,
 costPerMToken: '$3 / $15',
 capabilities: ['Coding']
 };

 await selector.setDefaultModel(model);

 expect(mockConfig.update).toHaveBeenCalledWith(
 'models.defaultModel',
 'claude-3-5-sonnet-20241022',
 1
 );
 expect(mockConfig.update).toHaveBeenCalledWith(
 'models.defaultProvider',
 ModelProvider.CLAUDE,
 1
 );
 });
 });

 describe('getDefaultModel', () => {
 it('should return default model from config', () => {
 const mockConfig = {
 get: jest.fn().mockReturnValue('gpt-4-turbo-preview')
 };
 mockGetConfiguration.mockReturnValue(mockConfig);

 const result = selector.getDefaultModel();

 expect(result).toBe('gpt-4-turbo-preview');
 expect(mockConfig.get).toHaveBeenCalledWith('models.defaultModel');
 });
 });

 describe('getModelInfo', () => {
 it('should return model info for valid model', () => {
 const info = ModelSelector.getModelInfo('claude-3-5-sonnet-20241022');

 expect(info).toBeDefined();
 expect(info?.model).toBe('claude-3-5-sonnet-20241022');
 expect(info?.provider).toBe(ModelProvider.CLAUDE);
 });

 it('should return undefined for invalid model', () => {
 const info = ModelSelector.getModelInfo('invalid-model');

 expect(info).toBeUndefined();
 });
 });

 describe('getModelsForProvider', () => {
 it('should return all Claude models', () => {
 const models = ModelSelector.getModelsForProvider(ModelProvider.CLAUDE);

 expect(models.length).toBeGreaterThan(0);
 expect(models.every(m => m.provider === ModelProvider.CLAUDE)).toBe(true);
 });

 it('should return all OpenAI models', () => {
 const models = ModelSelector.getModelsForProvider(ModelProvider.OPENAI);

 expect(models.length).toBeGreaterThan(0);
 expect(models.every(m => m.provider === ModelProvider.OPENAI)).toBe(true);
 });

 it('should return all Gemini models', () => {
 const models = ModelSelector.getModelsForProvider(ModelProvider.GEMINI);

 expect(models.length).toBeGreaterThan(0);
 expect(models.every(m => m.provider === ModelProvider.GEMINI)).toBe(true);
 });
 });
});

