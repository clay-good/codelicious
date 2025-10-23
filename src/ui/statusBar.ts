/**
 * Manages the status bar indicator for Codelicious
 */

import * as vscode from 'vscode';

export class StatusBarManager {
 private statusBarItem: vscode.StatusBarItem;

 constructor() {
 this.statusBarItem = vscode.window.createStatusBarItem(
 vscode.StatusBarAlignment.Right,
 100
 );
 this.statusBarItem.command = 'codelicious.showIndexStatus';
 }

 /**
 * Show a message in the status bar
 */
 show(text: string, icon?: string): void {
 const iconText = icon ? `$(${icon}) ` : '';
 this.statusBarItem.text = `${iconText}${text}`;
 this.statusBarItem.show();
 }

 /**
 * Hide the status bar item
 */
 hide(): void {
 this.statusBarItem.hide();
 }

 /**
 * Update the tooltip
 */
 setTooltip(tooltip: string): void {
 this.statusBarItem.tooltip = tooltip;
 }

 /**
 * Clean up resources
 */
 dispose(): void {
 this.statusBarItem.dispose();
 }
}

