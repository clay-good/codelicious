/**
 * Image Support for Vision Models
 *
 * Enables image attachments and vision model support for:
 * - Screenshot analysis
 * - UI/UX review
 * - Diagram understanding
 * - Error screenshot debugging
 */
export interface ImageAttachment {
    id: string;
    path: string;
    mimeType: string;
    base64Data: string;
    metadata: {
        width?: number;
        height?: number;
        size: number;
        timestamp: number;
    };
}
export interface VisionModelRequest {
    prompt: string;
    images: ImageAttachment[];
    model: string;
    maxTokens?: number;
}
export interface VisionModelResponse {
    content: string;
    model: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}
export declare class ImageSupportManager {
    private attachments;
    private supportedFormats;
    constructor();
    /**
    * Add image attachment
    */
    addImage(imagePath: string): Promise<ImageAttachment>;
    /**
    * Remove image attachment
    */
    removeImage(id: string): void;
    /**
    * Get all attachments
    */
    getAttachments(): ImageAttachment[];
    /**
    * Clear all attachments
    */
    clearAttachments(): void;
    /**
    * Analyze image with vision model
    */
    analyzeImage(imagePath: string, prompt: string, model?: string): Promise<VisionModelResponse>;
    /**
    * Take screenshot and analyze
    */
    analyzeScreenshot(prompt: string): Promise<VisionModelResponse>;
    /**
    * Get MIME type from file extension
    */
    private getMimeType;
    /**
    * Generate unique ID
    */
    private generateId;
}
/**
 * Vision Model Adapter
 *
 * Adapts different vision model APIs (OpenAI GPT-4V, Claude 3, Gemini Pro Vision)
 */
export declare class VisionModelAdapter {
    /**
    * Call OpenAI GPT-4 Vision
    */
    callGPT4Vision(request: VisionModelRequest): Promise<VisionModelResponse>;
    /**
    * Call Claude 3 Vision
    */
    callClaude3Vision(request: VisionModelRequest): Promise<VisionModelResponse>;
    /**
    * Call Gemini Pro Vision
    */
    callGeminiVision(request: VisionModelRequest): Promise<VisionModelResponse>;
}
//# sourceMappingURL=imageSupport.d.ts.map