import type pino from 'pino';

/**
 * 日志服务接口
 */
export interface ILoggerService {
  /**
   * 获取根 logger
   */
  getLogger(prefix?: string): pino.Logger;

  /**
   * 创建控制台 logger
   */
  createConsoleLogger(prefix?: string): pino.Logger;

  /**
   * 创建文件 logger
   */
  createFileLogger(prefix?: string): pino.Logger;

  /**
   * 设置日志级别
   */
  setLogLevel(level: pino.Level | 'silent'): void;

  /**
   * 获取当前日志级别
   */
  getLogLevel(): pino.Level | 'silent';

  /**
   * 设置静音状态
   */
  setMuted(muted: boolean): void;

  /**
   * 获取静音状态
   */
  isMuted(): boolean;
}
