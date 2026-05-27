import fs from 'node:fs/promises';
import path from 'node:path';
import type pino from 'pino';
import { redactSensitiveData } from '../security/sensitive-data.js';
import { VectaHubError, ErrorType } from '../errors/index.js';

/**
 * 操作日志条目接口
 */
export interface OperationLogEntry {
  id: string;
  timestamp: string;
  command: string;
  args: string[];
  success: boolean;
  duration?: number;
  error?: string;
  output?: string;
  sessionId?: string;
}

/**
 * 操作日志配置接口
 */
export interface OperationLogConfig {
  enabled: boolean;
  maxEntries: number;
  logFile?: string;
  autoFlush: boolean;
  redactSensitive: boolean;
}

export type OperationLogPathResolver = (...segments: string[]) => string;

export interface OperationLogDeps {
  logger: pino.Logger;
  resolveStoragePath: OperationLogPathResolver;
}

export interface OperationLogOptions {
  config?: Partial<OperationLogConfig>;
  deps: OperationLogDeps;
}

/**
 * 默认操作日志配置
 */
const DEFAULT_CONFIG: OperationLogConfig = {
  enabled: true,
  maxEntries: 1000,
  autoFlush: true,
  redactSensitive: true,
};

/**
 * 操作日志类
 *
 * 负责记录命令的执行记录，支持查询和统计
 */
export class OperationLog {
  private readonly logger: pino.Logger;
  private readonly resolveStoragePath: OperationLogPathResolver;
  private config: OperationLogConfig;
  private entries: OperationLogEntry[] = [];
  private logFile: string;
  private isFlushing = false;

  constructor(options: OperationLogOptions) {
    this.assertDeps(options);
    this.logger = options.deps.logger;
    this.resolveStoragePath = options.deps.resolveStoragePath;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    this.logFile = this.config.logFile || this.resolveStoragePath('logs', 'operations.jsonl');
    this.loadEntries();
  }

  /**
   * 显式依赖校验，缺失时直接失败
   */
  private assertDeps(options: OperationLogOptions | undefined): asserts options is OperationLogOptions {
    if (!options?.deps?.logger || typeof options.deps.resolveStoragePath !== 'function') {
      throw new VectaHubError('OperationLog requires explicit logger and resolveStoragePath dependencies', ErrorType.CONFIGURATION);
    }
  }

  /**
   * 从文件加载历史条目
   */
  private async loadEntries(): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const content = await fs.readFile(this.logFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      
      for (const line of lines.slice(-this.config.maxEntries)) {
        try {
          const entry = JSON.parse(line) as OperationLogEntry;
          this.entries.push(entry);
        } catch {
          continue;
        }
      }
    } catch {
      this.entries = [];
    }
  }

  /**
   * 添加操作记录
   */
  async add(entry: Omit<OperationLogEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) return;

    const newEntry: OperationLogEntry = {
      ...entry,
      id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
    };

    if (this.config.redactSensitive) {
      if (newEntry.args) {
        newEntry.args = newEntry.args.map(arg => 
          typeof arg === 'string' ? redactSensitiveData(arg) as string : arg
        );
      }
      if (newEntry.output) {
        newEntry.output = redactSensitiveData(newEntry.output) as string;
      }
      if (newEntry.error) {
        newEntry.error = redactSensitiveData(newEntry.error) as string;
      }
    }

    this.entries.push(newEntry);

    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    if (this.config.autoFlush) {
      await this.flush();
    }
  }

  /**
   * 记录命令执行
   * 返回记录 ID，供后续更新使用
   */
  async logCommand(command: string, args: string[], sessionId?: string): Promise<string> {
    const startTime = Date.now();
    const entryId = `op_${startTime}_${Math.random().toString(36).substring(2, 9)}`;

    const entry: OperationLogEntry = {
      id: entryId,
      timestamp: new Date(startTime).toISOString(),
      command,
      args: this.config.redactSensitive ? args.map(arg => 
        typeof arg === 'string' ? redactSensitiveData(arg) as string : arg
      ) : args,
      success: true,
      sessionId,
    };

    this.entries.push(entry);

    if (this.entries.length > this.config.maxEntries) {
      this.entries = this.entries.slice(-this.config.maxEntries);
    }

    return entryId;
  }

  /**
   * 更新操作记录
   */
  async updateEntry(entryId: string, updates: Partial<Pick<OperationLogEntry, 'success' | 'duration' | 'error' | 'output'>>): Promise<void> {
    const index = this.entries.findIndex(e => e.id === entryId);
    if (index !== -1) {
      if (this.config.redactSensitive) {
        if (updates.output) {
          updates.output = redactSensitiveData(updates.output) as string;
        }
        if (updates.error) {
          updates.error = redactSensitiveData(updates.error) as string;
        }
      }
      
      this.entries[index] = { ...this.entries[index], ...updates };

      if (this.config.autoFlush) {
        await this.flush();
      }
    }
  }

  /**
   * 刷新日志到文件
   */
  private async flush(): Promise<void> {
    if (this.isFlushing) return;
    
    this.isFlushing = true;
    
    try {
      await fs.mkdir(path.dirname(this.logFile), { recursive: true });
      
      const lines = this.entries.map(entry => JSON.stringify(entry));
      await fs.writeFile(this.logFile, lines.join('\n') + '\n', 'utf-8');
    } catch (error) {
      this.logger.error(`Failed to flush operation log: ${(error as Error).message}`);
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * 查询操作记录
   */
  getEntries(options?: {
    limit?: number;
    command?: string;
    success?: boolean;
    sessionId?: string;
    since?: string;
  }): OperationLogEntry[] {
    let result = [...this.entries];

    if (options?.command) {
      result = result.filter(e => e.command === options.command);
    }

    if (options?.success !== undefined) {
      result = result.filter(e => e.success === options.success);
    }

    if (options?.sessionId) {
      result = result.filter(e => e.sessionId === options.sessionId);
    }

    if (options?.since) {
      result = result.filter(e => e.timestamp >= options.since!);
    }

    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (options?.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  /**
   * 获取最近的记录
   */
  getRecent(count: number = 10): OperationLogEntry[] {
    return [...this.entries]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    success: number;
    failed: number;
    commands: Record<string, number>;
  } {
    const stats = {
      total: this.entries.length,
      success: 0,
      failed: 0,
      commands: {} as Record<string, number>,
    };

    for (const entry of this.entries) {
      if (entry.success) {
        stats.success++;
      } else {
        stats.failed++;
      }
      
      stats.commands[entry.command] = (stats.commands[entry.command] || 0) + 1;
    }

    return stats;
  }

  /**
   * 清空操作记录
   */
  async clear(): Promise<void> {
    this.entries = [];
    await this.flush();
    this.logger.info('Operation log cleared');
  }

  /**
   * 导出到指定文件
   */
  async exportToFile(filePath: string): Promise<void> {
    const lines = this.entries.map(entry => JSON.stringify(entry));
    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
    this.logger.info(`Operation log exported to ${filePath}`);
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  updateConfig(config: Partial<OperationLogConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * 创建 OperationLog 实例的工厂函数
 */
export function createOperationLog(options: OperationLogOptions): OperationLog {
  return new OperationLog(options);
}
