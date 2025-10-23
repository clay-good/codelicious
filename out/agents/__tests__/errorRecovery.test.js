"use strict";
/**
 * Tests for Error Recovery System
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const errorRecovery_1 = require("../errorRecovery");
const vscode = __importStar(require("vscode"));
// Mock vscode
jest.mock('vscode');
describe('ErrorRecoveryManager', () => {
    let manager;
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock output channel BEFORE creating the manager
        vscode.window.createOutputChannel.mockReturnValue({
            show: jest.fn(),
            appendLine: jest.fn(),
            clear: jest.fn(),
            dispose: jest.fn()
        });
        // Create manager AFTER setting up mocks
        manager = new errorRecovery_1.ErrorRecoveryManager();
    });
    describe('classifyError', () => {
        it('should classify network errors correctly', () => {
            const error = new Error('Network timeout occurred');
            const classified = manager.classifyError(error);
            expect(classified.category).toBe(errorRecovery_1.ErrorCategory.NETWORK);
            expect(classified.severity).toBe(errorRecovery_1.ErrorSeverity.LOW);
            expect(classified.recoveryStrategy).toBe(errorRecovery_1.RecoveryStrategy.RETRY);
            expect(classified.retryable).toBe(true);
            expect(classified.maxRetries).toBe(3);
        });
        it('should classify file system errors correctly', () => {
            const error = new Error('ENOENT: file not found');
            const classified = manager.classifyError(error);
            expect(classified.category).toBe(errorRecovery_1.ErrorCategory.FILE_SYSTEM);
            expect(classified.severity).toBe(errorRecovery_1.ErrorSeverity.MEDIUM);
            expect(classified.recoveryStrategy).toBe(errorRecovery_1.RecoveryStrategy.RETRY_WITH_FALLBACK);
            expect(classified.retryable).toBe(true);
        });
        it('should classify permission errors correctly', () => {
            const error = new Error('EACCES: permission denied');
            const classified = manager.classifyError(error);
            expect(classified.category).toBe(errorRecovery_1.ErrorCategory.PERMISSION);
            expect(classified.severity).toBe(errorRecovery_1.ErrorSeverity.HIGH);
            expect(classified.recoveryStrategy).toBe(errorRecovery_1.RecoveryStrategy.USER_INTERVENTION);
            expect(classified.retryable).toBe(false);
        });
        it('should classify validation errors correctly', () => {
            const error = new Error('Invalid input provided');
            const classified = manager.classifyError(error);
            expect(classified.category).toBe(errorRecovery_1.ErrorCategory.VALIDATION);
            expect(classified.severity).toBe(errorRecovery_1.ErrorSeverity.MEDIUM);
            expect(classified.recoveryStrategy).toBe(errorRecovery_1.RecoveryStrategy.USER_INTERVENTION);
        });
        it('should classify execution errors correctly', () => {
            const error = new Error('Command not found: npm');
            const classified = manager.classifyError(error);
            expect(classified.category).toBe(errorRecovery_1.ErrorCategory.EXECUTION);
            expect(classified.severity).toBe(errorRecovery_1.ErrorSeverity.MEDIUM);
            expect(classified.recoveryStrategy).toBe(errorRecovery_1.RecoveryStrategy.RETRY_WITH_FALLBACK);
        });
        it('should classify timeout errors correctly', () => {
            const error = new Error('Operation timed out after 5000ms');
            const classified = manager.classifyError(error);
            expect(classified.category).toBe(errorRecovery_1.ErrorCategory.TIMEOUT);
            expect(classified.severity).toBe(errorRecovery_1.ErrorSeverity.LOW);
            expect(classified.recoveryStrategy).toBe(errorRecovery_1.RecoveryStrategy.RETRY);
        });
        it('should classify resource errors correctly', () => {
            const error = new Error('Out of memory');
            const classified = manager.classifyError(error);
            expect(classified.category).toBe(errorRecovery_1.ErrorCategory.RESOURCE);
            expect(classified.severity).toBe(errorRecovery_1.ErrorSeverity.HIGH);
            expect(classified.recoveryStrategy).toBe(errorRecovery_1.RecoveryStrategy.ABORT);
            expect(classified.retryable).toBe(false);
        });
        it('should classify unknown errors conservatively', () => {
            const error = new Error('Something went wrong');
            const classified = manager.classifyError(error);
            expect(classified.category).toBe(errorRecovery_1.ErrorCategory.UNKNOWN);
            expect(classified.severity).toBe(errorRecovery_1.ErrorSeverity.MEDIUM);
            expect(classified.recoveryStrategy).toBe(errorRecovery_1.RecoveryStrategy.RETRY);
            expect(classified.maxRetries).toBe(1);
        });
    });
    describe('recover', () => {
        it('should succeed on first attempt', async () => {
            const operation = jest.fn().mockResolvedValue('success');
            const result = await manager.recover(operation);
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });
        it('should retry on transient failures', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Network timeout'))
                .mockResolvedValueOnce('success');
            const result = await manager.recover(operation, { maxRetries: 2, initialBackoffMs: 10 });
            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });
        it('should respect maxRetries limit', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Network timeout'));
            await expect(manager.recover(operation, { maxRetries: 2, initialBackoffMs: 10 })).rejects.toThrow('Network timeout');
            expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });
        it('should use exponential backoff', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Network timeout'))
                .mockRejectedValueOnce(new Error('Network timeout'))
                .mockResolvedValueOnce('success');
            const startTime = Date.now();
            await manager.recover(operation, {
                maxRetries: 2,
                initialBackoffMs: 100,
                backoffMultiplier: 2
            });
            const duration = Date.now() - startTime;
            // Should wait at least 100ms + 200ms = 300ms
            expect(duration).toBeGreaterThanOrEqual(300);
            expect(operation).toHaveBeenCalledTimes(3);
        });
        it('should update statistics on recovery', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new Error('Network timeout'))
                .mockResolvedValueOnce('success');
            await manager.recover(operation, { maxRetries: 2, initialBackoffMs: 10 });
            const stats = manager.getStats();
            expect(stats.totalErrors).toBe(1);
            expect(stats.recoveredErrors).toBe(1);
            expect(stats.retriesAttempted).toBe(1);
        });
        it('should update statistics on failure', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Network timeout'));
            await expect(manager.recover(operation, { maxRetries: 1, initialBackoffMs: 10 })).rejects.toThrow();
            const stats = manager.getStats();
            expect(stats.totalErrors).toBe(2); // Initial + 1 retry
            expect(stats.failedRecoveries).toBe(1);
        });
        it('should track errors by category', async () => {
            const operation1 = jest.fn().mockRejectedValue(new Error('Network timeout'));
            const operation2 = jest.fn().mockRejectedValue(new Error('ENOENT: file not found'));
            await expect(manager.recover(operation1, { maxRetries: 0, initialBackoffMs: 10 })).rejects.toThrow();
            await expect(manager.recover(operation2, { maxRetries: 0, initialBackoffMs: 10 })).rejects.toThrow();
            const stats = manager.getStats();
            expect(stats.errorsByCategory.get(errorRecovery_1.ErrorCategory.NETWORK)).toBe(1);
            expect(stats.errorsByCategory.get(errorRecovery_1.ErrorCategory.FILE_SYSTEM)).toBe(1);
        });
        it('should track errors by severity', async () => {
            const operation1 = jest.fn().mockRejectedValue(new Error('Network timeout')); // LOW
            const operation2 = jest.fn().mockRejectedValue(new Error('EACCES: permission denied')); // HIGH
            await expect(manager.recover(operation1, { maxRetries: 0, initialBackoffMs: 10 })).rejects.toThrow();
            await expect(manager.recover(operation2, { maxRetries: 0, initialBackoffMs: 10 })).rejects.toThrow();
            const stats = manager.getStats();
            expect(stats.errorsBySeverity.get(errorRecovery_1.ErrorSeverity.LOW)).toBe(1);
            expect(stats.errorsBySeverity.get(errorRecovery_1.ErrorSeverity.HIGH)).toBe(1);
        });
        it('should throw immediately on critical errors', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Out of memory'));
            await expect(manager.recover(operation, { maxRetries: 3, initialBackoffMs: 10 })).rejects.toThrow('Out of memory');
            // Should not retry critical errors
            expect(operation).toHaveBeenCalledTimes(1);
        });
    });
    describe('statistics', () => {
        it('should calculate average recovery time', async () => {
            const operation1 = jest.fn()
                .mockRejectedValueOnce(new Error('Network timeout'))
                .mockResolvedValueOnce('success');
            const operation2 = jest.fn()
                .mockRejectedValueOnce(new Error('Network timeout'))
                .mockResolvedValueOnce('success');
            await manager.recover(operation1, { maxRetries: 1, initialBackoffMs: 50 });
            await manager.recover(operation2, { maxRetries: 1, initialBackoffMs: 50 });
            const stats = manager.getStats();
            expect(stats.averageRecoveryTime).toBeGreaterThan(0);
            expect(stats.recoveredErrors).toBe(2);
        });
        it('should reset statistics', async () => {
            const operation = jest.fn().mockRejectedValue(new Error('Network timeout'));
            await expect(manager.recover(operation, { maxRetries: 0, initialBackoffMs: 10 })).rejects.toThrow();
            let stats = manager.getStats();
            expect(stats.totalErrors).toBeGreaterThan(0);
            manager.resetStats();
            stats = manager.getStats();
            expect(stats.totalErrors).toBe(0);
            expect(stats.recoveredErrors).toBe(0);
            expect(stats.failedRecoveries).toBe(0);
        });
    });
    describe('showReport', () => {
        it('should display recovery report', () => {
            // The output channel is created in the constructor, so we need to get a reference to it
            // by checking what was passed to createOutputChannel
            const mockOutputChannel = vscode.window.createOutputChannel.mock.results[0].value;
            manager.showReport();
            expect(mockOutputChannel.clear).toHaveBeenCalled();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('ERROR RECOVERY REPORT'));
            expect(mockOutputChannel.show).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=errorRecovery.test.js.map