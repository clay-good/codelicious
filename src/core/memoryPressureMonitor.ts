/**
 * Memory Pressure Monitor
 * Monitors memory usage and triggers cleanup when thresholds are exceeded
 *
 * Features:
 * - Real-time memory monitoring
 * - Automatic cache eviction under pressure
 * - Garbage collection triggering
 * - Memory leak detection
 * - Performance metrics
 */

import * as os from 'os';
import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const logger = createLogger('MemoryPressureMonitor');

export interface MemoryPressureConfig {
 // Thresholds (in MB)
 warningThreshold: number;
 criticalThreshold: number;
 maxHeapSize: number;

 // Monitoring
 checkIntervalMs: number;
 enableAutoCleanup: boolean;
 enableGC: boolean;

 // Callbacks
 onWarning?: (usage: MemoryUsage) => void;
 onCritical?: (usage: MemoryUsage) => void;
 onNormal?: (usage: MemoryUsage) => void;
}

export interface MemoryUsage {
 heapUsed: number;
 heapTotal: number;
 external: number;
 rss: number;
 arrayBuffers: number;
 timestamp: number;
 percentUsed: number;
 systemFree: number;
 systemTotal: number;
}

export enum MemoryPressureLevel {
 NORMAL = 'normal',
 WARNING = 'warning',
 CRITICAL = 'critical'
}

export interface MemoryStats {
 currentLevel: MemoryPressureLevel;
 currentUsage: MemoryUsage;
 peakUsage: MemoryUsage;
 averageUsage: number;
 gcCount: number;
 cleanupCount: number;
 leakDetected: boolean;
}

/**
 * Memory Pressure Monitor
 */
export class MemoryPressureMonitor {
 private config: MemoryPressureConfig;
 private monitoringInterval?: NodeJS.Timeout;
 private isMonitoring = false;
 private currentLevel: MemoryPressureLevel = MemoryPressureLevel.NORMAL;
 private usageHistory: MemoryUsage[] = [];
 private peakUsage?: MemoryUsage;
 private gcCount = 0;
 private cleanupCount = 0;
 private cleanupCallbacks: Array<() => Promise<void>> = [];
 private outputChannel?: vscode.OutputChannel;

 constructor(config: Partial<MemoryPressureConfig> = {}) {
 const totalSystemMemory = os.totalmem() / 1024 / 1024; // MB
 const recommendedMax = Math.min(totalSystemMemory * 0.25, 1024); // 25% of system or 1GB

 this.config = {
 warningThreshold: config.warningThreshold || recommendedMax * 0.7,
 criticalThreshold: config.criticalThreshold || recommendedMax * 0.9,
 maxHeapSize: config.maxHeapSize || recommendedMax,
 checkIntervalMs: config.checkIntervalMs || 5000, // Check every 5 seconds
 enableAutoCleanup: config.enableAutoCleanup ?? true,
 enableGC: config.enableGC ?? true,
 onWarning: config.onWarning,
 onCritical: config.onCritical,
 onNormal: config.onNormal
 };

 logger.info('MemoryPressureMonitor initialized:', {
 warning: `${this.config.warningThreshold.toFixed(0)}MB`,
 critical: `${this.config.criticalThreshold.toFixed(0)}MB`,
 max: `${this.config.maxHeapSize.toFixed(0)}MB`
 });
 }

 /**
 * Start monitoring memory usage
 */
 start(): void {
 if (this.isMonitoring) {
 return;
 }

 this.isMonitoring = true;
 this.monitoringInterval = setInterval(() => {
 this.checkMemoryPressure();
 }, this.config.checkIntervalMs);

 logger.info('Memory pressure monitoring started');
 }

 /**
 * Stop monitoring
 */
 stop(): void {
 if (this.monitoringInterval) {
 clearInterval(this.monitoringInterval);
 this.monitoringInterval = undefined;
 }
 this.isMonitoring = false;
 logger.info('Memory pressure monitoring stopped');
 }

 /**
 * Register cleanup callback
 */
 registerCleanupCallback(callback: () => Promise<void>): void {
 this.cleanupCallbacks.push(callback);
 }

 /**
 * Get current memory usage
 */
 getCurrentUsage(): MemoryUsage {
 const mem = process.memoryUsage();
 const systemFree = os.freemem() / 1024 / 1024;
 const systemTotal = os.totalmem() / 1024 / 1024;
 const heapUsedMB = mem.heapUsed / 1024 / 1024;
 const heapTotalMB = mem.heapTotal / 1024 / 1024;

 return {
 heapUsed: heapUsedMB,
 heapTotal: heapTotalMB,
 external: mem.external / 1024 / 1024,
 rss: mem.rss / 1024 / 1024,
 arrayBuffers: mem.arrayBuffers / 1024 / 1024,
 timestamp: Date.now(),
 percentUsed: (heapUsedMB / this.config.maxHeapSize) * 100,
 systemFree,
 systemTotal
 };
 }

 /**
 * Get memory statistics
 */
 getStats(): MemoryStats {
 const avgUsage = this.usageHistory.length > 0
 ? this.usageHistory.reduce((sum, u) => sum + u.heapUsed, 0) / this.usageHistory.length
 : 0;

 return {
 currentLevel: this.currentLevel,
 currentUsage: this.getCurrentUsage(),
 peakUsage: this.peakUsage || this.getCurrentUsage(),
 averageUsage: avgUsage,
 gcCount: this.gcCount,
 cleanupCount: this.cleanupCount,
 leakDetected: this.detectMemoryLeak()
 };
 }

 /**
 * Force cleanup
 */
 async forceCleanup(): Promise<void> {
 logger.info('Forcing memory cleanup...');
 await this.performCleanup();
 }

 /**
 * Check memory pressure and take action
 */
 private checkMemoryPressure(): void {
 const usage = this.getCurrentUsage();

 // Update history (keep last 100 samples)
 this.usageHistory.push(usage);
 if (this.usageHistory.length > 100) {
 this.usageHistory.shift();
 }

 // Update peak usage
 if (!this.peakUsage || usage.heapUsed > this.peakUsage.heapUsed) {
 this.peakUsage = usage;
 }

 // Determine pressure level
 const previousLevel = this.currentLevel;

 if (usage.heapUsed >= this.config.criticalThreshold) {
 this.currentLevel = MemoryPressureLevel.CRITICAL;
 } else if (usage.heapUsed >= this.config.warningThreshold) {
 this.currentLevel = MemoryPressureLevel.WARNING;
 } else {
 this.currentLevel = MemoryPressureLevel.NORMAL;
 }

 // Take action on level change
 if (this.currentLevel !== previousLevel) {
 this.handleLevelChange(previousLevel, this.currentLevel, usage);
 }

 // Auto cleanup if enabled and under pressure
 if (this.config.enableAutoCleanup && this.currentLevel !== MemoryPressureLevel.NORMAL) {
 this.performCleanup().catch(error => {
 logger.error('Cleanup failed', error);
 });
 }
 }

 /**
 * Handle pressure level change
 */
 private handleLevelChange(
 previousLevel: MemoryPressureLevel,
 newLevel: MemoryPressureLevel,
 usage: MemoryUsage
 ): void {
 logger.info(`Memory pressure: ${previousLevel} → ${newLevel} (${usage.heapUsed.toFixed(0)}MB / ${this.config.maxHeapSize.toFixed(0)}MB)`);

 switch (newLevel) {
 case MemoryPressureLevel.CRITICAL:
 if (this.config.onCritical) {
 this.config.onCritical(usage);
 }
 vscode.window.showWarningMessage(
 `High memory usage: ${usage.heapUsed.toFixed(0)}MB. Cleaning up...`
 );
 break;

 case MemoryPressureLevel.WARNING:
 if (this.config.onWarning) {
 this.config.onWarning(usage);
 }
 break;

 case MemoryPressureLevel.NORMAL:
 if (this.config.onNormal) {
 this.config.onNormal(usage);
 }
 break;
 }
 }

 /**
 * Perform cleanup
 */
 private async performCleanup(): Promise<void> {
 const startUsage = this.getCurrentUsage();
 logger.info(`Starting cleanup (current: ${startUsage.heapUsed.toFixed(0)}MB)...`);

 // Call all registered cleanup callbacks
 for (const callback of this.cleanupCallbacks) {
 try {
 await callback();
 } catch (error) {
 logger.error('Cleanup callback failed', error);
 }
 }

 // Force garbage collection if available
 if (this.config.enableGC && global.gc) {
 global.gc();
 this.gcCount++;
 }

 this.cleanupCount++;

 // Wait a bit for GC to complete
 await new Promise(resolve => setTimeout(resolve, 100));

 const endUsage = this.getCurrentUsage();
 const freed = startUsage.heapUsed - endUsage.heapUsed;

 logger.info(`Cleanup complete: freed ${freed.toFixed(0)}MB (${endUsage.heapUsed.toFixed(0)}MB remaining)`);
 }

 /**
 * Detect potential memory leak
 */
 private detectMemoryLeak(): boolean {
 if (this.usageHistory.length < 20) {
 return false;
 }

 // Check if memory is consistently increasing
 const recent = this.usageHistory.slice(-20);
 let increasingCount = 0;

 for (let i = 1; i < recent.length; i++) {
 if (recent[i].heapUsed > recent[i - 1].heapUsed) {
 increasingCount++;
 }
 }

 // If memory increased in 80%+ of samples, potential leak
 return increasingCount / recent.length > 0.8;
 }
}

