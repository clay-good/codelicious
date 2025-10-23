"use strict";
/**
 * Tests for ModelSelector
 */
Object.defineProperty(exports, "__esModule", { value: true });
const modelSelector_1 = require("../modelSelector");
const types_1 = require("../../types");
// Mock VS Code API
const mockShowQuickPick = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockShowErrorMessage = jest.fn();
const mockExecuteCommand = jest.fn();
const mockCreateWebviewPanel = jest.fn();
const mockGetConfiguration = jest.fn();
jest.mock('vscode', () => ({
    window: {
        showQuickPick: (...args) => mockShowQuickPick(...args),
        showInformationMessage: (...args) => mockShowInformationMessage(...args),
        showErrorMessage: (...args) => mockShowErrorMessage(...args),
        createWebviewPanel: (...args) => mockCreateWebviewPanel(...args)
    },
    commands: {
        executeCommand: (...args) => mockExecuteCommand(...args)
    },
    workspace: {
        getConfiguration: (...args) => {
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
};
// Mock ModelComparisonView
const mockComparisonViewShow = jest.fn();
jest.mock('../modelComparisonView', () => ({
    ModelComparisonView: jest.fn().mockImplementation(() => ({
        show: mockComparisonViewShow
    }))
}));
describe('ModelSelector', () => {
    let selector;
    const mockExtensionUri = { fsPath: '/test/extension', scheme: 'file', authority: '', path: '/test/extension', query: '', fragment: '' };
    beforeEach(() => {
        selector = new modelSelector_1.ModelSelector(mockOrchestrator, mockExtensionUri);
        jest.clearAllMocks();
    });
    describe('showModelPicker', () => {
        it('should show error if no providers configured', async () => {
            mockOrchestrator.getAvailableProviders.mockReturnValue([]);
            mockShowErrorMessage.mockResolvedValue('Configure API Keys');
            const result = await selector.showModelPicker();
            expect(result).toBeUndefined();
            expect(mockShowErrorMessage).toHaveBeenCalledWith('No AI providers configured. Please configure API keys first.', 'Configure API Keys');
        });
        it('should show models for available providers', async () => {
            mockOrchestrator.getAvailableProviders.mockReturnValue([
                types_1.ModelProvider.CLAUDE,
                types_1.ModelProvider.OPENAI
            ]);
            mockShowQuickPick.mockResolvedValue(undefined);
            await selector.showModelPicker();
            expect(mockShowQuickPick).toHaveBeenCalled();
            const items = mockShowQuickPick.mock.calls[0][0];
            expect(items.length).toBeGreaterThan(0);
            expect(items.every((item) => item.model.provider === types_1.ModelProvider.CLAUDE ||
                item.model.provider === types_1.ModelProvider.OPENAI)).toBe(true);
        });
        it('should return selected model', async () => {
            mockOrchestrator.getAvailableProviders.mockReturnValue([
                types_1.ModelProvider.CLAUDE
            ]);
            const mockModel = {
                provider: types_1.ModelProvider.CLAUDE,
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
            mockOrchestrator.getAvailableProviders.mockReturnValue([
                types_1.ModelProvider.CLAUDE
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
            const model = {
                provider: types_1.ModelProvider.CLAUDE,
                model: 'claude-3-5-sonnet-20241022',
                displayName: 'Claude 3.5 Sonnet',
                description: 'Test',
                contextWindow: 200000,
                costPerMToken: '$3 / $15',
                capabilities: ['Coding']
            };
            await selector.setDefaultModel(model);
            expect(mockConfig.update).toHaveBeenCalledWith('models.defaultModel', 'claude-3-5-sonnet-20241022', 1);
            expect(mockConfig.update).toHaveBeenCalledWith('models.defaultProvider', types_1.ModelProvider.CLAUDE, 1);
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
            const info = modelSelector_1.ModelSelector.getModelInfo('claude-3-5-sonnet-20241022');
            expect(info).toBeDefined();
            expect(info?.model).toBe('claude-3-5-sonnet-20241022');
            expect(info?.provider).toBe(types_1.ModelProvider.CLAUDE);
        });
        it('should return undefined for invalid model', () => {
            const info = modelSelector_1.ModelSelector.getModelInfo('invalid-model');
            expect(info).toBeUndefined();
        });
    });
    describe('getModelsForProvider', () => {
        it('should return all Claude models', () => {
            const models = modelSelector_1.ModelSelector.getModelsForProvider(types_1.ModelProvider.CLAUDE);
            expect(models.length).toBeGreaterThan(0);
            expect(models.every(m => m.provider === types_1.ModelProvider.CLAUDE)).toBe(true);
        });
        it('should return all OpenAI models', () => {
            const models = modelSelector_1.ModelSelector.getModelsForProvider(types_1.ModelProvider.OPENAI);
            expect(models.length).toBeGreaterThan(0);
            expect(models.every(m => m.provider === types_1.ModelProvider.OPENAI)).toBe(true);
        });
        it('should return all Gemini models', () => {
            const models = modelSelector_1.ModelSelector.getModelsForProvider(types_1.ModelProvider.GEMINI);
            expect(models.length).toBeGreaterThan(0);
            expect(models.every(m => m.provider === types_1.ModelProvider.GEMINI)).toBe(true);
        });
    });
});
//# sourceMappingURL=modelSelector.test.js.map