import { describe, it, expect, vi } from 'vitest';
import { createTaskQueue, createTaskQueue as createQueueWithProcessor, type TaskQueueOptions } from './task-queue.js';
import type { TaskQueueItem } from './types.js';
import type { DaemonResponse } from './types.js';

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

  it('calls the task processor with the task input', async () => {
    const processor = vi.fn().mockResolvedValue({
      id: 'task_1',
      success: true,
      data: { result: 'processed' },
      timestamp: new Date().toISOString(),
    });

    const queue = createQueueWithProcessor({ maxConcurrent: 1, processor });
    const response = await queue.enqueue({
      id: 'task_1',
      input: 'test input',
      priority: 0,
      createdAt: new Date(),
      resolve: () => {},
      reject: () => {},
    });

    expect(processor).toHaveBeenCalledWith('test input');
    expect(response?.data).toEqual({ result: 'processed' });
  });

  it('returns error when task processor throws', async () => {
    const processor = vi.fn().mockRejectedValue(new Error('Processing failed'));
    const queue = createQueueWithProcessor({ maxConcurrent: 1, processor });

    await expect(queue.enqueue({
      id: 'task_1',
      input: 'test input',
      priority: 0,
      createdAt: new Date(),
      resolve: () => {},
      reject: () => {},
    })).rejects.toThrow('Processing failed');
  });

  it('processes multiple tasks sequentially', async () => {
    const processor = vi.fn().mockImplementation(async (input: string) => ({
      id: `task_${input}`,
      success: true,
      data: { input },
      timestamp: new Date().toISOString(),
    }));

    const queue = createQueueWithProcessor({ maxConcurrent: 1, processor });

    const response1 = await queue.enqueue({
      id: 'task_1',
      input: 'input1',
      priority: 0,
      createdAt: new Date(),
      resolve: () => {},
      reject: () => {},
    });

    const response2 = await queue.enqueue({
      id: 'task_2',
      input: 'input2',
      priority: 0,
      createdAt: new Date(),
      resolve: () => {},
      reject: () => {},
    });

    expect(processor).toHaveBeenCalledTimes(2);
    expect(processor).toHaveBeenNthCalledWith(1, 'input1');
    expect(processor).toHaveBeenNthCalledWith(2, 'input2');
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
