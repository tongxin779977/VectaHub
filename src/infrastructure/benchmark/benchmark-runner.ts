/**
 * 基准测试套件运行器
 *
 * 提供将多个基准测试组织为套件并统一运行和报告的能力
 */

import {
  type BenchmarkOptions,
  type BenchmarkResult,
  runBenchmark,
  formatBenchmarkResults,
  formatDuration,
} from './timer.js';

/**
 * 基准测试套件选项
 */
export interface BenchmarkSuiteOptions {
  /** 套件名称 */
  name: string;
  /** 套件中的基准测试列表 */
  benchmarks: BenchmarkOptions[];
}

/**
 * 基准测试套件结果
 */
export interface SuiteResult {
  /** 套件名称 */
  name: string;
  /** 各基准测试结果 */
  results: BenchmarkResult[];
  /** 套件总耗时（毫秒） */
  totalDurationMs: number;
}

/**
 * 运行基准测试套件，依次执行所有基准测试并汇总结果
 *
 * @param options - 套件选项
 * @returns 套件结果
 */
export async function runBenchmarkSuite(options: BenchmarkSuiteOptions): Promise<SuiteResult> {
  const { name, benchmarks } = options;
  const results: BenchmarkResult[] = [];

  const suiteStart = performance.now();

  for (const benchmark of benchmarks) {
    const result = await runBenchmark(benchmark);
    results.push(result);
  }

  const suiteEnd = performance.now();

  return {
    name,
    results,
    totalDurationMs: suiteEnd - suiteStart,
  };
}

/**
 * 格式化套件结果为可打印的报告
 *
 * @param suite - 套件结果
 * @returns 格式化的报告字符串
 */
export function formatSuiteReport(suite: SuiteResult): string {
  const lines: string[] = [];
  lines.push(`\n=== ${suite.name} ===`);
  lines.push('');
  lines.push(formatBenchmarkResults(suite.results));
  lines.push('');
  lines.push(`Total suite duration: ${formatDuration(suite.totalDurationMs)}`);
  return lines.join('\n');
}

/**
 * 将多个套件结果格式化为完整报告
 *
 * @param suites - 套件结果数组
 * @returns 格式化的完整报告字符串
 */
export function formatFullReport(suites: SuiteResult[]): string {
  const sections = suites.map(formatSuiteReport);
  const totalMs = suites.reduce((sum, s) => sum + s.totalDurationMs, 0);
  sections.push(`\n=== Summary ===`);
  sections.push(`Total suites: ${suites.length}`);
  sections.push(`Total benchmarks: ${suites.reduce((sum, s) => sum + s.results.length, 0)}`);
  sections.push(`Total duration: ${formatDuration(totalMs)}`);
  return sections.join('\n');
}
