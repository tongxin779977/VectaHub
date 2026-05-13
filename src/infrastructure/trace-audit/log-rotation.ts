/**
 * 日志轮转管理器 - 实现日志文件的轮转、归档和清理
 * Log Rotation Manager - Implements log file rotation, archiving, and cleanup
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { getLogger } from '../../utils/logger.js';
import type { LogRotationConfig } from './types.js';

const gzip = promisify(zlib.gzip);
const logger = getLogger('log-rotation');

/** 默认配置 */
const DEFAULT_CONFIG: LogRotationConfig = {
  enabled: true,
  maxFileSizeMB: 50,
  retentionDays: 30,
  compressArchive: true,
};

/**
 * 日志轮转管理器类
 * Log Rotation Manager Class
 */
export class LogRotationManager {
  private logDir: string;
  private archiveDir: string;
  private config: LogRotationConfig;

  constructor(logDir: string, config?: Partial<LogRotationConfig>) {
    this.logDir = logDir;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.archiveDir = this.config.archiveDir || path.join(logDir, 'archive');
    this.ensureDirectories();
  }

  /** 确保目录存在 */
  private ensureDirectories(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  /** 执行日志轮转 */
  async rotate(): Promise<{ rotated: number; archived: number; deleted: number }> {
    if (!this.config.enabled) {
      return { rotated: 0, archived: 0, deleted: 0 };
    }

    let rotated = 0;
    let archived = 0;
    let deleted = 0;

    try {
      // 1. 检查并轮转过大的文件
      rotated = await this.rotateLargeFiles();

      // 2. 归档旧文件
      archived = await this.archiveOldFiles();

      // 3. 清理过期文件
      deleted = await this.cleanupExpiredFiles();

      logger.info(`日志轮转完成: 轮转=${rotated}, 归档=${archived}, 删除=${deleted}`);
    } catch (error) {
      logger.error(`日志轮转失败: ${(error as Error).message}`);
    }

    return { rotated, archived, deleted };
  }

  /** 轮转过大的文件 */
  private async rotateLargeFiles(): Promise<number> {
    const files = this.getLogFiles();
    let count = 0;
    const maxBytes = this.config.maxFileSizeMB * 1024 * 1024;

    for (const file of files) {
      try {
        const stats = fs.statSync(file);
        if (stats.size > maxBytes) {
          await this.rotateFile(file);
          count++;
        }
      } catch (error) {
        logger.warn(`检查文件大小失败: ${file}, ${(error as Error).message}`);
      }
    }

    return count;
  }

  /** 轮转单个文件 */
  private async rotateFile(filePath: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath);
    const rotatedName = `${baseName}.${timestamp}${ext}`;
    const rotatedPath = path.join(path.dirname(filePath), rotatedName);

    // 重命名文件
    fs.renameSync(filePath, rotatedPath);

    // 创建新的空文件
    fs.writeFileSync(filePath, '');

    logger.info(`文件轮转: ${filePath} -> ${rotatedPath}`);
  }

  /** 归档旧文件 */
  private async archiveOldFiles(): Promise<number> {
    const files = this.getLogFiles();
    const now = Date.now();
    const archiveThreshold = 7 * 24 * 60 * 60 * 1000; // 7 天
    let count = 0;

    for (const file of files) {
      try {
        const stats = fs.statSync(file);
        const age = now - stats.mtimeMs;

        if (age > archiveThreshold) {
          await this.archiveFile(file);
          count++;
        }
      } catch (error) {
        logger.warn(`归档文件失败: ${file}, ${(error as Error).message}`);
      }
    }

    return count;
  }

  /** 归档单个文件 */
  private async archiveFile(filePath: string): Promise<void> {
    const baseName = path.basename(filePath);
    let archivePath = path.join(this.archiveDir, baseName);

    if (this.config.compressArchive) {
      archivePath += '.gz';
      const content = fs.readFileSync(filePath);
      const compressed = await gzip(content);
      fs.writeFileSync(archivePath, compressed);
    } else {
      fs.copyFileSync(filePath, archivePath);
    }

    // 删除原文件
    fs.unlinkSync(filePath);

    logger.info(`文件归档: ${filePath} -> ${archivePath}`);
  }

  /** 清理过期文件 */
  private async cleanupExpiredFiles(): Promise<number> {
    const allFiles = [
      ...this.getLogFiles(),
      ...this.getArchiveFiles(),
    ];

    const now = Date.now();
    const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
    let count = 0;

    for (const file of allFiles) {
      try {
        const stats = fs.statSync(file);
        const age = now - stats.mtimeMs;

        if (age > retentionMs) {
          fs.unlinkSync(file);
          count++;
          logger.info(`文件清理: ${file}`);
        }
      } catch (error) {
        logger.warn(`清理文件失败: ${file}, ${(error as Error).message}`);
      }
    }

    return count;
  }

  /** 获取日志文件列表 */
  private getLogFiles(): string[] {
    if (!fs.existsSync(this.logDir)) {
      return [];
    }

    return fs.readdirSync(this.logDir)
      .filter((f) => f.endsWith('.jsonl') || f.endsWith('.log'))
      .map((f) => path.join(this.logDir, f));
  }

  /** 获取归档文件列表 */
  private getArchiveFiles(): string[] {
    if (!fs.existsSync(this.archiveDir)) {
      return [];
    }

    return fs.readdirSync(this.archiveDir)
      .filter((f) => f.endsWith('.jsonl') || f.endsWith('.gz'))
      .map((f) => path.join(this.archiveDir, f));
  }

  /** 获取存储统计 */
  getStorageStats(): {
    logDirSize: number;
    archiveDirSize: number;
    logFileCount: number;
    archiveFileCount: number;
  } {
    const logFiles = this.getLogFiles();
    const archiveFiles = this.getArchiveFiles();

    const logDirSize = logFiles.reduce((sum, file) => {
      try {
        return sum + fs.statSync(file).size;
      } catch {
        return sum;
      }
    }, 0);

    const archiveDirSize = archiveFiles.reduce((sum, file) => {
      try {
        return sum + fs.statSync(file).size;
      } catch {
        return sum;
      }
    }, 0);

    return {
      logDirSize,
      archiveDirSize,
      logFileCount: logFiles.length,
      archiveFileCount: archiveFiles.length,
    };
  }

  /** 手动触发清理 */
  async forceCleanup(): Promise<number> {
    return this.cleanupExpiredFiles();
  }

  /** 获取配置 */
  getConfig(): LogRotationConfig {
    return { ...this.config };
  }

  /** 更新配置 */
  updateConfig(config: Partial<LogRotationConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.archiveDir) {
      this.archiveDir = config.archiveDir;
      this.ensureDirectories();
    }
  }
}

/**
 * 创建日志轮转管理器工厂函数
 * Create Log Rotation Manager Factory Function
 */
export function createLogRotationManager(
  logDir: string,
  config?: Partial<LogRotationConfig>
): LogRotationManager {
  return new LogRotationManager(logDir, config);
}
