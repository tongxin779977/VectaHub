export class MemoryMonitor {
  private maxMemoryMB: number;
  private checkIntervalMS: number;
  private intervalId: NodeJS.Timeout | null = null;
  private overflowHandlers: Array<(usage: any, percentage: number) => void> = [];

  constructor(maxMemoryMB = 512, checkIntervalMS = 1000) {
    this.maxMemoryMB = maxMemoryMB;
    this.checkIntervalMS = checkIntervalMS;
  }

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

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getCurrentUsage(): any {
    return process.memoryUsage();
  }

  getUsagePercentage(): number {
    const usage = this.getCurrentUsage();
    const rssMB = usage.rss / 1024 / 1024;
    return (rssMB / this.maxMemoryMB) * 100;
  }

  registerOverflowHandler(
    handler: (usage: any, percentage: number) => void
  ): void {
    this.overflowHandlers.push(handler);
  }

  clearOverflowHandlers(): void {
    this.overflowHandlers = [];
  }
}
