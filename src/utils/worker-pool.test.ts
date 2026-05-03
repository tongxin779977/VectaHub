import { describe, it, expect } from 'vitest';
import { WorkerPool } from './worker-pool.js';

describe('WorkerPool', () => {
  it('should execute tasks', async () => {
    const pool = new WorkerPool({ size: 2 });
    const result = await pool.execute(async () => 'test result');
    expect(result).toBe('test result');
  });

  it('should handle multiple tasks concurrently', async () => {
    const pool = new WorkerPool({ size: 2 });
    const tasks = [
      pool.execute(async () => { await new Promise(r => setTimeout(r, 50)); return 1; }),
      pool.execute(async () => { await new Promise(r => setTimeout(r, 30)); return 2; }),
      pool.execute(async () => { await new Promise(r => setTimeout(r, 40)); return 3; }),
    ];
    
    const results = await Promise.all(tasks);
    expect(results).toEqual([1, 2, 3]);
  });

  it('should reject when task throws', async () => {
    const pool = new WorkerPool({ size: 1 });
    await expect(
      pool.execute(async () => { throw new Error('test error'); })
    ).rejects.toThrow('test error');
  });

  it('should reject when queue is full', async () => {
    const pool = new WorkerPool({ size: 1, maxQueueSize: 1 });
    
    // Start a long running task
    pool.execute(async () => await new Promise(r => setTimeout(r, 1000)));
    // Queue a task
    pool.execute(async () => 2);
    // Try to queue third task - should reject
    await expect(pool.execute(async () => 3)).rejects.toThrow('Task queue is full');
  });
});
