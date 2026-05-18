/**
 * 工作池配置选项
 */
export interface WorkerPoolOptions {
  size: number;
  maxQueueSize?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * 任务接口
 */
interface Task<T> {
  execute: () => Promise<T>;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
  retries: number;
  maxRetries: number;
}

/**
 * 任务执行结果
 */
export interface TaskResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  retryCount: number;
}

/**
 * 工作池类
 *
 * 用于限制并发执行的任务数量，支持队列和重试机制
 */
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

  /**
   * 执行任务并返回结果
   * 失败时直接抛出错误
   */
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

  /**
   * 执行任务并返回包含错误的结果对象
   * 不会抛出错误
   */
  async executeWithResult<T>(task: () => Promise<T>, maxRetries?: number): Promise<TaskResult<T>> {
    try {
      const result = await this.execute(task, maxRetries);
      return { success: true, result, retryCount: 0 };
    } catch (error) {
      return { success: false, error: error as Error, retryCount: maxRetries ?? this.maxRetries };
    }
  }

  /**
   * 处理任务队列
   */
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

  /**
   * 执行任务并处理重试
   */
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

  /**
   * 延迟执行
   */
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
