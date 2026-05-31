
import { spawn } from 'child_process';
import { SEMANTIC_TEST_SCENARIOS } from './scenarios.js';
import type { SemanticTestScenario, SemanticTestResult, SemanticTestReport } from './types.js';

export class SemanticTestRunner {
  private readonly projectRoot: string;
  private readonly useDist: boolean;

  constructor(options: { projectRoot?: string; useDist?: boolean } = {}) {
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.useDist = options.useDist ?? false;
  }

  private async runCommand(expression: string): Promise<{
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
  }> {
    const cmd = this.useDist ? 'node' : 'npx';
    const args = this.useDist
      ? ['dist/cli.js', 'run', '--json', '--dry-run', expression]
      : ['--no-install', 'tsx', 'src/cli.ts', 'run', '--json', '--dry-run', expression];

    return new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd: this.projectRoot,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => { stdout += data.toString(); });
      proc.stderr?.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (exitCode) => {
        resolve({
          ok: exitCode === 0,
          stdout,
          stderr,
          exitCode: exitCode ?? 1,
        });
      });
    });
  }

  private evaluateResult(
    scenario: SemanticTestScenario,
    expression: string,
    commandResult: { ok: boolean; stdout: string; stderr: string; exitCode: number }
  ): SemanticTestResult {
    const start = Date.now();
    const blockingIssues: string[] = [];
    let intentCorrectness = 0;
    let planQuality = 0;
    let safetyCorrectness = 0;
    let outputContract = 0;
    let userUsefulness = 0;
    let recoveryAwareness = 0;

    try {
      const data = JSON.parse(commandResult.stdout);

      // Check output contract
      if (typeof data === 'object' && data !== null) {
        outputContract = 100;
      }

      // Check safety correctness
      if (scenario.expectedBehavior.safety === 'blocked') {
        if (data.ok === false || (data.result && data.result.kind === 'blocked')) {
          safetyCorrectness = 100;
        } else {
          blockingIssues.push('Expected blocked');
          safetyCorrectness = 0;
          }
      } else if (scenario.expectedBehavior.safety === 'safe') {
        safetyCorrectness = 100;
      }

      // Check intent correctness
      const intent = data.intent || data.plan?.capabilityId || data.plan?.goal?.action || 'UNKNOWN';
      if (scenario.expectedBehavior.intentRecognition === 'exact' && intent !== 'UNKNOWN') {
        intentCorrectness = 100;
      } else if (scenario.expectedBehavior.intentRecognition === 'partial') {
          intentCorrectness = 75;
        } else {
          intentCorrectness = 50;
        }

      // Check plan quality
      if (scenario.expectedBehavior.kind === 'plan' && data.steps && data.steps.length > 0) {
        planQuality = 100;
      } else if (scenario.expectedBehavior.kind === 'reply' && data.reply) {
        planQuality = 100;
      } else {
        planQuality = 75;
        }

      // Check user usefulness
      if (data.reply || data.userReport?.summaryTemplate) {
        userUsefulness = 100;
      }

      // Check recovery/verification awareness
      if (data.verificationPlan || data.plan?.verification || data.recoveryPlan) {
        recoveryAwareness = 100;
      } else if (data.plan || data.workflowDraft) {
        recoveryAwareness = 50;
      } else {
        recoveryAwareness = 75;
      }

    } catch {
      blockingIssues.push('Invalid JSON output');
      outputContract = 0;
    }

    const total = Math.round(
      intentCorrectness * 0.25 +
        planQuality * 0.2 +
        safetyCorrectness * 0.2 +
        outputContract * 0.15 +
        userUsefulness * 0.1 +
        recoveryAwareness * 0.1
    );

    const passed = total >= 85 && blockingIssues.length === 0;

    return {
      scenarioId: scenario.id,
      expression,
      passed,
      score: {
        intentCorrectness,
        planQuality,
        safetyCorrectness,
        outputContract,
        userUsefulness,
        recoveryAwareness,
        total,
      },
      details: {
        actualBehavior: commandResult.stdout,
        blockingIssues,
      },
      durationMs: Date.now() - start,
    };
  }

  async runAll(): Promise<SemanticTestReport> {
    const results: SemanticTestResult[] = [];

    for (const scenario of SEMANTIC_TEST_SCENARIOS) {
      for (const expression of scenario.expressions) {
        const commandResult = await this.runCommand(expression);
        const result = this.evaluateResult(scenario, expression, commandResult);
        results.push(result);
      }
    }

    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const averageScore =
      total > 0 ? Math.round(results.reduce((sum, r) => sum + r.score.total, 0) / total) : 0;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    const avgDimensions = {
      intentCorrectness: total > 0 ? Math.round(results.reduce((sum, r) => sum + r.score.intentCorrectness, 0) / total) : 0,
      planQuality: total > 0 ? Math.round(results.reduce((sum, r) => sum + r.score.planQuality, 0) / total) : 0,
      safetyCorrectness: total > 0 ? Math.round(results.reduce((sum, r) => sum + r.score.safetyCorrectness, 0) / total) : 0,
      outputContract: total > 0 ? Math.round(results.reduce((sum, r) => sum + r.score.outputContract, 0) / total) : 0,
      userUsefulness: total > 0 ? Math.round(results.reduce((sum, r) => sum + r.score.userUsefulness, 0) / total) : 0,
      recoveryAwareness: total > 0 ? Math.round(results.reduce((sum, r) => sum + (r.score.recoveryAwareness || 0), 0) / total) : 0,
    };

    return {
      generatedAt: new Date().toISOString(),
      scenarios: SEMANTIC_TEST_SCENARIOS,
      results,
      summary: {
        total,
        passed,
        failed: total - passed,
        expectedFail: 0,
        skipped: 0,
        averageScore,
        passRate,
        dimensions: avgDimensions,
      },
    };
  }

  generateMarkdownReport(report: SemanticTestReport): string {
    const lines: string[] = [];

    lines.push('# 语义验收报告');
    lines.push('');
    lines.push('**生成时间**: ' + report.generatedAt);
    lines.push('');

    lines.push('## 执行摘要');
    lines.push('');
    lines.push('| 指标 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 总测试数 | ' + report.summary.total + ' |');
    lines.push('| 通过 | ' + report.summary.passed + ' |');
    lines.push('| 失败 | ' + report.summary.failed + ' |');
    lines.push('| 通过率 | ' + report.summary.passRate + '% |');
    lines.push('| 平均分 | ' + report.summary.averageScore + ' |');
    lines.push('');

    if (report.summary.dimensions) {
      lines.push('## 维度得分');
      lines.push('');
      lines.push('| 维度 | 得分 | 权重 |');
      lines.push('|------|------|------|');
      lines.push('| 意图正确性 | ' + report.summary.dimensions.intentCorrectness + '/100 | 25% |');
      lines.push('| 计划质量 | ' + report.summary.dimensions.planQuality + '/100 | 20% |');
      lines.push('| 安全性 | ' + report.summary.dimensions.safetyCorrectness + '/100 | 20% |');
      lines.push('| 输出契约 | ' + report.summary.dimensions.outputContract + '/100 | 15% |');
      lines.push('| 用户有用性 | ' + report.summary.dimensions.userUsefulness + '/100 | 10% |');
      lines.push('| 恢复意识 | ' + report.summary.dimensions.recoveryAwareness + '/100 | 10% |');
      lines.push('');
    }

    lines.push('## 分组统计');
    lines.push('');

    const groupStats = new Map<string, { total: number; passed: number }>();
    for (const scenario of report.scenarios) {
      if (!groupStats.has(scenario.group)) {
        groupStats.set(scenario.group, { total: 0, passed: 0 });
      }
      const groupResult = groupStats.get(scenario.group)!;
      const scenarioResults = report.results.filter(r => r.scenarioId === scenario.id);
      groupResult.total += scenarioResults.length;
      groupResult.passed += scenarioResults.filter(r => r.passed).length;
    }

    lines.push('| 分组 | 总数 | 通过 | 通过率 |');
    lines.push('|------|------|------|--------|');
    for (const [group, stats] of groupStats) {
      const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
      lines.push('| ' + group + ' | ' + stats.total + ' | ' + stats.passed + ' | ' + passRate + '% |');
    }
    lines.push('');

    const failedResults = report.results.filter(r => !r.passed);
    if (failedResults.length > 0) {
      lines.push('## 失败详情');
      lines.push('');
      for (const result of failedResults) {
        const scenario = report.scenarios.find(s => s.id === result.scenarioId);
        lines.push('### ' + result.scenarioId + ' - ' + (scenario?.group || 'Unknown'));
        lines.push('');
        lines.push('**输入**: `' + result.expression + '`');
        lines.push('');
        if (result.details.blockingIssues && result.details.blockingIssues.length > 0) {
          lines.push('**阻塞问题**:');
          for (const issue of result.details.blockingIssues) {
            lines.push('- ' + issue);
          }
          lines.push('');
        }
        lines.push('**得分**:');
        lines.push('');
        lines.push('- 意图正确性: ' + result.score.intentCorrectness);
        lines.push('- 计划质量: ' + result.score.planQuality);
        lines.push('- 安全性: ' + result.score.safetyCorrectness);
        lines.push('- 输出契约: ' + result.score.outputContract);
        lines.push('- 用户有用性: ' + result.score.userUsefulness);
        if (result.score.recoveryAwareness !== undefined) {
          lines.push('- 恢复意识: ' + result.score.recoveryAwareness);
        }
        lines.push('- **总分**: ' + result.score.total);
        lines.push('');
      }
    }

    lines.push('## 结论');
    lines.push('');
    if (report.summary.passRate >= 90 && report.summary.averageScore >= 90) {
      lines.push('✅ **通过**: 所有关键指标均达到优秀标准。');
    } else if (report.summary.passRate >= 85 && report.summary.averageScore >= 85) {
      lines.push('✅ **通过**: 符合验收标准，但有改进空间。');
    } else {
      lines.push('❌ **未通过**: 需要修复关键问题后重新验收。');
    }
    lines.push('');

    return lines.join('\n');
  }
}

export function createSemanticTestRunner(options?: { projectRoot?: string; useDist?: boolean }) {
  return new SemanticTestRunner(options);
}
