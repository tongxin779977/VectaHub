export interface WorkerPoolOptions {
  size: number;
  maxQueueSize?: number;
}

interface Task<T> {
  execute: () => Promise<T>;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  private queue: Task<any>[] = [];
  private activeWorkers = 0;
  private maxSize: number;
  private maxQueueSize: number;

  constructor(options: WorkerPoolOptions) {
    this.maxSize = options.size;
    this.maxQueueSize = options.maxQueueSize || 100;
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error('Task queue is full'));
        return;
      }

      this.queue.push({ execute: task, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    while (this.activeWorkers < this.maxSize && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.activeWorkers++;

      task.execute()
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.activeWorkers--;
          this.processQueue();
        });
    }
  }
}
