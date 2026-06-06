import fs from 'node:fs/promises';
import path from 'node:path';
import type pino from 'pino';

/**
 * 数据清理配置
 */
export interface CleanupConfig {
  logRetentionDays: number;
  executionRetentionDays: number;
  workflowRetentionDays: number;
  cleanupIntervalHours: number;
  enabled: boolean;
}

/**
 * Resolves storage path from segments
 */
export type CleanupPathResolver = (...segments: string[]) => string;

/**
 * Dependencies for DataCleanupService
 */
export interface DataCleanupDeps {
  logger: pino.Logger;
  resolveStoragePath: CleanupPathResolver;
}

/**
 * Options for creating a DataCleanupService
 */
export interface DataCleanupServiceOptions {
  config?: Partial<CleanupConfig>;
  deps: DataCleanupDeps;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: CleanupConfig = {
  logRetentionDays: 30,
  executionRetentionDays: 90,
  workflowRetentionDays: 365,
  cleanupIntervalHours: 24,
  enabled: true,
};

/**
 * 数据清理服务
 */
export class DataCleanupService {
  private readonly logger: pino.Logger;
  private readonly resolveStoragePath: CleanupPathResolver;
  private config: CleanupConfig;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(options: DataCleanupServiceOptions) {
    this.assertDeps(options);
    this.logger = options.deps.logger;
    this.resolveStoragePath = options.deps.resolveStoragePath;
    this.config = { ...DEFAULT_CONFIG, ...options.config };
  }

  /**
   * 显式依赖校验，缺失时直接失败
   */
  private assertDeps(options: DataCleanupServiceOptions | undefined): asserts options is DataCleanupServiceOptions {
    if (!options?.deps?.logger || typeof options.deps.resolveStoragePath !== 'function') {
      throw new Error('DataCleanupService requires explicit logger and resolveStoragePath dependencies');
    }
  }

  /**
   * Starts the data cleanup service with periodic cleanup
   */
  start(): void {
    if (this.isRunning || !this.config.enabled) return;
    
    this.isRunning = true;
    this.scheduleCleanup();
    this.logger.info('Data cleanup service started');
  }

  /**
   * Stops the data cleanup service
   */
  stop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.isRunning = false;
    this.logger.info('Data cleanup service stopped');
  }

  private scheduleCleanup(): void {
    this.cleanup().catch(error => {
      this.logger.error(`Cleanup failed: ${(error as Error).message}`);
    });

    this.cleanupIntervalId = setInterval(() => {
      this.cleanup().catch(error => {
        this.logger.error(`Cleanup failed: ${(error as Error).message}`);
      });
    }, this.config.cleanupIntervalHours * 60 * 60 * 1000);
  }

  /**
   * Performs data cleanup for logs, executions, and workflows
   */
  async cleanup(): Promise<void> {
    if (!this.config.enabled) return;

    this.logger.debug('Starting data cleanup...');

    await this.cleanupLogs();
    await this.cleanupExecutions();
    await this.cleanupWorkflows();

    this.logger.debug('Data cleanup completed');
  }

  private async cleanupLogs(): Promise<void> {
    const logDir = this.resolveStoragePath('logs');
    const cutoffDate = new Date(Date.now() - this.config.logRetentionDays * 24 * 60 * 60 * 1000);

    try {
      await fs.access(logDir);
    } catch (error) {
      this.logger.debug(`Log directory ${logDir} not accessible, skipping log cleanup: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const files = await fs.readdir(logDir);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(logDir, file);
      
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
          this.logger.debug(`Deleted old log file: ${file}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to process log file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    if (deletedCount > 0) {
      this.logger.info(`Cleaned up ${deletedCount} old log files`);
    }
  }

  private async cleanupExecutions(): Promise<void> {
    const executionsDir = this.resolveStoragePath('executions');
    const cutoffDate = new Date(Date.now() - this.config.executionRetentionDays * 24 * 60 * 60 * 1000);

    try {
      await fs.access(executionsDir);
    } catch (error) {
      this.logger.debug(`Executions directory ${executionsDir} not accessible, skipping execution cleanup: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const files = await fs.readdir(executionsDir);
    let deletedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(executionsDir, file);

      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
          this.logger.debug(`Deleted old execution record: ${file}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to process execution file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    if (deletedCount > 0) {
      this.logger.info(`Cleaned up ${deletedCount} old execution records`);
    }
  }

  private async cleanupWorkflows(): Promise<void> {
    const workflowsDir = this.resolveStoragePath('workflows');
    const cutoffDate = new Date(Date.now() - this.config.workflowRetentionDays * 24 * 60 * 60 * 1000);

    try {
      await fs.access(workflowsDir);
    } catch (error) {
      this.logger.debug(`Workflows directory ${workflowsDir} not accessible, skipping workflow cleanup: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const files = await fs.readdir(workflowsDir);
    let deletedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.yaml') && !file.endsWith('.json')) continue;

      const filePath = path.join(workflowsDir, file);

      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
          this.logger.debug(`Deleted old workflow: ${file}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to process workflow file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    if (deletedCount > 0) {
      this.logger.info(`Cleaned up ${deletedCount} old workflows`);
    }
  }

  /**
   * Cleans up old files by age
   * @param days - Number of days to retain files
   * @returns Object containing counts of deleted files
   */
  async cleanupByAge(days: number): Promise<{ logs: number; executions: number; workflows: number }> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = { logs: 0, executions: 0, workflows: 0 };

    const logDir = this.resolveStoragePath('logs');
    const executionsDir = this.resolveStoragePath('executions');
    const workflowsDir = this.resolveStoragePath('workflows');

    results.logs = await this.deleteOldFiles(logDir, cutoffDate);
    results.executions = await this.deleteOldFiles(executionsDir, cutoffDate);
    results.workflows = await this.deleteOldFiles(workflowsDir, cutoffDate);

    return results;
  }

  private async deleteOldFiles(dirPath: string, cutoffDate: Date): Promise<number> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      this.logger.debug(`Directory ${dirPath} not accessible, skipping age-based cleanup: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    }

    const files = await fs.readdir(dirPath);
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(dirPath, file);

      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile() && stat.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch (error) {
        this.logger.warn(`Failed to process file ${filePath} during age-based cleanup: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    return deletedCount;
  }

  /**
   * Gets storage usage statistics
   * @returns Object containing file counts and total bytes
   */
  async getStorageUsage(): Promise<{ logs: number; executions: number; workflows: number; totalBytes: number }> {
    const logDir = this.resolveStoragePath('logs');
    const executionsDir = this.resolveStoragePath('executions');
    const workflowsDir = this.resolveStoragePath('workflows');

    const [logStats, executionStats, workflowStats] = await Promise.all([
      this.getDirStats(logDir),
      this.getDirStats(executionsDir),
      this.getDirStats(workflowsDir),
    ]);

    return {
      logs: logStats.count,
      executions: executionStats.count,
      workflows: workflowStats.count,
      totalBytes: logStats.bytes + executionStats.bytes + workflowStats.bytes,
    };
  }

  private async getDirStats(dirPath: string): Promise<{ count: number; bytes: number }> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      this.logger.debug(`Directory ${dirPath} not accessible for stats, returning empty stats: ${error instanceof Error ? error.message : String(error)}`);
      return { count: 0, bytes: 0 };
    }

    const files = await fs.readdir(dirPath);
    let count = 0;
    let bytes = 0;

    for (const file of files) {
      const filePath = path.join(dirPath, file);

      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          count++;
          bytes += stat.size;
        }
      } catch (error) {
        this.logger.warn(`Failed to get stats for file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }

    return { count, bytes };
  }

  /**
   * Checks if the cleanup service is enabled
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Updates the cleanup configuration
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<CleanupConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

/**
 * 创建数据清理服务
 */
export function createDataCleanupService(options: DataCleanupServiceOptions): DataCleanupService {
  return new DataCleanupService(options);
}
