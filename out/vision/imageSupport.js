"use strict";
/**
 * Image Support for Vision Models
 *
 * Enables image attachments and vision model support for:
 * - Screenshot analysis
 * - UI/UX review
 * - Diagram understanding
 * - Error screenshot debugging
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
exports.VisionModelAdapter = exports.ImageSupportManager = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ImageSupportManager {
    constructor() {
        this.attachments = new Map();
        this.supportedFormats = new Set([
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/gif',
            'image/webp'
        ]);
    }
    /**
    * Add image attachment
    */
    async addImage(imagePath) {
        // Read image file
        const buffer = await fs.promises.readFile(imagePath);
        const base64Data = buffer.toString('base64');
        const mimeType = this.getMimeType(imagePath);
        if (!this.supportedFormats.has(mimeType)) {
            throw new Error(`Unsupported image format: ${mimeType}`);
        }
        const attachment = {
            id: this.generateId(),
            path: imagePath,
            mimeType,
            base64Data,
            metadata: {
                size: buffer.length,
                timestamp: Date.now()
            }
        };
        this.attachments.set(attachment.id, attachment);
        return attachment;
    }
    /**
    * Remove image attachment
    */
    removeImage(id) {
        this.attachments.delete(id);
    }
    /**
    * Get all attachments
    */
    getAttachments() {
        return Array.from(this.attachments.values());
    }
    /**
    * Clear all attachments
    */
    clearAttachments() {
        this.attachments.clear();
    }
    /**
    * Analyze image with vision model
    */
    async analyzeImage(imagePath, prompt, model = 'gpt-4-vision-preview') {
        const attachment = await this.addImage(imagePath);
        const request = {
            prompt,
            images: [attachment],
            model,
            maxTokens: 1000
        };
        // This would call the actual vision model API
        // For now, return a mock response
        return {
            content: `Analysis of image: ${path.basename(imagePath)}\n\n${prompt}`,
            model,
            usage: {
                promptTokens: 100,
                completionTokens: 200,
                totalTokens: 300
            }
        };
    }
    /**
    * Take screenshot and analyze
    */
    async analyzeScreenshot(prompt) {
        // This would integrate with VS Code screenshot API
        // For now, show a file picker
        const uri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp']
            },
            title: 'Select Screenshot'
        });
        if (!uri || uri.length === 0) {
            throw new Error('No screenshot selected');
        }
        return this.analyzeImage(uri[0].fsPath, prompt);
    }
    /**
    * Get MIME type from file extension
    */
    getMimeType(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
    /**
    * Generate unique ID
    */
    generateId() {
        return `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}
exports.ImageSupportManager = ImageSupportManager;
/**
 * Vision Model Adapter
 *
 * Adapts different vision model APIs (OpenAI GPT-4V, Claude 3, Gemini Pro Vision)
 */
class VisionModelAdapter {
    /**
    * Call OpenAI GPT-4 Vision
    */
    async callGPT4Vision(request) {
        // Would call OpenAI API with vision support
        return {
            content: 'GPT-4 Vision analysis',
            model: 'gpt-4-vision-preview',
            usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 }
        };
    }
    /**
    * Call Claude 3 Vision
    */
    async callClaude3Vision(request) {
        // Would call Anthropic API with vision support
        return {
            content: 'Claude 3 Vision analysis',
            model: 'claude-3-opus-20240229',
            usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 }
        };
    }
    /**
    * Call Gemini Pro Vision
    */
    async callGeminiVision(request) {
        // Would call Google API with vision support
        return {
            content: 'Gemini Pro Vision analysis',
            model: 'gemini-pro-vision',
            usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 }
        };
    }
}
exports.VisionModelAdapter = VisionModelAdapter;
//# sourceMappingURL=imageSupport.js.map