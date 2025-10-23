/**
 * Chat View HTML Template
 * Extracted from chatViewProvider.ts for better maintainability
 */

import * as vscode from 'vscode';

export function getChatViewHtml(webview: vscode.Webview): string {
 return `<!DOCTYPE html>
<html lang="en">
<head>
 <meta charset="UTF-8">
 <meta name="viewport" content="width=device-width, initial-scale=1.0">
 <title>Codelicious Chat</title>
 <style>
 body {
 padding: 0;
 margin: 0;
 font-family: var(--vscode-font-family);
 color: var(--vscode-foreground);
 background-color: var(--vscode-editor-background);
 display: flex;
 flex-direction: column;
 height: 100vh;
 }

 #chat-container {
 flex: 1;
 overflow-y: auto;
 padding: 16px;
 display: flex;
 flex-direction: column;
 gap: 12px;
 }

 .message {
 padding: 12px;
 border-radius: 8px;
 max-width: 85%;
 word-wrap: break-word;
 }

 .message.user {
 background-color: var(--vscode-input-background);
 align-self: flex-end;
 border: 1px solid var(--vscode-input-border);
 }

 .message.assistant {
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 align-self: flex-start;
 }

 .message.error {
 background-color: var(--vscode-inputValidation-errorBackground);
 border: 1px solid var(--vscode-inputValidation-errorBorder);
 align-self: flex-start;
 }

 #input-container {
 padding: 16px;
 border-top: 1px solid var(--vscode-panel-border);
 }

 #attachments-container {
 display: none;
 padding: 8px;
 background-color: var(--vscode-editor-background);
 border-radius: 4px;
 margin-bottom: 8px;
 max-height: 150px;
 overflow-y: auto;
 }

 #attachments-container.has-attachments {
 display: block;
 }

 .attachment-item {
 display: flex;
 align-items: center;
 justify-content: space-between;
 padding: 4px 8px;
 margin: 2px 0;
 background-color: var(--vscode-input-background);
 border-radius: 3px;
 font-size: 12px;
 }

 .attachment-name {
 flex: 1;
 overflow: hidden;
 text-overflow: ellipsis;
 white-space: nowrap;
 }

 .attachment-remove {
 margin-left: 8px;
 cursor: pointer;
 color: var(--vscode-errorForeground);
 font-weight: bold;
 }

 .attachment-remove:hover {
 opacity: 0.7;
 }

 #attachment-controls {
 display: flex;
 gap: 8px;
 margin-bottom: 8px;
 }

 #input-wrapper {
 display: flex;
 gap: 8px;
 }

 #message-input {
 flex: 1;
 padding: 8px;
 border: 1px solid var(--vscode-input-border);
 background-color: var(--vscode-input-background);
 color: var(--vscode-input-foreground);
 border-radius: 4px;
 font-family: var(--vscode-font-family);
 resize: vertical;
 min-height: 60px;
 }

 button {
 padding: 8px 16px;
 background-color: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 border: none;
 border-radius: 4px;
 cursor: pointer;
 font-family: var(--vscode-font-family);
 }

 button:hover {
 background-color: var(--vscode-button-hoverBackground);
 }

 button:disabled {
 opacity: 0.5;
 cursor: not-allowed;
 }

 button.secondary {
 background-color: var(--vscode-button-secondaryBackground);
 color: var(--vscode-button-secondaryForeground);
 }

 button.secondary:hover {
 background-color: var(--vscode-button-secondaryHoverBackground);
 }

 .small-button {
 padding: 4px 8px;
 font-size: 12px;
 }

 #model-info {
 padding: 8px;
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 4px;
 margin-bottom: 8px;
 font-size: 12px;
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 #model-name {
 font-weight: bold;
 }

 #model-actions {
 display: flex;
 gap: 8px;
 }

 pre {
 background-color: var(--vscode-textCodeBlock-background);
 padding: 12px;
 border-radius: 4px;
 overflow-x: auto;
 margin: 8px 0;
 }

 code {
 font-family: var(--vscode-editor-font-family);
 font-size: var(--vscode-editor-font-size);
 }

 .code-block-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 background-color: var(--vscode-editorGroupHeader-tabsBackground);
 padding: 4px 8px;
 border-radius: 4px 4px 0 0;
 font-size: 12px;
 }

 .code-block-actions {
 display: flex;
 gap: 4px;
 }

 .code-block-wrapper {
 margin: 8px 0;
 }

 .code-block-wrapper pre {
 margin: 0;
 border-radius: 0 0 4px 4px;
 }

 .loading {
 display: inline-block;
 width: 12px;
 height: 12px;
 border: 2px solid var(--vscode-foreground);
 border-radius: 50%;
 border-top-color: transparent;
 animation: spin 1s linear infinite;
 }

 @keyframes spin {
 to { transform: rotate(360deg); }
 }

 .message-content {
 line-height: 1.6;
 }

 .message-content p {
 margin: 8px 0;
 }

 .message-content ul, .message-content ol {
 margin: 8px 0;
 padding-left: 24px;
 }

 .message-content li {
 margin: 4px 0;
 }

 .message-content h1, .message-content h2, .message-content h3 {
 margin: 16px 0 8px 0;
 }

 .message-content blockquote {
 border-left: 3px solid var(--vscode-textBlockQuote-border);
 padding-left: 12px;
 margin: 8px 0;
 color: var(--vscode-textBlockQuote-foreground);
 }

 #autonomous-panel {
 display: none;
 padding: 12px;
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 4px;
 margin-bottom: 8px;
 }

 #autonomous-panel.active {
 display: block;
 }

 #autonomous-actions {
 display: flex;
 gap: 8px;
 margin-top: 8px;
 }

 #builder-panel {
 display: none;
 padding: 12px;
 background-color: var(--vscode-editor-inactiveSelectionBackground);
 border-radius: 4px;
 margin-bottom: 8px;
 }

 #builder-panel.active {
 display: block;
 }

 #builder-form {
 display: flex;
 flex-direction: column;
 gap: 8px;
 }

 #builder-form input {
 padding: 8px;
 border: 1px solid var(--vscode-input-border);
 background-color: var(--vscode-input-background);
 color: var(--vscode-input-foreground);
 border-radius: 4px;
 font-family: var(--vscode-font-family);
 }

 #builder-form textarea {
 padding: 8px;
 border: 1px solid var(--vscode-input-border);
 background-color: var(--vscode-input-background);
 color: var(--vscode-input-foreground);
 border-radius: 4px;
 font-family: var(--vscode-font-family);
 min-height: 100px;
 resize: vertical;
 }

 #builder-actions {
 display: flex;
 gap: 8px;
 }
 </style>
</head>
<body>
 <div id="chat-container"></div>
 <div id="input-container">
 <div id="model-info">
 <span id="model-name">Loading...</span>
 <div id="model-actions">
 <button class="small-button secondary" onclick="selectModel()">Change Model</button>
 <button class="small-button secondary" onclick="compareModels()">Compare</button>
 </div>
 </div>
 <div id="attachments-container">
 <div id="attachment-list"></div>
 </div>
 <div id="attachment-controls">
 <button class="small-button secondary" onclick="attachFiles()">Attach Files</button>
 <button class="small-button secondary" onclick="attachCurrentFile()">Attach Current</button>
 <button class="small-button secondary" onclick="clearAttachments()">Clear All</button>
 </div>
 <div id="autonomous-panel">
 <div>Autonomous operations detected in AI response</div>
 <div id="autonomous-actions">
 <button onclick="executeAutonomous()">Execute</button>
 <button class="secondary" onclick="hideAutonomousPanel()">Cancel</button>
 </div>
 </div>
 <div id="builder-panel">
 <div id="builder-form">
 <input type="text" id="project-name" placeholder="Project name (e.g., todo-app)" />
 <textarea id="specification" placeholder="Describe what you want to build..."></textarea>
 <div id="builder-actions">
 <button onclick="startAutonomousBuild()">Start Building</button>
 <button class="secondary" onclick="hideBuilderPanel()">Cancel</button>
 </div>
 </div>
 </div>
 <div id="input-wrapper">
 <textarea id="message-input" placeholder="Ask me anything about your code..."></textarea>
 <div style="display: flex; flex-direction: column; gap: 8px;">
 <button onclick="sendMessage()">Send</button>
 <button class="secondary" onclick="clearChat()">Clear</button>
 </div>
 </div>
 </div>

 <script>
 const vscode = acquireVsCodeApi();
 let attachedFiles = [];
 let currentBuilderMode = null;

 function sendMessage() {
 const input = document.getElementById('message-input');
 const message = input.value.trim();
 if (message) {
 vscode.postMessage({ type: 'sendMessage', message });
 addMessage(message, 'user');
 input.value = '';
 }
 }

 function clearChat() {
 vscode.postMessage({ type: 'clearChat' });
 document.getElementById('chat-container').innerHTML = '';
 }

 function selectModel() {
 vscode.postMessage({ type: 'selectModel' });
 }

 function compareModels() {
 vscode.postMessage({ type: 'compareModels' });
 }

 function attachFiles() {
 vscode.postMessage({ type: 'attachFiles' });
 }

 function attachCurrentFile() {
 vscode.postMessage({ type: 'attachCurrentFile' });
 }

 function removeAttachment(filePath) {
 vscode.postMessage({ type: 'removeAttachment', filePath });
 }

 function clearAttachments() {
 vscode.postMessage({ type: 'clearAttachments' });
 attachedFiles = [];
 updateAttachmentsUI();
 }

 function executeAutonomous() {
 vscode.postMessage({ type: 'executeAutonomous' });
 hideAutonomousPanel();
 }

 function hideAutonomousPanel() {
 document.getElementById('autonomous-panel').classList.remove('active');
 }

 function showBuilderPanel(intent) {
 currentBuilderMode = intent;
 const panel = document.getElementById('builder-panel');
 panel.classList.add('active');

 if (intent && intent.projectName) {
 document.getElementById('project-name').value = intent.projectName;
 }
 if (intent && intent.specification) {
 document.getElementById('specification').value = intent.specification;
 }
 }

 function hideBuilderPanel() {
 document.getElementById('builder-panel').classList.remove('active');
 currentBuilderMode = null;
 }

 function startAutonomousBuild() {
 const projectName = document.getElementById('project-name').value.trim();
 const specification = document.getElementById('specification').value.trim();

 if (!projectName || !specification) {
 alert('Please provide both project name and specification');
 return;
 }

 vscode.postMessage({
 type: 'startAutonomousBuild',
 projectName,
 specification
 });
 hideBuilderPanel();
 }

 function cancelAutonomousBuild() {
 vscode.postMessage({ type: 'cancelAutonomousBuild' });
 }

 function addMessage(content, role) {
 const container = document.getElementById('chat-container');
 const messageDiv = document.createElement('div');
 messageDiv.className = 'message ' + role;

 const contentDiv = document.createElement('div');
 contentDiv.className = 'message-content';
 contentDiv.innerHTML = formatMessage(content);

 messageDiv.appendChild(contentDiv);
 container.appendChild(messageDiv);
 container.scrollTop = container.scrollHeight;
 }

 function formatMessage(content) {
 content = content.replace(/\\\`\\\`\\\`(\\w+)?\\n([\\s\\S]*?)\\\`\\\`\\\`/g, function(match, lang, code) {
 const language = lang || 'text';
 const escapedCode = escapeHtml(code);
 return '<div class="code-block-wrapper">' +
 '<div class="code-block-header">' +
 '<span>' + language + '</span>' +
 '<div class="code-block-actions">' +
 '<button class="small-button" onclick="applyCode(\`' + escapedCode + '\`, \'' + language + '\')">Apply</button>' +
 '<button class="small-button secondary" onclick="explainCode(\`' + escapedCode + '\`, \'' + language + '\')">Explain</button>' +
 '<button class="small-button secondary" onclick="runCode(\`' + escapedCode + '\`, \'' + language + '\')">Run</button>' +
 '</div>' +
 '</div>' +
 '<pre><code>' + escapedCode + '</code></pre>' +
 '</div>';
 });

 content = content.replace(/\\\`([^\\\`]+)\\\`/g, '<code>$1</code>');
 content = content.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong>$1</strong>');
 content = content.replace(/\\*([^\\*]+)\\*/g, '<em>$1</em>');
 content = content.replace(/\\n/g, '<br>');

 return content;
 }

 function escapeHtml(text) {
 const div = document.createElement('div');
 div.textContent = text;
 return div.innerHTML;
 }

 function applyCode(code, language) {
 vscode.postMessage({ type: 'applyCode', code, language });
 }

 function explainCode(code, language) {
 vscode.postMessage({ type: 'explainCode', code, language });
 }

 function runCode(code, language) {
 vscode.postMessage({ type: 'runCode', code, language });
 }

 function updateAttachmentsUI() {
 const container = document.getElementById('attachments-container');
 const list = document.getElementById('attachment-list');

 if (attachedFiles.length === 0) {
 container.classList.remove('has-attachments');
 list.innerHTML = '';
 return;
 }

 container.classList.add('has-attachments');
 list.innerHTML = attachedFiles.map(function(file) {
 return '<div class="attachment-item">' +
 '<span class="attachment-name" title="' + file + '">' + file + '</span>' +
 '<span class="attachment-remove" onclick="removeAttachment(\'' + file + '\')">×</span>' +
 '</div>';
 }).join('');
 }

 window.addEventListener('message', event => {
 const message = event.data;

 switch (message.type) {
 case 'addMessage':
 addMessage(message.content, message.role);
 break;
 case 'updateModel':
 document.getElementById('model-name').textContent = message.model;
 break;
 case 'showAutonomousPanel':
 document.getElementById('autonomous-panel').classList.add('active');
 break;
 case 'showBuilderPanel':
 showBuilderPanel(message.intent);
 break;
 case 'updateAttachments':
 attachedFiles = message.files;
 updateAttachmentsUI();
 break;
 case 'error':
 addMessage(message.content, 'error');
 break;
 }
 });

 document.getElementById('message-input').addEventListener('keydown', (e) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 sendMessage();
 }
 });
 </script>
</body>
</html>
`;
}
