import { TaskQueueItem, DaemonResponse } from './types.js';

export interface TaskQueueOptions {
  maxConcurrent: number;
}

export interface TaskQueue {
  enqueue(item: TaskQueueItem): Promise<DaemonResponse | null>;
  getPendingCount(): number;
  getActiveCount(): number;
  clear(): void;
}

export function createTaskQueue(options: TaskQueueOptions): TaskQueue {
  const queue: TaskQueueItem[] = [];
  let activeTasks = 0;

  return {
    async enqueue(item: TaskQueueItem): Promise<DaemonResponse | null> {
      return new Promise((resolve, reject) => {
        const wrappedItem: TaskQueueItem = {
          ...item,
          resolve: (response) => {
            activeTasks--;
            item.resolve(response);
            resolve(response);
            processNext();
          },
          reject: (error) => {
            activeTasks--;
            item.reject(error);
            reject(error);
            processNext();
          },
        };

        queue.push(wrappedItem);
        processNext();
      });
    },

    getPendingCount(): number {
      return queue.length;
    },

    getActiveCount(): number {
      return activeTasks;
    },

    clear(): void {
      queue.length = 0;
    },
  };

  async function processNext(): Promise<void> {
    if (activeTasks >= options.maxConcurrent || queue.length === 0) {
      return;
    }

    const item = queue.shift();
    if (!item) return;

    activeTasks++;

    try {
      const response: DaemonResponse = {
        id: item.id,
        success: true,
        data: { processed: true, input: item.input },
        timestamp: new Date().toISOString(),
      };
      item.resolve(response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      item.reject(error);
    }
  }
}
