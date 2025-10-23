"use strict";
/**
 * Tests for Priority Queue
 */
Object.defineProperty(exports, "__esModule", { value: true });
const priorityQueue_1 = require("../priorityQueue");
describe('PriorityQueue', () => {
    let queue;
    beforeEach(() => {
        queue = new priorityQueue_1.PriorityQueue(item => item);
    });
    describe('basic operations', () => {
        it('should start empty', () => {
            expect(queue.isEmpty()).toBe(true);
            expect(queue.size()).toBe(0);
        });
        it('should enqueue items', () => {
            queue.enqueue('item1', 10);
            expect(queue.isEmpty()).toBe(false);
            expect(queue.size()).toBe(1);
        });
        it('should dequeue items', () => {
            queue.enqueue('item1', 10);
            const item = queue.dequeue();
            expect(item).toBe('item1');
            expect(queue.isEmpty()).toBe(true);
        });
        it('should return undefined when dequeuing from empty queue', () => {
            const item = queue.dequeue();
            expect(item).toBeUndefined();
        });
    });
    describe('priority ordering', () => {
        it('should dequeue highest priority item first', () => {
            queue.enqueue('low', 1);
            queue.enqueue('high', 100);
            queue.enqueue('medium', 50);
            expect(queue.dequeue()).toBe('high');
            expect(queue.dequeue()).toBe('medium');
            expect(queue.dequeue()).toBe('low');
        });
        it('should use FIFO for items with same priority', () => {
            queue.enqueue('first', 10);
            queue.enqueue('second', 10);
            queue.enqueue('third', 10);
            expect(queue.dequeue()).toBe('first');
            expect(queue.dequeue()).toBe('second');
            expect(queue.dequeue()).toBe('third');
        });
    });
    describe('duplicate handling', () => {
        it('should not add duplicate items', () => {
            queue.enqueue('item1', 10);
            queue.enqueue('item1', 20);
            expect(queue.size()).toBe(1);
        });
        it('should check if item exists', () => {
            queue.enqueue('item1', 10);
            expect(queue.has('item1')).toBe(true);
            expect(queue.has('item2')).toBe(false);
        });
    });
    describe('peek operation', () => {
        it('should peek at highest priority item without removing', () => {
            queue.enqueue('item1', 10);
            queue.enqueue('item2', 20);
            expect(queue.peek()).toBe('item2');
            expect(queue.size()).toBe(2);
        });
        it('should return undefined when peeking empty queue', () => {
            expect(queue.peek()).toBeUndefined();
        });
    });
    describe('clear operation', () => {
        it('should clear all items', () => {
            queue.enqueue('item1', 10);
            queue.enqueue('item2', 20);
            queue.enqueue('item3', 30);
            queue.clear();
            expect(queue.isEmpty()).toBe(true);
            expect(queue.size()).toBe(0);
        });
    });
    describe('update priority', () => {
        it('should update priority of existing item', () => {
            queue.enqueue('item1', 10);
            queue.enqueue('item2', 20);
            queue.updatePriority('item1', 30);
            expect(queue.dequeue()).toBe('item1');
            expect(queue.dequeue()).toBe('item2');
        });
        it('should handle updating non-existent item', () => {
            queue.updatePriority('nonexistent', 100);
            expect(queue.size()).toBe(0);
        });
    });
    describe('getAll operation', () => {
        it('should return all items in priority order', () => {
            queue.enqueue('low', 1);
            queue.enqueue('high', 100);
            queue.enqueue('medium', 50);
            const all = queue.getAll();
            expect(all).toEqual(['high', 'medium', 'low']);
        });
        it('should return empty array for empty queue', () => {
            expect(queue.getAll()).toEqual([]);
        });
    });
});
describe('calculateFilePriority', () => {
    it('should give highest priority to open files', () => {
        const openPriority = (0, priorityQueue_1.calculateFilePriority)('file.ts', 1000, Date.now(), true, false);
        const closedPriority = (0, priorityQueue_1.calculateFilePriority)('file.ts', 1000, Date.now(), false, false);
        expect(openPriority).toBeGreaterThan(closedPriority);
    });
    it('should give high priority to recently modified files', () => {
        const recentPriority = (0, priorityQueue_1.calculateFilePriority)('file.ts', 1000, Date.now(), false, true);
        const oldPriority = (0, priorityQueue_1.calculateFilePriority)('file.ts', 1000, Date.now(), false, false);
        expect(recentPriority).toBeGreaterThan(oldPriority);
    });
    it('should give higher priority to smaller files', () => {
        const smallPriority = (0, priorityQueue_1.calculateFilePriority)('file.ts', 5000, Date.now());
        const largePriority = (0, priorityQueue_1.calculateFilePriority)('file.ts', 200000, Date.now());
        expect(smallPriority).toBeGreaterThan(largePriority);
    });
    it('should give high priority to index files', () => {
        const indexPriority = (0, priorityQueue_1.calculateFilePriority)('index.ts', 10000, Date.now());
        const regularPriority = (0, priorityQueue_1.calculateFilePriority)('regular.ts', 10000, Date.now());
        expect(indexPriority).toBeGreaterThan(regularPriority);
    });
    it('should give high priority to main files', () => {
        const mainPriority = (0, priorityQueue_1.calculateFilePriority)('main.ts', 10000, Date.now());
        const regularPriority = (0, priorityQueue_1.calculateFilePriority)('regular.ts', 10000, Date.now());
        expect(mainPriority).toBeGreaterThan(regularPriority);
    });
    it('should give highest priority to package.json', () => {
        const packagePriority = (0, priorityQueue_1.calculateFilePriority)('package.json', 10000, Date.now());
        const regularPriority = (0, priorityQueue_1.calculateFilePriority)('regular.ts', 10000, Date.now());
        expect(packagePriority).toBeGreaterThan(regularPriority);
    });
    it('should give lower priority to test files', () => {
        const testPriority = (0, priorityQueue_1.calculateFilePriority)('file.test.ts', 10000, Date.now());
        const regularPriority = (0, priorityQueue_1.calculateFilePriority)('file.ts', 10000, Date.now());
        expect(testPriority).toBeLessThan(regularPriority);
    });
    it('should never return negative priority', () => {
        const priority = (0, priorityQueue_1.calculateFilePriority)('test.spec.ts', 1000000, Date.now());
        expect(priority).toBeGreaterThanOrEqual(0);
    });
    it('should combine multiple factors correctly', () => {
        const highPriority = (0, priorityQueue_1.calculateFilePriority)('index.ts', 5000, Date.now(), true, true);
        const lowPriority = (0, priorityQueue_1.calculateFilePriority)('file.test.ts', 200000, Date.now(), false, false);
        expect(highPriority).toBeGreaterThan(lowPriority);
    });
});
//# sourceMappingURL=priorityQueue.test.js.map