/**
 * 异步日志写入器 - 实现缓冲和异步刷盘机制
 * Async Log Writer - Implements buffering and async flush mechanism
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { getLogger } from '../../utils/logger.js';
import type { TraceSpan, AsyncWriteConfig } from './types.js';

const logger = getLogger('async-log-writer');

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
  private queue: WriteQueueItem[] = [];
  private isFlushing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;

  constructor(logDir: string, config?: Partial<AsyncWriteConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logDir = logDir;
    this.ensureDirectory();
    this.startFlushTimer();
    AsyncLogWriter.activeWriters.add(this);
  }

  /** 刷盘所有活跃的写入器 */
  static async flushAll(): Promise<void> {
    const promises = Array.from(AsyncLogWriter.activeWriters).map(writer => writer.flush());
    await Promise.all(promises);
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
        logger.error('定时刷盘失败:', err);
      });
    }, this.config.flushIntervalMs);
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
        logger.warn('日志队列已满，丢弃最旧的日志');
        this.queue.shift();
      }

      this.queue.push({ data, resolve, reject });

      // 如果缓冲区已满，立即刷盘
      if (this.queue.length >= this.config.bufferSize) {
        this.flush().catch((err) => {
          logger.error('缓冲区满刷盘失败:', err);
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
    if (this.isFlushing || this.queue.length === 0 || this.isDestroyed) {
      return;
    }

    this.isFlushing = true;

    try {
      const itemsToFlush = [...this.queue];
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
      logger.error('刷盘失败: ' + err.message);
      
      // 将失败的数据重新放回队列头部
      const failedItems = this.queue;
      this.queue = [...failedItems, ...this.queue];
      
      // 通知所有等待的写入操作失败
      failedItems.forEach((item) => item.reject(err));
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
    bufferSize: number;
  } {
    return {
      queueLength: this.queue.length,
      isFlushing: this.isFlushing,
      isDestroyed: this.isDestroyed,
      bufferSize: this.config.bufferSize,
    };
  }

  /** 销毁写入器 */
  async destroy(): Promise<void> {
    this.isDestroyed = true;
    AsyncLogWriter.activeWriters.delete(this);
    
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // 刷盘剩余数据
    await this.flush();
  }
}

/**
 * 创建异步日志写入器工厂函数
 * Create Async Log Writer Factory Function
 */
export function createAsyncLogWriter(
  logDir: string,
  config?: Partial<AsyncWriteConfig>
): AsyncLogWriter {
  return new AsyncLogWriter(logDir, config);
}
