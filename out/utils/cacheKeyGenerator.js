"use strict";
/**
 * Cache Key Generator Utility
 * Consolidates duplicated cache key generation logic from multiple files
 *
 * Provides consistent, collision-resistant cache keys for:
 * - Code generation requests
 * - RAG queries
 * - Pattern matching
 * - File processing
 * - Embeddings
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
exports.generateHash = generateHash;
exports.generateCodeCacheKey = generateCodeCacheKey;
exports.generateRAGCacheKey = generateRAGCacheKey;
exports.generatePatternCacheKey = generatePatternCacheKey;
exports.generateFileCacheKey = generateFileCacheKey;
exports.generateEmbeddingCacheKey = generateEmbeddingCacheKey;
exports.generateGenericCacheKey = generateGenericCacheKey;
exports.parseCacheKey = parseCacheKey;
exports.isValidCacheKey = isValidCacheKey;
exports.generateContentHash = generateContentHash;
exports.generateSafeCacheKey = generateSafeCacheKey;
const crypto = __importStar(require("crypto"));
/**
 * Generate a deterministic hash from input
 */
function generateHash(input, algorithm = 'md5') {
    return crypto.createHash(algorithm).update(input).digest('hex');
}
/**
 * Generate cache key for code generation
 */
function generateCodeCacheKey(prompt, language, context, options = {}) {
    const parts = [
        'code',
        language.toLowerCase(),
        generateHash(prompt),
        context ? generateHash(context) : ''
    ].filter(Boolean);
    if (options.includeVersion) {
        parts.push('v1');
    }
    if (options.includeTimestamp) {
        parts.push(Date.now().toString());
    }
    let key = parts.join(':');
    if (options.prefix) {
        key = `${options.prefix}:${key}`;
    }
    if (options.suffix) {
        key = `${key}:${options.suffix}`;
    }
    if (options.maxLength && key.length > options.maxLength) {
        // Truncate and add hash to ensure uniqueness
        const hash = generateHash(key).substring(0, 8);
        key = key.substring(0, options.maxLength - 9) + ':' + hash;
    }
    return key;
}
/**
 * Generate cache key for RAG query
 */
function generateRAGCacheKey(query, maxResults, filters, options = {}) {
    const parts = [
        'rag',
        generateHash(query),
        maxResults?.toString() || '',
        filters ? generateHash(JSON.stringify(filters)) : ''
    ].filter(Boolean);
    if (options.includeVersion) {
        parts.push('v1');
    }
    let key = parts.join(':');
    if (options.prefix) {
        key = `${options.prefix}:${key}`;
    }
    if (options.suffix) {
        key = `${key}:${options.suffix}`;
    }
    if (options.maxLength && key.length > options.maxLength) {
        const hash = generateHash(key).substring(0, 8);
        key = key.substring(0, options.maxLength - 9) + ':' + hash;
    }
    return key;
}
/**
 * Generate cache key for pattern matching
 */
function generatePatternCacheKey(patternType, code, language, options = {}) {
    const parts = [
        'pattern',
        patternType.toLowerCase(),
        language?.toLowerCase() || '',
        generateHash(code)
    ].filter(Boolean);
    if (options.includeVersion) {
        parts.push('v1');
    }
    let key = parts.join(':');
    if (options.prefix) {
        key = `${options.prefix}:${key}`;
    }
    if (options.suffix) {
        key = `${key}:${options.suffix}`;
    }
    if (options.maxLength && key.length > options.maxLength) {
        const hash = generateHash(key).substring(0, 8);
        key = key.substring(0, options.maxLength - 9) + ':' + hash;
    }
    return key;
}
/**
 * Generate cache key for file processing
 */
function generateFileCacheKey(filePath, operation, contentHash, options = {}) {
    const parts = [
        'file',
        operation.toLowerCase(),
        generateHash(filePath),
        contentHash || ''
    ].filter(Boolean);
    if (options.includeVersion) {
        parts.push('v1');
    }
    let key = parts.join(':');
    if (options.prefix) {
        key = `${options.prefix}:${key}`;
    }
    if (options.suffix) {
        key = `${key}:${options.suffix}`;
    }
    if (options.maxLength && key.length > options.maxLength) {
        const hash = generateHash(key).substring(0, 8);
        key = key.substring(0, options.maxLength - 9) + ':' + hash;
    }
    return key;
}
/**
 * Generate cache key for embeddings
 */
function generateEmbeddingCacheKey(text, model, options = {}) {
    const parts = [
        'embedding',
        model.toLowerCase(),
        generateHash(text)
    ];
    if (options.includeVersion) {
        parts.push('v1');
    }
    let key = parts.join(':');
    if (options.prefix) {
        key = `${options.prefix}:${key}`;
    }
    if (options.suffix) {
        key = `${key}:${options.suffix}`;
    }
    if (options.maxLength && key.length > options.maxLength) {
        const hash = generateHash(key).substring(0, 8);
        key = key.substring(0, options.maxLength - 9) + ':' + hash;
    }
    return key;
}
/**
 * Generate generic cache key from object
 */
function generateGenericCacheKey(type, data, options = {}) {
    const dataHash = generateHash(JSON.stringify(data));
    const parts = [
        type.toLowerCase(),
        dataHash
    ];
    if (options.includeVersion) {
        parts.push('v1');
    }
    if (options.includeTimestamp) {
        parts.push(Date.now().toString());
    }
    let key = parts.join(':');
    if (options.prefix) {
        key = `${options.prefix}:${key}`;
    }
    if (options.suffix) {
        key = `${key}:${options.suffix}`;
    }
    if (options.maxLength && key.length > options.maxLength) {
        const hash = generateHash(key).substring(0, 8);
        key = key.substring(0, options.maxLength - 9) + ':' + hash;
    }
    return key;
}
/**
 * Parse cache key into components
 */
function parseCacheKey(key) {
    const parts = key.split(':');
    return {
        type: parts[0],
        components: parts.slice(1)
    };
}
/**
 * Validate cache key format
 */
function isValidCacheKey(key) {
    // Cache key should:
    // - Not be empty
    // - Not contain whitespace
    // - Not contain special characters except : and -
    // - Be reasonable length (< 500 chars)
    if (!key || key.length === 0)
        return false;
    if (key.length > 500)
        return false;
    if (/\s/.test(key))
        return false;
    if (!/^[a-zA-Z0-9:_-]+$/.test(key))
        return false;
    return true;
}
/**
 * Generate content hash for cache invalidation
 */
function generateContentHash(content) {
    return generateHash(content, 'sha256').substring(0, 16);
}
/**
 * Generate cache key with automatic collision detection
 */
function generateSafeCacheKey(type, data, existingKeys, options = {}) {
    const dataRecord = data; // Cache data structure
    let key = generateGenericCacheKey(type, dataRecord, options);
    let attempt = 0;
    // If collision detected, add suffix
    while (existingKeys.has(key) && attempt < 100) {
        attempt++;
        key = generateGenericCacheKey(type, dataRecord, {
            ...options,
            suffix: `${options.suffix || ''}_${attempt}`
        });
    }
    if (attempt >= 100) {
        throw new Error('Failed to generate unique cache key after 100 attempts');
    }
    return key;
}
//# sourceMappingURL=cacheKeyGenerator.js.map