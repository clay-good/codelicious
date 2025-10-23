"use strict";
/**
 * Priority queue for managing file indexing order
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriorityQueue = void 0;
exports.calculateFilePriority = calculateFilePriority;
class PriorityQueue {
    constructor(getKey) {
        this.getKey = getKey;
        this.items = [];
        this.itemSet = new Set();
    }
    /**
    * Add item to queue with priority
    * Higher priority = processed first
    */
    enqueue(item, priority) {
        const key = this.getKey(item);
        // Don't add duplicates
        if (this.itemSet.has(key)) {
            return;
        }
        this.items.push({
            item,
            priority,
            timestamp: Date.now()
        });
        this.itemSet.add(key);
        this.sort();
    }
    /**
    * Remove and return highest priority item
    */
    dequeue() {
        const queueItem = this.items.shift();
        if (queueItem) {
            const key = this.getKey(queueItem.item);
            this.itemSet.delete(key);
            return queueItem.item;
        }
        return undefined;
    }
    /**
    * Peek at highest priority item without removing
    */
    peek() {
        return this.items[0]?.item;
    }
    /**
    * Check if queue is empty
    */
    isEmpty() {
        return this.items.length === 0;
    }
    /**
    * Get queue size
    */
    size() {
        return this.items.length;
    }
    /**
    * Clear the queue
    */
    clear() {
        this.items = [];
        this.itemSet.clear();
    }
    /**
    * Check if item exists in queue
    */
    has(item) {
        const key = this.getKey(item);
        return this.itemSet.has(key);
    }
    /**
    * Update priority of existing item
    */
    updatePriority(item, newPriority) {
        const key = this.getKey(item);
        const index = this.items.findIndex(qi => this.getKey(qi.item) === key);
        if (index !== -1) {
            this.items[index].priority = newPriority;
            this.sort();
        }
    }
    /**
    * Get all items (for debugging)
    */
    getAll() {
        return this.items.map(qi => qi.item);
    }
    /**
    * Sort items by priority (descending) and timestamp (ascending)
    */
    sort() {
        this.items.sort((a, b) => {
            // Higher priority first
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            // Earlier timestamp first (FIFO for same priority)
            return a.timestamp - b.timestamp;
        });
    }
}
exports.PriorityQueue = PriorityQueue;
/**
 * Calculate file priority based on various factors
 */
function calculateFilePriority(filePath, fileSize, lastModified, isOpen = false, isRecent = false) {
    let priority = 0;
    // Open files get highest priority
    if (isOpen) {
        priority += 1000;
    }
    // Recently modified files get high priority
    if (isRecent) {
        priority += 500;
    }
    // Smaller files get higher priority (faster to process)
    if (fileSize < 10000) {
        priority += 100;
    }
    else if (fileSize < 50000) {
        priority += 50;
    }
    else if (fileSize < 100000) {
        priority += 25;
    }
    // Important file types get higher priority
    if (filePath.includes('index.') || filePath.includes('main.')) {
        priority += 200;
    }
    if (filePath.includes('package.json') || filePath.includes('tsconfig.json')) {
        priority += 300;
    }
    // Test files get lower priority
    if (filePath.includes('.test.') || filePath.includes('.spec.')) {
        priority -= 50;
    }
    // Config files in root get medium-high priority
    if (filePath.split('/').length <= 2 &&
        (filePath.endsWith('.json') || filePath.endsWith('.config.js'))) {
        priority += 150;
    }
    return Math.max(0, priority);
}
//# sourceMappingURL=priorityQueue.js.map