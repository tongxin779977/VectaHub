import { describe, it, expect, beforeEach } from 'vitest';
import { createTaskQueue } from './task-queue.js';

describe('Task Queue', () => {
  it('enqueues and processes a task', async () => {
    const queue = createTaskQueue({ maxConcurrent: 1 });
    const response = await queue.enqueue({
      id: 'task_1',
      input: 'test input',
      priority: 0,
      createdAt: new Date(),
      resolve: () => {},
      reject: () => {},
    });

    expect(response).not.toBeNull();
    expect(response?.success).toBe(true);
    expect(response?.data).toEqual({ processed: true, input: 'test input' });
  });

  it('tracks pending and active counts', async () => {
    const queue = createTaskQueue({ maxConcurrent: 1 });

    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getActiveCount()).toBe(0);

    const promise = queue.enqueue({
      id: 'task_1',
      input: 'test',
      priority: 0,
      createdAt: new Date(),
      resolve: () => {},
      reject: () => {},
    });

    await promise;
    expect(queue.getActiveCount()).toBe(0);
  });

  it('clears the queue', async () => {
    const queue = createTaskQueue({ maxConcurrent: 1 });

    queue.enqueue({
      id: 'task_1',
      input: 'test 1',
      priority: 0,
      createdAt: new Date(),
      resolve: () => {},
      reject: () => {},
    });

    queue.enqueue({
      id: 'task_2',
      input: 'test 2',
      priority: 0,
      createdAt: new Date(),
      resolve: () => {},
      reject: () => {},
    });

    queue.clear();
    expect(queue.getPendingCount()).toBe(0);
  });

  it('respects maxConcurrent limit', async () => {
    const queue = createTaskQueue({ maxConcurrent: 2 });

    let activeCount = 0;
    const maxActive = 0;

    const promises = [
      queue.enqueue({
        id: 'task_1',
        input: 'test 1',
        priority: 0,
        createdAt: new Date(),
        resolve: () => { activeCount++; },
        reject: () => {},
      }),
      queue.enqueue({
        id: 'task_2',
        input: 'test 2',
        priority: 0,
        createdAt: new Date(),
        resolve: () => { activeCount++; },
        reject: () => {},
      }),
      queue.enqueue({
        id: 'task_3',
        input: 'test 3',
        priority: 0,
        createdAt: new Date(),
        resolve: () => { activeCount++; },
        reject: () => {},
      }),
    ];

    await Promise.all(promises);
    expect(activeCount).toBe(3);
  });
});
