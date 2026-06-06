/**
 * 性能测量工具模块
 *
 * 提供高精度计时、统计分析和持续时间格式化等基础工具
 */

import { performance } from 'node:perf_hooks';

/**
 * 单次计时结果
 */
export interface TimingResult {
  /** 执行耗时（毫秒） */
  durationMs: number;
}

/**
 * 基准测试结果
 */
export interface BenchmarkResult {
  /** 基准名称 */
  name: string;
  /** 迭代次数 */
  iterations: number;
  /** 最小耗时（毫秒） */
  minMs: number;
  /** 最大耗时（毫秒） */
  maxMs: number;
  /** 平均耗时（毫秒） */
  avgMs: number;
  /** 中位数耗时（毫秒） */
  p50Ms: number;
  /** P95 耗时（毫秒） */
  p95Ms: number;
  /** P99 耗时（毫秒） */
  p99Ms: number;
  /** 总耗时（毫秒） */
  totalMs: number;
}

/**
 * 基准测试选项
 */
export interface BenchmarkOptions {
  /** 基准名称 */
  name: string;
  /** 迭代次数（默认 100） */
  iterations?: number;
  /** 预热迭代次数（默认 5） */
  warmupIterations?: number;
  /** 待测函数 */
  fn: () => void | Promise<void>;
}

/**
 * 从已排序数组中计算百分位值
 *
 * @param sorted - 已升序排列的数值数组
 * @param p - 百分位（0-100）
 * @returns 对应百分位的值
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0];
  }
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

/**
 * 测量同步函数执行时间
 *
 * @param fn - 待测同步函数
 * @returns 计时结果
 */
export function measureSync(fn: () => void): TimingResult {
  const start = performance.now();
  fn();
  const end = performance.now();
  return { durationMs: end - start };
}

/**
 * 测量异步函数执行时间
 *
 * @param fn - 待测异步函数
 * @returns 计时结果
 */
export async function measureAsync(fn: () => Promise<void>): Promise<TimingResult> {
  const start = performance.now();
  await fn();
  const end = performance.now();
  return { durationMs: end - start };
}

/**
 * 格式化持续时间为人类可读形式
 *
 * @param ms - 毫秒数
 * @returns 格式化的字符串
 */
export function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(1)}µs`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = ((ms % 60_000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * 运行单个基准测试，执行多次迭代并收集统计数据
 *
 * @param options - 基准测试选项
 * @returns 基准测试结果
 */
export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
  const { name, iterations = 100, warmupIterations = 5, fn } = options;

  // 预热阶段：减少 JIT 编译和缓存冷启动的影响
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // 正式测量阶段
  const durations: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    durations.push(end - start);
  }

  durations.sort((a, b) => a - b);

  const totalMs = durations.reduce((sum, d) => sum + d, 0);

  return {
    name,
    iterations,
    minMs: durations[0],
    maxMs: durations[durations.length - 1],
    avgMs: totalMs / iterations,
    p50Ms: percentile(durations, 50),
    p95Ms: percentile(durations, 95),
    p99Ms: percentile(durations, 99),
    totalMs,
  };
}

/**
 * 格式化基准测试结果为对齐的文本表格
 *
 * @param results - 基准测试结果数组
 * @returns 格式化的表格字符串
 */
export function formatBenchmarkResults(results: BenchmarkResult[]): string {
  const header = [
    'Benchmark',
    'Iterations',
    'Min',
    'Avg',
    'P50',
    'P95',
    'P99',
    'Max',
    'Total',
  ];

  const rows = results.map((r) => [
    r.name,
    String(r.iterations),
    formatDuration(r.minMs),
    formatDuration(r.avgMs),
    formatDuration(r.p50Ms),
    formatDuration(r.p95Ms),
    formatDuration(r.p99Ms),
    formatDuration(r.maxMs),
    formatDuration(r.totalMs),
  ]);

  const columns = header.length;
  const widths: number[] = [];
  for (let col = 0; col < columns; col++) {
    let maxLen = header[col].length;
    for (const row of rows) {
      if (row[col].length > maxLen) {
        maxLen = row[col].length;
      }
    }
    widths.push(maxLen);
  }

  const pad = (value: string, width: number, align: 'left' | 'right' = 'right'): string => {
    if (align === 'left') {
      return value.padEnd(width);
    }
    return value.padStart(width);
  };

  const separator = widths.map((w) => '-'.repeat(w)).join(' | ');
  const headerLine = header.map((h, i) => pad(h, widths[i], i === 0 ? 'left' : 'right')).join(' | ');
  const dataLines = rows.map((row) =>
    row.map((cell, i) => pad(cell, widths[i], i === 0 ? 'left' : 'right')).join(' | '),
  );

  return [headerLine, separator, ...dataLines].join('\n');
}
