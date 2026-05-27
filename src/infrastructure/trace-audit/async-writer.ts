/**
 * 异步日志写入器 - 实现缓冲和异步刷盘机制
 * Async Log Writer - Implements buffering and async flush mechanism
 */

import path from 'node:path';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import type { Logger } from '../logger/index.js';
import type { TraceSpan, AsyncWriteConfig } from './types.js';

export interface AsyncLogWriterDeps {
  logger: Logger;
}

/** 默认配置 */
const DEFAULT_CONFIG: AsyncWriteConfig = {
  enabled: true,
  bufferSize: 100,
  flushIntervalMs: 1000,
  maxQueueLength: 10000,
};

/** 写入队列项 */
interface WriteQueueItem {
  data: TraceSpan;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * 异步日志写入器类
 * Async Log Writer Class
 */
export class AsyncLogWriter {
  private static activeWriters: Set<AsyncLogWriter> = new Set();
  private config: AsyncWriteConfig;
  private logDir: string;
  private logger: Logger;
  private queue: WriteQueueItem[] = [];
  private isFlushing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;
  private isPaused = false;
  private pauseResolve: (() => void) | null = null;

  constructor(
    logDir: string,
    config: Partial<AsyncWriteConfig> | undefined,
    deps: AsyncLogWriterDeps
  ) {
    if (!deps.logger) {
      throw new Error('AsyncLogWriter requires a logger dependency');
    }

    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logDir = logDir;
    this.logger = deps.logger;
    this.ensureDirectory();
    this.startFlushTimer();
    AsyncLogWriter.activeWriters.add(this);
  }

  /** 刷盘所有活跃的写入器 */
  static async flushAll(): Promise<void> {
    const promises = Array.from(AsyncLogWriter.activeWriters).map(writer => writer.flush());
    await Promise.all(promises);
  }

  /** 暂停所有活跃的写入器（用于日志轮转等操作） */
  static async pauseAll(): Promise<void> {
    const promises = Array.from(AsyncLogWriter.activeWriters).map(writer => writer.pause());
    await Promise.all(promises);
  }

  /** 恢复所有活跃的写入器 */
  static resumeAll(): void {
    for (const writer of AsyncLogWriter.activeWriters) {
      writer.resume();
    }
  }

  /** 确保日志目录存在 */
  private ensureDirectory(): void {
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }
  }

  /** 获取当前日志文件路径 */
  private getLogFilePath(): string {
    const dateStr = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${dateStr}-traces.jsonl`);
  }

  /** 启动定时刷盘 */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        this.logger.error('定时刷盘失败:', err);
      });
    }, this.config.flushIntervalMs);
  }

  /**
   * 暂停写入器 - flush 已缓冲数据并阻止后续刷盘，直到 resume()
   * 用于日志轮转等需要独占文件的场景
   */
  async pause(): Promise<void> {
    if (this.isPaused) {
      return;
    }
    this.isPaused = true;

    // 刷盘当前缓冲区，确保所有数据写入磁盘
    await this.flush();

    // 返回一个 Promise，由 resume() 解除
    return new Promise<void>((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  /**
   * 恢复写入器 - 允许正常刷盘
   */
  resume(): void {
    if (!this.isPaused) {
      return;
    }
    this.isPaused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  /** 写入单条日志 */
  async write(data: TraceSpan): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('写入器已销毁');
    }

    if (!this.config.enabled) {
      return;
    }

    return new Promise((resolve, reject) => {
      // 检查队列长度
      if (this.queue.length >= this.config.maxQueueLength) {
        this.logger.warn('日志队列已满，丢弃最旧的日志');
        const discarded = this.queue.shift();
        if (discarded) {
          discarded.reject(new Error('日志队列已满，该条日志被丢弃'));
        }
      }

      this.queue.push({ data, resolve, reject });

      // 暂停时不触发刷盘，等待 resume 后由定时器或手动触发
      if (!this.isPaused && this.queue.length >= this.config.bufferSize) {
        this.flush().catch((err) => {
          this.logger.error('缓冲区满刷盘失败:', err);
        });
      }
    });
  }

  /** 批量写入日志 */
  async writeBatch(dataList: TraceSpan[]): Promise<void> {
    const promises = dataList.map((data) => this.write(data));
    await Promise.all(promises);
  }

  /** 刷盘操作 */
  async flush(): Promise<void> {
    if (this.isPaused || this.isFlushing || this.queue.length === 0 || this.isDestroyed) {
      return;
    }

    this.isFlushing = true;
    let itemsToFlush: WriteQueueItem[] = [];

    try {
      itemsToFlush = [...this.queue];
      this.queue = [];

      const logFile = this.getLogFilePath();
      const lines = itemsToFlush
        .map((item) => JSON.stringify(item.data))
        .join('\n') + '\n';

      // 使用 appendFileSync 确保数据不丢失
      appendFileSync(logFile, lines, 'utf-8');

      // 通知所有等待的写入操作
      itemsToFlush.forEach((item) => item.resolve());
    } catch (error) {
      const err = error as Error;
      this.logger.error('刷盘失败: ' + err.message);

      // 将失败的数据重新放回队列头部，保证不丢当前批次
      this.queue = [...itemsToFlush, ...this.queue];

      throw err;
    } finally {
      this.isFlushing = false;
    }
  }

  /** 获取队列长度 */
  getQueueLength(): number {
    return this.queue.length;
  }

  /** 获取统计信息 */
  getStats(): {
    queueLength: number;
    isFlushing: boolean;
    isDestroyed: boolean;
    isPaused: boolean;
    bufferSize: number;
  } {
    return {
      queueLength: this.queue.length,
      isFlushing: this.isFlushing,
      isDestroyed: this.isDestroyed,
      isPaused: this.isPaused,
      bufferSize: this.config.bufferSize,
    };
  }

  /** 销毁写入器 */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 刷盘剩余数据
    await this.flush();

    this.isDestroyed = true;
    AsyncLogWriter.activeWriters.delete(this);
  }
}

/**
 * 创建异步日志写入器工厂函数
 * Create Async Log Writer Factory Function
 */
export function createAsyncLogWriter(
  logDir: string,
  config: Partial<AsyncWriteConfig> | undefined,
  deps: AsyncLogWriterDeps
): AsyncLogWriter {
  return new AsyncLogWriter(logDir, config, deps);
}
