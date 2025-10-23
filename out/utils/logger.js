"use strict";
/**
 * Centralized Logging System
 * Replaces console.log/error/warn with structured logging
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
exports.logger = exports.Logger = exports.LogLevel = void 0;
exports.createLogger = createLogger;
const vscode = __importStar(require("vscode"));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["NONE"] = 4] = "NONE";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor() {
        this.logLevel = LogLevel.INFO;
        this.logHistory = [];
        this.maxHistorySize = 1000;
        // Only create output channel if vscode.window is available (not in test environment)
        try {
            if (vscode.window && vscode.window.createOutputChannel) {
                this.outputChannel = vscode.window.createOutputChannel('Codelicious');
            }
        }
        catch (error) {
            // In test environment, output channel creation may fail - that's okay
            console.log('Logger: Running in test environment, output channel disabled');
        }
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    setLogLevel(level) {
        this.logLevel = level;
    }
    debug(category, message, data) {
        this.log(LogLevel.DEBUG, category, message, data);
    }
    info(category, message, data) {
        this.log(LogLevel.INFO, category, message, data);
    }
    warn(category, message, data) {
        this.log(LogLevel.WARN, category, message, data);
    }
    error(category, message, error) {
        const errorObj = error instanceof Error ? error : undefined;
        const data = error instanceof Error ? undefined : error;
        this.log(LogLevel.ERROR, category, message, data, errorObj);
    }
    log(level, category, message, data, error) {
        if (level < this.logLevel) {
            return;
        }
        const entry = {
            timestamp: new Date(),
            level,
            category,
            message,
            data,
            error
        };
        this.logHistory.push(entry);
        if (this.logHistory.length > this.maxHistorySize) {
            this.logHistory.shift();
        }
        const levelStr = LogLevel[level];
        const timestamp = entry.timestamp.toISOString();
        const prefix = `[${timestamp}] [${levelStr}] [${category}]`;
        let logMessage = `${prefix} ${message}`;
        if (data) {
            logMessage += `\n Data: ${JSON.stringify(data, null, 2)}`;
        }
        if (error) {
            logMessage += `\n Error: ${error.message}`;
            if (error.stack) {
                logMessage += `\n Stack: ${error.stack}`;
            }
        }
        // Only write to output channel if available
        if (this.outputChannel) {
            this.outputChannel.appendLine(logMessage);
        }
        else {
            // Fallback to console in test environment
            console.log(logMessage);
        }
        // Only show notifications if vscode.window is available
        try {
            if (level === LogLevel.ERROR && vscode.window && vscode.window.showErrorMessage) {
                vscode.window.showErrorMessage(`Codelicious: ${message}`);
            }
            else if (level === LogLevel.WARN && vscode.window && vscode.window.showWarningMessage) {
                vscode.window.showWarningMessage(`Codelicious: ${message}`);
            }
        }
        catch (error) {
            // Ignore errors in test environment
        }
    }
    show() {
        if (this.outputChannel) {
            this.outputChannel.show();
        }
    }
    clear() {
        if (this.outputChannel) {
            this.outputChannel.clear();
        }
        this.logHistory = [];
    }
    getHistory(category, level) {
        let filtered = this.logHistory;
        if (category) {
            filtered = filtered.filter(e => e.category === category);
        }
        if (level !== undefined) {
            filtered = filtered.filter(e => e.level === level);
        }
        return filtered;
    }
    exportLogs() {
        return this.logHistory.map(entry => {
            const levelStr = LogLevel[entry.level];
            const timestamp = entry.timestamp.toISOString();
            let line = `[${timestamp}] [${levelStr}] [${entry.category}] ${entry.message}`;
            if (entry.data) {
                line += `\n Data: ${JSON.stringify(entry.data)}`;
            }
            if (entry.error) {
                line += `\n Error: ${entry.error.message}`;
                if (entry.error.stack) {
                    line += `\n Stack: ${entry.error.stack}`;
                }
            }
            return line;
        }).join('\n\n');
    }
}
exports.Logger = Logger;
exports.logger = Logger.getInstance();
function createLogger(category) {
    return {
        debug: (message, data) => exports.logger.debug(category, message, data),
        info: (message, data) => exports.logger.info(category, message, data),
        warn: (message, data) => exports.logger.warn(category, message, data),
        error: (message, error) => exports.logger.error(category, message, error)
    };
}
//# sourceMappingURL=logger.js.map