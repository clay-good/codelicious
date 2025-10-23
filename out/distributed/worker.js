"use strict";
/**
 * Worker Thread Script - Executes tasks in separate thread
 *
 * This script runs in a worker thread and processes tasks sent from the main thread.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const worker_threads_1 = require("worker_threads");
const logger_1 = require("../utils/logger");
const logger = (0, logger_1.createLogger)('Worker');
const workerId = worker_threads_1.workerData.workerId;
const memoryLimit = worker_threads_1.workerData.memoryLimit;
logger.info(`Worker ${workerId} started`);
// Task handlers
const taskHandlers = new Map();
/**
 * Register task handler
 */
function registerHandler(type, handler) {
    taskHandlers.set(type, handler);
}
/**
 * Process file task
 */
registerHandler('process-file', async (data) => {
    // Simulate file processing
    const lines = data.content.split('\n').length;
    const size = Buffer.byteLength(data.content, 'utf8');
    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    return {
        filePath: data.filePath,
        lines,
        size,
        processed: true
    };
});
/**
 * Generate embedding task
 */
registerHandler('generate-embedding', async (data) => {
    // Simulate embedding generation
    await new Promise(resolve => setTimeout(resolve, Math.random() * 200));
    // Generate fake embedding (in real implementation, use actual embedding model)
    const embedding = Array.from({ length: 384 }, () => Math.random());
    return { embedding };
});
/**
 * Analyze code task
 */
registerHandler('analyze-code', async (data) => {
    // Simulate code analysis
    await new Promise(resolve => setTimeout(resolve, Math.random() * 150));
    const lines = data.code.split('\n').length;
    const functions = (data.code.match(/function\s+\w+/g) || []).length;
    const classes = (data.code.match(/class\s+\w+/g) || []).length;
    return {
        lines,
        functions,
        classes,
        complexity: Math.floor(Math.random() * 10) + 1
    };
});
/**
 * Index file task
 */
registerHandler('index-file', async (data) => {
    // Simulate indexing
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    const words = data.content.split(/\s+/).length;
    const symbols = (data.content.match(/\b[A-Z][a-zA-Z0-9]*\b/g) || []).length;
    return {
        filePath: data.filePath,
        words,
        symbols,
        indexed: true
    };
});
// Listen for messages from main thread
if (worker_threads_1.parentPort) {
    worker_threads_1.parentPort.on('message', async (message) => {
        if (message.type === 'task') {
            try {
                const handler = taskHandlers.get(message.taskType);
                if (!handler) {
                    throw new Error(`Unknown task type: ${message.taskType}`);
                }
                const result = await handler(message.data);
                worker_threads_1.parentPort.postMessage({
                    type: 'task-complete',
                    taskId: message.taskId,
                    result
                });
            }
            catch (error) {
                worker_threads_1.parentPort.postMessage({
                    type: 'task-error',
                    taskId: message.taskId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        else if (message.type === 'health-check') {
            const memUsage = process.memoryUsage();
            const memoryUsageMB = memUsage.heapUsed / 1024 / 1024;
            worker_threads_1.parentPort.postMessage({
                type: 'health',
                memoryUsage: memoryUsageMB,
                cpuUsage: 0, // Would need actual CPU monitoring
                healthy: memoryUsageMB < memoryLimit
            });
        }
    });
}
//# sourceMappingURL=worker.js.map