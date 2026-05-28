/**
 * 内存监控器
 *
 * 定期检查 Node.js 进程内存使用情况，当 RSS 内存占用
 * 超过指定阈值（默认 90%）时触发已注册的溢出处理器。
 *
 * @example
 * ```ts
 * const monitor = new MemoryMonitor(512, 2000);
 * monitor.registerOverflowHandler((usage, pct) => console.warn(`Memory at ${pct}%`));
 * monitor.start();
 * ```
 */
export class MemoryMonitor {
  private maxMemoryMB: number;
  private checkIntervalMS: number;
  private intervalId: NodeJS.Timeout | null = null;
  private overflowHandlers: Array<(usage: NodeJS.MemoryUsage, percentage: number) => void> = [];

  /**
   * 创建内存监控器实例
   *
   * @param maxMemoryMB - 最大允许内存（MB），默认 512
   * @param checkIntervalMS - 检查间隔（毫秒），默认 1000
   */
  constructor(maxMemoryMB = 512, checkIntervalMS = 1000) {
    this.maxMemoryMB = maxMemoryMB;
    this.checkIntervalMS = checkIntervalMS;
  }

  /**
   * 启动内存监控定时器
   * 若已启动则忽略
   */
  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      const usage = this.getCurrentUsage();
      const percentage = this.getUsagePercentage();
      if (percentage > 90) {
        for (const handler of this.overflowHandlers) {
          handler(usage, percentage);
        }
      }
    }, this.checkIntervalMS);
  }

  /**
   * 停止内存监控定时器
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * 获取当前进程内存使用情况
   *
   * @returns Node.js 进程内存使用快照
   */
  getCurrentUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * 计算当前 RSS 内存占最大允许内存的百分比
   *
   * @returns 使用百分比（0-100+）
   */
  getUsagePercentage(): number {
    const usage = this.getCurrentUsage();
    const rssMB = usage.rss / 1024 / 1024;
    return (rssMB / this.maxMemoryMB) * 100;
  }

  /**
   * 注册内存溢出处理器
   * 当内存使用率超过 90% 时调用
   *
   * @param handler - 回调函数，接收内存使用快照和使用百分比
   */
  registerOverflowHandler(
    handler: (usage: NodeJS.MemoryUsage, percentage: number) => void
  ): void {
    this.overflowHandlers.push(handler);
  }

  /**
   * 清除所有已注册的溢出处理器
   */
  clearOverflowHandlers(): void {
    this.overflowHandlers = [];
  }
}
