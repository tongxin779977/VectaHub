export interface WorkerPoolOptions {
  size: number;
  maxQueueSize?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface Task<T> {
  execute: () => Promise<T>;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  retries: number;
  maxRetries: number;
}

export interface TaskResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  retryCount: number;
}

export class WorkerPool {
  private queue: Task<any>[] = [];
  private activeWorkers = 0;
  private maxSize: number;
  private maxQueueSize: number;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: WorkerPoolOptions) {
    this.maxSize = options.size;
    this.maxQueueSize = options.maxQueueSize || 100;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelayMs = options.retryDelayMs || 1000;
  }

  async execute<T>(task: () => Promise<T>, maxRetries?: number): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) {
        reject(new Error('Task queue is full'));
        return;
      }

      this.queue.push({ 
        execute: task, 
        resolve, 
        reject,
        retries: 0,
        maxRetries: maxRetries ?? this.maxRetries
      });
      this.processQueue();
    });
  }

  async executeWithResult<T>(task: () => Promise<T>, maxRetries?: number): Promise<TaskResult<T>> {
    try {
      const result = await this.execute(task, maxRetries);
      return { success: true, result, retryCount: 0 };
    } catch (error) {
      return { success: false, error: error as Error, retryCount: maxRetries ?? this.maxRetries };
    }
  }

  private processQueue(): void {
    while (this.activeWorkers < this.maxSize && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.activeWorkers++;

      this.executeWithRetry(task)
        .then(task.resolve)
        .catch(task.reject)
        .finally(() => {
          this.activeWorkers--;
          this.processQueue();
        });
    }
  }

  private async executeWithRetry<T>(task: Task<T>): Promise<T> {
    try {
      return await task.execute();
    } catch (error) {
      if (task.retries < task.maxRetries && task.maxRetries > 0) {
        task.retries++;
        
        await this.delay(this.retryDelayMs * task.retries);
        
        return this.executeWithRetry(task);
      }
      
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getActiveWorkerCount(): number {
    return this.activeWorkers;
  }

  isBusy(): boolean {
    return this.activeWorkers >= this.maxSize;
  }

  clearQueue(): void {
    this.queue.forEach(task => {
      task.reject(new Error('Task cancelled: queue cleared'));
    });
    this.queue = [];
  }

  getStats(): {
    activeWorkers: number;
    queueSize: number;
    maxWorkers: number;
    maxQueueSize: number;
  } {
    return {
      activeWorkers: this.activeWorkers,
      queueSize: this.queue.length,
      maxWorkers: this.maxSize,
      maxQueueSize: this.maxQueueSize,
    };
  }
}