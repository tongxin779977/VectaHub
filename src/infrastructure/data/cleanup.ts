import fs from 'node:fs/promises';
import path from 'node:path';
import { getDefaultContext } from '../context.js';
import { getVectaHubPath } from '../paths/index.js';

function getModuleLogger() {
  return getDefaultContext().logger.getLogger('data-cleanup');
}

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
  private config: CleanupConfig;
  private cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  constructor(config?: Partial<CleanupConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (this.isRunning || !this.config.enabled) return;
    
    this.isRunning = true;
    this.scheduleCleanup();
    getModuleLogger().info('Data cleanup service started');
  }

  stop(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
    this.isRunning = false;
    getModuleLogger().info('Data cleanup service stopped');
  }

  private scheduleCleanup(): void {
    this.cleanup().catch(error => {
      getModuleLogger().error(`Cleanup failed: ${(error as Error).message}`);
    });

    this.cleanupIntervalId = setInterval(() => {
      this.cleanup().catch(error => {
        getModuleLogger().error(`Cleanup failed: ${(error as Error).message}`);
      });
    }, this.config.cleanupIntervalHours * 60 * 60 * 1000);
  }

  async cleanup(): Promise<void> {
    if (!this.config.enabled) return;

    getModuleLogger().debug('Starting data cleanup...');

    await this.cleanupLogs();
    await this.cleanupExecutions();
    await this.cleanupWorkflows();

    getModuleLogger().debug('Data cleanup completed');
  }

  private async cleanupLogs(): Promise<void> {
    const logDir = getVectaHubPath('logs');
    const cutoffDate = new Date(Date.now() - this.config.logRetentionDays * 24 * 60 * 60 * 1000);

    try {
      await fs.access(logDir);
    } catch {
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
          getModuleLogger().debug(`Deleted old log file: ${file}`);
        }
      } catch {
        continue;
      }
    }

    if (deletedCount > 0) {
      getModuleLogger().info(`Cleaned up ${deletedCount} old log files`);
    }
  }

  private async cleanupExecutions(): Promise<void> {
    const executionsDir = getVectaHubPath('executions');
    const cutoffDate = new Date(Date.now() - this.config.executionRetentionDays * 24 * 60 * 60 * 1000);

    try {
      await fs.access(executionsDir);
    } catch {
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
          getModuleLogger().debug(`Deleted old execution record: ${file}`);
        }
      } catch {
        continue;
      }
    }

    if (deletedCount > 0) {
      getModuleLogger().info(`Cleaned up ${deletedCount} old execution records`);
    }
  }

  private async cleanupWorkflows(): Promise<void> {
    const workflowsDir = getVectaHubPath('workflows');
    const cutoffDate = new Date(Date.now() - this.config.workflowRetentionDays * 24 * 60 * 60 * 1000);

    try {
      await fs.access(workflowsDir);
    } catch {
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
          getModuleLogger().debug(`Deleted old workflow: ${file}`);
        }
      } catch {
        continue;
      }
    }

    if (deletedCount > 0) {
      getModuleLogger().info(`Cleaned up ${deletedCount} old workflows`);
    }
  }

  async cleanupByAge(days: number): Promise<{ logs: number; executions: number; workflows: number }> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = { logs: 0, executions: 0, workflows: 0 };

    const logDir = getVectaHubPath('logs');
    const executionsDir = getVectaHubPath('executions');
    const workflowsDir = getVectaHubPath('workflows');

    results.logs = await this.deleteOldFiles(logDir, cutoffDate);
    results.executions = await this.deleteOldFiles(executionsDir, cutoffDate);
    results.workflows = await this.deleteOldFiles(workflowsDir, cutoffDate);

    return results;
  }

  private async deleteOldFiles(dirPath: string, cutoffDate: Date): Promise<number> {
    try {
      await fs.access(dirPath);
    } catch {
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
      } catch {
        continue;
      }
    }

    return deletedCount;
  }

  async getStorageUsage(): Promise<{ logs: number; executions: number; workflows: number; totalBytes: number }> {
    const logDir = getVectaHubPath('logs');
    const executionsDir = getVectaHubPath('executions');
    const workflowsDir = getVectaHubPath('workflows');

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
    } catch {
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
      } catch {
        continue;
      }
    }

    return { count, bytes };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

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
export function createDataCleanupService(config?: Partial<CleanupConfig>): DataCleanupService {
  return new DataCleanupService(config);
}
