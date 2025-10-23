/**
 * Priority queue for managing file indexing order
 */
export interface QueueItem<T> {
    item: T;
    priority: number;
    timestamp: number;
}
export declare class PriorityQueue<T> {
    private getKey;
    private items;
    private itemSet;
    constructor(getKey: (item: T) => string);
    /**
    * Add item to queue with priority
    * Higher priority = processed first
    */
    enqueue(item: T, priority: number): void;
    /**
    * Remove and return highest priority item
    */
    dequeue(): T | undefined;
    /**
    * Peek at highest priority item without removing
    */
    peek(): T | undefined;
    /**
    * Check if queue is empty
    */
    isEmpty(): boolean;
    /**
    * Get queue size
    */
    size(): number;
    /**
    * Clear the queue
    */
    clear(): void;
    /**
    * Check if item exists in queue
    */
    has(item: T): boolean;
    /**
    * Update priority of existing item
    */
    updatePriority(item: T, newPriority: number): void;
    /**
    * Get all items (for debugging)
    */
    getAll(): T[];
    /**
    * Sort items by priority (descending) and timestamp (ascending)
    */
    private sort;
}
/**
 * Calculate file priority based on various factors
 */
export declare function calculateFilePriority(filePath: string, fileSize: number, lastModified: number, isOpen?: boolean, isRecent?: boolean): number;
//# sourceMappingURL=priorityQueue.d.ts.map