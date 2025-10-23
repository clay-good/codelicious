/**
 * Centralized Logging System
 * Replaces console.log/error/warn with structured logging
 */

import * as vscode from 'vscode';

export enum LogLevel {
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

export class Logger {
 private static instance: Logger;
 private outputChannel?: vscode.OutputChannel;
 private logLevel: LogLevel = LogLevel.INFO;
 private logHistory: LogEntry[] = [];
 private maxHistorySize = 1000;

 private constructor() {
 // Only create output channel if vscode.window is available (not in test environment)
 try {
 if (vscode.window && vscode.window.createOutputChannel) {
 this.outputChannel = vscode.window.createOutputChannel('Codelicious');
 }
 } catch (error) {
 // In test environment, output channel creation may fail - that's okay
 console.log('Logger: Running in test environment, output channel disabled');
 }
 }

 static getInstance(): Logger {
 if (!Logger.instance) {
 Logger.instance = new Logger();
 }
 return Logger.instance;
 }

 setLogLevel(level: LogLevel): void {
 this.logLevel = level;
 }

 debug(category: string, message: string, data?: unknown): void {
 this.log(LogLevel.DEBUG, category, message, data);
 }

 info(category: string, message: string, data?: unknown): void {
 this.log(LogLevel.INFO, category, message, data);
 }

 warn(category: string, message: string, data?: unknown): void {
 this.log(LogLevel.WARN, category, message, data);
 }

 error(category: string, message: string, error?: Error | unknown): void {
 const errorObj = error instanceof Error ? error : undefined;
 const data = error instanceof Error ? undefined : error;
 this.log(LogLevel.ERROR, category, message, data, errorObj);
 }

 private log(level: LogLevel, category: string, message: string, data?: unknown, error?: Error): void {
 if (level < this.logLevel) {
 return;
 }

 const entry: LogEntry = {
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
 } else {
 // Fallback to console in test environment
 console.log(logMessage);
 }

 // Only show notifications if vscode.window is available
 try {
 if (level === LogLevel.ERROR && vscode.window && vscode.window.showErrorMessage) {
 vscode.window.showErrorMessage(`Codelicious: ${message}`);
 } else if (level === LogLevel.WARN && vscode.window && vscode.window.showWarningMessage) {
 vscode.window.showWarningMessage(`Codelicious: ${message}`);
 }
 } catch (error) {
 // Ignore errors in test environment
 }
 }

 show(): void {
 if (this.outputChannel) {
 this.outputChannel.show();
 }
 }

 clear(): void {
 if (this.outputChannel) {
 this.outputChannel.clear();
 }
 this.logHistory = [];
 }

 getHistory(category?: string, level?: LogLevel): LogEntry[] {
 let filtered = this.logHistory;

 if (category) {
 filtered = filtered.filter(e => e.category === category);
 }

 if (level !== undefined) {
 filtered = filtered.filter(e => e.level === level);
 }

 return filtered;
 }

 exportLogs(): string {
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

export const logger = Logger.getInstance();

export function createLogger(category: string) {
 return {
 debug: (message: string, data?: unknown) => logger.debug(category, message, data),
 info: (message: string, data?: unknown) => logger.info(category, message, data),
 warn: (message: string, data?: unknown) => logger.warn(category, message, data),
 error: (message: string, error?: Error | unknown) => logger.error(category, message, error)
 };
}

