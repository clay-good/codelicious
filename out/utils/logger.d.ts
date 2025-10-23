/**
 * Centralized Logging System
 * Replaces console.log/error/warn with structured logging
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    NONE = 4
}
export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    category: string;
    message: string;
    data?: unknown;
    error?: Error;
}
export declare class Logger {
    private static instance;
    private outputChannel?;
    private logLevel;
    private logHistory;
    private maxHistorySize;
    private constructor();
    static getInstance(): Logger;
    setLogLevel(level: LogLevel): void;
    debug(category: string, message: string, data?: unknown): void;
    info(category: string, message: string, data?: unknown): void;
    warn(category: string, message: string, data?: unknown): void;
    error(category: string, message: string, error?: Error | unknown): void;
    private log;
    show(): void;
    clear(): void;
    getHistory(category?: string, level?: LogLevel): LogEntry[];
    exportLogs(): string;
}
export declare const logger: Logger;
export declare function createLogger(category: string): {
    debug: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, error?: Error | unknown) => void;
};
//# sourceMappingURL=logger.d.ts.map