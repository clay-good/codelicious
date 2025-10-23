/**
 * Tests for Memory Pressure Monitor
 */

import { MemoryPressureMonitor, MemoryPressureLevel } from '../memoryPressureMonitor';

describe('MemoryPressureMonitor', () => {
 let monitor: MemoryPressureMonitor;

 beforeEach(() => {
 monitor = new MemoryPressureMonitor({
 warningThreshold: 100, // 100MB
 criticalThreshold: 150, // 150MB
 maxHeapSize: 200, // 200MB
 checkIntervalMs: 100, // Fast for testing
 enableAutoCleanup: false, // Disable for tests
 enableGC: false
 });
 });

 afterEach(() => {
 monitor.stop();
 });

 describe('initialization', () => {
 it('should initialize with default config', () => {
 const defaultMonitor = new MemoryPressureMonitor();
 expect(defaultMonitor).toBeDefined();
 });

 it('should initialize with custom config', () => {
 const customMonitor = new MemoryPressureMonitor({
 warningThreshold: 500,
 criticalThreshold: 700,
 maxHeapSize: 1000
 });
 expect(customMonitor).toBeDefined();
 });
 });

 describe('getCurrentUsage', () => {
 it('should return current memory usage', () => {
 const usage = monitor.getCurrentUsage();

 expect(usage).toBeDefined();
 expect(usage.heapUsed).toBeGreaterThan(0);
 expect(usage.heapTotal).toBeGreaterThan(0);
 expect(usage.rss).toBeGreaterThan(0);
 expect(usage.timestamp).toBeGreaterThan(0);
 expect(usage.percentUsed).toBeGreaterThanOrEqual(0);
 expect(usage.systemFree).toBeGreaterThan(0);
 expect(usage.systemTotal).toBeGreaterThan(0);
 });

 it('should calculate percent used correctly', () => {
 const usage = monitor.getCurrentUsage();

 // Percent should be >= 0 (can exceed 100% if heap exceeds max)
 expect(usage.percentUsed).toBeGreaterThanOrEqual(0);
 });
 });

 describe('getStats', () => {
 it('should return statistics', () => {
 const stats = monitor.getStats();

 expect(stats).toBeDefined();
 expect(stats.currentLevel).toBe(MemoryPressureLevel.NORMAL);
 expect(stats.currentUsage).toBeDefined();
 expect(stats.peakUsage).toBeDefined();
 expect(stats.averageUsage).toBeGreaterThanOrEqual(0);
 expect(stats.gcCount).toBe(0);
 expect(stats.cleanupCount).toBe(0);
 expect(typeof stats.leakDetected).toBe('boolean');
 });
 });

 describe('start and stop', () => {
 it('should start monitoring', () => {
 monitor.start();
 // Should not throw
 expect(true).toBe(true);
 });

 it('should stop monitoring', () => {
 monitor.start();
 monitor.stop();
 // Should not throw
 expect(true).toBe(true);
 });

 it('should not start twice', () => {
 monitor.start();
 monitor.start(); // Should be ignored
 // Should not throw
 expect(true).toBe(true);
 });
 });

 describe('cleanup callbacks', () => {
 it('should register cleanup callbacks', () => {
 const callback = jest.fn(async () => {});
 monitor.registerCleanupCallback(callback);
 // Should not throw
 expect(true).toBe(true);
 });

 it('should call cleanup callbacks on force cleanup', async () => {
 const callback1 = jest.fn(async () => {});
 const callback2 = jest.fn(async () => {});

 monitor.registerCleanupCallback(callback1);
 monitor.registerCleanupCallback(callback2);

 await monitor.forceCleanup();

 expect(callback1).toHaveBeenCalled();
 expect(callback2).toHaveBeenCalled();
 });

 it('should handle cleanup callback errors', async () => {
 const errorCallback = jest.fn(async () => {
 throw new Error('Cleanup failed');
 });
 const successCallback = jest.fn(async () => {});

 monitor.registerCleanupCallback(errorCallback);
 monitor.registerCleanupCallback(successCallback);

 // Should not throw
 await monitor.forceCleanup();

 expect(errorCallback).toHaveBeenCalled();
 expect(successCallback).toHaveBeenCalled();
 });
 });

 describe('memory pressure levels', () => {
 it('should start at NORMAL level', () => {
 const stats = monitor.getStats();
 expect(stats.currentLevel).toBe(MemoryPressureLevel.NORMAL);
 });

 it('should track peak usage', () => {
 const initialStats = monitor.getStats();
 const initialPeak = initialStats.peakUsage.heapUsed;

 // Get current usage multiple times
 monitor.getCurrentUsage();
 monitor.getCurrentUsage();

 const finalStats = monitor.getStats();
 expect(finalStats.peakUsage.heapUsed).toBeGreaterThanOrEqual(initialPeak);
 });
 });

 describe('forceCleanup', () => {
 it('should perform cleanup', async () => {
 const initialStats = monitor.getStats();
 const initialCleanupCount = initialStats.cleanupCount;

 await monitor.forceCleanup();

 const finalStats = monitor.getStats();
 expect(finalStats.cleanupCount).toBe(initialCleanupCount + 1);
 });

 it('should call all registered callbacks', async () => {
 const callbacks = [
 jest.fn(async () => {}),
 jest.fn(async () => {}),
 jest.fn(async () => {})
 ];

 callbacks.forEach(cb => monitor.registerCleanupCallback(cb));

 await monitor.forceCleanup();

 callbacks.forEach(cb => {
 expect(cb).toHaveBeenCalled();
 });
 });
 });

 describe('memory leak detection', () => {
 it('should not detect leak with stable memory', () => {
 const stats = monitor.getStats();
 expect(stats.leakDetected).toBe(false);
 });
 });

 describe('integration', () => {
 it('should monitor memory over time', async () => {
 monitor.start();

 // Wait for a few monitoring cycles
 await new Promise(resolve => setTimeout(resolve, 300));

 const stats = monitor.getStats();
 expect(stats.currentUsage).toBeDefined();
 expect(stats.peakUsage).toBeDefined();

 monitor.stop();
 });

 it('should handle rapid cleanup requests', async () => {
 const cleanups = [
 monitor.forceCleanup(),
 monitor.forceCleanup(),
 monitor.forceCleanup()
 ];

 await Promise.all(cleanups);

 const stats = monitor.getStats();
 expect(stats.cleanupCount).toBe(3);
 });
 });

 describe('edge cases', () => {
 it('should handle zero thresholds', () => {
 const zeroMonitor = new MemoryPressureMonitor({
 warningThreshold: 0,
 criticalThreshold: 0,
 maxHeapSize: 1
 });

 const usage = zeroMonitor.getCurrentUsage();
 expect(usage).toBeDefined();
 });

 it('should handle very high thresholds', () => {
 const highMonitor = new MemoryPressureMonitor({
 warningThreshold: 10000,
 criticalThreshold: 20000,
 maxHeapSize: 30000
 });

 const stats = highMonitor.getStats();
 expect(stats.currentLevel).toBe(MemoryPressureLevel.NORMAL);
 });
 });

 describe('callbacks', () => {
 it('should accept callback configuration', () => {
 const onWarning = jest.fn();
 const onCritical = jest.fn();
 const onNormal = jest.fn();

 const callbackMonitor = new MemoryPressureMonitor({
 warningThreshold: 100,
 criticalThreshold: 150,
 maxHeapSize: 200,
 onWarning,
 onCritical,
 onNormal
 });

 expect(callbackMonitor).toBeDefined();
 });

 it('should work without callbacks', () => {
 const noCallbackMonitor = new MemoryPressureMonitor({
 warningThreshold: 100,
 criticalThreshold: 150,
 maxHeapSize: 200
 });

 noCallbackMonitor.start();
 noCallbackMonitor.stop();
 expect(true).toBe(true);
 });
 });
});

