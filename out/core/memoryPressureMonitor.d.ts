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
export interface MemoryPressureConfig {
    warningThreshold: number;
    criticalThreshold: number;
    maxHeapSize: number;
    checkIntervalMs: number;
    enableAutoCleanup: boolean;
    enableGC: boolean;
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
export declare enum MemoryPressureLevel {
    NORMAL = "normal",
    WARNING = "warning",
    CRITICAL = "critical"
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
export declare class MemoryPressureMonitor {
    private config;
    private monitoringInterval?;
    private isMonitoring;
    private currentLevel;
    private usageHistory;
    private peakUsage?;
    private gcCount;
    private cleanupCount;
    private cleanupCallbacks;
    private outputChannel?;
    constructor(config?: Partial<MemoryPressureConfig>);
    /**
    * Start monitoring memory usage
    */
    start(): void;
    /**
    * Stop monitoring
    */
    stop(): void;
    /**
    * Register cleanup callback
    */
    registerCleanupCallback(callback: () => Promise<void>): void;
    /**
    * Get current memory usage
    */
    getCurrentUsage(): MemoryUsage;
    /**
    * Get memory statistics
    */
    getStats(): MemoryStats;
    /**
    * Force cleanup
    */
    forceCleanup(): Promise<void>;
    /**
    * Check memory pressure and take action
    */
    private checkMemoryPressure;
    /**
    * Handle pressure level change
    */
    private handleLevelChange;
    /**
    * Perform cleanup
    */
    private performCleanup;
    /**
    * Detect potential memory leak
    */
    private detectMemoryLeak;
}
//# sourceMappingURL=memoryPressureMonitor.d.ts.map