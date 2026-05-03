import { TaskQueueItem, DaemonResponse } from './types.js';

export interface TaskProcessor {
  (input: string): Promise<DaemonResponse>;
}

export interface TaskQueueOptions {
  maxConcurrent: number;
  processor?: TaskProcessor;
}

export interface TaskQueue {
  enqueue(item: TaskQueueItem): Promise<DaemonResponse | null>;
  getPendingCount(): number;
  getActiveCount(): number;
  clear(rejectPending?: boolean): void;
}

export function createTaskQueue(options: TaskQueueOptions): TaskQueue {
  const queue: TaskQueueItem[] = [];
  let activeTasks = 0;
  let isProcessing = false;

  return {
    async enqueue(item: TaskQueueItem): Promise<DaemonResponse | null> {
      return new Promise((resolve, reject) => {
        const wrappedItem: TaskQueueItem = {
          ...item,
          resolve: (response) => {
            item.resolve(response);
            resolve(response);
          },
          reject: (error) => {
            item.reject(error);
            reject(error);
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

    clear(rejectPending = true): void {
      if (rejectPending) {
        const error = new Error('Task queue cleared, task cancelled');
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            item.reject(error);
          }
        }
      } else {
        queue.length = 0;
      }
    },
  };

  async function processNext(): Promise<void> {
    if (isProcessing) return;
    isProcessing = true;

    try {
      while (activeTasks < options.maxConcurrent && queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        activeTasks++;
        executeTask(item);
      }
    } finally {
      isProcessing = false;
    }
  }

  async function executeTask(item: TaskQueueItem): Promise<void> {
    try {
      let response: DaemonResponse;

      if (options.processor) {
        response = await options.processor(item.input);
      } else {
        response = {
          id: item.id,
          success: true,
          data: { processed: true, input: item.input },
          timestamp: new Date().toISOString(),
        };
      }

      item.resolve(response);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      item.reject(error);
    } finally {
      activeTasks--;
      processNext();
    }
  }
}
